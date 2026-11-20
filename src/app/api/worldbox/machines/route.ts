import { NextResponse } from "next/server";
import { getRequestSession, isSameOriginRequest, sessionOwnerKey } from "@/lib/auth";
import { WORLD_COORD_LIMIT } from "@/lib/worldbox/world/mapgen";
import { loadProfile, storeProfile } from "@/lib/worldbox/player/profile-online";
import { addItem, countItem, removeItem } from "@/lib/worldbox/player/profile";
import { itemById, recipeById } from "@/lib/worldbox/economy/items";
import { listPresence } from "@/lib/worldbox/player/presence-online";
import { presenceIdFor } from "@/lib/worldbox/player/presence";
import { parseSave } from "@/lib/worldbox/core/save";
import { loadWorldBoxSave } from "@/lib/worldbox/core/save-online";
import { isOverrideActive, tileKey, type TileOverride } from "@/lib/worldbox/world/tiles";
import {
  isTilesEnabled,
  loadTileOverride,
  loadTileOverrides,
  storeTileOverride,
} from "@/lib/worldbox/world/tiles-online";
import {
  decodeCustomBlueprint,
  decodeProgram,
  defaultCustomBlueprint,
  defaultProgram,
  encodeCustomBlueprint,
  encodeProgram,
  evaluateExtendedMachine,
  isMachineItem,
  machineBufferCount,
  machineSpecFor,
  parseCustomBlueprint,
  parseProgram,
  type LogisticsRouteMode,
  type MachineState,
} from "@/lib/worldbox/economy/machines";
import {
  isMachinesEnabled,
  loadMachine,
  storeMachine,
} from "@/lib/worldbox/economy/machines-online";
import { awardMmoCoins, spendMmoCoins } from "@/lib/worldbox/economy/mmo-wallet";
import { payoutUserChunked } from "@/lib/worldbox/economy/settlement";
import { incrementQuestProgress } from "@/lib/worldbox/social/mmo-events-online";
import { depositCityTreasury, loadGovernanceState } from "@/lib/worldbox/social/governance-online";
import { withUserLock } from "@/lib/worldbox/core/user-lock";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const MAX_ACTION_DISTANCE = 3;

