import { NextResponse } from "next/server";
import { getRequestSession, isSameOriginRequest, sessionOwnerKey } from "@/lib/auth";
import { itemById } from "@/lib/worldbox/economy/items";
import { hasSecurityCoverage } from "@/lib/worldbox/economy/machines";
import { awardMmoCoins, getMmoBalance, spendMmoCoins } from "@/lib/worldbox/economy/mmo-wallet";
import { addItem, countItem, removeItem } from "@/lib/worldbox/player/profile";
import { loadProfile, storeProfile } from "@/lib/worldbox/player/profile-online";
import {
  findPresenceOwnerKey,
  listPresence,
  putPresence,
} from "@/lib/worldbox/player/presence-online";
import { presenceIdFor } from "@/lib/worldbox/player/presence";
import { vehicleSpecFor } from "@/lib/worldbox/player/vehicles";
import { loadEquippedVehicle } from "@/lib/worldbox/player/vehicles-online";
import { parseSave, serializeSave } from "@/lib/worldbox/core/save";
import { loadWorldBoxSave, storeWorldBoxSave } from "@/lib/worldbox/core/save-online";
import { loadTileOverrides } from "@/lib/worldbox/world/tiles-online";
import { stationNear } from "@/lib/worldbox/world/lobby";
import {
  buildPrison,
  prisonCellEntry,
  PRISON_VISITOR_ENTRY,
} from "@/lib/worldbox/world/prison-map";
import { pickRandomSpawn } from "@/lib/worldbox/world/spawn";
import { loadJobProfile, storeJobProfile } from "@/lib/worldbox/social/jobs-online";
import { depositCityTreasury, loadGovernanceState } from "@/lib/worldbox/social/governance-online";
import {
  CRIME_TARGET_SPOTS,
  crimeById,
  CRIMES,
  dailyNpcSuspects,
  generateSecuritySequence,
  isActivelyJailed,
  isPrisonGuardSweepingVent,
  nearAnyCrimeSpot,
  PRISON_LABOR_TASKS,
  releasePrisoner,
  remainingBailAmount,
  sentencePlayer,
  type PrisonRecord,
} from "@/lib/worldbox/social/prison";
import {
  isPrisonEnabled,
  listActivePrisonSummary,
  loadPrisonRecord,
  storePrisonRecord,
} from "@/lib/worldbox/social/prison-online";
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

async function getActorLocation(
  ownerKey: string,
): Promise<{ space: string; x: number; y: number }> {
  const selfId = presenceIdFor(ownerKey);
  const now = Date.now();
  const entries = await listPresence();
  const live = entries.find((e) => e.id === selfId && now - e.ts <= 20_000);
  if (live) return { space: live.space, x: live.x, y: live.y };
  const saved = parseSave(await loadWorldBoxSave(ownerKey));
  if (saved) return { space: saved.space, x: saved.x, y: saved.y };
  return { space: "lobby", x: 28.5, y: 28.5 };
}

async function movePlayerSpaceServer(
  ownerKey: string,
  name: string,
  space: string,
  x: number,
  y: number,
) {
  const prev = parseSave(await loadWorldBoxSave(ownerKey));
  const worldReturn =
    space === "world"
      ? null
      : prev?.space === "world"
        ? { x: prev.x, y: prev.y }
        : (prev?.worldReturn ?? null);
  await storeWorldBoxSave(ownerKey, serializeSave({ space, x, y, worldReturn }));
  await putPresence(
    ownerKey,
    { name: name || "プレイヤー", x, y, vx: 0, vy: 0, face: 1, space },
    Date.now(),
  );
}

