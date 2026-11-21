import { NextResponse } from "next/server";
import { getRequestSession, isSameOriginRequest, sessionOwnerKey } from "@/lib/auth";
import { MAP_SEED } from "@/lib/worldbox/world/mapgen";
import { loadProfile, storeProfile } from "@/lib/worldbox/player/profile-online";
import { addItem, wearTool } from "@/lib/worldbox/player/profile";
import { itemById } from "@/lib/worldbox/economy/items";
import { listPresence, putPresence } from "@/lib/worldbox/player/presence-online";
import { presenceIdFor } from "@/lib/worldbox/player/presence";
import { parseSave } from "@/lib/worldbox/core/save";
import { loadWorldBoxSave, storeWorldBoxSave } from "@/lib/worldbox/core/save-online";
import { serializeSave } from "@/lib/worldbox/core/save";
import {
  buildCaveLayer,
  buildDungeonFloor,
  buildRuins,
  makeInstanceSpace,
  parseInstanceSpace,
  ruinsCompleteOpId,
  weekKeyOf,
  CAVE_CHEST_RESPAWN_MS,
  DUNGEON_CLEAR_EARN,
  DUNGEON_FLOORS,
  RUINS_COMPLETE_EARN,
  RUINS_MAIN_CHEST_LOOT,
} from "@/lib/worldbox/world/instances";
import { activeLimitedDungeon, isEventDungeonEntrance } from "@/lib/worldbox/core/events";
import { withUserLock } from "@/lib/worldbox/core/user-lock";
import {
  deleteDungeonSession,
  dungeonSessionClosed,
  loadDungeonClearWeek,
  loadDungeonSession,
  loadRuinsPersonal,
  storeDungeonClearWeek,
  storeDungeonSession,
  storeRuinsPersonal,
  type DungeonSession,
} from "@/lib/worldbox/world/instances-online";
import { partyKeyOf } from "@/lib/worldbox/social/party";
import { loadPartyOf } from "@/lib/worldbox/social/party-online";
import { buildEconomyOp } from "@/lib/worldbox/economy/economy-bridge";
import {
  enqueueEconomyOpOnce,
  isEconomyEnabled,
} from "@/lib/worldbox/economy/economy-bridge-online";
import { addMasteryXp, MINER_BONUS_CHANCE } from "@/lib/worldbox/player/roles";
import {
  isInstancesEnabled,
  loadInstanceState,
  storeInstanceState,
} from "@/lib/worldbox/world/instances-online";
import { rollObjectLoot, specialObjectById } from "@/lib/worldbox/world/objects";
import { makeRng } from "@/lib/worldbox/core/rng";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const REACH = 2.4;

function sameOrigin(request: Request) {
  return isSameOriginRequest(request);
}

function bestToolTier(
  profile: { items: Record<string, number>; enhance?: Record<string, number> },
  tool: string,
): number {
  let best = 0;
  for (const [id, count] of Object.entries(profile.items)) {
    if (count <= 0) continue;
    const def = itemById(id);
    if (def?.tool !== tool) continue;
    const effective = (def.tier ?? 0) + (profile.enhance?.[id] ?? 0);
    if (effective > best) best = effective;
  }
  return best;
}

async function actorPos(ownerKey: string, space: string): Promise<{ x: number; y: number } | null> {
  const selfId = presenceIdFor(ownerKey);
  const entries = await listPresence();
  const now = Date.now();
  const entry = entries.find((e) => e.id === selfId && e.space === space && now - e.ts <= 15_000);
  if (entry) return { x: entry.x, y: entry.y };
  const saved = parseSave(await loadWorldBoxSave(ownerKey));
  if (saved && saved.space === space) return { x: saved.x, y: saved.y };
  return null;
}

