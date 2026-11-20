import { LOBBY_H, LOBBY_W } from "../world/lobby";
import { TENT_MAX_H, TENT_MAX_W } from "../world/tent";
import { WORLD_COORD_LIMIT } from "../world/mapgen";

export const SAVE_VERSION = 6;

export type SaveSpace = string;

export type WorldBoxState = {
  space: SaveSpace;
  x: number;
  y: number;
  worldReturn: { x: number; y: number } | null;
};

function clampPos(v: number, max: number): number {
  return Math.max(0.5, Math.min(max - 0.5, v));
}

const SAVE_INSTANCE_SPACE_RE = /^(cave|ruins|dungeon):(-?\d+),(-?\d+):(\d+)$/;
const SAVE_APARTMENT_SPACE_RE = /^apartment:[a-zA-Z0-9_-]{1,24}$/;
const SAVE_INTERIOR_SPACE_RE = /^interior:(-?\d+),(-?\d+):([a-z0-9_]{1,20})$/;
function instanceKindOf(space: string): string | null {
  const m = SAVE_INSTANCE_SPACE_RE.exec(space);
  return m ? m[1] : null;
}

function sanitizeSpace(raw: unknown): SaveSpace {
  if (
    raw === "lobby" ||
    raw === "lobby2" ||
    raw === "lobby3" ||
    raw === "tent" ||
    raw === "prison"
  ) {
    return raw;
  }
  if (
    typeof raw === "string" &&
    (instanceKindOf(raw) || SAVE_APARTMENT_SPACE_RE.test(raw) || SAVE_INTERIOR_SPACE_RE.test(raw))
  )
    return raw;
  return "world";
}

function clampToSpace(space: SaveSpace, x: number, y: number): { x: number; y: number } {
  if (space === "lobby") return { x: clampPos(x, LOBBY_W), y: clampPos(y, LOBBY_H) };
  if (space === "lobby2") return { x: clampPos(x, 40), y: clampPos(y, 28) };
  if (space === "lobby3") return { x: clampPos(x, 32), y: clampPos(y, 24) };
  if (space === "prison") return { x: clampPos(x, 44), y: clampPos(y, 32) };
  if (space === "tent") return { x: clampPos(x, TENT_MAX_W), y: clampPos(y, TENT_MAX_H) };
  if (SAVE_APARTMENT_SPACE_RE.test(space)) return { x: clampPos(x, 24), y: clampPos(y, 18) };
  if (SAVE_INTERIOR_SPACE_RE.test(space)) return { x: clampPos(x, 20), y: clampPos(y, 15) };
  if (instanceKindOf(space) === "cave") return { x: clampPos(x, 64), y: clampPos(y, 64) };
  if (instanceKindOf(space) === "ruins") return { x: clampPos(x, 48), y: clampPos(y, 48) };
  if (instanceKindOf(space) === "dungeon") return { x: clampPos(x, 52), y: clampPos(y, 52) };
  const lim = (v: number) => Math.max(-WORLD_COORD_LIMIT, Math.min(WORLD_COORD_LIMIT, v));
  return { x: lim(x), y: lim(y) };
}

function parseWorldReturn(raw: unknown): { x: number; y: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as { x?: unknown; y?: unknown };
  if (typeof v.x !== "number" || typeof v.y !== "number") return null;
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return null;
  return clampToSpace("world", v.x, v.y);
}

export function serializeSave(state: WorldBoxState): string {
  const pos = clampToSpace(state.space, state.x, state.y);
  return JSON.stringify({
    version: SAVE_VERSION,
    space: state.space,
    x: pos.x,
    y: pos.y,
    worldReturn: state.worldReturn
      ? clampToSpace("world", state.worldReturn.x, state.worldReturn.y)
      : null,
  });
}

export function parseSave(json: string | null | undefined): WorldBoxState | null {
  if (!json) return null;
  try {
    const data = JSON.parse(json) as {
      version?: unknown;
      space?: unknown;
      x?: unknown;
      y?: unknown;
      worldReturn?: unknown;
    };
    if (data.version !== SAVE_VERSION) return null;
    if (typeof data.x !== "number" || typeof data.y !== "number") return null;
    if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) return null;
    const space = sanitizeSpace(data.space);
    const pos = clampToSpace(space, data.x, data.y);
    return { space, x: pos.x, y: pos.y, worldReturn: parseWorldReturn(data.worldReturn) };
  } catch {
    return null;
  }
}
