import { isBotApiConfigured, kvDelete, kvGet, kvList, kvSet } from "../../bot-api";
import { isTradeActive, parseTradeOffer, type DirectTradeOffer } from "./trade";

export const WORLDBOX_TRADES_NAMESPACE = "worldbox_trades";

export function isTradeEnabled(): boolean {
  return isBotApiConfigured();
}

export async function loadTradeOffer(id: string): Promise<DirectTradeOffer | null> {
  if (!isBotApiConfigured()) return null;
  try {
    const raw = await kvGet(WORLDBOX_TRADES_NAMESPACE, `trade:${id}`);
    return parseTradeOffer(raw);
  } catch {
    return null;
  }
}

export async function storeTradeOffer(offer: DirectTradeOffer): Promise<boolean> {
  if (!isBotApiConfigured()) return false;
  try {
    await kvSet(WORLDBOX_TRADES_NAMESPACE, `trade:${offer.id}`, JSON.stringify(offer));
    return true;
  } catch {
    return false;
  }
}

export async function listTradesForUser(
  ownerKey: string,
  now = Date.now(),
): Promise<DirectTradeOffer[]> {
  if (!isBotApiConfigured()) return [];
  try {
    const rows = await kvList(WORLDBOX_TRADES_NAMESPACE);
    const out: DirectTradeOffer[] = [];
    for (const [k, raw] of rows) {
      if (!k.startsWith("trade:")) continue;
      const offer = parseTradeOffer(raw);
      if (!offer) continue;
      if (offer.fromKey !== ownerKey && offer.toKey !== ownerKey) continue;
      if (offer.status === "pending" && !isTradeActive(offer, now)) {
        await kvDelete(WORLDBOX_TRADES_NAMESPACE, k).catch(() => {});
        continue;
      }
      out.push(offer);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, 24);
  } catch {
    return [];
  }
}
