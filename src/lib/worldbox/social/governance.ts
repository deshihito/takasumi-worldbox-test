export interface CityPolicies {
  incomeTaxRate: number; // 0.05 .. 0.20 (default 0.10)
  vendingTaxRate: number; // 0.00 .. 0.10 (default 0.03)
  bailMultiplier: number; // 0.70 .. 1.50 (default 1.00)
  policeBountyMult: number; // 1.00 .. 1.50 (default 1.00)
  stimulusPayout: number; // 200 .. 2000 (default 500)
}

export interface ElectionCandidate {
  ownerKey: string;
  name: string;
  manifesto: string;
  votes: number;
  nominatedAt: number;
}

export interface CityGovernanceState {
  mayorKey: string | null;
  mayorName: string;
  termStartedAt: number;
  termEndsAt: number;
  treasuryBalance: number;
  lastStimulusAt: number;
  policies: CityPolicies;
  candidates: Record<string, ElectionCandidate>;
  voterBallots: Record<string, string>; // voterOwnerKey -> candidateOwnerKey
  stimulusClaimed: Record<string, number>; // ownerKey -> claimedAt
}

export interface CourtTrial {
  id: string;
  defendantKey: string;
  defendantName: string;
  chargeLabel: string;
  requestedBail: number;
  lawyerKey: string | null;
  lawyerName: string | null;
  openedAt: number;
  closesAt: number;
  guiltyVotes: string[];
  lenientVotes: string[];
  status: "open" | "verdict_lenient" | "verdict_guilty";
}

export const DEFAULT_POLICIES: CityPolicies = {
  incomeTaxRate: 0.1,
  vendingTaxRate: 0.03,
  bailMultiplier: 1.0,
  policeBountyMult: 1.0,
  stimulusPayout: 500,
};

export const ELECTION_TERM_MS = 24 * 60 * 60 * 1000;
export const STIMULUS_COOLDOWN_MS = 30 * 60 * 1000;
export const COURT_TRIAL_DURATION_MS = 90 * 1000;

export function sanitizePolicies(raw: unknown): CityPolicies {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_POLICIES };
  const v = raw as Record<string, unknown>;
  const clamp = (val: unknown, min: number, max: number, def: number, dec = 2) =>
    typeof val === "number" && Number.isFinite(val)
      ? Number(Math.max(min, Math.min(max, val)).toFixed(dec))
      : def;
  return {
    incomeTaxRate: clamp(v.incomeTaxRate, 0.05, 0.2, DEFAULT_POLICIES.incomeTaxRate),
    vendingTaxRate: clamp(v.vendingTaxRate, 0.0, 0.1, DEFAULT_POLICIES.vendingTaxRate),
    bailMultiplier: clamp(v.bailMultiplier, 0.7, 1.5, DEFAULT_POLICIES.bailMultiplier),
    policeBountyMult: clamp(v.policeBountyMult, 1.0, 1.5, DEFAULT_POLICIES.policeBountyMult),
    stimulusPayout: Math.round(
      clamp(v.stimulusPayout, 200, 2000, DEFAULT_POLICIES.stimulusPayout, 0),
    ),
  };
}

export function defaultGovernanceState(now = Date.now()): CityGovernanceState {
  return {
    mayorKey: null,
    mayorName: "臨時行政官（NPC）",
    termStartedAt: now,
    termEndsAt: now + ELECTION_TERM_MS,
    treasuryBalance: 25000,
    lastStimulusAt: 0,
    policies: { ...DEFAULT_POLICIES },
    candidates: {},
    voterBallots: {},
    stimulusClaimed: {},
  };
}

