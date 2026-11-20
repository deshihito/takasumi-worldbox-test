import { NextResponse } from "next/server";
import { getRequestSession, isSameOriginRequest, sessionOwnerKey } from "@/lib/auth";
import { withUserLock } from "@/lib/worldbox/core/user-lock";
import { awardMmoCoins, getMmoBalance, spendMmoCoins } from "@/lib/worldbox/economy/mmo-wallet";
import { payoutUserChunked } from "@/lib/worldbox/economy/settlement";
import { presenceIdFor } from "@/lib/worldbox/player/presence";
import { findPresenceOwnerKey, listPresence } from "@/lib/worldbox/player/presence-online";
import { loadProfile, storeProfile } from "@/lib/worldbox/player/profile-online";
import { pushMmoNews } from "@/lib/worldbox/social/mmo-events-online";
import {
  executeTradeProfiles,
  isTradeActive,
  sanitizeCoinAmount,
  sanitizeTradeItems,
  TRADE_TTL_MS,
  validateOfferInventory,
  type DirectTradeOffer,
} from "@/lib/worldbox/social/trade";
import {
  isTradeEnabled,
  listTradesForUser,
  loadTradeOffer,
  storeTradeOffer,
} from "@/lib/worldbox/social/trade-online";

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

async function payOwnerKey(targetKey: string, amount: number, reason: string): Promise<boolean> {
  if (amount <= 0) return true;
  if (targetKey.startsWith("discord:")) {
    const res = await payoutUserChunked(targetKey, targetKey.slice(8), amount, reason);
    return res.state === "done" || res.state === "pending";
  }
  const prof = await loadProfile(targetKey);
  if (!prof) return false;
  return storeProfile(targetKey, {
    ...prof,
    coins: Math.min(100_000_000, prof.coins + amount),
  });
}

