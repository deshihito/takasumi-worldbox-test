import { NextResponse } from "next/server";
import { getRequestSession, isSameOriginRequest, sessionOwnerKey } from "@/lib/auth";
import { withUserLock } from "@/lib/worldbox/core/user-lock";
import { parseSave, serializeSave } from "@/lib/worldbox/core/save";
import { loadWorldBoxSave, storeWorldBoxSave } from "@/lib/worldbox/core/save-online";
import { awardMmoCoins, getMmoBalance, spendMmoCoins } from "@/lib/worldbox/economy/mmo-wallet";
import { payoutUserChunked } from "@/lib/worldbox/economy/settlement";
import { presenceIdFor } from "@/lib/worldbox/player/presence";
import { listPresence, putPresence } from "@/lib/worldbox/player/presence-online";
import { loadProfile, storeProfile } from "@/lib/worldbox/player/profile-online";
import { loadTileOverrides } from "@/lib/worldbox/world/tiles-online";
import { depositCityTreasury } from "@/lib/worldbox/social/governance-online";
import { pushMmoNews } from "@/lib/worldbox/social/mmo-events-online";
import {
  APARTMENT_ENTRY,
  APARTMENT_TIERS,
  chunkKeyFromWorld,
  computeChunkValuation,
  type ApartmentOwnership,
  type ApartmentTierId,
  type PropertyDeed,
  type ZoneType,
} from "@/lib/worldbox/world/realestate";
import {
  isRealEstateEnabled,
  listAllApartments,
  listAllPropertyDeeds,
  loadApartment,
  loadPropertyDeed,
  storeApartment,
  storePropertyDeed,
} from "@/lib/worldbox/world/realestate-online";

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

async function actorPos(ownerKey: string): Promise<{ space: string; x: number; y: number }> {
  const selfId = presenceIdFor(ownerKey);
  const now = Date.now();
  const list = await listPresence();
  const live = list.find((p) => p.id === selfId && now - p.ts <= 20_000);
  if (live) return { space: live.space, x: live.x, y: live.y };
  const saved = parseSave(await loadWorldBoxSave(ownerKey));
  if (saved) return { space: saved.space, x: saved.x, y: saved.y };
  return { space: "lobby", x: 28.5, y: 28.5 };
}

async function movePlayerSpaceServer(
  ownerKey: string,
  name: string,
  space: string,
  x: number,
  y: number,
) {
  const prev = parseSave(await loadWorldBoxSave(ownerKey));
  const worldReturn =
    space === "world"
      ? null
      : prev?.space === "world"
        ? { x: prev.x, y: prev.y }
        : (prev?.worldReturn ?? null);
  await storeWorldBoxSave(ownerKey, serializeSave({ space, x, y, worldReturn }));
  await putPresence(ownerKey, { name, x, y, vx: 0, vy: 0, face: 1, space }, Date.now());
}

async function payOwner(targetKey: string, amount: number, reason: string) {
  if (amount <= 0) return;
  if (targetKey.startsWith("discord:")) {
    await payoutUserChunked(targetKey, targetKey.slice(8), amount, reason);
    return;
  }
  const prof = await loadProfile(targetKey);
  if (prof) {
    await storeProfile(targetKey, { ...prof, coins: Math.min(100_000_000, prof.coins + amount) });
  }
}

