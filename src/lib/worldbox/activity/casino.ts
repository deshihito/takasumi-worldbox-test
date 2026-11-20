import type { LobbyObject } from "../world/lobby";

export type CasinoGame = "slot" | "roulette" | "dice";
export type CasinoMachine = "slot" | "slot7" | "roulette" | "dice" | "blackjack" | "double";

export const CASINO_BET_TIERS: readonly number[] = [10, 100, 1000];
export const CASINO_BET_MIN = 10;
export const CASINO_BET_MAX = 1_000_000;

export function validateCasinoBet(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < CASINO_BET_MIN || value > CASINO_BET_MAX) return null;
  return value;
}

export interface SlotSymbol {
  glyph: string;
  color: string;
  weight: number;
  triple: number;
}

export const SLOT_SYMBOLS: readonly SlotSymbol[] = [
  { glyph: "7", color: "#ffd23e", weight: 1, triple: 300 },
  { glyph: "diamond", color: "#7ad0ff", weight: 3, triple: 60 },
  { glyph: "star", color: "#ffb3e2", weight: 5, triple: 20 },
  { glyph: "circle", color: "#9dff70", weight: 8, triple: 8 },
  { glyph: "triangle", color: "#ffa25e", weight: 11, triple: 4 },
  { glyph: "square", color: "#c9c9d6", weight: 14, triple: 3 },
];
export const SLOT_PAIR_MULTIPLIER = 1.2;

const SLOT_TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);

export interface SlotResult {
  reels: [number, number, number];
  multiplier: number;
  payout: number;
}

function drawSymbol(rng: () => number): number {
  let roll = rng() * SLOT_TOTAL_WEIGHT;
  for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
    roll -= SLOT_SYMBOLS[i].weight;
    if (roll < 0) return i;
  }
  return SLOT_SYMBOLS.length - 1;
}

export function slotMultiplier(reels: readonly [number, number, number]): number {
  const [a, b, c] = reels;
  if (a === b && b === c) return SLOT_SYMBOLS[a].triple;
  if (a === b || b === c || a === c) return SLOT_PAIR_MULTIPLIER;
  return 0;
}

export function playSlot(bet: number, rng: () => number): SlotResult {
  const reels: [number, number, number] = [drawSymbol(rng), drawSymbol(rng), drawSymbol(rng)];
  const multiplier = slotMultiplier(reels);
  return { reels, multiplier, payout: Math.floor(bet * multiplier) };
}

export function slotRtp(): number {
  let rtp = 0;
  for (const s of SLOT_SYMBOLS) {
    const p = s.weight / SLOT_TOTAL_WEIGHT;
    rtp += p * p * p * s.triple;
    rtp += 3 * p * p * (1 - p) * SLOT_PAIR_MULTIPLIER;
  }
  return rtp;
}

export const ROULETTE_RED: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type RoulettePick = "red" | "black";
export type RouletteColor = RoulettePick | "green";

export function rouletteColor(n: number): RouletteColor {
  if (n === 0) return "green";
  return ROULETTE_RED.has(n) ? "red" : "black";
}

export interface RouletteResult {
  number: number;
  color: RouletteColor;
  payout: number;
}

export function playRoulette(bet: number, pick: RoulettePick, rng: () => number): RouletteResult {
  const number = Math.min(36, Math.floor(rng() * 37));
  const color = rouletteColor(number);
  return { number, color, payout: color === pick ? bet * 2 : 0 };
}

export function rouletteRtp(): number {
  return 36 / 37;
}

export const CASINO_SPRITE_MACHINE: Record<string, CasinoMachine> = {
  slot_machine: "slot",
  slot7_machine: "slot7",
  roulette_table: "roulette",
  casino_table: "roulette",
  dice_table: "dice",
  blackjack_table: "blackjack",
  double_machine: "double",
};

export function casinoMachineNear(
  objectsList: readonly LobbyObject[],
  tx: number,
  ty: number,
): CasinoMachine | null {
  let best: CasinoMachine | null = null;
  let bestDist = Infinity;
  for (const o of objectsList) {
    const machine = CASINO_SPRITE_MACHINE[o.sprite];
    if (!machine) continue;
    if (tx < o.x - 1 || tx > o.x + o.w || ty < o.y - 1 || ty > o.y + o.h) continue;
    const dist = Math.max(Math.abs(tx - o.x), Math.abs(ty - o.y));
    if (dist < bestDist) {
      bestDist = dist;
      best = machine;
    }
  }
  return best;
}

export const CASINO_REASON: Record<CasinoGame, string> = {
  slot: "casino_slot",
  roulette: "casino_roulette",
  dice: "casino_dice",
};

export const CASINO_SESSION_REASONS = {
  slot7Prepay: "casino_slot7_prepay",
  slot7Settle: "casino_slot7",
  slot7Penalty: "casino_slot7_penalty",
  doubleBet: "casino_double_bet",
  doubleSettle: "casino_double",
  blackjackBet: "casino_blackjack_bet",
  blackjackSettle: "casino_blackjack",
} as const;

export function isCasinoSpendReason(reason: string): boolean {
  return reason.startsWith("casino_");
}