export async function GET(request: Request) {
  const session = getRequestSession(request);
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  if (!isInstancesEnabled())
    return NextResponse.json(
      { error: "instances_unavailable" },
      { status: 503, headers: NO_STORE },
    );
  const space = new URL(request.url).searchParams.get("space") ?? "";
  const inst = parseInstanceSpace(space);
  if (!inst)
    return NextResponse.json({ error: "invalid_space" }, { status: 400, headers: NO_STORE });
  if (inst.kind === "ruins") {
    if (
      isEventDungeonEntrance(inst.entranceX, inst.entranceY) &&
      !activeLimitedDungeon(Date.now())
    ) {
      return NextResponse.json({ error: "event_inactive" }, { status: 409, headers: NO_STORE });
    }
    const personal = await loadRuinsPersonal(
      space,
      sessionOwnerKey(session),
      weekKeyOf(Date.now()),
    );
    return NextResponse.json(
      {
        chests: personal.chests,
        traps: personal.traps,
        doors: personal.doors,
        completed: personal.completed,
      },
      { headers: NO_STORE },
    );
  }
  if (inst.kind === "dungeon") {
    const ownerKey = sessionOwnerKey(session);
    const party = await loadPartyOf(ownerKey);
    const floor1 = makeInstanceSpace("dungeon", inst.entranceX, inst.entranceY, 0);
    const ds = await loadDungeonSession(floor1, partyKeyOf(party, ownerKey));
    if (!ds) return NextResponse.json({ error: "no_session" }, { status: 404, headers: NO_STORE });
    const myChests: Record<string, number> = {};
    for (const [k, v] of Object.entries(ds.chests)) {
      if (k.startsWith(`${ownerKey}:`)) myChests[k.slice(ownerKey.length + 1)] = v;
    }
    return NextResponse.json({ chests: myChests, size: ds.size }, { headers: NO_STORE });
  }
  if (inst.kind !== "cave")
    return NextResponse.json({ error: "invalid_space" }, { status: 400, headers: NO_STORE });
  const state = await loadInstanceState(space);
  return NextResponse.json({ veins: state.veins, chest: state.chest }, { headers: NO_STORE });
}

type SessionT = NonNullable<ReturnType<typeof getRequestSession>>;

async function handleRuins(
  request: Request,
  session: SessionT,
  space: string,
  inst: { entranceX: number; entranceY: number },
  fields: { action?: unknown; chestIdx?: unknown; doorIdx?: unknown; trapIdx?: unknown },
): Promise<NextResponse> {
  const ownerKey = sessionOwnerKey(session);
  const now = Date.now();
  const ruins = buildRuins(MAP_SEED, inst.entranceX, inst.entranceY);
  const personal = await loadRuinsPersonal(space, ownerKey, weekKeyOf(now));
  const pos = await actorPos(ownerKey, space);
  const near = (x: number, y: number) =>
    pos !== null && Math.hypot(pos.x - (x + 0.5), pos.y - (y + 0.5)) <= REACH;
  const profile = await loadProfile(ownerKey);
  if (!profile)
    return NextResponse.json({ error: "profile_unavailable" }, { status: 503, headers: NO_STORE });

  if (fields.action === "trap") {
    const trap = ruins.traps.find((t) => t.idx === fields.trapIdx);
    if (!trap) return NextResponse.json({ error: "no_trap" }, { status: 404, headers: NO_STORE });
    if (personal.traps[String(trap.idx)])
      return NextResponse.json({ ok: true, already: true }, { headers: NO_STORE });
    if (!near(trap.x, trap.y))
      return NextResponse.json({ error: "too_far" }, { status: 409, headers: NO_STORE });
    personal.traps[String(trap.idx)] = true;
    let next = profile;
    if (profile.role === "scout") next = addMasteryXp(next, "scout", 3).profile;
    let teleport: { x: number; y: number } | null = null;
    if (trap.kind === "teleport") {
      const centers = ruins.roomCenters.filter((c) => Math.hypot(c.x - trap.x, c.y - trap.y) > 6);
      const target = centers[Math.floor(Math.random() * centers.length)] ?? ruins.portal;
      teleport = { x: target.x + 0.5, y: target.y + 0.5 };
    }
    await storeRuinsPersonal(space, ownerKey, personal);
    if (next !== profile && !(await storeProfile(ownerKey, next))) {
      return NextResponse.json(
        { error: "profile_unavailable" },
        { status: 503, headers: NO_STORE },
      );
    }
    if (teleport) {
      const prevSave = parseSave(await loadWorldBoxSave(ownerKey));
      await storeWorldBoxSave(
        ownerKey,
        serializeSave({
          space,
          x: teleport.x,
          y: teleport.y,
          worldReturn: prevSave?.worldReturn ?? null,
        }),
      );
      await putPresence(
        ownerKey,
        {
          name: session.username?.trim() || "プレイヤー",
          x: teleport.x,
          y: teleport.y,
          vx: 0,
          vy: 0,
          face: 1,
          space,
        },
        now,
      );
    }
    return NextResponse.json(
      { ok: true, kind: trap.kind, teleport, profile: next },
      { headers: NO_STORE },
    );
  }

  if (fields.action === "open_chest") {
    const chest = ruins.chests.find((c) => c.idx === fields.chestIdx);
    if (!chest) return NextResponse.json({ error: "no_chest" }, { status: 404, headers: NO_STORE });
    if (personal.chests[String(chest.idx)])
      return NextResponse.json({ error: "depleted" }, { status: 409, headers: NO_STORE });
    if (!near(chest.x, chest.y))
      return NextResponse.json({ error: "too_far" }, { status: 409, headers: NO_STORE });
    if (
      chest.requiresKey &&
      ruins.doors.length > 0 &&
      !personal.doors[String(ruins.doors[0].idx)]
    ) {
      return NextResponse.json({ error: "needs_golden_key" }, { status: 409, headers: NO_STORE });
    }
    const def = specialObjectById("ruins_chest");
    if (!def) return NextResponse.json({ error: "no_chest" }, { status: 404, headers: NO_STORE });
    const rng = makeRng((now ^ (chest.x * 131) ^ (chest.y * 17)) >>> 0);
    void rng;
    let gained: Record<string, number> = {};
    let trapped = false;
    if (chest.main) {
      for (const entry of RUINS_MAIN_CHEST_LOOT) {
        if (rng() >= entry.chance) continue;
        const count = entry.min + Math.floor(rng() * (entry.max - entry.min + 1));
        if (count > 0) gained[entry.itemId] = (gained[entry.itemId] ?? 0) + count;
      }
    } else {
      const loot = rollObjectLoot(def, rng);
      gained = loot.gained;
      trapped = loot.trapped;
      if (trapped && profile.role === "scout" && rng() < 0.5) trapped = false;
    }
    let next = profile;
    for (const [id, count] of Object.entries(gained)) next = addItem(next, id, count);
    if (profile.role === "scout") next = addMasteryXp(next, "scout", 4).profile;
    personal.chests[String(chest.idx)] = true;
    let completedNow = false;
    if (chest.main && !personal.completed) {
      personal.completed = true;
      completedNow = true;
    }
    await storeRuinsPersonal(space, ownerKey, personal);
    if (!(await storeProfile(ownerKey, next))) {
      return NextResponse.json(
        { error: "profile_unavailable" },
        { status: 503, headers: NO_STORE },
      );
    }
    if (completedNow && session.provider === "discord" && isEconomyEnabled()) {
      const op = buildEconomyOp(
        {
          kind: "earn",
          userKey: ownerKey,
          discordId: session.id,
          amount: RUINS_COMPLETE_EARN,
          reason: "ruins_complete",
        },
        ruinsCompleteOpId(inst.entranceX, inst.entranceY, session.id),
        now,
      );
      if (op) await enqueueEconomyOpOnce(op);
    }
    return NextResponse.json(
      {
        ok: true,
        gained,
        trapped,
        completed: completedNow,
        profile: next,
        chests: personal.chests,
      },
      { headers: NO_STORE },
    );
  }

  return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });
}

