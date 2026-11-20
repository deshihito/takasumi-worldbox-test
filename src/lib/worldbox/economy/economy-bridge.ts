export const WORLDBOX_ECONOMY_NAMESPACE = "worldbox_economy";

export type EconomyOpKind = "spend" | "earn" | "transfer" | "steal" | "gamble";
export type EconomyOpStatus = "pending" | "done" | "failed";

export interface EconomyOp {
  id: string;
  kind: EconomyOpKind;
  userKey: string;
  discordId: string;
  amount: number;
  reason: string;
  toDiscordId?: string;
  fromDiscordId?: string;
  payout?: number;
  prepaid?: boolean;
  status: EconomyOpStatus;
  error?: string;
  appliedAmount?: number;
  createdAt: number;
  appliedAt?: number;
}

export const ECONOMY_AMOUNT_MIN = 1;
export const ECONOMY_AMOUNT_MAX = 1_000_000;
export const ECONOMY_REASON_MAX = 40;
export const ECONOMY_RECENT_OPS = 20;

export const EARN_REASONS: ReadonlySet<string> = new Set([
  "harvest",
  "guild_shop_sale",
  "arena_prize",
  "arena_pvp_prize",
  "arena_pvp_fee_refund",
  "arena_tournament_prize",
  "arena_tournament_refund",
  "casino_tournament_prize",
  "casino_tournament_refund",
  "shop_sale",
  "guild_request_reward",
  "guild_request_refund",
  "ruins_complete",
  "dungeon_clear",
  "company_salary",
  "company_bonus",
  "company_dissolve",
  "company_dividend",
  "company_material_sale",
  "stock_sell",
  "stock_dividend",
  "market_sale",
  "market_refund",
  "fx_exchange",
  "fx_margin_close",
  "bank_withdraw",
  "bank_interest",
  "bank_loan",
  "house_pool_withdraw",
  "house_pool_yield",
  "prediction_payout",
  "prediction_refund",
  "job_salary",
  "job_bonus",
  "unemployment_benefit",
  "prison_labor",
  "bounty_reward",
  "crime_heist",
  "machine_yield",
  "vending_sale",
  "quest_reward",
  "p2p_trade",
  "p2p_transfer",
  "contract_reward",
  "contract_refund",
  "rent_income",
  "treasury_stimulus",
  "court_refund",
  "arcade_prize",
]);

export const GAMBLE_REASONS: ReadonlySet<string> = new Set([
  "casino_slot",
  "casino_roulette",
  "casino_dice",
  "casino_slot7",
  "casino_blackjack",
  "casino_double",
  "horse_racing",
]);

export const GAMBLE_PAYOUT_MAX = 300_000_000;

export function chunkEconomyAmounts(total: number): number[] {
  if (!Number.isInteger(total) || total <= 0) return [];
  const chunks: number[] = [];
  for (let rest = total; rest > 0; rest -= ECONOMY_AMOUNT_MAX) {
    chunks.push(Math.min(rest, ECONOMY_AMOUNT_MAX));
  }
  return chunks;
}

export function validateGamblePayout(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 0 || value > GAMBLE_PAYOUT_MAX) return null;
  return value;
}

const DISCORD_ID_RE = /^\d{5,25}$/;
const OP_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export function validateEconomyAmount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < ECONOMY_AMOUNT_MIN || value > ECONOMY_AMOUNT_MAX) return null;
  return value;
}

export function validateEconomyReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.trim();
  if (reason.length === 0 || reason.length > ECONOMY_REASON_MAX) return null;
  return reason;
}

export function validateDiscordId(value: unknown): string | null {
  if (typeof value !== "string" || !DISCORD_ID_RE.test(value)) return null;
  return value;
}

export interface BuildEconomyOpInput {
  kind: EconomyOpKind;
  userKey: string;
  discordId: string;
  amount: unknown;
  reason: unknown;
  toDiscordId?: unknown;
  fromDiscordId?: unknown;
  payout?: unknown;
  prepaid?: unknown;
}

export function buildEconomyOp(
  input: BuildEconomyOpInput,
  id: string,
  now: number,
): EconomyOp | null {
  if (!OP_ID_RE.test(id)) return null;
  if (typeof input.userKey !== "string" || input.userKey.length === 0) return null;
  const discordId = validateDiscordId(input.discordId);
  if (discordId === null) return null;
  const amount = validateEconomyAmount(input.amount);
  if (amount === null) return null;
  const reason = validateEconomyReason(input.reason);
  if (reason === null) return null;
  if (input.kind === "earn" && !EARN_REASONS.has(reason)) return null;
  if (input.kind === "gamble" && !GAMBLE_REASONS.has(reason)) return null;
  if (input.kind === "steal") return null;
  const op: EconomyOp = {
    id,
    kind: input.kind,
    userKey: input.userKey,
    discordId,
    amount,
    reason,
    status: "pending",
    createdAt: now,
  };
  if (input.kind === "transfer") {
    const to = validateDiscordId(input.toDiscordId);
    if (to === null || to === discordId) return null;
    op.toDiscordId = to;
  }
  if (input.kind === "gamble") {
    const payout = validateGamblePayout(input.payout);
    if (payout === null) return null;
    op.payout = payout;
    if (input.prepaid === true) op.prepaid = true;
  }
  return op;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseEconomyOp(raw: unknown): EconomyOp | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) return null;
  const { id, kind, userKey, discordId, status } = value;
  if (typeof id !== "string" || !OP_ID_RE.test(id)) return null;
  if (
    kind !== "spend" &&
    kind !== "earn" &&
    kind !== "transfer" &&
    kind !== "steal" &&
    kind !== "gamble"
  )
    return null;
  if (typeof userKey !== "string" || userKey.length === 0) return null;
  if (validateDiscordId(discordId) === null) return null;
  if (status !== "pending" && status !== "done" && status !== "failed") return null;
  const amount = validateEconomyAmount(value.amount);
  if (amount === null) return null;
  const reason = validateEconomyReason(value.reason);
  if (reason === null) return null;
  if (typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) return null;
  const op: EconomyOp = {
    id,
    kind,
    userKey,
    discordId: discordId as string,
    amount,
    reason,
    status,
    createdAt: value.createdAt,
  };
  if (kind === "transfer") {
    const to = validateDiscordId(value.toDiscordId);
    if (to === null) return null;
    op.toDiscordId = to;
  }
  if (kind === "steal") {
    const from = validateDiscordId(value.fromDiscordId);
    if (from === null) return null;
    op.fromDiscordId = from;
  }
  if (kind === "gamble") {
    const payout = validateGamblePayout(value.payout);
    if (payout === null) return null;
    op.payout = payout;
    if (value.prepaid === true) op.prepaid = true;
  }
  if (typeof value.error === "string" && value.error.length > 0) op.error = value.error;
  if (
    typeof value.appliedAmount === "number" &&
    Number.isInteger(value.appliedAmount) &&
    value.appliedAmount >= 0
  ) {
    op.appliedAmount = value.appliedAmount;
  }
  if (typeof value.appliedAt === "number" && Number.isFinite(value.appliedAt))
    op.appliedAt = value.appliedAt;
  return op;
}

export function recentEconomyOps(
  ops: readonly EconomyOp[],
  userKey: string,
  limit = ECONOMY_RECENT_OPS,
): EconomyOp[] {
  return ops
    .filter((op) => op.userKey === userKey)
    .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1))
    .slice(0, Math.max(0, limit));
}
