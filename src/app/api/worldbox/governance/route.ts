import { NextResponse } from "next/server";
import { getRequestSession, isSameOriginRequest, sessionOwnerKey } from "@/lib/auth";
import { withUserLock } from "@/lib/worldbox/core/user-lock";
import { parseSave, serializeSave } from "@/lib/worldbox/core/save";
import { loadWorldBoxSave, storeWorldBoxSave } from "@/lib/worldbox/core/save-online";
import { awardMmoCoins, getMmoBalance, spendMmoCoins } from "@/lib/worldbox/economy/mmo-wallet";
import { putPresence } from "@/lib/worldbox/player/presence-online";
import { loadJobProfile } from "@/lib/worldbox/social/jobs-online";
import { pushMmoNews } from "@/lib/worldbox/social/mmo-events-online";
import { isActivelyJailed, releasePrisoner } from "@/lib/worldbox/social/prison";
import { loadPrisonRecord, storePrisonRecord } from "@/lib/worldbox/social/prison-online";
import {
  COURT_TRIAL_DURATION_MS,
  evaluateCourtVerdict,
  sanitizePolicies,
  STIMULUS_COOLDOWN_MS,
  type CourtTrial,
} from "@/lib/worldbox/social/governance";
import {
  isGovernanceEnabled,
  listCourtTrials,
  loadCourtTrial,
  loadGovernanceState,
  storeCourtTrial,
  storeGovernanceState,
} from "@/lib/worldbox/social/governance-online";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function err(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

function sanitizeText(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLen);
}

async function moveToLobby(ownerKey: string, name: string) {
  const prev = parseSave(await loadWorldBoxSave(ownerKey));
  await storeWorldBoxSave(
    ownerKey,
    serializeSave({ space: "lobby", x: 28.5, y: 28.5, worldReturn: prev?.worldReturn ?? null }),
  );
  await putPresence(
    ownerKey,
    { name: name || "市民", x: 28.5, y: 28.5, vx: 0, vy: 0, face: 1, space: "lobby" },
    Date.now(),
  );
}