async function handleDungeon(
  request: Request,
  session: SessionT,
  space: string,
  inst: NonNullable<ReturnType<typeof parseInstanceSpace>>,
  fields: { action?: unknown; chestIdx?: unknown; doorIdx?: unknown },
): Promise<NextResponse> {
  void request;
  const ownerKey = sessionOwnerKey(session);
  const now = Date.now();
  const floor = buildDungeonFloor(MAP_SEED, inst.entranceX, inst.entranceY, inst.layer);
  const party = await loadPartyOf(ownerKey);
  const partyKey = partyKeyOf(party, ownerKey);
  const floor1 = makeInstanceSpace("dungeon", inst.entranceX, inst.entranceY, 0);
  const ds = await loadDungeonSession(floor1, partyKey);
  if (!ds || !ds.members.includes(ownerKey)) {
    return NextResponse.json({ error: "no_session" }, { status: 409, headers: NO_STORE });
  }
  const pos = await actorPos(ownerKey, space);
  const near = (x: number, y: number) =>
    !!pos && Math.hypot(x + 0.5 - pos.x, y + 0.5 - pos.y) <= REACH;
  const profile = await loadProfile(ownerKey);
  if (!profile)
    return NextResponse.json(
      { error: "instances_unavailable" },
      { status: 503, headers: NO_STORE },
    );

  if (fields.action === "leave") {
    const next: DungeonSession = {
      ...ds,
      departed: ds.departed.includes(ownerKey) ? ds.departed : [...ds.departed, ownerKey],
    };
    if (dungeonSessionClosed(next)) await deleteDungeonSession(floor1, partyKey);
    else await storeDungeonSession(floor1, next);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  if (fields.action === "open_chest") {
    const chest = floor.chests.find((c) => c.idx === fields.chestIdx);
    if (!chest)
      return NextResponse.json({ error: "unknown_chest" }, { status: 400, headers: NO_STORE });
    if (!near(chest.x, chest.y))
      return NextResponse.json({ error: "too_far" }, { status: 409, headers: NO_STORE });

    const claimKey = `${ownerKey}:${inst.layer}:${chest.idx}`;
    if (ds.chests[claimKey])
      return NextResponse.json({ error: "already_opened" }, { status: 409, headers: NO_STORE });
    const def = specialObjectById("dungeon_chest");
    if (!def) return NextResponse.json({ error: "no_chest" }, { status: 404, headers: NO_STORE });
    const rng = makeRng((now ^ (chest.x * 131) ^ (chest.y * 17) ^ (inst.layer * 7)) >>> 0);
    const loot = rollObjectLoot(def, rng);
    let trapped = chest.main ? false : loot.trapped;
    if (trapped && profile.role === "scout" && rng() < 0.5) trapped = false;
    let next = profile;
    for (const [id, count] of Object.entries(loot.gained)) next = addItem(next, id, count);
    const nextSession: DungeonSession = { ...ds, chests: { ...ds.chests, [claimKey]: now } };
    if (!(await storeDungeonSession(floor1, nextSession)))
      return NextResponse.json({ error: "store_failed" }, { status: 503, headers: NO_STORE });
    if (!(await storeProfile(ownerKey, next)))
      return NextResponse.json({ error: "store_failed" }, { status: 503, headers: NO_STORE });
    let cleared = false;
    if (
      chest.main &&
      inst.layer + 1 >= DUNGEON_FLOORS &&
      session.provider === "discord" &&
      isEconomyEnabled()
    ) {
      const week = weekKeyOf(now);
      if ((await loadDungeonClearWeek(ownerKey)) !== week) {
        const op = buildEconomyOp(
          {
            kind: "earn",
            userKey: ownerKey,
            discordId: session.id,
            amount: DUNGEON_CLEAR_EARN,
            reason: "dungeon_clear",
          },
          `dungeon-clear-${inst.entranceX}-${inst.entranceY}-${session.id}-${week}`,
          now,
        );
        if (op && (await enqueueEconomyOpOnce(op))) {
          await storeDungeonClearWeek(ownerKey, week);
          cleared = true;
        }
      }
    }
    return NextResponse.json(
      { ok: true, gained: loot.gained, trapped, cleared, profile: next },
      { headers: NO_STORE },
    );
  }

  return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });
}

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const session = getRequestSession(request);
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  if (!isInstancesEnabled())
    return NextResponse.json(
      { error: "instances_unavailable" },
      { status: 503, headers: NO_STORE },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });
  }
  const fields = (body ?? {}) as {
    action?: unknown;
    space?: unknown;
    veinKey?: unknown;
    chestIdx?: unknown;
    doorIdx?: unknown;
    trapIdx?: unknown;
  };
  const space = typeof fields.space === "string" ? fields.space : "";
  const inst = parseInstanceSpace(space);
  if (!inst)
    return NextResponse.json({ error: "invalid_space" }, { status: 400, headers: NO_STORE });
  return withUserLock(`instance:${space}`, () =>
    handleInstancePost(request, session, space, inst, fields),
  );
}