export async function GET(request: Request) {
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (!isTradeEnabled()) return err("trade_unavailable", 503);

  const ownerKey = sessionOwnerKey(session);
  const selfId = presenceIdFor(ownerKey);
  const now = Date.now();

  const [offers, presenceList, balance, profile] = await Promise.all([
    listTradesForUser(ownerKey, now),
    listPresence(),
    getMmoBalance(session, ownerKey),
    loadProfile(ownerKey),
  ]);

  const onlinePlayers = presenceList
    .filter((p) => p.id !== selfId && now - p.ts <= 30_000)
    .map((p) => ({
      presenceId: p.id,
      name: p.name,
      space: p.space,
      x: Math.round(p.x),
      y: Math.round(p.y),
    }));

  return NextResponse.json(
    {
      selfKey: ownerKey,
      offers,
      onlinePlayers,
      balance,
      inventory: profile.items,
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return err("forbidden", 403);
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (!isTradeEnabled()) return err("trade_unavailable", 503);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return err("invalid_request", 400);
  }

  const ownerKey = sessionOwnerKey(session);
  const displayName = (session.username || "市民").slice(0, 24);
  const action = body.action;

  return withUserLock("trade:global", async () => {
    const now = Date.now();

    if (action === "send_coins") {
      const amount = sanitizeCoinAmount(body.amount);
      if (amount < 10) return err("invalid_amount", 400);
      let targetKey = typeof body.targetOwnerKey === "string" ? body.targetOwnerKey : "";
      let targetName = sanitizeText(body.targetName, 24) || "市民";
      if (!targetKey && typeof body.targetPresenceId === "string" && body.targetPresenceId) {
        const resolved = await findPresenceOwnerKey(body.targetPresenceId);
        if (!resolved) return err("target_offline", 409);
        targetKey = resolved;
        const pres = (await listPresence()).find((p) => p.id === body.targetPresenceId);
        if (pres) targetName = pres.name;
      }
      if (!targetKey || targetKey === ownerKey) return err("invalid_target", 400);

      const paid = await spendMmoCoins(session, ownerKey, amount, "p2p_transfer", "p2p_trade");
      if (!paid.ok) return err(paid.error, 409);

      const sent = await payOwnerKey(targetKey, amount, "p2p_transfer");
      if (!sent) {
        await awardMmoCoins(session, ownerKey, amount, "p2p_trade");
        return err("transfer_failed", 503);
      }
      return NextResponse.json(
        { ok: true, amount, targetName, balance: paid.balance },
        { headers: NO_STORE },
      );
    }

    if (action === "create_offer") {
      let targetKey = typeof body.targetOwnerKey === "string" ? body.targetOwnerKey : "";
      let targetName = sanitizeText(body.targetName, 24) || "相手市民";
      if (!targetKey && typeof body.targetPresenceId === "string" && body.targetPresenceId) {
        const resolved = await findPresenceOwnerKey(body.targetPresenceId);
        if (!resolved) return err("target_offline", 409);
        targetKey = resolved;
        const pres = (await listPresence()).find((p) => p.id === body.targetPresenceId);
        if (pres) targetName = pres.name;
      }
      if (!targetKey || targetKey === ownerKey) return err("invalid_target", 400);

      const offerCoins = sanitizeCoinAmount(body.offerCoins);
      const requestCoins = sanitizeCoinAmount(body.requestCoins);
      const offerItems = sanitizeTradeItems(body.offerItems);
      const requestItems = sanitizeTradeItems(body.requestItems);
      if (
        offerCoins === 0 &&
        requestCoins === 0 &&
        offerItems.length === 0 &&
        requestItems.length === 0
      ) {
        return err("empty_offer", 400);
      }

      const senderProfile = await loadProfile(ownerKey);
      if (!validateOfferInventory(senderProfile, offerItems)) {
        return err("not_enough_items", 409);
      }

      // Escrow sender's offered coins up front so acceptance is always safe
      let balance = await getMmoBalance(session, ownerKey);
      if (offerCoins > 0) {
        const paid = await spendMmoCoins(session, ownerKey, offerCoins, "p2p_trade", "p2p_trade");
        if (!paid.ok) return err(paid.error, 409);
        balance = paid.balance;
      }

      const offer: DirectTradeOffer = {
        id: `tr_${now}_${Math.floor(Math.random() * 9999)}`,
        fromKey: ownerKey,
        fromName: displayName,
        toKey: targetKey,
        toName: targetName,
        offerCoins,
        offerItems,
        requestCoins,
        requestItems,
        note: sanitizeText(body.note, 64),
        status: "pending",
        createdAt: now,
        expiresAt: now + TRADE_TTL_MS,
      };
      await storeTradeOffer(offer);
      return NextResponse.json({ ok: true, offer, balance }, { headers: NO_STORE });
    }

    const offerId = typeof body.offerId === "string" ? body.offerId : "";
    if (!offerId) return err("missing_offer_id", 400);
    const offer = await loadTradeOffer(offerId);
    if (!offer) return err("offer_not_found", 404);

    if (action === "cancel_offer" || action === "decline_offer") {
      if (offer.status !== "pending") return err("offer_not_pending", 409);
      if (action === "cancel_offer" && offer.fromKey !== ownerKey) return err("not_sender", 403);
      if (action === "decline_offer" && offer.toKey !== ownerKey) return err("not_recipient", 403);

      const nextStatus = action === "cancel_offer" ? "cancelled" : "declined";
      await storeTradeOffer({ ...offer, status: nextStatus });
      if (offer.offerCoins > 0) {
        await payOwnerKey(offer.fromKey, offer.offerCoins, "p2p_trade");
      }
      return NextResponse.json(
        { ok: true, status: nextStatus, balance: await getMmoBalance(session, ownerKey) },
        { headers: NO_STORE },
      );
    }

    if (action === "accept_offer") {
      if (offer.toKey !== ownerKey) return err("not_recipient", 403);
      if (!isTradeActive(offer, now)) return err("offer_expired", 409);

      const [senderProfile, receiverProfile] = await Promise.all([
        loadProfile(offer.fromKey),
        loadProfile(offer.toKey),
      ]);
      const swapped = executeTradeProfiles(senderProfile, receiverProfile, offer);
      if (!swapped.ok) return err(swapped.error, 409);

      if (offer.requestCoins > 0) {
        const paidReq = await spendMmoCoins(
          session,
          ownerKey,
          offer.requestCoins,
          "p2p_trade",
          "p2p_trade",
        );
        if (!paidReq.ok) return err(paidReq.error, 409);
      }

      await Promise.all([
        storeProfile(offer.fromKey, swapped.senderProfile),
        storeProfile(offer.toKey, swapped.receiverProfile),
        storeTradeOffer({ ...offer, status: "accepted" }),
      ]);

      if (offer.offerCoins > 0) {
        await payOwnerKey(offer.toKey, offer.offerCoins, "p2p_trade");
      }
      if (offer.requestCoins > 0) {
        await payOwnerKey(offer.fromKey, offer.requestCoins, "p2p_trade");
      }

      void pushMmoNews("economy", `[P2P取引] ${offer.fromName} / ${offer.toName} 取引成立`, now);

      return NextResponse.json(
        {
          ok: true,
          offer: { ...offer, status: "accepted" },
          profile: swapped.receiverProfile,
          balance: await getMmoBalance(session, ownerKey),
        },
        { headers: NO_STORE },
      );
    }

    return err("invalid_action", 400);
  });
}