export async function GET(request: Request) {
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (!isRealEstateEnabled()) return err("realestate_unavailable", 503);

  const ownerKey = sessionOwnerKey(session);
  const url = new URL(request.url);
  const qx = Number(url.searchParams.get("x"));
  const qy = Number(url.searchParams.get("y"));

  const [pos, deeds, apartments, overrides, balance] = await Promise.all([
    actorPos(ownerKey),
    listAllPropertyDeeds(),
    listAllApartments(),
    loadTileOverrides(),
    getMmoBalance(session, ownerKey),
  ]);

  const evalX = Number.isFinite(qx) ? qx : pos.space === "world" ? pos.x : 0;
  const evalY = Number.isFinite(qy) ? qy : pos.space === "world" ? pos.y : 0;
  const chunk = chunkKeyFromWorld(evalX, evalY);
  const currentDeed = deeds.find((d) => d.chunkKey === chunk.key) ?? null;
  const currentValuation = computeChunkValuation(
    chunk.cx,
    chunk.cy,
    overrides,
    currentDeed?.zone ?? "residential",
  );

  return NextResponse.json(
    {
      selfKey: ownerKey,
      actorPos: pos,
      currentChunk: {
        ...chunk,
        valuation: currentValuation,
        deed: currentDeed,
      },
      myDeeds: deeds
        .filter((d) => d.ownerKey === ownerKey)
        .map((d) => ({ ...d, valuation: computeChunkValuation(d.cx, d.cy, overrides, d.zone) })),
      allDeeds: deeds
        .slice(0, 30)
        .map((d) => ({ ...d, valuation: computeChunkValuation(d.cx, d.cy, overrides, d.zone) })),
      myApartments: apartments.filter((a) => a.ownerKey === ownerKey),
      apartmentTiers: APARTMENT_TIERS,
      balance,
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return err("forbidden", 403);
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (!isRealEstateEnabled()) return err("realestate_unavailable", 503);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return err("invalid_request", 400);
  }

  const ownerKey = sessionOwnerKey(session);
  const displayName = (session.username || "市民").slice(0, 24);
  const action = body.action;

  return withUserLock("realestate:global", async () => {
    const now = Date.now();
    const pos = await actorPos(ownerKey);

    if (action === "claim_chunk") {
      if (pos.space !== "world") return err("must_be_in_world", 409);
      const chunk = chunkKeyFromWorld(pos.x, pos.y);
      const existing = await loadPropertyDeed(chunk.key);
      if (existing) return err("already_claimed", 409);

      const zone: ZoneType =
        body.zone === "commercial" || body.zone === "industrial" ? body.zone : "residential";
      const overrides = await loadTileOverrides();
      const price = computeChunkValuation(chunk.cx, chunk.cy, overrides, zone);

      const paid = await spendMmoCoins(session, ownerKey, price, "shop_buy");
      if (!paid.ok) return err(paid.error, 409);
      void depositCityTreasury(Math.floor(price * 0.2));

      const deed: PropertyDeed = {
        chunkKey: chunk.key,
        cx: chunk.cx,
        cy: chunk.cy,
        zone,
        ownerKey,
        ownerName: displayName,
        tenantKey: null,
        tenantName: null,
        rentPerHour: 250,
        lastRentAt: now,
        claimedAt: now,
        name: sanitizeText(body.name, 28) || `区画 (${chunk.cx}, ${chunk.cy})`,
      };
      await storePropertyDeed(deed);
      void pushMmoNews(
        "economy",
        `[不動産取得] ${displayName} がチャンク ${deed.name} (${chunk.key}) の権利書を取得`,
        now,
      );
      return NextResponse.json(
        { ok: true, deed, price, balance: paid.balance },
        { headers: NO_STORE },
      );
    }

    if (action === "update_deed") {
      const chunkKey = typeof body.chunkKey === "string" ? body.chunkKey : "";
      const deed = await loadPropertyDeed(chunkKey);
      if (!deed) return err("deed_not_found", 404);
      if (deed.ownerKey !== ownerKey) return err("not_owner", 403);
      const zone: ZoneType =
        body.zone === "commercial" || body.zone === "industrial"
          ? body.zone
          : body.zone === "residential"
            ? "residential"
            : deed.zone;
      const rentPerHour =
        typeof body.rentPerHour === "number" && Number.isFinite(body.rentPerHour)
          ? Math.max(0, Math.min(50_000, Math.floor(body.rentPerHour)))
          : deed.rentPerHour;
      const name = sanitizeText(body.name, 28) || deed.name;
      const updated = { ...deed, zone, rentPerHour, name };
      await storePropertyDeed(updated);
      return NextResponse.json({ ok: true, deed: updated }, { headers: NO_STORE });
    }

    if (action === "lease_chunk") {
      const chunkKey = typeof body.chunkKey === "string" ? body.chunkKey : "";
      const deed = await loadPropertyDeed(chunkKey);
      if (!deed) return err("deed_not_found", 404);
      if (deed.ownerKey === ownerKey) return err("cannot_lease_own", 409);
      if (deed.tenantKey && deed.tenantKey !== ownerKey) return err("already_leased", 409);
      const rent = Math.max(50, deed.rentPerHour);
      const paid = await spendMmoCoins(session, ownerKey, rent, "shop_buy");
      if (!paid.ok) return err(paid.error, 409);
      await payOwner(deed.ownerKey, rent, "rent_income");

      const updated: PropertyDeed = {
        ...deed,
        tenantKey: ownerKey,
        tenantName: displayName,
        lastRentAt: now,
      };
      await storePropertyDeed(updated);
      return NextResponse.json(
        { ok: true, deed: updated, balance: paid.balance },
        { headers: NO_STORE },
      );
    }

    if (action === "buy_apartment") {
      const tierId = (typeof body.tier === "string" ? body.tier : "studio") as ApartmentTierId;
      const def = APARTMENT_TIERS.find((t) => t.id === tierId);
      if (!def) return err("unknown_tier", 400);

      const unitId = `${tierId.slice(0, 3)}_${now.toString(36).slice(-5)}_${Math.floor(Math.random() * 99)}`;
      const paid = await spendMmoCoins(session, ownerKey, def.price, "shop_buy");
      if (!paid.ok) return err(paid.error, 409);
      void depositCityTreasury(Math.floor(def.price * 0.15));

      const apt: ApartmentOwnership = {
        unitId,
        tier: tierId,
        ownerKey,
        ownerName: displayName,
        purchasedAt: now,
        lastIncomeAt: now,
      };
      await storeApartment(apt);
      void pushMmoNews("economy", `[分譲購入] ${displayName} が「${def.name}」を購入`, now);
      return NextResponse.json(
        { ok: true, apartment: apt, balance: paid.balance },
        { headers: NO_STORE },
      );
    }

    if (action === "collect_rent") {
      const unitId = typeof body.unitId === "string" ? body.unitId : "";
      const apt = await loadApartment(unitId);
      if (!apt) return err("apartment_not_found", 404);
      if (apt.ownerKey !== ownerKey) return err("not_owner", 403);
      const def = APARTMENT_TIERS.find((t) => t.id === apt.tier);
      if (!def) return err("unknown_tier", 400);

      const elapsedHours = Math.min(12, Math.floor((now - apt.lastIncomeAt) / 3_600_000));
      if (elapsedHours < 1) {
        return err("no_rent_ready", 409);
      }
      const payout = elapsedHours * def.hourlyPassiveRent;
      const paid = await awardMmoCoins(session, ownerKey, payout, "rent_income");
      if (!paid.ok) return err(paid.error, 503);
      await storeApartment({ ...apt, lastIncomeAt: now });
      return NextResponse.json(
        { ok: true, collected: payout, balance: paid.balance },
        { headers: NO_STORE },
      );
    }

    if (action === "enter_apartment") {
      const unitId = typeof body.unitId === "string" ? body.unitId : "";
      const apt = await loadApartment(unitId);
      if (!apt) return err("apartment_not_found", 404);
      const space = `apartment:${apt.unitId}`;
      await movePlayerSpaceServer(
        ownerKey,
        displayName,
        space,
        APARTMENT_ENTRY.x,
        APARTMENT_ENTRY.y,
      );
      return NextResponse.json(
        {
          ok: true,
          forceMove: { space, x: APARTMENT_ENTRY.x, y: APARTMENT_ENTRY.y },
          tier: apt.tier,
        },
        { headers: NO_STORE },
      );
    }

    if (action === "exit_apartment") {
      await movePlayerSpaceServer(ownerKey, displayName, "lobby", 28.5, 28.5);
      return NextResponse.json(
        { ok: true, forceMove: { space: "lobby", x: 28.5, y: 28.5 } },
        { headers: NO_STORE },
      );
    }

    return err("invalid_action", 400);
  });
}
