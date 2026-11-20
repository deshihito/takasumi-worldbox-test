import { NextResponse } from "next/server";
import { getRequestSession, isSameOriginRequest, sessionOwnerKey } from "@/lib/auth";
import { withUserLock } from "@/lib/worldbox/core/user-lock";
import { arcadeById } from "@/lib/worldbox/activity/arcade";
import { awardMmoCoins, getMmoBalance, spendMmoCoins } from "@/lib/worldbox/economy/mmo-wallet";
import { depositCityTreasury } from "@/lib/worldbox/social/governance-online";
import { incrementQuestProgress } from "@/lib/worldbox/social/mmo-events-online";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function err(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return err("forbidden", 403);
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return err("invalid_request", 400);
  }

  const ownerKey = sessionOwnerKey(session);
  const entry = arcadeById(String(body.gameId ?? ""));
  if (!entry) return err("unknown_game", 400);

  return withUserLock(`arcade:${ownerKey}`, async () => {
    const now = Date.now();
    const stake =
      typeof body.stake === "number" && Number.isFinite(body.stake)
        ? Math.max(0, Math.min(2000, Math.floor(body.stake)))
        : 100;

    if (body.action === "start") {
      if (stake > 0) {
        const paid = await spendMmoCoins(session, ownerKey, stake, "shop_buy", "arcade_prize");
        if (!paid.ok) return err(paid.error, 409);
        void depositCityTreasury(Math.floor(stake * 0.05));
        return NextResponse.json({ ok: true, stake, balance: paid.balance }, { headers: NO_STORE });
      }
      return NextResponse.json(
        { ok: true, stake: 0, balance: await getMmoBalance(session, ownerKey) },
        { headers: NO_STORE },
      );
    }

    if (body.action === "finish") {
      const won = body.won === true;
      const draw = body.draw === true;
      const mult =
        typeof body.mult === "number" && Number.isFinite(body.mult)
          ? Math.max(1, Math.min(2.5, body.mult))
          : 1.9;
      const basePrize = stake > 0 ? Math.round(stake * mult) : won ? 120 : 0;
      const payout = won ? basePrize : draw && stake > 0 ? stake : 0;

      if (payout > 0) {
        const paid = await awardMmoCoins(session, ownerKey, payout, "arcade_prize");
        if (!paid.ok) return err(paid.error, 503);
        void incrementQuestProgress(ownerKey, "world_action", 1, now);
        return NextResponse.json(
          { ok: true, payout, balance: paid.balance },
          { headers: NO_STORE },
        );
      }
      return NextResponse.json(
        { ok: true, payout: 0, balance: await getMmoBalance(session, ownerKey) },
        { headers: NO_STORE },
      );
    }

    return err("invalid_action", 400);
  });
}
