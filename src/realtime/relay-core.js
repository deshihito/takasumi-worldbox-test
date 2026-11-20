"use strict";
const crypto = require("node:crypto");

const FRESH_MS = 10_000;
const MAX_PLAYERS = 32;
const MAX_VELOCITY = 16;
const NAME_MAX = 24;
const TOKEN_TTL_MS = 10 * 60 * 1000;

const SPACE_BOUNDS = {
  lobby: { width: 156, height: 92 }, // テーマパーク型ロビー拡張（lobby.ts の LOBBY_W/H）
  lobby2: { width: 40, height: 28 }, // ロビー2Fラウンジ（lobby-floors.ts の LOBBY2_W/H）
  lobby3: { width: 32, height: 24 }, // ロビー3F展望（lobby-floors.ts の LOBBY3_W/H）
  prison: { width: 44, height: 32 }, // 中央刑務所（prison-map.ts の PRISON_W/H）
  tent: { width: 22, height: 17 }, // テント拡張の最大段階（tier 2）に合わせる
};
const WORLD_COORD_LIMIT = 1_000_000;
const INSTANCE_SPACE_RE = /^(cave|ruins|dungeon):(-?\d+),(-?\d+):(\d+)$/;
const APARTMENT_SPACE_RE = /^apartment:[a-zA-Z0-9_-]{1,24}$/;
const INTERIOR_SPACE_RE = /^interior:(-?\d+),(-?\d+):([a-z0-9_]{1,20})$/;
const INSTANCE_BOUNDS = { cave: 64, ruins: 48, dungeon: 52 };
const ROLE_IDS = ["blade", "guard", "scout", "miner", "medic", "teleporter"];

function boundsForSpace(space) {
  if (SPACE_BOUNDS[space]) {
    const b = SPACE_BOUNDS[space];
    return { minX: 0, maxX: b.width, minY: 0, maxY: b.height };
  }
  const m = INSTANCE_SPACE_RE.exec(space || "");
  if (m) {
    const size = INSTANCE_BOUNDS[m[1]];
    return { minX: 0, maxX: size, minY: 0, maxY: size };
  }
  if (APARTMENT_SPACE_RE.test(space || "")) {
    return { minX: 0, maxX: 24, minY: 0, maxY: 18 };
  }
  if (INTERIOR_SPACE_RE.test(space || "")) {
    return { minX: 0, maxX: 20, minY: 0, maxY: 15 };
  }
  return {
    minX: -WORLD_COORD_LIMIT,
    maxX: WORLD_COORD_LIMIT,
    minY: -WORLD_COORD_LIMIT,
    maxY: WORLD_COORD_LIMIT,
  };
}

function sanitizeSpace(raw) {
  if (
    raw === "lobby" ||
    raw === "lobby2" ||
    raw === "lobby3" ||
    raw === "prison" ||
    raw === "tent"
  ) {
    return raw;
  }
  if (
    typeof raw === "string" &&
    (INSTANCE_SPACE_RE.test(raw) || APARTMENT_SPACE_RE.test(raw) || INTERIOR_SPACE_RE.test(raw))
  )
    return raw;
  return "world";
}

function clampNum(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function sanitizeHeartbeat(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.x !== "number" || !Number.isFinite(raw.x)) return null;
  if (typeof raw.y !== "number" || !Number.isFinite(raw.y)) return null;
  const space = sanitizeSpace(raw.space);
  const b = boundsForSpace(space);
  const vel = (n) =>
    typeof n === "number" && Number.isFinite(n) ? clampNum(n, -MAX_VELOCITY, MAX_VELOCITY) : 0;
  return {
    x: clampNum(raw.x, b.minX, b.maxX),
    y: clampNum(raw.y, b.minY, b.maxY),
    vx: vel(raw.vx),
    vy: vel(raw.vy),
    face: raw.face === -1 ? -1 : 1,
    space,
    role: typeof raw.role === "string" && ROLE_IDS.includes(raw.role) ? raw.role : "free",
    rank:
      typeof raw.rank === "number" && Number.isFinite(raw.rank)
        ? Math.max(1, Math.min(5, Math.floor(raw.rank)))
        : 1,
    party: typeof raw.party === "string" ? raw.party.slice(0, 48) : "",
    ...(raw.sit === true ? { sit: true } : {}),
  };
}

