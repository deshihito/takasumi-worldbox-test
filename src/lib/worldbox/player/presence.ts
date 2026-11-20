export type CoordBounds = { minX: number; maxX: number; minY: number; maxY: number };

const PRESENCE_COORD_LIMIT = 1_000_000;

function fallbackBounds(): CoordBounds {
  return {
    minX: -PRESENCE_COORD_LIMIT,
    maxX: PRESENCE_COORD_LIMIT,
    minY: -PRESENCE_COORD_LIMIT,
    maxY: PRESENCE_COORD_LIMIT,
  };
}

export const PRESENCE_FRESH_MS = 10_000;
export const PRESENCE_MAX_PLAYERS = 32;
export const EXTRAPOLATE_CAP_SEC = 2;
export const SNAP_DISTANCE = 6;
const MAX_VELOCITY = 16;
export const PRESENCE_NAME_MAX = 24;
export const MAX_MOVE_SPEED = 10;
export const MOVEMENT_MARGIN_TILES = 3;
export const MOVEMENT_RESET_MS = 30_000;
export const SAVE_FALLBACK_MAX_TILES = 12;
export const WARP_LANDING_TOLERANCE_TILES = 2.5;
export const WARP_FALLBACK_SOURCE_REACH_TILES = 5;

export const SAME_SPACE_WARPS: readonly {
  space: string;
  sources: readonly { x: number; y: number }[];
  landing: { x: number; y: number };
}[] = [
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

export function isRegisteredWarpJump(
  baseline: PositionLike,
  next: PositionLike,
  reachTiles: number,
): boolean {
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

export type PositionLike = { x: number; y: number; space: PresenceSpace };
export type MovementBaseline = PositionLike & { ts: number };

export function checkMovementContinuity(
  baseline: MovementBaseline | null,
  next: PositionLike,
  now: number,
): { ok: true } | { ok: false; reason: "position_jump" } {
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

export function checkSaveFallbackContinuity(
  saved: PositionLike | null,
  next: PositionLike,
): { ok: true } | { ok: false; reason: "position_jump" } {
  if (!saved) return { ok: true };
  if (saved.space !== next.space) return { ok: true };
  const dist = Math.hypot(next.x - saved.x, next.y - saved.y);
  if (dist <= SAVE_FALLBACK_MAX_TILES) return { ok: true };
  if (isRegisteredWarpJump(saved, next, WARP_FALLBACK_SOURCE_REACH_TILES)) return { ok: true };
  return { ok: false, reason: "position_jump" };
}

export type PresenceSpace = string;

const PRESENCE_INSTANCE_SPACE_RE = /^(cave|ruins|dungeon):(-?\d+),(-?\d+):(\d+)$/;
const PRESENCE_APARTMENT_SPACE_RE = /^apartment:[a-zA-Z0-9_-]{1,24}$/;
const PRESENCE_INTERIOR_SPACE_RE = /^interior:(-?\d+),(-?\d+):([a-z0-9_]{1,20})$/;

export function sanitizePresenceSpace(raw: unknown): PresenceSpace {
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
    (PRESENCE_INSTANCE_SPACE_RE.test(raw) ||
      PRESENCE_APARTMENT_SPACE_RE.test(raw) ||
      PRESENCE_INTERIOR_SPACE_RE.test(raw))
  )
    return raw;
  return "world";
}

export type Heartbeat = {
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: 1 | -1;
  space: PresenceSpace;
  role?: string;
  rank?: number;
  party?: string;
  sit?: boolean;
  avatar?: string;
  tab?: string;
  tabAt?: number;
};

export type PresenceEntry = Heartbeat & {
  id: string;
  ts: number;
};

export function presenceIdFor(ownerKey: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < ownerKey.length; i++) {
    h ^= ownerKey.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function clampNum(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, PRESENCE_NAME_MAX);
}

export function sanitizeHeartbeat(raw: unknown, bounds: CoordBounds): Heartbeat | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.x !== "number" || !Number.isFinite(v.x)) return null;
  if (typeof v.y !== "number" || !Number.isFinite(v.y)) return null;
  const vel = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) ? clampNum(n, -MAX_VELOCITY, MAX_VELOCITY) : 0;
  return {
    name: sanitizeName(v.name),
    x: clampNum(v.x, bounds.minX, bounds.maxX),
    y: clampNum(v.y, bounds.minY, bounds.maxY),
    vx: vel(v.vx),
    vy: vel(v.vy),
    face: v.face === -1 ? -1 : 1,
    space: sanitizePresenceSpace(v.space),
    role:
      typeof v.role === "string" &&
      ["blade", "guard", "scout", "miner", "medic", "teleporter"].includes(v.role)
        ? v.role
        : "free",
    rank:
      typeof v.rank === "number" && Number.isFinite(v.rank)
        ? Math.max(1, Math.min(5, Math.floor(v.rank)))
        : 1,
    party: typeof v.party === "string" ? v.party.slice(0, 48) : "",
    ...(v.sit === true ? { sit: true } : {}),
    ...(typeof v.tab === "string" && v.tab.length > 0 ? { tab: v.tab.slice(0, 64) } : {}),
    ...(typeof v.tabAt === "number" && Number.isFinite(v.tabAt) && v.tabAt > 0
      ? { tabAt: v.tabAt }
      : {}),
  };
}

