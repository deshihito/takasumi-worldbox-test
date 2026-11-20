import { itemById } from "../economy/items";
import { addItem, countItem, removeItem, type PlayerProfile } from "../player/profile";

export type TradeStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface TradeItemEntry {
  itemId: string;
  count: number;
}

export interface DirectTradeOffer {
  id: string;
  fromKey: string;
  fromName: string;
  toKey: string;
  toName: string;
  offerCoins: number;
  offerItems: TradeItemEntry[];
  requestCoins: number;
  requestItems: TradeItemEntry[];
  note: string;
  status: TradeStatus;
  createdAt: number;
  expiresAt: number;
}

export const TRADE_TTL_MS = 5 * 60 * 1000;
export const TRADE_MAX_ITEMS_PER_SIDE = 4;

export function sanitizeTradeItems(raw: unknown): TradeItemEntry[] {
  if (!Array.isArray(raw)) return [];
  const merged = new Map<string, number>();
  for (const row of raw.slice(0, TRADE_MAX_ITEMS_PER_SIDE)) {
    if (!row || typeof row !== "object") continue;
    const v = row as Record<string, unknown>;
    const def = itemById(v.itemId);
    if (!def) continue;
    const n =
      typeof v.count === "number" && Number.isFinite(v.count)
        ? Math.max(1, Math.min(99, Math.floor(v.count)))
        : 0;
    if (n > 0) merged.set(def.id, (merged.get(def.id) ?? 0) + n);
  }
  return Array.from(merged.entries()).map(([itemId, count]) => ({ itemId, count }));
}

export function sanitizeCoinAmount(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(5_000_000, Math.floor(raw)));
}

export function isTradeActive(offer: DirectTradeOffer, now: number): boolean {
  return offer.status === "pending" && offer.expiresAt > now;
}

export function validateOfferInventory(
  profile: PlayerProfile,
  items: readonly TradeItemEntry[],
): boolean {
  return items.every((entry) => countItem(profile, entry.itemId) >= entry.count);
}

export function executeTradeProfiles(
  senderProfile: PlayerProfile,
  receiverProfile: PlayerProfile,
  offer: DirectTradeOffer,
):
  | { ok: true; senderProfile: PlayerProfile; receiverProfile: PlayerProfile }
  | { ok: false; error: "sender_missing_items" | "receiver_missing_items" } {
  if (!validateOfferInventory(senderProfile, offer.offerItems)) {
    return { ok: false, error: "sender_missing_items" };
  }
  if (!validateOfferInventory(receiverProfile, offer.requestItems)) {
    return { ok: false, error: "receiver_missing_items" };
  }

  let nextSender = senderProfile;
  let nextReceiver = receiverProfile;

  for (const entry of offer.offerItems) {
    const rm = removeItem(nextSender, entry.itemId, entry.count);
    if (!rm) return { ok: false, error: "sender_missing_items" };
    nextSender = rm;
    nextReceiver = addItem(nextReceiver, entry.itemId, entry.count);
  }

  for (const entry of offer.requestItems) {
    const rm = removeItem(nextReceiver, entry.itemId, entry.count);
    if (!rm) return { ok: false, error: "receiver_missing_items" };
    nextReceiver = rm;
    nextSender = addItem(nextSender, entry.itemId, entry.count);
  }

  return { ok: true, senderProfile: nextSender, receiverProfile: nextReceiver };
}

export function parseTradeOffer(raw: unknown): DirectTradeOffer | null {
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
  if (typeof v.id !== "string" || typeof v.fromKey !== "string" || typeof v.toKey !== "string") {
    return null;
  }
  const status: TradeStatus =
    v.status === "accepted" || v.status === "declined" || v.status === "cancelled"
      ? v.status
      : "pending";
  return {
    id: v.id,
    fromKey: v.fromKey,
    fromName: typeof v.fromName === "string" ? v.fromName.slice(0, 24) : "市民",
    toKey: v.toKey,
    toName: typeof v.toName === "string" ? v.toName.slice(0, 24) : "市民",
    offerCoins: sanitizeCoinAmount(v.offerCoins),
    offerItems: sanitizeTradeItems(v.offerItems),
    requestCoins: sanitizeCoinAmount(v.requestCoins),
    requestItems: sanitizeTradeItems(v.requestItems),
    note: typeof v.note === "string" ? v.note.slice(0, 60) : "",
    status,
    createdAt: typeof v.createdAt === "number" ? v.createdAt : 0,
    expiresAt: typeof v.expiresAt === "number" ? v.expiresAt : 0,
  };
}