function err(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

function sameOrigin(request: Request) {
  return isSameOriginRequest(request);
}

function checkedCoord(xRaw: unknown, yRaw: unknown): { x: number; y: number } | null {
  if (typeof xRaw !== "number" || typeof yRaw !== "number") return null;
  if (!Number.isFinite(xRaw) || !Number.isFinite(yRaw)) return null;
  const x = Math.floor(xRaw);
  const y = Math.floor(yRaw);
  if (Math.abs(x) > WORLD_COORD_LIMIT || Math.abs(y) > WORLD_COORD_LIMIT) return null;
  return { x, y };
}

async function actorWorldPosition(ownerKey: string): Promise<{ x: number; y: number } | null> {
  const selfId = presenceIdFor(ownerKey);
  const entries = await listPresence();
  const now = Date.now();
  const entry = entries.find((e) => e.id === selfId && e.space === "world" && now - e.ts <= 15_000);
  if (entry) return { x: entry.x, y: entry.y };
  const saved = parseSave(await loadWorldBoxSave(ownerKey));
  if (saved && saved.space === "world") return { x: saved.x, y: saved.y };
  return null;
}

async function nearMachine(ownerKey: string, x: number, y: number) {
  const pos = await actorWorldPosition(ownerKey);
  if (!pos) return err("position_unknown", 409);
  if (
    Math.max(Math.abs(Math.floor(pos.x) - x), Math.abs(Math.floor(pos.y) - y)) > MAX_ACTION_DISTANCE
  ) {
    return err("too_far", 409);
  }
  return null;
}

async function ensureMachine(
  ownerKey: string,
  x: number,
  y: number,
  allowVendingVisitor = false,
): Promise<
  { state: MachineState; machineType: string; isOwner: boolean } | { response: NextResponse }
> {
  const ov = await loadTileOverride(x, y);
  const now = Date.now();
  if (!ov || !isOverrideActive(ov, now) || !ov.block || !isMachineItem(ov.block.itemId)) {
    return { response: err("no_machine", 404) };
  }
  const machineType = ov.block.itemId;
  const selfId = presenceIdFor(ownerKey);
  const isOwner = ov.block.ownerId === selfId;
  if (!isOwner && !(allowVendingVisitor && machineType === "smart_vending")) {
    return { response: err("not_owner", 403) };
  }
  let state = await loadMachine(x, y);
  if (!state) {
    state = {
      ownerId: ov.block.ownerId,
      ownerKey: isOwner ? ownerKey : undefined,
      machineType,
      program: {
        ...defaultProgram(),
        intervalSec: machineSpecFor(machineType).defaultIntervalSec,
      },
      buffer: {},
      ...(machineType === "custom_machine" ? { blueprint: defaultCustomBlueprint() } : {}),
      lastEvalAt: now,
      updatedAt: now,
    };
    await storeMachine(x, y, state);
  } else if (isOwner && (!state.ownerKey || state.machineType !== machineType)) {
    state = { ...state, ownerKey, machineType };
    await storeMachine(x, y, state);
  }
  return { state, machineType, isOwner };
}

async function runEvaluation(
  x: number,
  y: number,
  machineType: string,
  state: MachineState,
): Promise<MachineState> {
  const now = Date.now();
  if (!state.program.enabled) return state;

  const all = await loadTileOverrides();
  const radius = Math.max(1, machineSpecFor(machineType).radius);
  const neighbors = new Map<string, TileOverride>();
  let powered = false;

  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      const key = tileKey(x + dx, y + dy);
      const ov = all[key];
      if (!ov || !isOverrideActive(ov, now)) continue;
      if (ov.block?.itemId === "power_generator") powered = true;
      if (Math.abs(dx) <= radius && Math.abs(dy) <= radius) {
        neighbors.set(key, ov);
      }
    }
  }

  // Logistics sorter gathers buffers via nearby radius 2 + connected conveyor_relay chains,
  // and optionally routes items straight into CNC inputs or Vending Machine stock.
  if (
    machineType === "logistics_sorter" &&
    now - state.lastEvalAt >= state.program.intervalSec * 1000
  ) {
    const buffer = { ...state.buffer };
    const routeMode: LogisticsRouteMode = state.routeMode ?? "buffer";
    let pulled = 0;

    // BFS across radius-2 hops along conveyor_relay nodes (max 24 connected hubs)
    const connectedCoords: { cx: number; cy: number; ov: TileOverride }[] = [];
    const seen = new Set<string>([tileKey(x, y)]);
    const queue: { cx: number; cy: number }[] = [{ cx: x, cy: y }];
    while (queue.length > 0 && seen.size < 25) {
      const cur = queue.shift()!;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cur.cx + dx;
          const ny = cur.cy + dy;
          const k = tileKey(nx, ny);
          if (seen.has(k)) continue;
          seen.add(k);
          const ov = all[k];
          if (!ov || !isOverrideActive(ov, now) || !ov.block) continue;
          if (ov.block.ownerId !== state.ownerId || !isMachineItem(ov.block.itemId)) continue;
          connectedCoords.push({ cx: nx, cy: ny, ov });
          if (ov.block.itemId === "conveyor_relay") {
            queue.push({ cx: nx, cy: ny });
          }
        }
      }
    }

    const cncTargets: { cx: number; cy: number; machine: MachineState }[] = [];
    const vendingTargets: { cx: number; cy: number; machine: MachineState }[] = [];

    for (const node of connectedCoords) {
      const type = node.ov.block!.itemId;
      if (type === "conveyor_relay" || type === "logistics_sorter" || type === "power_generator") {
        continue;
      }
      const m = await loadMachine(node.cx, node.cy);
      if (!m) continue;
      if (type === "cnc_factory" || (type === "custom_machine" && m.blueprint?.module === "cnc")) {
        cncTargets.push({ cx: node.cx, cy: node.cy, machine: m });
      }
      if (type === "smart_vending") {
        vendingTargets.push({ cx: node.cx, cy: node.cy, machine: m });
        continue;
      }
      if (machineBufferCount(m) > 0) {
        for (const [id, n] of Object.entries(m.buffer)) {
          buffer[id] = (buffer[id] ?? 0) + n;
          pulled += n;
        }
        await storeMachine(node.cx, node.cy, { ...m, buffer: {}, updatedAt: now });
      }
    }

    if (routeMode === "feed_cnc" && cncTargets.length > 0) {
      for (const target of cncTargets) {
        const rec = recipeById(
          target.machine.blueprint?.targetRecipeId ?? target.machine.targetRecipeId,
        );
        if (!rec) continue;
        const inputs = { ...(target.machine.inputs ?? {}) };
        let moved = 0;
        for (const inId of Object.keys(rec.inputs)) {
          const avail = buffer[inId] ?? 0;
          if (avail > 0) {
            inputs[inId] = (inputs[inId] ?? 0) + avail;
            delete buffer[inId];
            moved += avail;
          }
        }
        if (moved > 0) {
          await storeMachine(target.cx, target.cy, { ...target.machine, inputs, updatedAt: now });
        }
      }
    } else if (routeMode === "feed_vending" && vendingTargets.length > 0) {
      for (const target of vendingTargets) {
        const slots = [...(target.machine.vending ?? [])];
        let moved = 0;
        for (const [id, qty] of Object.entries(buffer)) {
          if (qty <= 0) continue;
          const def = itemById(id);
          if (!def) continue;
          const idx = slots.findIndex((s) => s.itemId === id);
          if (idx >= 0) {
            slots[idx] = { ...slots[idx], stock: Math.min(999, slots[idx].stock + qty) };
            delete buffer[id];
            moved += qty;
          } else if (slots.length < 6) {
            slots.push({ itemId: id, price: def.price, stock: Math.min(999, qty) });
            delete buffer[id];
            moved += qty;
          }
        }
        if (moved > 0) {
          await storeMachine(target.cx, target.cy, {
            ...target.machine,
            vending: slots,
            updatedAt: now,
          });
        }
      }
    }

    const nextState: MachineState = {
      ...state,
      machineType,
      routeMode,
      buffer,
      poweredByNearby: powered,
      lastEvalAt: now,
      updatedAt: now,
    };
    if (pulled > 0 || nextState.lastEvalAt !== state.lastEvalAt) {
      await storeMachine(x, y, nextState);
    }
    return nextState;
  }

  const result = evaluateExtendedMachine(state, {
    machineType,
    x,
    y,
    neighbors,
    now,
    powered,
  });
  if (!result.evaluated) return state;
  for (const [key, next] of result.changed) {
    const [tx, ty] = key.split(",").map(Number);
    await storeTileOverride(tx, ty, next);
  }
  await storeMachine(x, y, result.state);
  return result.state;
}