type InstanceT = NonNullable<ReturnType<typeof parseInstanceSpace>>;
type FieldsT = {
  action?: unknown;
  space?: unknown;
  veinKey?: unknown;
  chestIdx?: unknown;
  doorIdx?: unknown;
  trapIdx?: unknown;
};

async function handleInstancePost(
  request: Request,
  session: SessionT,
  space: string,
  inst: InstanceT,
  fields: FieldsT,
): Promise<NextResponse> {
  if (inst.kind === "ruins") return handleRuins(request, session, space, inst, fields);
  if (inst.kind === "dungeon") return handleDungeon(request, session, space, inst, fields);
  if (inst.kind !== "cave")
    return NextResponse.json({ error: "invalid_space" }, { status: 400, headers: NO_STORE });
  const ownerKey = sessionOwnerKey(session);
  const now = Date.now();
  const cave = buildCaveLayer(MAP_SEED, inst.entranceX, inst.entranceY, inst.layer);
  const pos = await actorPos(ownerKey, space);
  const near = (x: number, y: number) =>
    pos !== null && Math.hypot(pos.x - (x + 0.5), pos.y - (y + 0.5)) <= REACH;

  if (fields.action === "onsen") {
    if (cave.onsen.length === 0 || !cave.onsen.some((t) => near(t.x, t.y))) {
      return NextResponse.json({ error: "not_at_onsen" }, { status: 409, headers: NO_STORE });
    }
    const profile = await loadProfile(ownerKey);
    if (!profile)
      return NextResponse.json(
        { error: "profile_unavailable" },
        { status: 503, headers: NO_STORE },
      );
    const saved = parseSave(await loadWorldBoxSave(ownerKey));
    if (saved) {
      saved.worldReturn = { x: inst.entranceX + 0.5, y: inst.entranceY + 0.5 };
      await storeWorldBoxSave(ownerKey, serializeSave(saved));
    }
    return NextResponse.json({ ok: true, hunger: profile.hunger, profile }, { headers: NO_STORE });
  }

  if (fields.action === "mine" || fields.action === "open_chest") {
    const profile = await loadProfile(ownerKey);
    if (!profile)
      return NextResponse.json(
        { error: "profile_unavailable" },
        { status: 503, headers: NO_STORE },
      );
    const state = await loadInstanceState(space);

    if (fields.action === "mine") {
      const vein = cave.veins.find((v) => v.key === fields.veinKey);
      if (!vein) return NextResponse.json({ error: "no_vein" }, { status: 404, headers: NO_STORE });
      if (!near(vein.x, vein.y))
        return NextResponse.json({ error: "too_far" }, { status: 409, headers: NO_STORE });
      const def = specialObjectById(vein.objectId);
      if (!def) return NextResponse.json({ error: "no_vein" }, { status: 404, headers: NO_STORE });
      const takenAt = state.veins[vein.key] ?? 0;
      if (takenAt > 0 && now - takenAt < def.respawnMs) {
        return NextResponse.json({ error: "depleted" }, { status: 409, headers: NO_STORE });
      }
      if (bestToolTier(profile, "pickaxe") <= 0) {
        return NextResponse.json({ error: "needs_pickaxe" }, { status: 409, headers: NO_STORE });
      }
      if (bestToolTier(profile, "pickaxe") < (def.minTier ?? 0)) {
        return NextResponse.json({ error: "pickaxe_tier" }, { status: 409, headers: NO_STORE });
      }
      const loot = rollObjectLoot(def, makeRng((now ^ (vein.x * 131) ^ (vein.y * 17)) >>> 0));
      let next = profile;
      for (const [id, count] of Object.entries(loot.gained)) next = addItem(next, id, count);
      if (profile.role === "miner") {
        if (Math.random() < MINER_BONUS_CHANCE) {
          const bonus = rollObjectLoot(def, makeRng((now ^ 0x5eed) >>> 0));
          for (const [id, count] of Object.entries(bonus.gained)) next = addItem(next, id, count);
        }
        next = addMasteryXp(next, "miner", (def.minTier ?? 0) >= 2 ? 4 : 1).profile;
      }
      const worn = wearTool(next, "pickaxe");
      next = worn.profile;
      state.veins[vein.key] = now;
      await storeInstanceState(space, state);
      if (!(await storeProfile(ownerKey, next))) {
        return NextResponse.json(
          { error: "profile_unavailable" },
          { status: 503, headers: NO_STORE },
        );
      }
      return NextResponse.json(
        {
          ok: true,
          gained: loot.gained,
          profile: next,
          ...(worn.brokeItemId ? { broke: worn.brokeItemId } : {}),
        },
        { headers: NO_STORE },
      );
    }

    if (!cave.chest)
      return NextResponse.json({ error: "no_chest" }, { status: 404, headers: NO_STORE });
    if (!near(cave.chest.x, cave.chest.y))
      return NextResponse.json({ error: "too_far" }, { status: 409, headers: NO_STORE });
    if (state.chest > 0 && now - state.chest < CAVE_CHEST_RESPAWN_MS) {
      return NextResponse.json({ error: "depleted" }, { status: 409, headers: NO_STORE });
    }
    const def = specialObjectById("cave_chest");
    if (!def) return NextResponse.json({ error: "no_chest" }, { status: 404, headers: NO_STORE });
    const rng = makeRng((now ^ (cave.chest.x * 71) ^ cave.chest.y) >>> 0);
    const loot = rollObjectLoot(def, rng);
    let next = profile;
    for (const [id, count] of Object.entries(loot.gained)) next = addItem(next, id, count);
    let trapped = loot.trapped;
    if (trapped && profile.role === "scout" && rng() < 0.5) trapped = false;
    state.chest = now;
    await storeInstanceState(space, state);
    if (!(await storeProfile(ownerKey, next))) {
      return NextResponse.json(
        { error: "profile_unavailable" },
        { status: 503, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { ok: true, gained: loot.gained, trapped, profile: next },
      { headers: NO_STORE },
    );
  }

  return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });
}
