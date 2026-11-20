import { NextResponse } from "next/server";
import { getRequestSession, isSameOriginRequest, sessionOwnerKey } from "@/lib/auth";
import { countItem, addItem } from "@/lib/worldbox/player/profile";
import { loadProfile, storeProfile } from "@/lib/worldbox/player/profile-online";
import { presenceIdFor } from "@/lib/worldbox/player/presence";
import { listPresence } from "@/lib/worldbox/player/presence-online";
import { parseSave } from "@/lib/worldbox/core/save";
import { loadWorldBoxSave } from "@/lib/worldbox/core/save-online";
import { vehicleSpecFor } from "@/lib/worldbox/player/vehicles";
import { loadEquippedVehicle } from "@/lib/worldbox/player/vehicles-online";
import { awardMmoCoins, getMmoBalance, spendMmoCoins } from "@/lib/worldbox/economy/mmo-wallet";
import {
  CAFE_INGREDIENT_PALETTE,
  CAFE_SPOTS,
  canSwitchCareer,
  careerById,
  CAREERS,
  CERT_BY_ID,
  CERTIFICATIONS,
  computeShiftPayout,
  generateCafeTicket,
  generateDeliveryOrder,
  generateJobTask,
  generatePatrolBeat,
  isNearSpatialTarget,
  jstDayKey,
  nearCafeSpot,
  PATROL_SPOTS,
  UNEMPLOYMENT_BASE_PAYOUT,
  UNEMPLOYMENT_COOLDOWN_MS,
  UNEMPLOYMENT_MAX_BALANCE,
  xpForNextLevel,
  type CareerId,
  type CertificationId,
} from "@/lib/worldbox/social/jobs";
import { isJobsEnabled, loadJobProfile, storeJobProfile } from "@/lib/worldbox/social/jobs-online";
import { depositCityTreasury, loadGovernanceState } from "@/lib/worldbox/social/governance-online";
import { isActivelyJailed } from "@/lib/worldbox/social/prison";
import { loadPrisonRecord, storePrisonRecord } from "@/lib/worldbox/social/prison-online";
import { incrementQuestProgress, pushMmoNews } from "@/lib/worldbox/social/mmo-events-online";
import { withUserLock } from "@/lib/worldbox/core/user-lock";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function sanitizeText(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLen);
}