const MAX_MOVE_SPEED = 10;
const MOVEMENT_MARGIN_TILES = 3;
const MOVEMENT_RESET_MS = 30_000;
const SAVE_FALLBACK_MAX_TILES = 12;
const WARP_LANDING_TOLERANCE_TILES = 2.5;
const WARP_FALLBACK_SOURCE_REACH_TILES = 5;
const SAME_SPACE_WARPS = [
  {
    space: "lobby",
    sources: [
      { x: 17, y: 29 },
      { x: 18, y: 29 },
    ],
    landing: { x: 17.5, y: 60.5 },
  },
  {
    space: "lobby",
    sources: [
      { x: 17, y: 62 },
      { x: 18, y: 62 },
    ],
    landing: { x: 17.5, y: 27.5 },
  },
];

function isRegisteredWarpJump(baseline, next, reachTiles) {
  if (baseline.space !== next.space) return false;
  for (const warp of SAME_SPACE_WARPS) {
    if (warp.space !== next.space) continue;
    if (Math.hypot(next.x - warp.landing.x, next.y - warp.landing.y) > WARP_LANDING_TOLERANCE_TILES)
      continue;
    for (const src of warp.sources) {
      if (Math.hypot(baseline.x - (src.x + 0.5), baseline.y - (src.y + 0.5)) <= reachTiles)
        return true;
    }
  }
  return false;
}

function checkMovementContinuity(baseline, next, now) {
  if (!baseline) return { ok: true };
  if (baseline.space !== next.space) return { ok: true };
  if (now - baseline.ts >= MOVEMENT_RESET_MS) return { ok: true };
  const elapsedSec = Math.max(0, (now - baseline.ts) / 1000);
  const allowed = MAX_MOVE_SPEED * elapsedSec + MOVEMENT_MARGIN_TILES;
  const dist = Math.hypot(next.x - baseline.x, next.y - baseline.y);
  if (dist <= allowed) return { ok: true };
  if (isRegisteredWarpJump(baseline, next, allowed)) return { ok: true };
  return { ok: false, reason: "position_jump" };
}

function checkSaveFallbackContinuity(saved, next) {
  if (!saved) return { ok: true };
  if (saved.space !== next.space) return { ok: true };
  const dist = Math.hypot(next.x - saved.x, next.y - saved.y);
  if (dist <= SAVE_FALLBACK_MAX_TILES) return { ok: true };
  if (isRegisteredWarpJump(saved, next, WARP_FALLBACK_SOURCE_REACH_TILES)) return { ok: true };
  return { ok: false, reason: "position_jump" };
}

function sanitizePianoNotes(raw) {
  if (!Array.isArray(raw)) return null;
  const notes = [];
  for (const n of raw) {
    if (typeof n !== "number" || !Number.isInteger(n) || n < -24 || n > 24) return null;
    notes.push(n);
    if (notes.length > 8) return null;
  }
  return notes.length > 0 ? notes : null;
}

function createRoom() {
  return { spaces: new Map(), gens: new Map() };
}

function admitTab(room, pid, tab, tabAt) {
  if (
    typeof tab !== "string" ||
    tab.length === 0 ||
    typeof tabAt !== "number" ||
    !Number.isFinite(tabAt)
  ) {
    return { verdict: "accept", evict: false };
  }
  const cur = room.gens.get(pid);
  if (!cur) {
    room.gens.set(pid, { tab, tabAt });
    return { verdict: "accept", evict: false };
  }
  if (cur.tab === tab) return { verdict: "accept", evict: false };
  const newer = tabAt !== cur.tabAt ? tabAt > cur.tabAt : tab > cur.tab;
  if (!newer) return { verdict: "reject", evict: false };
  room.gens.set(pid, { tab, tabAt });
  return { verdict: "accept", evict: true };
}

function findRoomEntry(room, id) {
  for (const table of room.spaces.values()) {
    const entry = table.get(id);
    if (entry) return entry;
  }
  return null;
}

function acceptHeartbeat(room, id, name, raw, now, externalBaseline = null, avatarUrl = null) {
  const hb = sanitizeHeartbeat(raw);
  if (!hb) return null;
  const prev = findRoomEntry(room, id);
  const baseline = prev ?? externalBaseline;
  const check =
    baseline && typeof baseline.ts === "number"
      ? checkMovementContinuity(baseline, hb, now)
      : checkSaveFallbackContinuity(baseline, hb);
  if (!check.ok) {
    return { rejected: true, x: baseline.x, y: baseline.y, space: baseline.space };
  }
  for (const [space, table] of room.spaces) {
    if (space !== hb.space) table.delete(id);
  }
  let table = room.spaces.get(hb.space);
  if (!table) {
    table = new Map();
    room.spaces.set(hb.space, table);
  }
  const entry = {
    id,
    name: String(name ?? "").slice(0, NAME_MAX),
    ...hb,
    ...(avatarUrl ? { avatar: avatarUrl } : {}),
    ts: now,
  };
  table.set(id, entry);
  return entry;
}

