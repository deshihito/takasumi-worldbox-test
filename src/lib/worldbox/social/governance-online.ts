import { isBotApiConfigured, kvGet, kvList, kvSet } from "../../bot-api";
import {
  defaultGovernanceState,
  parseCourtTrial,
  parseGovernanceState,
  resolveElection,
  type CityGovernanceState,
  type CourtTrial,
} from "./governance";

export const WORLDBOX_GOVERNANCE_NAMESPACE = "worldbox_governance";
const GOV_KEY = "city_gov_v1";

export function isGovernanceEnabled(): boolean {
  return isBotApiConfigured();
}

export async function loadGovernanceState(now = Date.now()): Promise<CityGovernanceState> {
  if (!isBotApiConfigured()) return defaultGovernanceState(now);
  try {
    const raw = await kvGet(WORLDBOX_GOVERNANCE_NAMESPACE, GOV_KEY);
    let state = parseGovernanceState(raw, now);
    if (now >= state.termEndsAt && Object.keys(state.candidates).length > 0) {
      state = resolveElection(state, now);
      await kvSet(WORLDBOX_GOVERNANCE_NAMESPACE, GOV_KEY, JSON.stringify(state));
    }
    return state;
  } catch {
    return defaultGovernanceState(now);
  }
}

export async function storeGovernanceState(state: CityGovernanceState): Promise<boolean> {
  if (!isBotApiConfigured()) return false;
  try {
    await kvSet(WORLDBOX_GOVERNANCE_NAMESPACE, GOV_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export async function depositCityTreasury(amount: number): Promise<void> {
  if (!isBotApiConfigured() || !Number.isInteger(amount) || amount <= 0) return;
  try {
    const state = await loadGovernanceState();
    await storeGovernanceState({
      ...state,
      treasuryBalance: Math.min(100_000_000, state.treasuryBalance + amount),
    });
  } catch {
    /* non-blocking */
  }
}

export async function loadCourtTrial(id: string): Promise<CourtTrial | null> {
  if (!isBotApiConfigured()) return null;
  try {
    return parseCourtTrial(await kvGet(WORLDBOX_GOVERNANCE_NAMESPACE, `trial:${id}`));
  } catch {
    return null;
  }
}

export async function storeCourtTrial(trial: CourtTrial): Promise<boolean> {
  if (!isBotApiConfigured()) return false;
  try {
    await kvSet(WORLDBOX_GOVERNANCE_NAMESPACE, `trial:${trial.id}`, JSON.stringify(trial));
    return true;
  } catch {
    return false;
  }
}

export async function listCourtTrials(): Promise<CourtTrial[]> {
  if (!isBotApiConfigured()) return [];
  try {
    const rows = await kvList(WORLDBOX_GOVERNANCE_NAMESPACE);
    const out: CourtTrial[] = [];
    for (const [k, raw] of rows) {
      if (!k.startsWith("trial:")) continue;
      const t = parseCourtTrial(raw);
      if (t) out.push(t);
    }
    return out.sort((a, b) => b.openedAt - a.openedAt).slice(0, 15);
  } catch {
    return [];
  }
}
