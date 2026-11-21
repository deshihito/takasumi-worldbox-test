import { addMasteryXp } from "@/lib/worldbox/player/roles";
import { NextResponse } from "next/server";
import { getRequestSession, isSameOriginRequest, sessionOwnerKey } from "@/lib/auth";
import {
  buyItem,
  craftFromInputs,
  craftItem,
  eatItem,
  sellItem,
  type CoinMovement,
  type EconomyError,
} from "@/lib/worldbox/economy/economy";
import { buildEconomyOp, type EconomyOp } from "@/lib/worldbox/economy/economy-bridge";
import {
  deleteEconomyOp,
  deleteEconomyOpLedger,
  findEconomyOp,
  isEconomyEnabled,
  readUserBalance,
  submitEconomyOp,
  waitForOpDone,
} from "@/lib/worldbox/economy/economy-bridge-online";
import { TENT_MAX_TIER, TENT_TIERS } from "@/lib/worldbox/world/tent";
import {
  countItem,
  ENHANCE_BASE_COST,
  ENHANCE_MATERIALS,
  ENHANCE_MAX_LEVEL,
  moveSlot,
  removeItem,
  swapSlots,
  type PlayerProfile,
} from "@/lib/worldbox/player/profile";
import { itemById, recipeById, recipeKind } from "@/lib/worldbox/economy/items";
import { findPresenceOwnerKey, isPresenceEnabled } from "@/lib/worldbox/player/presence-online";
import {
  checkBuyGenre,
  checkBuySold,
  checkDailyStock,
  dailyPriceFor,
  shopDayKeyOf,
} from "@/lib/worldbox/economy/shops";
import {
  loadMyLobbyShopGenre,
  loadMyLobbyStation,
  loadMyWorldStationKinds,
} from "@/lib/worldbox/world/station-online";
import type { StationKind } from "@/lib/worldbox/world/tiles";
import { isProfileEnabled, loadProfile, storeProfile } from "@/lib/worldbox/player/profile-online";
import { withUserLock } from "@/lib/worldbox/core/user-lock";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

const BAD_REQUEST_ERRORS = new Set([
  "invalid_request",
  "invalid_action",
  "unknown_item",
  "unknown_recipe",
  "invalid_count",
  "self_target",
]);

function sameOrigin(request: Request) {
  return isSameOriginRequest(request);
}