export async function GET(request: Request) {
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (!isPrisonEnabled()) return err("prison_unavailable", 503);

  const ownerKey = sessionOwnerKey(session);
  const now = Date.now();
  const [record, summary, jobProfile, balance, presenceList, gov, actorPos] = await Promise.all([
    loadPrisonRecord(ownerKey, session.username || "市民"),
    listActivePrisonSummary(now),
    loadJobProfile(ownerKey),
    getMmoBalance(session, ownerKey),
    listPresence(),
    loadGovernanceState(now),
    getActorLocation(ownerKey),
  ]);

  const isPolice = jobProfile.currentCareer === "police";
  const isLawyer =
    jobProfile.currentCareer === "lawyer" || jobProfile.certifications.includes("bar_exam");

  const nearbyTargets = presenceList
    .filter((p) => p.id !== presenceIdFor(ownerKey) && now - p.ts <= 15_000)
    .map((p) => ({
      presenceId: p.id,
      name: p.name,
      space: p.space,
      x: Math.round(p.x),
      y: Math.round(p.y),
    }));

  const bailCost = Math.round(
    remainingBailAmount(record, now, isLawyer) * gov.policies.bailMultiplier,
  );

  return NextResponse.json(
    {
      self: {
        ...record,
        jailed: isActivelyJailed(record, now),
        remainingMs: isActivelyJailed(record, now) ? Math.max(0, record.releaseAt - now) : 0,
        bailCost,
      },
      inmates: summary.inmates.map((i) => ({
        ownerKey: i.ownerKey,
        presenceId: presenceIdFor(i.ownerKey),
        name: i.name,
        inmateNumber: i.inmateNumber,
        cellId: i.cellId,
        remainingMs: Math.max(0, i.releaseAt - now),
        bailCost: Math.round(remainingBailAmount(i, now, isLawyer) * gov.policies.bailMultiplier),
        charges: i.charges.slice(0, 3),
        careLogs: i.careLogs.slice(0, 3),
      })),
      wanted: summary.wanted.map((w) => ({
        ownerKey: w.ownerKey,
        presenceId: presenceIdFor(w.ownerKey),
        name: w.name,
        wantedLevel: w.wantedLevel,
        bounty: w.bounty,
      })),
      npcSuspects: dailyNpcSuspects(now),
      crimes: CRIMES,
      crimeSpots: CRIME_TARGET_SPOTS,
      prisonSpots: {
        work: { space: "prison", x: 35, y: 9, label: "東棟・懲役ワークプレス" },
        desk: { space: "prison", x: 25, y: 26, label: "面会室・保釈申請デスク" },
        visit: { space: "prison", x: 18, y: 26, label: "面会差し入れカウンター" },
        escape: { space: "prison", x: 4, y: 27, label: "南西ダクト換気口" },
      },
      guardSweepingVent: isPrisonGuardSweepingVent(now),
      actorPos,
      govPolicies: gov.policies,
      laborTasks: PRISON_LABOR_TASKS,
      balance,
      isPolice,
      isLawyer,
      nearbyTargets,
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return err("forbidden", 403);
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (!isPrisonEnabled()) return err("prison_unavailable", 503);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err("invalid_request", 400);
  }
  const fields = (body ?? {}) as Record<string, unknown>;
  const ownerKey = sessionOwnerKey(session);
  const displayName = (session.username || "市民").slice(0, 24);

  return withUserLock(ownerKey, async () => {
    const now = Date.now();
    let record = await loadPrisonRecord(ownerKey, displayName);
    record = { ...record, name: displayName };
    let profile = await loadProfile(ownerKey);
    const [jobProfile, actorPos, gov, equippedVehicle] = await Promise.all([
      loadJobProfile(ownerKey),
      getActorLocation(ownerKey),
      loadGovernanceState(now),
      loadEquippedVehicle(ownerKey),
    ]);
    const isPolice = jobProfile.currentCareer === "police";
    const isLawyer =
      jobProfile.currentCareer === "lawyer" || jobProfile.certifications.includes("bar_exam");
    const prisonMap = buildPrison();

    if (fields.action === "get_challenge") {
      const kind = typeof fields.kind === "string" ? fields.kind : "atm_hack";
      if (kind === "jailbreak") {
        if (actorPos.space !== "prison" || Math.hypot(actorPos.x - 4.5, actorPos.y - 27.5) > 2.8) {
          return NextResponse.json(
            {
              error: "not_at_vent",
              spot: { space: "prison", x: 4, y: 27, label: "南西メンテナンス換気口" },
            },
            { status: 409, headers: NO_STORE },
          );
        }
      } else if (crimeById(kind)) {
        const spot = nearAnyCrimeSpot(
          crimeById(kind)!.id,
          actorPos.space,
          actorPos.x,
          actorPos.y,
          4.5,
        );
        if (!spot) {
          return NextResponse.json(
            { error: "not_at_crime_spot", spots: CRIME_TARGET_SPOTS[crimeById(kind)!.id] },
            { status: 409, headers: NO_STORE },
          );
        }
      }
      const len = kind === "vault_heist" ? 4 : 3;
      const challenge = generateSecuritySequence(kind, now, len);
      return NextResponse.json({ ok: true, seed: now, challenge }, { headers: NO_STORE });
    }

    if (fields.action === "visit_prison") {
      await movePlayerSpaceServer(
        ownerKey,
        displayName,
        "prison",
        PRISON_VISITOR_ENTRY.x,
        PRISON_VISITOR_ENTRY.y,
      );
      return NextResponse.json(
        {
          ok: true,
          forceMove: { space: "prison", x: PRISON_VISITOR_ENTRY.x, y: PRISON_VISITOR_ENTRY.y },
        },
        { headers: NO_STORE },
      );
    }

    if (fields.action === "leave_prison") {
      if (isActivelyJailed(record, now)) {
        return err("still_jailed", 409);
      }
      if (record.status === "jailed") {
        record = releasePrisoner(record);
        await storePrisonRecord(record);
      }
      await movePlayerSpaceServer(ownerKey, displayName, "lobby", 28.5, 28.5);
      return NextResponse.json(
        { ok: true, forceMove: { space: "lobby", x: 28.5, y: 28.5 }, self: record },
        { headers: NO_STORE },
      );
    }

    if (fields.action === "claim_release") {
      if (record.status === "jailed" && record.releaseAt > now) {
        return err("sentence_not_finished", 409);
      }
      record = releasePrisoner(record);
      await storePrisonRecord(record);
      await movePlayerSpaceServer(ownerKey, displayName, "lobby", 28.5, 28.5);
      return NextResponse.json(
        { ok: true, forceMove: { space: "lobby", x: 28.5, y: 28.5 }, self: record },
        { headers: NO_STORE },
      );
    }

    if (fields.action === "prison_labor") {
      if (!isActivelyJailed(record, now)) return err("not_jailed", 409);
      const nearWork =
        actorPos.space === "prison" &&
        stationNear(prisonMap.objects, Math.floor(actorPos.x), Math.floor(actorPos.y)) ===
          "prison_work";
      if (!nearWork) {
        return NextResponse.json(
          {
            error: "not_at_work_station",
            spot: { space: "prison", x: 35, y: 9, label: "東棟・懲役ワークプレス工場" },
          },
          { status: 409, headers: NO_STORE },
        );
      }
      const task = PRISON_LABOR_TASKS.find((t) => t.id === fields.taskId) ?? PRISON_LABOR_TASKS[0];
      if (now < record.lastLaborAt + task.cooldownMs) {
        return err("cooldown", 409);
      }
      const timingQuality =
        typeof fields.timingQuality === "number" && Number.isFinite(fields.timingQuality)
          ? Math.max(0.7, Math.min(1.35, fields.timingQuality))
          : 1;
      const wage = Math.round(task.wage * timingQuality);
      const reducedSec = Math.round(task.reduceSec * timingQuality);
      const paid = await awardMmoCoins(session, ownerKey, wage, "prison_labor");
      if (!paid.ok) return err(paid.error, 503);

      let released = false;
      const nextRelease = record.releaseAt - reducedSec * 1000;
      record = {
        ...record,
        releaseAt: Math.max(now, nextRelease),
        laborCount: record.laborCount + 1,
        lastLaborAt: now,
      };
      if (record.releaseAt <= now) {
        record = releasePrisoner(record);
        released = true;
        await movePlayerSpaceServer(ownerKey, displayName, "lobby", 28.5, 28.5);
      }
      await storePrisonRecord(record);
      let bonusItem: string | null = null;
      if (task.bonusItem && Math.random() < 0.45) {
        profile = addItem(profile, task.bonusItem, 1);
        await storeProfile(ownerKey, profile);
        bonusItem = task.bonusItem;
      }
      void incrementQuestProgress(ownerKey, "law_duty", 1, now);
      return NextResponse.json(
        {
          ok: true,
          wage,
          reducedSec,
          bonusItem,
          released,
          forceMove: released ? { space: "lobby", x: 28.5, y: 28.5 } : null,
          balance: paid.balance,
          profile,
          self: {
            ...record,
            jailed: isActivelyJailed(record, now),
            remainingMs: isActivelyJailed(record, now) ? Math.max(0, record.releaseAt - now) : 0,
            bailCost: Math.round(
              remainingBailAmount(record, now, isLawyer) * gov.policies.bailMultiplier,
            ),
          },
        },
        { headers: NO_STORE },
      );
    }

    if (fields.action === "pay_bail") {
      const targetKey =
        typeof fields.targetOwnerKey === "string" && fields.targetOwnerKey
          ? fields.targetOwnerKey
          : ownerKey;
      if (targetKey === ownerKey && actorPos.space === "prison") {
        const atDesk =
          stationNear(prisonMap.objects, Math.floor(actorPos.x), Math.floor(actorPos.y)) ===
          "prison_desk";
        if (!atDesk) {
          return NextResponse.json(
            {
              error: "not_at_bail_desk",
              spot: { space: "prison", x: 25, y: 26, label: "面会室・保釈申請デスク" },
            },
            { status: 409, headers: NO_STORE },
          );
        }
      }
      const targetRec = targetKey === ownerKey ? record : await loadPrisonRecord(targetKey);
      if (!isActivelyJailed(targetRec, now)) return err("not_jailed", 409);
      const bailCost = Math.round(
        remainingBailAmount(targetRec, now, isLawyer) * gov.policies.bailMultiplier,
      );
      const paid = await spendMmoCoins(session, ownerKey, bailCost, "shop_buy");
      if (!paid.ok) return err(paid.error, 409);
      void depositCityTreasury(Math.floor(bailCost * 0.5));

      const freed = releasePrisoner(targetRec);
      await storePrisonRecord(freed);
      const freedEntry = prisonCellEntry(targetRec.cellId);
      void freedEntry;
      await movePlayerSpaceServer(targetKey, freed.name, "lobby", 28.5, 28.5);
      await pushMmoNews(
        "prison",
        targetKey === ownerKey
          ? `${displayName} が保釈金 ¥${bailCost.toLocaleString()} を支払い釈放されました。`
          : `${displayName} が囚人 ${freed.name} を保釈させました（¥${bailCost.toLocaleString()}）！`,
        now,
      );
      return NextResponse.json(
        {
          ok: true,
          paidBail: bailCost,
          balance: paid.balance,
          forceMove: targetKey === ownerKey ? { space: "lobby", x: 28.5, y: 28.5 } : null,
          self: targetKey === ownerKey ? freed : undefined,
        },
        { headers: NO_STORE },
      );
    }

    if (fields.action === "care_package") {
      const targetKey = typeof fields.targetOwnerKey === "string" ? fields.targetOwnerKey : "";
      if (!targetKey || targetKey === ownerKey) return err("invalid_target", 400);
      if (actorPos.space === "prison") {
        const atVisit =
          stationNear(prisonMap.objects, Math.floor(actorPos.x), Math.floor(actorPos.y)) ===
          "prison_visit";
        if (!atVisit) {
          return NextResponse.json(
            {
              error: "not_at_visit_counter",
              spot: { space: "prison", x: 18, y: 26, label: "面会差し入れカウンター" },
            },
            { status: 409, headers: NO_STORE },
          );
        }
      }
      const targetRec = await loadPrisonRecord(targetKey);
      if (!isActivelyJailed(targetRec, now)) return err("not_jailed", 409);

      const itemId = typeof fields.itemId === "string" ? fields.itemId : "";
      if (!itemId || !itemById(itemId)) return err("unknown_item", 400);
      if (countItem(profile, itemId) < 1) return err("not_enough_items", 409);
      const nextProf = removeItem(profile, itemId, 1);
      if (!nextProf) return err("not_enough_items", 409);
      await storeProfile(ownerKey, nextProf);

      const targetProf = addItem(await loadProfile(targetKey), itemId, 1);
      await storeProfile(targetKey, targetProf);
      const itemDef = itemById(itemId)!;
      const msg = sanitizeText(fields.message, 48) || `${itemDef.name}の差し入れ`;
      const updatedTarget: PrisonRecord = {
        ...targetRec,
        careLogs: [
          { at: now, fromName: displayName, message: `${itemDef.name}: ${msg}` },
          ...targetRec.careLogs,
        ].slice(0, 10),
      };
      await storePrisonRecord(updatedTarget);
      return NextResponse.json({ ok: true, profile: nextProf }, { headers: NO_STORE });
    }

    if (fields.action === "jailbreak") {
      if (!isActivelyJailed(record, now)) return err("not_jailed", 409);
      if (now < record.lastEscapeAt + 25_000) return err("cooldown", 409);
      // Must physically reach South-West Maintenance Vent (4,27) inside prison
      if (actorPos.space !== "prison" || Math.hypot(actorPos.x - 4.5, actorPos.y - 27.5) > 2.8) {
        return NextResponse.json(
          {
            error: "not_at_vent",
            spot: { space: "prison", x: 4, y: 27, label: "南西メンテナンス換気口" },
          },
          { status: 409, headers: NO_STORE },
        );
      }

      const guardSpotted = isPrisonGuardSweepingVent(now);
      let pinSolved = false;
      if (
        typeof fields.challengeSeed === "number" &&
        Array.isArray(fields.pinSequence) &&
        now - fields.challengeSeed <= 120_000
      ) {
        const seqArr = fields.pinSequence as unknown[];
        const expected = generateSecuritySequence(
          "jailbreak",
          fields.challengeSeed,
          3,
        ).targetSequence;
        pinSolved =
          seqArr.length === expected.length && expected.every((n, i) => Number(seqArr[i]) === n);
      }

      const hasLockpick = countItem(profile, "lockpick") > 0;
      if (hasLockpick) {
        const nextProf = removeItem(profile, "lockpick", 1);
        if (nextProf) {
          profile = nextProf;
          await storeProfile(ownerKey, profile);
        }
      }

      const chance = guardSpotted
        ? 0.08
        : pinSolved
          ? hasLockpick
            ? 0.94
            : 0.78
          : hasLockpick
            ? 0.55
            : 0.25;

      if (Math.random() < chance) {
        const wild = pickRandomSpawn(Math.random);
        const escaped: PrisonRecord = {
          ...releasePrisoner(record),
          wantedLevel: Math.min(5, Math.max(2, record.wantedLevel + 2)),
          bounty: Math.min(500_000, record.bounty + 3200),
          escapeAttempts: record.escapeAttempts + 1,
          escapedCount: record.escapedCount + 1,
          lastEscapeAt: now,
          charges: [
            { at: now, code: "jailbreak", label: "脱獄逃亡罪", bountyDelta: 3200 },
            ...record.charges,
          ].slice(0, 12),
        };
        await storePrisonRecord(escaped);
        await movePlayerSpaceServer(ownerKey, displayName, "world", wild.x, wild.y);
        await pushMmoNews(
          "prison",
          `【緊急】囚人 ${displayName} (${record.inmateNumber}) が地下ダクトから脱獄逃亡！懸賞金が引き上げられました！`,
          now,
        );
        return NextResponse.json(
          {
            ok: true,
            escaped: true,
            usedLockpick: hasLockpick,
            pinSolved,
            forceMove: { space: "world", x: wild.x, y: wild.y },
            profile,
            self: escaped,
          },
          { headers: NO_STORE },
        );
      }
      const failed: PrisonRecord = {
        ...record,
        releaseAt: Math.min(now + 12 * 60_000, record.releaseAt + (guardSpotted ? 55_000 : 35_000)),
        escapeAttempts: record.escapeAttempts + 1,
        lastEscapeAt: now,
      };
      await storePrisonRecord(failed);
      return NextResponse.json(
        {
          ok: true,
          escaped: false,
          caughtByGuard: guardSpotted,
          usedLockpick: hasLockpick,
          penaltySec: guardSpotted ? 55 : 35,
          profile,
          self: {
            ...failed,
            jailed: true,
            remainingMs: Math.max(0, failed.releaseAt - now),
            bailCost: Math.round(
              remainingBailAmount(failed, now, isLawyer) * gov.policies.bailMultiplier,
            ),
          },
        },
        { headers: NO_STORE },
      );
    }

    if (fields.action === "commit_crime") {
      if (isActivelyJailed(record, now)) return err("in_prison", 409);
      const crime = crimeById(fields.crimeId);
      if (!crime) return err("unknown_crime", 400);
      if (now < record.lastCrimeAt + crime.cooldownMs) return err("cooldown", 409);

      const [presenceList, overrides] = await Promise.all([listPresence(), loadTileOverrides()]);
      const selfPres = presenceList.find((p) => p.id === presenceIdFor(ownerKey));

      // Verify physical proximity to target spot (or nearby citizen for pickpocket)
      let atValidSpot = nearAnyCrimeSpot(crime.id, actorPos.space, actorPos.x, actorPos.y, 4.5);
      if (!atValidSpot && crime.id === "pickpocket") {
        const nearPlayer = presenceList.find(
          (p) =>
            p.id !== presenceIdFor(ownerKey) &&
            now - p.ts <= 20_000 &&
            p.space === actorPos.space &&
            Math.hypot(p.x - actorPos.x, p.y - actorPos.y) <= 4.5,
        );
        if (nearPlayer) {
          atValidSpot = {
            space: nearPlayer.space,
            x: Math.round(nearPlayer.x),
            y: Math.round(nearPlayer.y),
            label: `${nearPlayer.name} の近く`,
          };
        }
      }
      if (!atValidSpot) {
        return NextResponse.json(
          { error: "not_at_crime_spot", spots: CRIME_TARGET_SPOTS[crime.id] },
          { status: 409, headers: NO_STORE },
        );
      }

      // Check vault/ATM dial challenge when submitted
      let pinSolved: boolean | null = null;
      if (crime.id === "vault_heist" || crime.id === "atm_hack") {
        if (
          typeof fields.challengeSeed === "number" &&
          Array.isArray(fields.pinSequence) &&
          now - fields.challengeSeed <= 120_000
        ) {
          const seqArr = fields.pinSequence as unknown[];
          const len = crime.id === "vault_heist" ? 4 : 3;
          const expected = generateSecuritySequence(
            crime.id,
            fields.challengeSeed,
            len,
          ).targetSequence;
          pinSolved =
            seqArr.length === expected.length && expected.every((n, i) => Number(seqArr[i]) === n);
        }
      }

      let blockedByCamera = false;
      if (selfPres && selfPres.space === "world") {
        const cov = hasSecurityCoverage(overrides, selfPres.x, selfPres.y);
        if (cov.protected && cov.ownerId !== selfPres.id) {
          blockedByCamera = true;
        }
      }

      const boostItem = crime.boostItemId && countItem(profile, crime.boostItemId) > 0;
      const pinMod = pinSolved === true ? 0.24 : pinSolved === false ? -0.45 : 0;
      const successChance = blockedByCamera
        ? 0.08
        : Math.max(0.05, Math.min(0.95, crime.baseSuccess + (boostItem ? 0.14 : 0) + pinMod));

      void incrementQuestProgress(ownerKey, "law_duty", 1, now);

      if (Math.random() < successChance) {
        const reward =
          crime.minReward + Math.floor(Math.random() * (crime.maxReward - crime.minReward + 1));
        const paid = await awardMmoCoins(session, ownerKey, reward, "crime_heist");
        if (!paid.ok) return err(paid.error, 503);

        const nextWanted = Math.min(5, record.wantedLevel + crime.wantedHeat);
        const bountyGain = Math.round(reward * 0.6);
        record = {
          ...record,
          wantedLevel: nextWanted,
          bounty: Math.min(500_000, record.bounty + bountyGain),
          lastCrimeAt: now,
          charges: [
            {
              at: now,
              code: crime.id,
              label: `${crime.name}（${atValidSpot.label}）`,
              bountyDelta: bountyGain,
            },
            ...record.charges,
          ].slice(0, 12),
        };
        await storePrisonRecord(record);
        await storeJobProfile(ownerKey, {
          ...jobProfile,
          creditScore: Math.max(300, jobProfile.creditScore - 18),
        });
        if (nextWanted >= 3) {
          await pushMmoNews(
            "crime",
            `[指名手配 Lv${nextWanted}] ${displayName} が「${atValidSpot.label}」で ${crime.name} を実行`,
            now,
          );
        }
        return NextResponse.json(
          {
            ok: true,
            success: true,
            reward,
            spot: atValidSpot.label,
            balance: paid.balance,
            self: record,
          },
          { headers: NO_STORE },
        );
      }

      // Caught & Jailed immediately!
      const cellPos = prisonCellEntry(record.cellId);
      const bailAmount = Math.round(
        crime.sentenceSec * crime.bailPerSec * gov.policies.bailMultiplier,
      );
      const jailed = sentencePlayer(
        { ...record, lastCrimeAt: now },
        {
          code: crime.id,
          label: blockedByCamera ? `${crime.name}（AI防犯カメラ検知）` : `${crime.name}（現行犯）`,
          sentenceMs: crime.sentenceSec * 1000,
          bailAmount,
          arrestedBy: blockedByCamera ? "AI防犯カメラ網" : "メトロ治安局",
          now,
        },
      );
      await storePrisonRecord(jailed);
      await storeJobProfile(ownerKey, {
        ...jobProfile,
        creditScore: Math.max(300, jobProfile.creditScore - 30),
      });
      await movePlayerSpaceServer(ownerKey, displayName, "prison", cellPos.x, cellPos.y);
      await pushMmoNews(
        "prison",
        blockedByCamera
          ? `${displayName} がAI防犯カメラに検知され ${crime.name} の容疑で現行犯逮捕！`
          : `${displayName} が ${atValidSpot.label} で ${crime.name} に失敗し、中央刑務所へ送致されました！`,
        now,
      );
      return NextResponse.json(
        {
          ok: true,
          success: false,
          blockedByCamera,
          forceMove: { space: "prison", x: cellPos.x, y: cellPos.y },
          self: {
            ...jailed,
            jailed: true,
            remainingMs: Math.max(0, jailed.releaseAt - now),
            bailCost: Math.round(
              remainingBailAmount(jailed, now, isLawyer) * gov.policies.bailMultiplier,
            ),
          },
        },
        { headers: NO_STORE },
      );
    }

    if (fields.action === "arrest_npc") {
      if (isActivelyJailed(record, now)) return err("in_prison", 409);
      const suspects = dailyNpcSuspects(now);
      const target = suspects.find((s) => s.id === fields.suspectId);
      if (!target) return err("unknown_suspect", 400);
      if (now < record.lastCrimeAt + 30_000) return err("cooldown", 409);

      const hasCuffs = countItem(profile, "police_cuffs") > 0;
      const secCert = jobProfile.certifications.includes("security_officer");
      const vSpec = vehicleSpecFor(equippedVehicle);
      const vehicleBoost = vSpec?.bountyBonusPct ? 1 + vSpec.bountyBonusPct / 100 : 1;
      const mult =
        (isPolice ? 1.25 : 1) *
        (secCert ? 1.25 : 1) *
        (hasCuffs ? 1.15 : 1) *
        gov.policies.policeBountyMult *
        vehicleBoost;
      const reward = Math.round(target.bounty * mult);
      const paid = await awardMmoCoins(session, ownerKey, reward, "bounty_reward");
      if (!paid.ok) return err(paid.error, 503);

      record = {
        ...record,
        arrestsCount: record.arrestsCount + 1,
        lastCrimeAt: now,
      };
      await storePrisonRecord(record);
      void incrementQuestProgress(ownerKey, "law_duty", 1, now);
      await pushMmoNews(
        "prison",
        `${isPolice ? "治安維持官 " : ""}${displayName} が指名手配犯『${target.name}』を逮捕し、懸賞金 ¥${reward.toLocaleString()} を獲得！`,
        now,
      );
      return NextResponse.json(
        { ok: true, reward, suspect: target, balance: paid.balance, self: record },
        { headers: NO_STORE },
      );
    }

    if (fields.action === "arrest_player") {
      if (isActivelyJailed(record, now)) return err("in_prison", 409);
      const presenceId = typeof fields.targetPresenceId === "string" ? fields.targetPresenceId : "";
      if (!presenceId || presenceId === presenceIdFor(ownerKey)) return err("invalid_target", 400);
      const targetKey = await findPresenceOwnerKey(presenceId);
      if (!targetKey) return err("target_offline", 409);

      const presenceList = await listPresence();
      const targetPres = presenceList.find((p) => p.id === presenceId);
      if (
        targetPres &&
        (targetPres.space !== actorPos.space ||
          Math.hypot(targetPres.x - actorPos.x, targetPres.y - actorPos.y) > 6.5)
      ) {
        return NextResponse.json(
          {
            error: "target_too_far",
            targetPos: {
              space: targetPres.space,
              x: targetPres.x,
              y: targetPres.y,
              name: targetPres.name,
            },
          },
          { status: 409, headers: NO_STORE },
        );
      }

      const targetRec = await loadPrisonRecord(targetKey);
      if (targetRec.wantedLevel <= 0 || isActivelyJailed(targetRec, now)) {
        return err("not_wanted", 409);
      }

      const sentenceMs = Math.max(90_000, targetRec.wantedLevel * 90_000);
      const baseBounty = Math.max(600, targetRec.bounty);
      const hasCuffs = countItem(profile, "police_cuffs") > 0;
      const secCert = jobProfile.certifications.includes("security_officer");
      const vSpec = vehicleSpecFor(equippedVehicle);
      const vehicleBoost = vSpec?.bountyBonusPct ? 1 + vSpec.bountyBonusPct / 100 : 1;
      const mult =
        (isPolice ? 1.25 : 1) *
        (secCert ? 1.25 : 1) *
        (hasCuffs ? 1.15 : 1) *
        gov.policies.policeBountyMult *
        vehicleBoost;
      const reward = Math.round(baseBounty * mult);

      const paid = await awardMmoCoins(session, ownerKey, reward, "bounty_reward");
      if (!paid.ok) return err(paid.error, 503);

      const cellPos = prisonCellEntry(targetRec.cellId);
      const jailedTarget = sentencePlayer(targetRec, {
        code: "citizen_arrest",
        label: `指名手配逮捕（Lv${targetRec.wantedLevel}）`,
        sentenceMs,
        bailAmount: Math.round(Math.max(1500, baseBounty * 2) * gov.policies.bailMultiplier),
        arrestedBy: displayName,
        now,
      });
      await storePrisonRecord(jailedTarget);
      await movePlayerSpaceServer(targetKey, targetRec.name, "prison", cellPos.x, cellPos.y);
      record = { ...record, arrestsCount: record.arrestsCount + 1 };
      await storePrisonRecord(record);
      void incrementQuestProgress(ownerKey, "law_duty", 1, now);
      await pushMmoNews(
        "prison",
        `${displayName} が手配犯 ${targetRec.name} を確保し刑務所へ護送！（懸賞金 ¥${reward.toLocaleString()}）`,
        now,
      );
      return NextResponse.json(
        { ok: true, reward, arrestedName: targetRec.name, balance: paid.balance, self: record },
        { headers: NO_STORE },
      );
    }

    return err("invalid_action", 400);
  });
}