export function tabVerdict(
  stored: PresenceEntry | null,
  incoming: { tab?: string; tabAt?: number },
  now: number,
): "accept" | "reject" {
  if (!incoming.tab || typeof incoming.tabAt !== "number") return "accept";
  if (!stored || !isFreshPresence(stored, now)) return "accept";
  if (!stored.tab || typeof stored.tabAt !== "number") return "accept";
  if (stored.tab === incoming.tab) return "accept";
  if (incoming.tabAt !== stored.tabAt) return incoming.tabAt > stored.tabAt ? "accept" : "reject";
  return incoming.tab > stored.tab ? "accept" : "reject";
}

export function sanitizeAvatarUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > 256) return null;
  if (!raw.startsWith("https://")) return null;
  if (/[\s"'<>\\\u0000-\u001f\u007f]/.test(raw)) return null;
  return raw;
}

export function parsePresenceEntry(id: string, raw: unknown): PresenceEntry | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  const v = data as Record<string, unknown>;
  if (typeof v.ts !== "number" || !Number.isFinite(v.ts)) return null;
  const hb = sanitizeHeartbeat(v, fallbackBounds());
  if (!hb) return null;
  const avatar = sanitizeAvatarUrl(v.avatar);
  return { ...hb, ...(avatar ? { avatar } : {}), id, ts: v.ts };
}

export function clockOffsetEstimate(
  serverNow: number,
  clientBefore: number,
  clientAfter: number,
): number {
  return serverNow - (clientBefore + clientAfter) / 2;
}

export function isFreshPresence(entry: PresenceEntry, now: number): boolean {
  return entry.ts <= now + 5_000 && now - entry.ts <= PRESENCE_FRESH_MS;
}

export function selectVisiblePlayers(
  entries: PresenceEntry[],
  selfId: string | null,
  now: number,
  limit: number = PRESENCE_MAX_PLAYERS,
  space?: PresenceSpace,
): PresenceEntry[] {
  return entries
    .filter(
      (e) =>
        e.id !== selfId && isFreshPresence(e, now) && (space === undefined || e.space === space),
    )
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
}

export const PRESENCE_NEAR_RADIUS = 48;

export function thinPresenceNear(
  entries: PresenceEntry[],
  self: PresenceEntry | null,
  radius: number = PRESENCE_NEAR_RADIUS,
  limit: number = PRESENCE_MAX_PLAYERS,
): PresenceEntry[] {
  if (!self) return entries.slice(0, limit);
  return entries
    .map((e) => ({ e, d: Math.hypot(e.x - self.x, e.y - self.y) }))
    .filter(({ d }) => d <= radius)
    .sort((a, b) => a.d - b.d || b.e.ts - a.e.ts)
    .slice(0, limit)
    .map(({ e }) => e);
}

export function predictPosition(
  entry: PresenceEntry,
  now: number,
  bounds: CoordBounds,
): { x: number; y: number } {
  const dt = clampNum((now - entry.ts) / 1000, 0, EXTRAPOLATE_CAP_SEC);
  return {
    x: clampNum(entry.x + entry.vx * dt, bounds.minX, bounds.maxX),
    y: clampNum(entry.y + entry.vy * dt, bounds.minY, bounds.maxY),
  };
}