export function parseGovernanceState(raw: unknown, now = Date.now()): CityGovernanceState {
  const base = defaultGovernanceState(now);
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return base;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return base;
  const v = data as Record<string, unknown>;
  const candidates: Record<string, ElectionCandidate> = {};
  if (v.candidates && typeof v.candidates === "object") {
    for (const [k, c] of Object.entries(v.candidates as Record<string, unknown>)) {
      if (!c || typeof c !== "object") continue;
      const cv = c as Record<string, unknown>;
      candidates[k] = {
        ownerKey: k,
        name: typeof cv.name === "string" ? cv.name.slice(0, 24) : "候補者",
        manifesto: typeof cv.manifesto === "string" ? cv.manifesto.slice(0, 80) : "",
        votes:
          typeof cv.votes === "number" && Number.isFinite(cv.votes)
            ? Math.max(0, Math.floor(cv.votes))
            : 0,
        nominatedAt: typeof cv.nominatedAt === "number" ? cv.nominatedAt : now,
      };
    }
  }
  const ballots: Record<string, string> = {};
  if (v.voterBallots && typeof v.voterBallots === "object") {
    for (const [voter, cand] of Object.entries(v.voterBallots as Record<string, unknown>)) {
      if (typeof cand === "string") ballots[voter] = cand;
    }
  }
  const claimed: Record<string, number> = {};
  if (v.stimulusClaimed && typeof v.stimulusClaimed === "object") {
    for (const [uk, ts] of Object.entries(v.stimulusClaimed as Record<string, unknown>)) {
      if (typeof ts === "number" && Number.isFinite(ts)) claimed[uk] = ts;
    }
  }
  return {
    mayorKey: typeof v.mayorKey === "string" ? v.mayorKey : null,
    mayorName:
      typeof v.mayorName === "string" && v.mayorName ? v.mayorName.slice(0, 24) : base.mayorName,
    termStartedAt: typeof v.termStartedAt === "number" ? v.termStartedAt : now,
    termEndsAt: typeof v.termEndsAt === "number" ? v.termEndsAt : now + ELECTION_TERM_MS,
    treasuryBalance:
      typeof v.treasuryBalance === "number" && Number.isFinite(v.treasuryBalance)
        ? Math.max(0, Math.floor(v.treasuryBalance))
        : base.treasuryBalance,
    lastStimulusAt: typeof v.lastStimulusAt === "number" ? v.lastStimulusAt : 0,
    policies: sanitizePolicies(v.policies),
    candidates,
    voterBallots: ballots,
    stimulusClaimed: claimed,
  };
}

export function resolveElection(state: CityGovernanceState, now: number): CityGovernanceState {
  const tally = new Map<string, number>();
  for (const candKey of Object.values(state.voterBallots)) {
    if (state.candidates[candKey]) tally.set(candKey, (tally.get(candKey) ?? 0) + 1);
  }
  let winner: ElectionCandidate | null = null;
  let topVotes = -1;
  for (const cand of Object.values(state.candidates)) {
    const votes = tally.get(cand.ownerKey) ?? cand.votes ?? 0;
    if (votes > topVotes) {
      topVotes = votes;
      winner = cand;
    }
  }
  if (!winner) {
    return {
      ...state,
      termStartedAt: now,
      termEndsAt: now + ELECTION_TERM_MS,
    };
  }
  return {
    ...state,
    mayorKey: winner.ownerKey,
    mayorName: winner.name,
    termStartedAt: now,
    termEndsAt: now + ELECTION_TERM_MS,
    candidates: {},
    voterBallots: {},
  };
}

export function parseCourtTrial(raw: unknown): CourtTrial | null {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const v = data as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.defendantKey !== "string") return null;
  const status: CourtTrial["status"] =
    v.status === "verdict_lenient" || v.status === "verdict_guilty" ? v.status : "open";
  return {
    id: v.id,
    defendantKey: v.defendantKey,
    defendantName: typeof v.defendantName === "string" ? v.defendantName.slice(0, 24) : "被告人",
    chargeLabel: typeof v.chargeLabel === "string" ? v.chargeLabel.slice(0, 48) : "容疑",
    requestedBail:
      typeof v.requestedBail === "number" && Number.isFinite(v.requestedBail)
        ? Math.max(0, Math.floor(v.requestedBail))
        : 1000,
    lawyerKey: typeof v.lawyerKey === "string" ? v.lawyerKey : null,
    lawyerName: typeof v.lawyerName === "string" ? v.lawyerName : null,
    openedAt: typeof v.openedAt === "number" ? v.openedAt : 0,
    closesAt: typeof v.closesAt === "number" ? v.closesAt : 0,
    guiltyVotes: Array.isArray(v.guiltyVotes) ? v.guiltyVotes.map(String) : [],
    lenientVotes: Array.isArray(v.lenientVotes) ? v.lenientVotes.map(String) : [],
    status,
  };
}

export function evaluateCourtVerdict(trial: CourtTrial): "verdict_lenient" | "verdict_guilty" {
  // Defense lawyer boosts lenient persuasion by +1 vote weight
  const lenientWeight = trial.lenientVotes.length + (trial.lawyerKey ? 1 : 0);
  const guiltyWeight = trial.guiltyVotes.length;
  return lenientWeight >= guiltyWeight ? "verdict_lenient" : "verdict_guilty";
}