export async function GET(request: Request) {
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (!isGovernanceEnabled()) return err("governance_unavailable", 503);

  const ownerKey = sessionOwnerKey(session);
  const now = Date.now();
  const [gov, trials, jobProfile, balance] = await Promise.all([
    loadGovernanceState(now),
    listCourtTrials(),
    loadJobProfile(ownerKey),
    getMmoBalance(session, ownerKey),
  ]);

  const isLawyer =
    jobProfile.currentCareer === "lawyer" || jobProfile.certifications.includes("bar_exam");
  const lastStim = gov.stimulusClaimed[ownerKey] ?? 0;

  return NextResponse.json(
    {
      selfKey: ownerKey,
      gov,
      trials,
      selfIsMayor: gov.mayorKey === ownerKey,
      selfVotedCandidate: gov.voterBallots[ownerKey] ?? null,
      stimulusCooldownMs: Math.max(0, lastStim + STIMULUS_COOLDOWN_MS - now),
      isLawyer,
      balance,
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return err("forbidden", 403);
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (!isGovernanceEnabled()) return err("governance_unavailable", 503);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return err("invalid_request", 400);
  }

  const ownerKey = sessionOwnerKey(session);
  const displayName = (session.username || "市民").slice(0, 24);
  const action = body.action;

  return withUserLock("governance:global", async () => {
    const now = Date.now();
    let gov = await loadGovernanceState(now);
    const jobProfile = await loadJobProfile(ownerKey);
    const isLawyer =
      jobProfile.currentCareer === "lawyer" || jobProfile.certifications.includes("bar_exam");

    if (action === "run_mayor") {
      if (gov.candidates[ownerKey]) return err("already_candidate", 409);
      if (Object.keys(gov.candidates).length >= 12) return err("candidates_full", 409);
      const manifesto = sanitizeText(body.manifesto, 80) || "成長と治安の両立を目指します";
      const deposit = 1000;
      const paid = await spendMmoCoins(session, ownerKey, deposit, "shop_buy");
      if (!paid.ok) return err(paid.error, 409);

      gov = {
        ...gov,
        treasuryBalance: gov.treasuryBalance + deposit,
        candidates: {
          ...gov.candidates,
          [ownerKey]: {
            ownerKey,
            name: displayName,
            manifesto,
            votes: 0,
            nominatedAt: now,
          },
        },
      };
      await storeGovernanceState(gov);
      void pushMmoNews("job", `[市長選挙出馬] ${displayName}「${manifesto}」`, now);
      return NextResponse.json({ ok: true, gov, balance: paid.balance }, { headers: NO_STORE });
    }

    if (action === "vote_mayor") {
      const candidateKey = typeof body.candidateKey === "string" ? body.candidateKey : "";
      if (!gov.candidates[candidateKey]) return err("unknown_candidate", 404);
      const ballots = { ...gov.voterBallots, [ownerKey]: candidateKey };
      const counts = new Map<string, number>();
      for (const c of Object.values(ballots)) counts.set(c, (counts.get(c) ?? 0) + 1);
      const nextCandidates: typeof gov.candidates = {};
      for (const [k, cand] of Object.entries(gov.candidates)) {
        nextCandidates[k] = { ...cand, votes: counts.get(k) ?? 0 };
      }
      gov = { ...gov, candidates: nextCandidates, voterBallots: ballots };
      await storeGovernanceState(gov);
      return NextResponse.json({ ok: true, gov }, { headers: NO_STORE });
    }

    if (action === "update_policies") {
      if (gov.mayorKey !== ownerKey) return err("not_mayor", 403);
      gov = { ...gov, policies: sanitizePolicies(body.policies) };
      await storeGovernanceState(gov);
      void pushMmoNews(
        "job",
        `[政策改定] ${displayName}市長が都市税制・治安ポリシーを改定（所得税 ${(gov.policies.incomeTaxRate * 100).toFixed(0)}%）`,
        now,
      );
      return NextResponse.json({ ok: true, gov }, { headers: NO_STORE });
    }

    if (action === "claim_stimulus") {
      const last = gov.stimulusClaimed[ownerKey] ?? 0;
      if (now < last + STIMULUS_COOLDOWN_MS) return err("cooldown", 409);
      const amount = gov.policies.stimulusPayout;
      if (gov.treasuryBalance < amount) return err("treasury_empty", 409);

      const paid = await awardMmoCoins(session, ownerKey, amount, "treasury_stimulus");
      if (!paid.ok) return err(paid.error, 503);

      gov = {
        ...gov,
        treasuryBalance: gov.treasuryBalance - amount,
        lastStimulusAt: now,
        stimulusClaimed: { ...gov.stimulusClaimed, [ownerKey]: now },
      };
      await storeGovernanceState(gov);
      return NextResponse.json(
        { ok: true, amount, gov, balance: paid.balance },
        { headers: NO_STORE },
      );
    }

    if (action === "open_trial") {
      const prison = await loadPrisonRecord(ownerKey, displayName);
      if (!isActivelyJailed(prison, now)) return err("not_jailed", 409);
      const paid = await spendMmoCoins(session, ownerKey, 300, "shop_buy");
      if (!paid.ok) return err(paid.error, 409);

      const trial: CourtTrial = {
        id: `tr_${now}_${Math.floor(Math.random() * 999)}`,
        defendantKey: ownerKey,
        defendantName: displayName,
        chargeLabel: prison.charges[0]?.label ?? "メトロ法令違反",
        requestedBail: prison.bailAmount,
        lawyerKey: null,
        lawyerName: null,
        openedAt: now,
        closesAt: now + COURT_TRIAL_DURATION_MS,
        guiltyVotes: [],
        lenientVotes: [],
        status: "open",
      };
      await storeCourtTrial(trial);
      void pushMmoNews("prison", `[公開法廷開廷] ${displayName} が無罪・減刑陪審審理を請求`, now);
      return NextResponse.json({ ok: true, trial, balance: paid.balance }, { headers: NO_STORE });
    }

    const trialId = typeof body.trialId === "string" ? body.trialId : "";
    const trial = trialId ? await loadCourtTrial(trialId) : null;
    if (!trial) return err("trial_not_found", 404);

    if (action === "assign_lawyer") {
      if (!isLawyer) return err("not_lawyer", 403);
      if (trial.status !== "open") return err("trial_closed", 409);
      if (trial.defendantKey === ownerKey) return err("cannot_defend_self", 409);
      const updated = { ...trial, lawyerKey: ownerKey, lawyerName: displayName };
      await storeCourtTrial(updated);
      return NextResponse.json({ ok: true, trial: updated }, { headers: NO_STORE });
    }

    if (action === "vote_jury") {
      if (trial.status !== "open") return err("trial_closed", 409);
      if (trial.defendantKey === ownerKey) return err("defendant_cannot_vote", 409);
      const verdict = body.verdict === "guilty" ? "guilty" : "lenient";
      const lenient = trial.lenientVotes.filter((k) => k !== ownerKey);
      const guilty = trial.guiltyVotes.filter((k) => k !== ownerKey);
      if (verdict === "lenient") lenient.push(ownerKey);
      else guilty.push(ownerKey);
      const updated = { ...trial, lenientVotes: lenient, guiltyVotes: guilty };
      await storeCourtTrial(updated);
      return NextResponse.json({ ok: true, trial: updated }, { headers: NO_STORE });
    }

    if (action === "resolve_trial") {
      if (trial.status !== "open") return err("already_resolved", 409);
      const totalVotes = trial.lenientVotes.length + trial.guiltyVotes.length;
      if (now < trial.closesAt && totalVotes < 3) {
        return err("trial_still_deliberating", 409);
      }
      const outcome = evaluateCourtVerdict(trial);
      const resolved: CourtTrial = { ...trial, status: outcome };
      await storeCourtTrial(resolved);

      if (outcome === "verdict_lenient") {
        const prisoner = await loadPrisonRecord(trial.defendantKey, trial.defendantName);
        if (isActivelyJailed(prisoner, now)) {
          await storePrisonRecord(releasePrisoner(prisoner));
          await moveToLobby(trial.defendantKey, trial.defendantName);
        }
        void pushMmoNews("prison", `[判決] ${trial.defendantName} に寛大・即時釈放判決`, now);
      } else {
        void pushMmoNews("prison", `[判決] ${trial.defendantName} の控訴は棄却（有罪維持）`, now);
      }
      return NextResponse.json({ ok: true, trial: resolved }, { headers: NO_STORE });
    }

    return err("invalid_action", 400);
  });
}