function err(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

async function getActorPos(ownerKey: string): Promise<{ space: string; x: number; y: number }> {
  const selfId = presenceIdFor(ownerKey);
  const now = Date.now();
  const entries = await listPresence();
  const live = entries.find((e) => e.id === selfId && now - e.ts <= 20_000);
  if (live) return { space: live.space, x: live.x, y: live.y };
  const saved = parseSave(await loadWorldBoxSave(ownerKey));
  if (saved) return { space: saved.space, x: saved.x, y: saved.y };
  return { space: "lobby", x: 28.5, y: 28.5 };
}

export async function GET(request: Request) {
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (!isJobsEnabled()) return err("jobs_unavailable", 503);
  const ownerKey = sessionOwnerKey(session);
  const now = Date.now();

  const [jobProfile, profile, balance, prison, actorPos, gov, equippedVehicle] = await Promise.all([
    loadJobProfile(ownerKey),
    loadProfile(ownerKey),
    getMmoBalance(session, ownerKey),
    loadPrisonRecord(ownerKey, session.username || "市民"),
    getActorPos(ownerKey),
    loadGovernanceState(now),
    loadEquippedVehicle(ownerKey),
  ]);

  const activeCareer = careerById(jobProfile.currentCareer) ?? CAREERS[0];
  const cooldownLeftMs = Math.max(0, jobProfile.lastShiftAt + activeCareer.cooldownMs - now);

  return NextResponse.json(
    {
      jobProfile,
      careers: CAREERS,
      certifications: CERTIFICATIONS,
      balance,
      hunger: profile.hunger,
      hasUnemploymentCard: countItem(profile, "unemployment_card") > 0,
      cooldownLeftMs,
      jailed: isActivelyJailed(prison, now),
      actorPos,
      spots: {
        cafe: CAFE_SPOTS,
        patrol: PATROL_SPOTS,
      },
      cafeIngredients: CAFE_INGREDIENT_PALETTE,
      govPolicies: gov.policies,
      equippedVehicle,
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return err("forbidden", 403);
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (!isJobsEnabled()) return err("jobs_unavailable", 503);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err("invalid_request", 400);
  }
  const fields = (body ?? {}) as Record<string, unknown>;
  const ownerKey = sessionOwnerKey(session);

  return withUserLock(ownerKey, async () => {
    const now = Date.now();
    let jobProfile = await loadJobProfile(ownerKey);
    let profile = await loadProfile(ownerKey);
    const [prison, gov, actorPos, equippedVehicle] = await Promise.all([
      loadPrisonRecord(ownerKey, session.username || "市民"),
      loadGovernanceState(now),
      getActorPos(ownerKey),
      loadEquippedVehicle(ownerKey),
    ]);

    if (fields.action === "switch_career") {
      const target = fields.careerId as CareerId;
      const check = canSwitchCareer(jobProfile, target);
      if (!check.ok) return err(check.error, 409);
      jobProfile = {
        ...jobProfile,
        currentCareer: target,
        activeTask: null,
        activeDelivery: null,
        activeCafe: null,
        activePatrol: null,
      };
      await storeJobProfile(ownerKey, jobProfile);
      return NextResponse.json({ ok: true, jobProfile }, { headers: NO_STORE });
    }

    if (fields.action === "buy_certification") {
      const certId = typeof fields.certId === "string" ? fields.certId : "";
      const cert = CERT_BY_ID.get(certId);
      if (!cert) return err("unknown_certification", 400);
      if (jobProfile.certifications.includes(cert.id as CertificationId)) {
        return err("already_owned", 409);
      }
      if (jobProfile.level < cert.minLevel) return err("level_too_low", 409);
      const paid = await spendMmoCoins(session, ownerKey, cert.cost, "shop_buy");
      if (!paid.ok) return err(paid.error, 409);

      jobProfile = {
        ...jobProfile,
        certifications: [...jobProfile.certifications, cert.id],
        creditScore: Math.min(900, jobProfile.creditScore + 25),
      };
      await storeJobProfile(ownerKey, jobProfile);
      return NextResponse.json(
        { ok: true, jobProfile, balance: paid.balance },
        { headers: NO_STORE },
      );
    }

    if (isActivelyJailed(prison, now)) {
      return err("in_prison", 409);
    }

    if (fields.action === "cancel_active_mission") {
      jobProfile = {
        ...jobProfile,
        activeDelivery: null,
        activeCafe: null,
        activePatrol: null,
      };
      await storeJobProfile(ownerKey, jobProfile);
      return NextResponse.json({ ok: true, jobProfile }, { headers: NO_STORE });
    }

    // Dynamic Spatial Action 1: Live Cafe Barista Operations at physical Lobby food counters
    if (fields.action === "start_cafe") {
      const spot = nearCafeSpot(actorPos.space, actorPos.x, actorPos.y, 4.5);
      if (!spot) {
        return NextResponse.json(
          { error: "not_at_cafe", nearestSpot: CAFE_SPOTS[0], spots: CAFE_SPOTS },
          { status: 409, headers: NO_STORE },
        );
      }
      const ticket = generateCafeTicket(now);
      const sessionCafe = {
        spotLabel: spot.label,
        ticket,
        servedCount: jobProfile.activeCafe?.servedCount ?? 0,
        expiresAt: now + 5 * 60 * 1000,
      };
      jobProfile = { ...jobProfile, activeCafe: sessionCafe };
      await storeJobProfile(ownerKey, jobProfile);
      return NextResponse.json({ ok: true, cafe: sessionCafe, jobProfile }, { headers: NO_STORE });
    }

    if (fields.action === "serve_cafe_order") {
      const spot = nearCafeSpot(actorPos.space, actorPos.x, actorPos.y, 4.5);
      if (!spot) {
        return NextResponse.json(
          { error: "not_at_cafe", nearestSpot: CAFE_SPOTS[0], spots: CAFE_SPOTS },
          { status: 409, headers: NO_STORE },
        );
      }
      if (!jobProfile.activeCafe || jobProfile.activeCafe.expiresAt < now) {
        return err("no_active_cafe_order", 409);
      }
      if (profile.hunger < 4) return err("too_tired", 409);

      const submitted = Array.isArray(fields.ingredients) ? fields.ingredients.map(String) : [];
      const target = jobProfile.activeCafe.ticket.ingredients;
      const exactMatch =
        submitted.length === target.length &&
        [...submitted].sort().join("|") === [...target].sort().join("|");

      const base = jobProfile.activeCafe.ticket.basePay;
      const gross = exactMatch
        ? Math.round(base * (1.35 + Math.min(0.4, jobProfile.level * 0.03)))
        : Math.round(base * 0.55);
      const tax = Math.floor(gross * gov.policies.incomeTaxRate);
      const net = Math.max(20, gross - tax);
      const paid = await awardMmoCoins(session, ownerKey, net, "job_salary");
      if (!paid.ok) return err(paid.error, 503);
      if (tax > 0) void depositCityTreasury(tax);

      profile = { ...profile, hunger: Math.max(0, profile.hunger - 4) };
      await storeProfile(ownerKey, profile);

      const nextServed = (jobProfile.activeCafe.servedCount ?? 0) + 1;
      const nextTicket = generateCafeTicket(now + nextServed * 17);
      let nextXp = jobProfile.xp + (exactMatch ? 24 : 10);
      let nextLevel = jobProfile.level;
      while (nextXp >= xpForNextLevel(nextLevel) && nextLevel < 50) {
        nextXp -= xpForNextLevel(nextLevel);
        nextLevel += 1;
      }

      const nextCafe = {
        spotLabel: spot.label,
        ticket: nextTicket,
        servedCount: nextServed,
        expiresAt: now + 5 * 60 * 1000,
      };
      jobProfile = {
        ...jobProfile,
        xp: nextXp,
        level: nextLevel,
        shiftsCompleted: jobProfile.shiftsCompleted + 1,
        totalEarned: jobProfile.totalEarned + net,
        totalTaxPaid: jobProfile.totalTaxPaid + tax,
        creditScore: Math.min(900, Math.max(300, jobProfile.creditScore + (exactMatch ? 3 : -1))),
        lastWorkDay: jstDayKey(now),
        activeCafe: nextCafe,
      };
      await storeJobProfile(ownerKey, jobProfile);
      void incrementQuestProgress(ownerKey, "work_shift", 1, now);
      return NextResponse.json(
        {
          ok: true,
          exactMatch,
          gross,
          tax,
          net,
          cafe: nextCafe,
          balance: paid.balance,
          profile,
          jobProfile,
        },
        { headers: NO_STORE },
      );
    }

    // Dynamic Spatial Action 2: Real Physical Delivery Run across Lobby/World coords
    if (fields.action === "start_delivery") {
      const order = generateDeliveryOrder(now);
      jobProfile = { ...jobProfile, activeDelivery: order };
      await storeJobProfile(ownerKey, jobProfile);
      return NextResponse.json({ ok: true, delivery: order, jobProfile }, { headers: NO_STORE });
    }

    if (fields.action === "complete_delivery") {
      const order = jobProfile.activeDelivery;
      if (!order || order.expiresAt < now) return err("no_active_delivery", 409);
      const near = isNearSpatialTarget(
        actorPos.space,
        actorPos.x,
        actorPos.y,
        order.targetSpace,
        order.targetX,
        order.targetY,
        4.8,
      );
      if (!near) {
        return NextResponse.json(
          {
            error: "too_far_from_destination",
            target: order,
            actorPos,
          },
          { status: 409, headers: NO_STORE },
        );
      }
      if (profile.hunger < 6) return err("too_tired", 409);

      const vSpec = vehicleSpecFor(equippedVehicle);
      const vMult = vSpec ? 1 + vSpec.deliveryBonusPct / 100 : 1;
      const lvlMult = 1 + Math.min(0.8, (jobProfile.level - 1) * 0.05);
      const gross = Math.round(order.rewardCoins * vMult * lvlMult);
      const tax = Math.floor(gross * gov.policies.incomeTaxRate);
      const net = Math.max(50, gross - tax);

      const paid = await awardMmoCoins(session, ownerKey, net, "job_salary");
      if (!paid.ok) return err(paid.error, 503);
      if (tax > 0) void depositCityTreasury(tax);

      profile = { ...profile, hunger: Math.max(0, profile.hunger - 6) };
      await storeProfile(ownerKey, profile);

      let nextXp = jobProfile.xp + 34;
      let nextLevel = jobProfile.level;
      while (nextXp >= xpForNextLevel(nextLevel) && nextLevel < 50) {
        nextXp -= xpForNextLevel(nextLevel);
        nextLevel += 1;
      }

      jobProfile = {
        ...jobProfile,
        xp: nextXp,
        level: nextLevel,
        shiftsCompleted: jobProfile.shiftsCompleted + 1,
        totalEarned: jobProfile.totalEarned + net,
        totalTaxPaid: jobProfile.totalTaxPaid + tax,
        creditScore: Math.min(900, jobProfile.creditScore + 5),
        lastWorkDay: jstDayKey(now),
        activeDelivery: null,
      };
      await storeJobProfile(ownerKey, jobProfile);
      void incrementQuestProgress(ownerKey, "work_shift", 1, now);
      return NextResponse.json(
        {
          ok: true,
          gross,
          tax,
          net,
          vehicleBonusPct: vSpec?.deliveryBonusPct ?? 0,
          balance: paid.balance,
          profile,
          jobProfile,
        },
        { headers: NO_STORE },
      );
    }

    // Dynamic Spatial Action 3: Police Physical Beat Patrol
    if (fields.action === "start_patrol") {
      if (
        jobProfile.currentCareer !== "police" &&
        !jobProfile.certifications.includes("security_officer")
      ) {
        return err("not_police", 403);
      }
      const beat = generatePatrolBeat(now);
      jobProfile = { ...jobProfile, activePatrol: beat };
      await storeJobProfile(ownerKey, jobProfile);
      return NextResponse.json({ ok: true, patrol: beat, jobProfile }, { headers: NO_STORE });
    }

    if (fields.action === "complete_patrol") {
      const beat = jobProfile.activePatrol;
      if (!beat || beat.expiresAt < now) return err("no_active_patrol", 409);
      const near = isNearSpatialTarget(
        actorPos.space,
        actorPos.x,
        actorPos.y,
        beat.space,
        beat.x,
        beat.y,
        4.6,
      );
      if (!near) {
        return NextResponse.json(
          { error: "too_far_from_patrol", target: beat, actorPos },
          { status: 409, headers: NO_STORE },
        );
      }
      const vSpec = vehicleSpecFor(equippedVehicle);
      const bountyMult = vSpec?.hasSiren ? 1.2 : 1;
      const gross = Math.round(beat.rewardCoins * gov.policies.policeBountyMult * bountyMult);
      const tax = Math.floor(gross * gov.policies.incomeTaxRate);
      const net = Math.max(50, gross - tax);
      const paid = await awardMmoCoins(session, ownerKey, net, "job_salary");
      if (!paid.ok) return err(paid.error, 503);
      if (tax > 0) void depositCityTreasury(tax);

      let nextXp = jobProfile.xp + 28;
      let nextLevel = jobProfile.level;
      while (nextXp >= xpForNextLevel(nextLevel) && nextLevel < 50) {
        nextXp -= xpForNextLevel(nextLevel);
        nextLevel += 1;
      }
      jobProfile = {
        ...jobProfile,
        xp: nextXp,
        level: nextLevel,
        shiftsCompleted: jobProfile.shiftsCompleted + 1,
        totalEarned: jobProfile.totalEarned + net,
        totalTaxPaid: jobProfile.totalTaxPaid + tax,
        creditScore: Math.min(900, jobProfile.creditScore + 5),
        lastWorkDay: jstDayKey(now),
        activePatrol: null,
      };
      await storeJobProfile(ownerKey, jobProfile);
      void incrementQuestProgress(ownerKey, "law_duty", 1, now);
      return NextResponse.json(
        { ok: true, gross, tax, net, balance: paid.balance, jobProfile },
        { headers: NO_STORE },
      );
    }

    if (fields.action === "start_task") {
      const task = generateJobTask(jobProfile.currentCareer, now);
      jobProfile = { ...jobProfile, activeTask: task };
      await storeJobProfile(ownerKey, jobProfile);
      return NextResponse.json({ ok: true, task, jobProfile }, { headers: NO_STORE });
    }

    if (fields.action === "submit_shift") {
      const career = careerById(jobProfile.currentCareer) ?? CAREERS[0];
      if (now < jobProfile.lastShiftAt + career.cooldownMs) {
        return NextResponse.json(
          {
            error: "cooldown",
            retryAfterMs: jobProfile.lastShiftAt + career.cooldownMs - now,
          },
          { status: 409, headers: NO_STORE },
        );
      }
      if (profile.hunger < career.hungerCost) {
        return err("too_tired", 409);
      }

      let taskCorrect: boolean | null = null;
      if (
        typeof fields.choiceIndex === "number" &&
        jobProfile.activeTask &&
        jobProfile.activeTask.careerId === career.id &&
        jobProfile.activeTask.expiresAt >= now
      ) {
        taskCorrect = Math.floor(fields.choiceIndex) === jobProfile.activeTask.correctIndex;
      }

      const rawPayout = computeShiftPayout(jobProfile, career, taskCorrect);
      const dynTax = Math.floor(rawPayout.gross * gov.policies.incomeTaxRate);
      const dynNet = Math.max(25, rawPayout.gross - dynTax);
      const payout = { ...rawPayout, tax: dynTax, net: dynNet };
      const paid = await awardMmoCoins(session, ownerKey, payout.net, "job_salary");
      if (!paid.ok) return err(paid.error, 503);
      if (payout.tax > 0) void depositCityTreasury(payout.tax);

      // Update hunger & possible item drops
      const dropLog: string[] = [];
      profile = { ...profile, hunger: Math.max(0, profile.hunger - career.hungerCost) };
      if (career.dropItems) {
        for (const drop of career.dropItems) {
          const boost =
            career.id === "engineer" && jobProfile.certifications.includes("master_engineer")
              ? 1.5
              : 1;
          if (Math.random() < drop.chance * boost) {
            profile = addItem(profile, drop.itemId, 1);
            dropLog.push(drop.itemId);
          }
        }
      }
      await storeProfile(ownerKey, profile);

      // Risky underground broker career chance of police heat
      let wantedNotice = false;
      if (career.isRisky && Math.random() < 0.25) {
        const nextWanted = Math.min(5, prison.wantedLevel + 1);
        await storePrisonRecord({
          ...prison,
          wantedLevel: nextWanted,
          bounty: Math.min(500_000, prison.bounty + 550),
          lastCrimeAt: now,
        });
        wantedNotice = true;
      }

      const earnedXp = taskCorrect === true ? 32 : taskCorrect === false ? 14 : 22;
      let nextXp = jobProfile.xp + earnedXp;
      let nextLevel = jobProfile.level;
      let leveledUp = false;
      while (nextXp >= xpForNextLevel(nextLevel) && nextLevel < 50) {
        nextXp -= xpForNextLevel(nextLevel);
        nextLevel += 1;
        leveledUp = true;
      }
      const today = jstDayKey(now);
      const nextStreak =
        jobProfile.lastWorkDay === today
          ? Math.max(1, jobProfile.streakDays)
          : jobProfile.streakDays + 1;

      jobProfile = {
        ...jobProfile,
        xp: nextXp,
        level: nextLevel,
        shiftsCompleted: jobProfile.shiftsCompleted + 1,
        totalEarned: jobProfile.totalEarned + payout.net,
        totalTaxPaid: jobProfile.totalTaxPaid + payout.tax,
        creditScore: Math.min(
          900,
          Math.max(300, jobProfile.creditScore + (taskCorrect === false ? -2 : 4)),
        ),
        lastShiftAt: now,
        streakDays: nextStreak,
        lastWorkDay: today,
        activeTask: null,
      };
      await storeJobProfile(ownerKey, jobProfile);
      void incrementQuestProgress(ownerKey, "work_shift", 1, now);
      if (leveledUp) {
        void pushMmoNews(
          "job",
          `${session.username || "市民"} が ${career.name} Lv.${nextLevel} に昇格しました！`,
          now,
        );
      }

      return NextResponse.json(
        {
          ok: true,
          jobProfile,
          profile,
          balance: paid.balance,
          payout,
          taskCorrect,
          leveledUp,
          drops: dropLog,
          wantedNotice,
        },
        { headers: NO_STORE },
      );
    }

    if (fields.action === "claim_unemployment") {
      if (now < jobProfile.lastInsuranceAt + UNEMPLOYMENT_COOLDOWN_MS) {
        return err("cooldown", 409);
      }
      const bal = (await getMmoBalance(session, ownerKey)) ?? 0;
      const hasCard = countItem(profile, "unemployment_card") > 0;
      if (!hasCard && bal > UNEMPLOYMENT_MAX_BALANCE) {
        return err("not_eligible", 409);
      }
      const baseBenefit = hasCard
        ? Math.round(UNEMPLOYMENT_BASE_PAYOUT * 1.5)
        : UNEMPLOYMENT_BASE_PAYOUT;
      const stimMult = Math.max(0.75, Math.min(2.0, gov.policies.stimulusPayout / 500));
      const benefit = Math.round(baseBenefit * stimMult);
      const paid = await awardMmoCoins(session, ownerKey, benefit, "unemployment_benefit");
      if (!paid.ok) return err(paid.error, 503);
      jobProfile = { ...jobProfile, lastInsuranceAt: now };
      await storeJobProfile(ownerKey, jobProfile);
      return NextResponse.json(
        { ok: true, amount: benefit, balance: paid.balance, jobProfile },
        { headers: NO_STORE },
      );
    }

    if (fields.action === "publish_news") {
      if (jobProfile.currentCareer !== "journalist") return err("not_journalist", 403);
      const headline = sanitizeText(fields.headline, 80);
      if (!headline) return err("invalid_text", 400);
      await pushMmoNews("job", `【号外・${session.username || "記者"}】${headline}`, now);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }

    return err("invalid_action", 400);
  });
}