function publicState(state: MachineState, machineType: string, isOwner: boolean) {
  return {
    machineType,
    isOwner,
    program: state.program,
    code: encodeProgram(state.program),
    blueprint: state.blueprint ?? null,
    blueprintCode: state.blueprint ? encodeCustomBlueprint(state.blueprint) : null,
    targetRecipeId: state.targetRecipeId ?? null,
    routeMode: state.routeMode ?? "buffer",
    inputs: isOwner ? (state.inputs ?? {}) : {},
    buffer: isOwner ? state.buffer : {},
    buffered: machineBufferCount(state),
    vending: state.vending ?? [],
    vendingSales: isOwner ? (state.vendingSales ?? 0) : undefined,
    alerts: isOwner ? (state.alerts ?? []) : [],
    poweredByNearby: state.poweredByNearby === true,
  };
}

export async function GET(request: Request) {
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (!isMachinesEnabled() || !isTilesEnabled()) return err("machines_unavailable", 503);
  const url = new URL(request.url);
  const coord = checkedCoord(Number(url.searchParams.get("x")), Number(url.searchParams.get("y")));
  if (!coord) return err("invalid_coord", 400);
  const ownerKey = sessionOwnerKey(session);
  const far = await nearMachine(ownerKey, coord.x, coord.y);
  if (far) return far;
  const ensured = await ensureMachine(ownerKey, coord.x, coord.y, true);
  if ("response" in ensured) return ensured.response;
  const state = await runEvaluation(coord.x, coord.y, ensured.machineType, ensured.state);
  return NextResponse.json(
    { machine: publicState(state, ensured.machineType, ensured.isOwner) },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return err("forbidden", 403);
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (!isMachinesEnabled() || !isTilesEnabled()) return err("machines_unavailable", 503);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err("invalid_request", 400);
  }
  const fields = (body ?? {}) as Record<string, unknown>;
  const coord = checkedCoord(
    typeof fields.x === "number" ? fields.x : Number(fields.x),
    typeof fields.y === "number" ? fields.y : Number(fields.y),
  );
  if (!coord) return err("invalid_coord", 400);
  const ownerKey = sessionOwnerKey(session);
  const far = await nearMachine(ownerKey, coord.x, coord.y);
  if (far) return far;

  const isPublicBuy = fields.action === "vending_buy";

  return withUserLock(`machine:${coord.x},${coord.y}`, async () => {
    const ensured = await ensureMachine(ownerKey, coord.x, coord.y, isPublicBuy);
    if ("response" in ensured) return ensured.response;
    let state = await runEvaluation(coord.x, coord.y, ensured.machineType, ensured.state);
    const now = Date.now();

    if (isPublicBuy && ensured.machineType === "smart_vending") {
      const itemId = typeof fields.itemId === "string" ? fields.itemId : "";
      const qty =
        typeof fields.count === "number" && Number.isFinite(fields.count)
          ? Math.max(1, Math.min(99, Math.floor(fields.count)))
          : 1;
      const slots = [...(state.vending ?? [])];
      const slotIdx = slots.findIndex((s) => s.itemId === itemId && s.stock >= qty);
      if (slotIdx < 0) return err("out_of_stock", 409);
      const slot = slots[slotIdx];
      const total = slot.price * qty;
      const paid = await spendMmoCoins(session, ownerKey, total, "shop_buy");
      if (!paid.ok) return err(paid.error, 409);

      // Pay machine owner
      if (!ensured.isOwner && state.ownerKey) {
        if (state.ownerKey.startsWith("discord:")) {
          await payoutUserChunked(state.ownerKey, state.ownerKey.slice(8), total, "vending_sale");
        } else {
          const ownerProf = await loadProfile(state.ownerKey);
          if (ownerProf) {
            await storeProfile(state.ownerKey, { ...ownerProf, coins: ownerProf.coins + total });
          }
        }
      } else if (ensured.isOwner) {
        await awardMmoCoins(session, ownerKey, total, "vending_sale");
      }

      const nextStock = slot.stock - qty;
      if (nextStock <= 0) slots.splice(slotIdx, 1);
      else slots[slotIdx] = { ...slot, stock: nextStock };

      let buyerProfile = await loadProfile(ownerKey);
      buyerProfile = addItem(buyerProfile, slot.itemId, qty);
      await storeProfile(ownerKey, buyerProfile);

      state = {
        ...state,
        vending: slots,
        vendingSales: (state.vendingSales ?? 0) + total,
        updatedAt: now,
      };
      await storeMachine(coord.x, coord.y, state);
      void incrementQuestProgress(ownerKey, "world_action", 1, now);
      return NextResponse.json(
        {
          machine: publicState(state, ensured.machineType, ensured.isOwner),
          profile: buyerProfile,
        },
        { headers: NO_STORE },
      );
    }

    if (!ensured.isOwner) return err("not_owner", 403);

    if (fields.action === "set_program") {
      state = { ...state, program: parseProgram(fields.program), updatedAt: now };
      await storeMachine(coord.x, coord.y, state);
      return NextResponse.json(
        { machine: publicState(state, ensured.machineType, true) },
        { headers: NO_STORE },
      );
    }
    if (fields.action === "apply_code") {
      const codeStr = typeof fields.code === "string" ? fields.code.trim() : "";
      if (codeStr.startsWith("WB2.")) {
        const bp = decodeCustomBlueprint(codeStr);
        if (!bp) return err("bad_code", 400);
        state = {
          ...state,
          blueprint: bp,
          targetRecipeId: bp.targetRecipeId ?? null,
          updatedAt: now,
        };
        await storeMachine(coord.x, coord.y, state);
        return NextResponse.json(
          { machine: publicState(state, ensured.machineType, true) },
          { headers: NO_STORE },
        );
      }
      const program = decodeProgram(fields.code);
      if (!program) return err("bad_code", 400);
      state = { ...state, program, updatedAt: now };
      await storeMachine(coord.x, coord.y, state);
      return NextResponse.json(
        { machine: publicState(state, ensured.machineType, true) },
        { headers: NO_STORE },
      );
    }
    if (fields.action === "set_recipe") {
      const rec = recipeById(fields.recipeId);
      if (!rec) return err("invalid_recipe", 400);
      state = {
        ...state,
        targetRecipeId: rec.id,
        ...(state.blueprint ? { blueprint: { ...state.blueprint, targetRecipeId: rec.id } } : {}),
        updatedAt: now,
      };
      await storeMachine(coord.x, coord.y, state);
      return NextResponse.json(
        { machine: publicState(state, ensured.machineType, true) },
        { headers: NO_STORE },
      );
    }
    if (fields.action === "set_blueprint") {
      const bp = parseCustomBlueprint(fields.blueprint);
      state = {
        ...state,
        blueprint: bp,
        targetRecipeId: bp.targetRecipeId ?? null,
        updatedAt: now,
      };
      await storeMachine(coord.x, coord.y, state);
      return NextResponse.json(
        { machine: publicState(state, ensured.machineType, true) },
        { headers: NO_STORE },
      );
    }
    if (fields.action === "deposit_input") {
      const itemId = typeof fields.itemId === "string" ? fields.itemId : "";
      const def = itemById(itemId);
      const qty =
        typeof fields.count === "number" && Number.isFinite(fields.count)
          ? Math.max(1, Math.min(99, Math.floor(fields.count)))
          : 1;
      if (!def) return err("unknown_item", 400);
      let profile = await loadProfile(ownerKey);
      if (countItem(profile, def.id) < qty) return err("not_enough_items", 409);
      const next = removeItem(profile, def.id, qty);
      if (!next) return err("not_enough_items", 409);
      profile = next;
      await storeProfile(ownerKey, profile);
      const inputs = { ...(state.inputs ?? {}) };
      inputs[def.id] = (inputs[def.id] ?? 0) + qty;
      state = { ...state, inputs, updatedAt: now };
      await storeMachine(coord.x, coord.y, state);
      return NextResponse.json(
        { machine: publicState(state, ensured.machineType, true), profile },
        { headers: NO_STORE },
      );
    }
    if (fields.action === "withdraw_input") {
      const itemId = typeof fields.itemId === "string" ? fields.itemId : "";
      const qty = state.inputs?.[itemId] ?? 0;
      if (qty <= 0) return err("empty", 409);
      let profile = await loadProfile(ownerKey);
      profile = addItem(profile, itemId, qty);
      await storeProfile(ownerKey, profile);
      const inputs = { ...(state.inputs ?? {}) };
      delete inputs[itemId];
      state = { ...state, inputs, updatedAt: now };
      await storeMachine(coord.x, coord.y, state);
      return NextResponse.json(
        { machine: publicState(state, ensured.machineType, true), profile },
        { headers: NO_STORE },
      );
    }
    if (fields.action === "vending_stock") {
      const itemId = typeof fields.itemId === "string" ? fields.itemId : "";
      const def = itemById(itemId);
      const qty =
        typeof fields.count === "number" && Number.isFinite(fields.count)
          ? Math.max(1, Math.min(99, Math.floor(fields.count)))
          : 1;
      const price =
        typeof fields.price === "number" && Number.isFinite(fields.price)
          ? Math.max(10, Math.min(1_000_000, Math.floor(fields.price)))
          : (def?.price ?? 100);
      if (!def) return err("unknown_item", 400);
      const profile = await loadProfile(ownerKey);
      const next = removeItem(profile, def.id, qty);
      if (!next) return err("not_enough_items", 409);
      const slots = [...(state.vending ?? [])];
      const existing = slots.findIndex((s) => s.itemId === def.id);
      if (existing >= 0) {
        slots[existing] = {
          itemId: def.id,
          price,
          stock: Math.min(999, slots[existing].stock + qty),
        };
      } else {
        if (slots.length >= 6) return err("slots_full", 409);
        slots.push({ itemId: def.id, price, stock: qty });
      }
      await storeProfile(ownerKey, next);
      state = { ...state, vending: slots, updatedAt: now };
      await storeMachine(coord.x, coord.y, state);
      return NextResponse.json(
        { machine: publicState(state, ensured.machineType, true), profile: next },
        { headers: NO_STORE },
      );
    }
    if (fields.action === "vending_remove") {
      const itemId = typeof fields.itemId === "string" ? fields.itemId : "";
      const slots = [...(state.vending ?? [])];
      const idx = slots.findIndex((s) => s.itemId === itemId);
      if (idx < 0) return err("empty", 409);
      const removed = slots[idx];
      slots.splice(idx, 1);
      const next = addItem(await loadProfile(ownerKey), removed.itemId, removed.stock);
      await storeProfile(ownerKey, next);
      state = { ...state, vending: slots, updatedAt: now };
      await storeMachine(coord.x, coord.y, state);
      return NextResponse.json(
        { machine: publicState(state, ensured.machineType, true), profile: next },
        { headers: NO_STORE },
      );
    }
    if (fields.action === "collect") {
      if (machineBufferCount(state) <= 0) return err("empty", 409);
      let profile = await loadProfile(ownerKey);
      for (const [itemId, count] of Object.entries(state.buffer)) {
        profile = addItem(profile, itemId, count);
      }
      await storeProfile(ownerKey, profile);
      state = { ...state, buffer: {}, updatedAt: now };
      await storeMachine(coord.x, coord.y, state);
      void incrementQuestProgress(ownerKey, "world_action", 1, now);
      return NextResponse.json(
        { machine: publicState(state, ensured.machineType, true), profile },
        { headers: NO_STORE },
      );
    }
    return err("invalid_action", 400);
  });
}
