import type { SessionInfo } from "../../auth";
import { loadProfile, storeProfile } from "../player/profile-online";
import { isEconomyEnabled, readUserBalance } from "./economy-bridge-online";
import { chargeUserChunked, payoutUserChunked } from "./settlement";

export async function getMmoBalance(
  session: SessionInfo,
  ownerKey: string,
): Promise<number | null> {
  if (session.provider === "discord" && isEconomyEnabled()) {
    return readUserBalance(session.id);
  }
  const profile = await loadProfile(ownerKey);
  return profile ? profile.coins : null;
}

export async function awardMmoCoins(
  session: SessionInfo,
  ownerKey: string,
  amount: number,
  reason: string,
): Promise<{ ok: true; balance: number | null } | { ok: false; error: string }> {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, error: "invalid_amount" };
  }
  if (session.provider === "discord") {
    if (!isEconomyEnabled()) return { ok: false, error: "economy_unavailable" };
    const settled = await payoutUserChunked(ownerKey, session.id, amount, reason);
    if (settled.state !== "done" && settled.state !== "pending") {
      return { ok: false, error: settled.error ?? "economy_failed" };
    }
    const bal =
      settled.newBalance !== undefined ? settled.newBalance : await readUserBalance(session.id);
    return { ok: true, balance: bal };
  }
  const profile = await loadProfile(ownerKey);
  if (!profile) return { ok: false, error: "profile_unavailable" };
  const nextCoins = Math.min(100_000_000, profile.coins + amount);
  const next = { ...profile, coins: nextCoins };
  await storeProfile(ownerKey, next);
  return { ok: true, balance: nextCoins };
}

export async function spendMmoCoins(
  session: SessionInfo,
  ownerKey: string,
  amount: number,
  reason: string,
  refundReason = "market_refund",
): Promise<{ ok: true; balance: number | null } | { ok: false; error: string }> {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, error: "invalid_amount" };
  }
  if (session.provider === "discord") {
    if (!isEconomyEnabled()) return { ok: false, error: "economy_unavailable" };
    const settled = await chargeUserChunked(ownerKey, session.id, amount, reason, {
      refundReason,
    });
    if (settled.state === "insufficient_funds") {
      return { ok: false, error: "insufficient_funds" };
    }
    if (settled.state !== "done") {
      return { ok: false, error: settled.error ?? "economy_failed" };
    }
    const bal =
      settled.newBalance !== undefined ? settled.newBalance : await readUserBalance(session.id);
    return { ok: true, balance: bal };
  }
  const profile = await loadProfile(ownerKey);
  if (!profile) return { ok: false, error: "profile_unavailable" };
  if (profile.coins < amount) return { ok: false, error: "insufficient_funds" };
  const nextCoins = profile.coins - amount;
  await storeProfile(ownerKey, { ...profile, coins: nextCoins });
  return { ok: true, balance: nextCoins };
}