function errorResponse(error: string) {
  const status = BAD_REQUEST_ERRORS.has(error) ? 400 : 409;
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

function statusError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

function discordIdOf(session: { provider: string; id: string }): string | null {
  return session.provider === "discord" ? session.id : null;
}

function buildCoinOp(ownerKey: string, discordId: string, coin: CoinMovement): EconomyOp | null {
  return buildEconomyOp(
    { kind: coin.kind, userKey: ownerKey, discordId, amount: coin.amount, reason: coin.reason },
    crypto.randomUUID(),
    Date.now(),
  );
}

export async function GET(request: Request) {
  const session = getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  if (!isProfileEnabled()) {
    return NextResponse.json({ error: "profile_unavailable" }, { status: 503, headers: NO_STORE });
  }
  const profile = await loadProfile(sessionOwnerKey(session));
  return NextResponse.json({ profile, loggedIn: true }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  const session = getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  if (!isProfileEnabled()) {
    return NextResponse.json({ error: "profile_unavailable" }, { status: 503, headers: NO_STORE });
  }
  return withUserLock(sessionOwnerKey(session), () => handlePost(request, session));
}

type AuthedSession = NonNullable<ReturnType<typeof getRequestSession>>;

async function handlePost(request: Request, session: AuthedSession) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });
  }
  const data = (body ?? {}) as {
    action?: unknown;
    itemId?: unknown;
    count?: unknown;
    recipeId?: unknown;
    targetId?: unknown;
    inputs?: unknown;
    hotbarIndex?: unknown;
    storageIndex?: unknown;
    from?: unknown;
    to?: unknown;
  };
  const ownerKey = sessionOwnerKey(session);
  const current = await loadProfile(ownerKey);

  const saveAndReturn = async (
    result: { ok: true; profile: PlayerProfile } | { ok: false; error: EconomyError },
    extra: Record<string, unknown> = {},
  ) => {
    if (!result.ok) return errorResponse(result.error);
    if (!(await storeProfile(ownerKey, result.profile))) {
      return NextResponse.json({ error: "store_failed" }, { status: 503, headers: NO_STORE });
    }
    return NextResponse.json({ profile: result.profile, ...extra }, { headers: NO_STORE });
  };

  const saveWithCoin = async (
    result:
      | { ok: true; profile: PlayerProfile; coin?: CoinMovement }
      | { ok: false; error: EconomyError },
    discordId: string,
    extra: Record<string, unknown> = {},
  ) => {
    if (!result.ok) return errorResponse(result.error);
    if (!(await storeProfile(ownerKey, result.profile))) {
      return NextResponse.json({ error: "store_failed" }, { status: 503, headers: NO_STORE });
    }
    if (result.coin) {
      const op = buildCoinOp(ownerKey, discordId, result.coin);
      if (!op) {
        await storeProfile(ownerKey, current);
        return statusError("economy_failed", 503);
      }
      const submitted = await submitEconomyOp(op, { freshId: true });
      if (submitted.state === "unavailable") {
        await storeProfile(ownerKey, current);
        return statusError("economy_failed", 503);
      }
      const settled =
        submitted.state === "pending" ? await waitForOpDone(ownerKey, op.id) : submitted.op;
      if (settled && settled.status === "failed") {
        await storeProfile(ownerKey, current);
        return NextResponse.json(
          { error: "economy_failed", opError: settled.error ?? null },
          { status: 409, headers: NO_STORE },
        );
      }
      if (settled && settled.status !== "pending") {
        const balance =
          submitted.state !== "pending" && submitted.newBalance !== undefined
            ? submitted.newBalance
            : await readUserBalance(discordId);
        return NextResponse.json(
          {
            profile: result.profile,
            ...extra,
            opStatus: settled.status,
            ...(balance !== null ? { balance } : {}),
          },
          { headers: NO_STORE },
        );
      }
    }
    return NextResponse.json({ profile: result.profile, ...extra }, { headers: NO_STORE });
  };

  const coinGate = (): { discordId: string } | { response: NextResponse } => {
    const discordId = discordIdOf(session);
    if (!discordId) return { response: statusError("discord_required", 403) };
    if (!isEconomyEnabled()) return { response: statusError("economy_unavailable", 503) };
    return { discordId };
  };

  const stationGate = async (station: string, error: string) => {
    return (await loadMyLobbyStation(ownerKey)) === station ? null : statusError(error, 409);
  };

  const workGate = async (kind: StationKind) => {
    if ((await loadMyLobbyStation(ownerKey)) === "smith") return null;
    const kinds = await loadMyWorldStationKinds(ownerKey);
    return kinds.has(kind) ? null : statusError("not_at_workbench", 409);
  };

  const shopGate = async () => {
    const station = await loadMyLobbyStation(ownerKey);
    return station === "shop" || station === "smith" ? null : statusError("not_at_shop", 409);
  };

  const sellGate = async () => {
    const station = await loadMyLobbyStation(ownerKey);
    return station === "shop" || station === "smith" || station === "sell"
      ? null
      : statusError("not_at_shop", 409);
  };

  switch (data.action) {
    case "buy": {
      const gate = coinGate();
      if ("response" in gate) return gate.response;
      const [place, myGenre, balance] = await Promise.all([
        shopGate(),
        loadMyLobbyShopGenre(ownerKey),
        readUserBalance(gate.discordId),
      ]);
      if (place) return place;
      const genreError = checkBuyGenre(myGenre, data.itemId);
      if (genreError) return statusError(genreError, 409);
      const soldError = checkBuySold(data.itemId);
      if (soldError) return statusError(soldError, 409);
      const dayKey = shopDayKeyOf(Date.now());
      const dailyError = checkDailyStock(myGenre, data.itemId, dayKey);
      if (dailyError) return statusError(dailyError, 409);
      if (balance === null) return statusError("economy_unavailable", 503);
      const itemDef = itemById(data.itemId as string);
      const unitPrice = myGenre && itemDef ? dailyPriceFor(itemDef, dayKey) : undefined;
      return saveWithCoin(
        buyItem(current, data.itemId, data.count, balance, unitPrice),
        gate.discordId,
      );
    }
    case "expand_tent": {
      const gate = coinGate();
      if ("response" in gate) return gate.response;
      const nextTier = current.tentTier + 1;
      if (nextTier > TENT_MAX_TIER) return statusError("max_tier", 409);
      const price = TENT_TIERS[nextTier].price;
      const balance = await readUserBalance(gate.discordId);
      if (balance === null) return statusError("economy_unavailable", 503);
      if (balance < price) return statusError("insufficient_balance", 409);
      const opId = `tent-expand-${gate.discordId}-${nextTier}`;
      const existing = await findEconomyOp(ownerKey, opId);
      if (existing && existing.status === "failed") {
        await deleteEconomyOp(opId);
        await deleteEconomyOpLedger(opId);
      }
      const op = buildEconomyOp(
        {
          kind: "spend",
          userKey: ownerKey,
          discordId: gate.discordId,
          amount: price,
          reason: "tent_expand",
        },
        opId,
        Date.now(),
      );
      if (!op) return statusError("economy_failed", 503);
      const submitted = await submitEconomyOp(op);
      if (submitted.state === "unavailable") return statusError("economy_failed", 503);
      const settled =
        submitted.state === "pending" ? await waitForOpDone(ownerKey, op.id) : submitted.op;
      if (settled && settled.status === "failed") {
        return NextResponse.json(
          { error: "economy_failed", opError: settled.error ?? null },
          { status: 409, headers: NO_STORE },
        );
      }
      return saveAndReturn({ ok: true, profile: { ...current, tentTier: nextTier } });
    }
    case "sell": {
      const gate = coinGate();
      if ("response" in gate) return gate.response;
      const place = await sellGate();
      if (place) return place;
      return saveWithCoin(sellItem(current, data.itemId, data.count), gate.discordId);
    }
    case "swap": {
      const swapped = swapSlots(current, data.hotbarIndex, data.storageIndex);
      if (!swapped) return errorResponse("invalid_action");
      return saveAndReturn({ ok: true, profile: swapped });
    }
    case "move": {
      const movedProfile = moveSlot(current, data.from, data.to);
      if (!movedProfile) return errorResponse("invalid_action");
      return saveAndReturn({ ok: true, profile: movedProfile });
    }
    case "eat": {
      const result = eatItem(current, data.itemId);
      if (result.ok && current.role === "medic") {
        const withXp = { ...result, profile: addMasteryXp(result.profile, "medic", 2).profile };
        return saveAndReturn(withXp, { itemName: result.item.name });
      }
      return saveAndReturn(result, result.ok ? { itemName: result.item.name } : {});
    }
    case "enhance": {
      const gate = coinGate();
      if ("response" in gate) return gate.response;
      const place = await workGate("enhance");
      if (place) return place;
      const def = itemById(data.itemId as string);
      if (!def || !def.tool) return errorResponse("unknown_item");
      if ((current.items[def.id] ?? 0) <= 0) return errorResponse("not_enough_items");
      const level = current.enhance[def.id] ?? 0;
      if (level >= ENHANCE_MAX_LEVEL) return statusError("max_level", 409);
      const material = ENHANCE_MATERIALS[def.tier ?? 1] ?? ENHANCE_MATERIALS[1];
      if (countItem(current, material.itemId) < material.count)
        return errorResponse("not_enough_items");
      const cost = ENHANCE_BASE_COST * (level + 1);
      const balance = await readUserBalance(gate.discordId);
      if (balance === null) return statusError("economy_unavailable", 503);
      if (balance < cost) return statusError("insufficient_balance", 409);
      const removedMat = removeItem(current, material.itemId, material.count);
      if (!removedMat) return errorResponse("not_enough_items");
      return saveWithCoin(
        {
          ok: true,
          profile: { ...removedMat, enhance: { ...removedMat.enhance, [def.id]: level + 1 } },
          coin: { kind: "spend", amount: cost, reason: "tool_enhance" },
        },
        gate.discordId,
      );
    }
    case "craft": {
      const recipe = recipeById(data.recipeId);
      const place = await workGate(recipe ? recipeKind(recipe) : "craft");
      if (place) return place;
      const withDiscovery = (profile: PlayerProfile, recipeId: string): PlayerProfile => {
        const found = profile.discoveredRecipes ?? [];
        return found.includes(recipeId)
          ? profile
          : { ...profile, discoveredRecipes: [...found, recipeId] };
      };
      if (data.inputs !== undefined && data.inputs !== null) {
        const result = craftFromInputs(current, data.inputs);
        if (!result.ok) return saveAndReturn(result);
        const profile =
          result.matched && result.recipe
            ? withDiscovery(result.profile, result.recipe.id)
            : result.profile;
        return saveAndReturn(
          { ok: true, profile },
          {
            craftedId: result.resultId,
            rareId: result.rare?.id ?? null,
            hint: result.hint,
            matched: result.matched,
          },
        );
      }
      const result = craftItem(current, data.recipeId);
      if (!result.ok) return saveAndReturn(result);
      return saveAndReturn(
        { ok: true, profile: withDiscovery(result.profile, result.recipe.id) },
        {
          craftedId: result.recipe.output,
          rareId: result.rare?.id ?? null,
          hint: "exact",
          matched: true,
        },
      );
    }
    case "work": {
      return errorResponse("work_disabled");
    }
    case "steal": {
      return errorResponse("steal_disabled");
    }
    default:
      return NextResponse.json({ error: "invalid_action" }, { status: 400, headers: NO_STORE });
  }
}