function snapshot(room, space, selfId, now) {
  const table = room.spaces.get(sanitizeSpace(space));
  if (!table) return [];
  const out = [];
  for (const e of table.values()) {
    if (e.id === selfId) continue;
    if (e.ts > now + 5_000 || now - e.ts > FRESH_MS) continue;
    out.push(e);
  }
  out.sort((a, b) => b.ts - a.ts);
  return out.slice(0, MAX_PLAYERS);
}

function removePlayer(room, id) {
  const removedFrom = [];
  for (const [space, table] of room.spaces) {
    if (table.delete(id)) removedFrom.push(space);
  }
  room.gens.delete(id);
  return removedFrom;
}

function pruneRoom(room, now) {
  const removed = [];
  for (const [space, table] of room.spaces) {
    for (const e of [...table.values()]) {
      if (now - e.ts > FRESH_MS) {
        table.delete(e.id);
        removed.push({ id: e.id, space });
      }
    }
  }
  return removed;
}

function hmac(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const head = `v1.${body}`;
  return `${head}.${hmac(head, secret)}`;
}

function verifyToken(token, secret, now) {
  if (typeof token !== "string" || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const head = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(hmac(head, secret));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload.pid !== "string" || typeof payload.exp !== "number") return null;
  if (now > payload.exp) return null;
  return {
    pid: payload.pid,
    name: typeof payload.name === "string" ? payload.name : "",
    ok: typeof payload.ok === "string" && payload.ok.length > 0 ? payload.ok : null,
    av:
      typeof payload.av === "string" &&
      payload.av.length <= 256 &&
      payload.av.startsWith("https://") &&
      !/[\s"'<>\\]/.test(payload.av)
        ? payload.av
        : null,
  };
}

function presenceKvValue(entry) {
  const hb = {
    name: entry.name,
    x: entry.x,
    y: entry.y,
    vx: entry.vx,
    vy: entry.vy,
    face: entry.face,
    space: entry.space,
    role: entry.role ?? "free",
    rank: entry.rank ?? 1,
    party: entry.party ?? "",
    ...(entry.sit === true ? { sit: true } : {}),
    ...(entry.avatar ? { avatar: entry.avatar } : {}),
  };
  return JSON.stringify({ ...hb, ts: entry.ts });
}

const AGG_MOVING_WRITE_MS = 1_000;
const AGG_IDLE_WRITE_MS = 2_000;
const AGG_JUMP_DISTANCE = 4;

function createAggregator() {
  return { players: new Map() };
}

function planPresenceWrite(agg, pid, entry, now, force = false) {
  const st = agg.players.get(pid);
  if (force) {
    agg.players.set(pid, { at: now, x: entry.x, y: entry.y, space: entry.space });
    return true;
  }
  if (!st) {
    agg.players.set(pid, { at: now, x: entry.x, y: entry.y, space: entry.space });
    return true;
  }
  const dist = Math.hypot(entry.x - st.x, entry.y - st.y);
  const immediate = entry.space !== st.space || dist > AGG_JUMP_DISTANCE;
  const moving = dist > 0.05 || entry.vx !== 0 || entry.vy !== 0;
  const interval = moving ? AGG_MOVING_WRITE_MS : AGG_IDLE_WRITE_MS;
  if (immediate || now - st.at >= interval) {
    agg.players.set(pid, { at: now, x: entry.x, y: entry.y, space: entry.space });
    return true;
  }
  return false;
}

function forgetPresenceWrite(agg, pid) {
  agg.players.delete(pid);
}

module.exports = {
  FRESH_MS,
  MAX_PLAYERS,
  SPACE_BOUNDS,
  WORLD_COORD_LIMIT,
  TOKEN_TTL_MS,
  MAX_MOVE_SPEED,
  MOVEMENT_MARGIN_TILES,
  MOVEMENT_RESET_MS,
  SAVE_FALLBACK_MAX_TILES,
  WARP_LANDING_TOLERANCE_TILES,
  WARP_FALLBACK_SOURCE_REACH_TILES,
  SAME_SPACE_WARPS,
  isRegisteredWarpJump,
  checkMovementContinuity,
  checkSaveFallbackContinuity,
  boundsForSpace,
  sanitizeSpace,
  sanitizeHeartbeat,
  createRoom,
  admitTab,
  acceptHeartbeat,
  snapshot,
  removePlayer,
  pruneRoom,
  signToken,
  verifyToken,
  presenceKvValue,
  AGG_MOVING_WRITE_MS,
  AGG_IDLE_WRITE_MS,
  createAggregator,
  planPresenceWrite,
  forgetPresenceWrite,
  sanitizePianoNotes,
};
