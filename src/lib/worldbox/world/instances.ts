import {
  L_DARK,
  L_MARBLE,
  L_SAND,
  L_WALL,
  isSolidLobbyTile,
  type LobbyData,
  type LobbyObject,
} from "./lobby";
import { T_GRASS, T_ROCK, tilesSource, type TopDownMap } from "./mapgen";
import { makeRng } from "../core/rng";

export type InstanceKind = "cave" | "ruins" | "dungeon";

export type InstanceSpaceRef = {
  kind: InstanceKind;
  entranceX: number;
  entranceY: number;
  layer: number;
};

const INSTANCE_SPACE_RE = /^(cave|ruins|dungeon):(-?\d+),(-?\d+):(\d+)$/;

export function makeInstanceSpace(
  kind: InstanceKind,
  entranceX: number,
  entranceY: number,
  layer: number,
): string {
  return `${kind}:${Math.floor(entranceX)},${Math.floor(entranceY)}:${Math.max(0, Math.floor(layer))}`;
}

export function parseInstanceSpace(space: unknown): InstanceSpaceRef | null {
  if (typeof space !== "string") return null;
  const m = INSTANCE_SPACE_RE.exec(space);
  if (!m) return null;
  return {
    kind: m[1] as InstanceKind,
    entranceX: Number(m[2]),
    entranceY: Number(m[3]),
    layer: Number(m[4]),
  };
}

export function isInstanceSpace(space: unknown): boolean {
  return parseInstanceSpace(space) !== null;
}

export function lightRadiusTiles(
  inventory: Readonly<Record<string, number>> | null | undefined,
): number {
  if (!inventory) return 2.5;
  if ((inventory["lamp"] ?? 0) > 0) return 9;
  if ((inventory["torch"] ?? 0) > 0) return 6;
  return 2.5;
}

export const PLACED_LIGHT_RADIUS: Readonly<Record<string, number>> = {
  lamp: 9,
  glowstone_block: 7,
  torch: 6,
  lava_block: 6,
  campfire: 5,
  magma_block: 5,
};

export function placedLightRadiusTiles(itemId: unknown): number {
  if (typeof itemId !== "string") return 0;
  return PLACED_LIGHT_RADIUS[itemId] ?? 0;
}

export const CAVE_W = 64;
export const CAVE_H = 64;
export const CAVE_LAYERS = 3;

export type CaveVein = {
  key: string;
  objectId: string;
  x: number;
  y: number;
};

export type CaveLayer = {
  data: LobbyData;
  portal: { x: number; y: number };
  stairsUp: { x: number; y: number } | null;
  stairsDown: { x: number; y: number } | null;
  onsen: readonly { x: number; y: number }[];
  veins: readonly CaveVein[];
  chest: { x: number; y: number } | null;
};

const CAVE_VEIN_POOLS: readonly (readonly { objectId: string; count: number }[])[] = [
  [
    { objectId: "coal_vein", count: 6 },
    { objectId: "copper_vein", count: 6 },
  ],
  [
    { objectId: "coal_vein", count: 3 },
    { objectId: "copper_vein", count: 3 },
    { objectId: "rare_vein", count: 3 },
    { objectId: "crystal_cluster", count: 2 },
  ],
  [
    { objectId: "rare_vein", count: 3 },
    { objectId: "crystal_cluster", count: 3 },
    { objectId: "mithril_vein", count: 2 },
  ],
];

export const CAVE_CHEST_RESPAWN_MS = 6 * 60 * 60 * 1000;

function hashSeed(seed: number, ex: number, ey: number, layer: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const v of [ex, ey, layer]) {
    h ^= (v * 2654435761) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 16777619) >>> 0;
  }
  return h >>> 0;
}

const caveCache = new Map<string, CaveLayer>();

export function buildCaveLayer(
  seed: number,
  entranceX: number,
  entranceY: number,
  layer: number,
): CaveLayer {
  const cacheKey = `${seed}:${entranceX},${entranceY}:${layer}`;
  const cached = caveCache.get(cacheKey);
  if (cached) return cached;

  const rng = makeRng(hashSeed(seed, entranceX, entranceY, layer));
  const tiles = new Uint8Array(CAVE_W * CAVE_H).fill(L_WALL);
  const floor = new Set<string>();
  const carve = (x: number, y: number) => {
    if (x < 1 || y < 1 || x >= CAVE_W - 1 || y >= CAVE_H - 1) return;
    tiles[y * CAVE_W + x] = L_DARK;
    floor.add(`${x},${y}`);
  };

  const portal = { x: 32, y: CAVE_H - 6 };
  for (let dy = 0; dy < 3; dy++)
    for (let dx = -1; dx <= 1; dx++) carve(portal.x + dx, portal.y + dy - 1);
  const walkers: { x: number; y: number }[] = [{ ...portal }];
  const roomCenters: { x: number; y: number }[] = [{ ...portal }];
  for (let w = 0; w < 5; w++) {
    let { x, y } = walkers[0];
    const steps = 260 + Math.floor(rng() * 160);
    for (let s = 0; s < steps; s++) {
      carve(x, y);
      carve(x + (rng() < 0.3 ? 1 : 0), y);
      const dir = Math.floor(rng() * 4);
      if (dir === 0) x += 1;
      else if (dir === 1) x -= 1;
      else if (dir === 2) y += 1;
      else y -= 1;
      x = Math.max(2, Math.min(CAVE_W - 3, x));
      y = Math.max(2, Math.min(CAVE_H - 3, y));
      if (s % 90 === 89) {
        const rw = 3 + Math.floor(rng() * 3);
        const rh = 3 + Math.floor(rng() * 3);
        for (let dy = 0; dy < rh; dy++)
          for (let dx = 0; dx < rw; dx++) carve(x + dx - 1, y + dy - 1);
        roomCenters.push({ x, y });
      }
    }
    walkers[0] = { x, y };
  }
  const floorList = [...floor].map((k) => {
    const [x, y] = k.split(",").map(Number);
    return { x, y };
  });
  const farFrom = (p: { x: number; y: number }, min: number) =>
    floorList.filter((t) => Math.hypot(t.x - p.x, t.y - p.y) >= min);
  const pickFar = (from: { x: number; y: number }, min: number, used: Set<string>) => {
    const cand = farFrom(from, min).filter((t) => !used.has(`${t.x},${t.y}`));
    if (cand.length === 0) return null;
    const t = cand[Math.floor(rng() * cand.length)];
    used.add(`${t.x},${t.y}`);
    return t;
  };
  const used = new Set<string>([`${portal.x},${portal.y}`]);

  const stairsDown = layer < CAVE_LAYERS - 1 ? pickFar(portal, 24, used) : null;
  const stairsUp = layer > 0 ? { x: portal.x + 2, y: portal.y } : null;
  if (stairsUp) used.add(`${stairsUp.x},${stairsUp.y}`);

  const onsen: { x: number; y: number }[] = [];
  if (layer === 0) {
    const base = { x: portal.x - 3, y: portal.y - 1 };
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const t = { x: base.x + dx, y: base.y + dy };
        if (floor.has(`${t.x},${t.y}`)) {
          tiles[t.y * CAVE_W + t.x] = L_SAND;
          onsen.push(t);
          used.add(`${t.x},${t.y}`);
        }
      }
    }
  }

  const chest = pickFar(portal, 18, used);

  const veins: CaveVein[] = [];
  const wallUsed = new Set<string>();
  const pool = CAVE_VEIN_POOLS[layer] ?? CAVE_VEIN_POOLS[0];
  for (const entry of pool) {
    for (let i = 0; i < entry.count; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const f = floorList[Math.floor(rng() * floorList.length)];
        const dirs = [
          { x: f.x + 1, y: f.y },
          { x: f.x - 1, y: f.y },
          { x: f.x, y: f.y + 1 },
          { x: f.x, y: f.y - 1 },
        ];
        const w = dirs[Math.floor(rng() * dirs.length)];
        const key = `${w.x},${w.y}`;
        if (w.x < 1 || w.y < 1 || w.x >= CAVE_W - 1 || w.y >= CAVE_H - 1) continue;
        if (tiles[w.y * CAVE_W + w.x] !== L_WALL || wallUsed.has(key)) continue;
        wallUsed.add(key);
        veins.push({
          key: `${entry.objectId}:${veins.length}`,
          objectId: entry.objectId,
          x: w.x,
          y: w.y,
        });
        break;
      }
    }
  }

  const objects: LobbyObject[] = [
    { sprite: "warp_pad", x: portal.x, y: portal.y, w: 1, h: 1, solid: false },
  ];
  if (stairsDown)
    objects.push({ sprite: "stairs", x: stairsDown.x, y: stairsDown.y, w: 1, h: 1, solid: false });
  if (stairsUp)
    objects.push({ sprite: "stairs", x: stairsUp.x, y: stairsUp.y, w: 1, h: 1, solid: false });
  for (const v of veins)
    objects.push({ sprite: v.objectId, x: v.x, y: v.y, w: 1, h: 1, solid: true });
  if (chest)
    objects.push({ sprite: "cave_chest", x: chest.x, y: chest.y, w: 1, h: 1, solid: true });
  const blocked = new Set<string>();
  for (const o of objects) if (o.solid) blocked.add(`${o.x},${o.y}`);
  const moveTiles = new Uint8Array(CAVE_W * CAVE_H);
  for (let i = 0; i < tiles.length; i++)
    moveTiles[i] = isSolidLobbyTile(tiles[i]) ? T_ROCK : T_GRASS;
  const moveMap: TopDownMap = tilesSource(0, CAVE_W, CAVE_H, moveTiles);
  const result: CaveLayer = {
    data: { width: CAVE_W, height: CAVE_H, tiles, objects, npcs: [], blocked, moveMap },
    portal,
    stairsUp,
    stairsDown,
    onsen,
    veins,
    chest,
  };
  caveCache.set(cacheKey, result);
  return result;
}

export function isCaveSafeTile(cave: CaveLayer, x: number, y: number): boolean {
  const near = (p: { x: number; y: number } | null) =>
    p !== null && Math.hypot(x - p.x, y - p.y) <= 1.5;
  return near(cave.portal) || near(cave.stairsUp) || near(cave.stairsDown);
}

export const RUINS_W = 48;
export const RUINS_H = 48;

export type RuinsTrapKind = "teleport";
export const RUINS_TRAP_KINDS: readonly RuinsTrapKind[] = ["teleport"];

export type RuinsChest = {
  idx: number;
  x: number;
  y: number;
  main: boolean;
  requiresKey: boolean;
};

export type RuinsDoor = { idx: number; x: number; y: number };
export type RuinsTrap = { idx: number; x: number; y: number; kind: RuinsTrapKind };

export type RuinsMap = {
  data: LobbyData;
  portal: { x: number; y: number };
  chests: readonly RuinsChest[];
  doors: readonly RuinsDoor[];
  traps: readonly RuinsTrap[];
  roomCenters: readonly { x: number; y: number }[];
};

export const RUINS_MAIN_CHEST_LOOT = [
  { itemId: "ancient_coin", min: 2, max: 3, chance: 1 },
  { itemId: "gold_ingot", min: 1, max: 2, chance: 0.6 },
  { itemId: "ancient_relic", min: 1, max: 1, chance: 0.5 },
  { itemId: "star_map", min: 1, max: 1, chance: 0.4 },
] as const;

export const RUINS_COMPLETE_EARN = 300;

export function ruinsCompleteOpId(entranceX: number, entranceY: number, discordId: string): string {
  return `ruins-done-${entranceX}-${entranceY}-${discordId}`;
}

export function weekKeyOf(now: number): string {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

const ruinsCache = new Map<string, RuinsMap>();

export function buildRuins(seed: number, entranceX: number, entranceY: number): RuinsMap {
  const cacheKey = `ruins:${seed}:${entranceX},${entranceY}`;
  const cached = ruinsCache.get(cacheKey);
  if (cached) return cached;

  const rng = makeRng(hashSeed(seed, entranceX, entranceY, 777));
  const tiles = new Uint8Array(RUINS_W * RUINS_H).fill(L_WALL);
  const floor = new Set<string>();
  const carve = (x: number, y: number) => {
    if (x < 1 || y < 1 || x >= RUINS_W - 1 || y >= RUINS_H - 1) return;
    tiles[y * RUINS_W + x] = L_MARBLE;
    floor.add(`${x},${y}`);
  };

  const COLS = 3;
  const ROWS = 3;
  const rooms: { x: number; y: number; w: number; h: number; cx: number; cy: number }[] = [];
  for (let ry = 0; ry < ROWS; ry++) {
    for (let rx = 0; rx < COLS; rx++) {
      const w = 7 + Math.floor(rng() * 3);
      const h = 6 + Math.floor(rng() * 3);
      const x = 2 + rx * 15 + Math.floor(rng() * 3);
      const y = 2 + ry * 15 + Math.floor(rng() * 3);
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) carve(x + dx, y + dy);
      rooms.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
    }
  }
  const corridor = (x0: number, y0: number, x1: number, y1: number) => {
    let x = x0;
    let y = y0;
    while (x !== x1) {
      carve(x, y);
      carve(x, y + 1);
      x += Math.sign(x1 - x);
    }
    while (y !== y1) {
      carve(x, y);
      carve(x + 1, y);
      y += Math.sign(y1 - y);
    }
    carve(x, y);
  };
  for (let ry = 0; ry < ROWS; ry++) {
    for (let rx = 0; rx < COLS; rx++) {
      const room = rooms[ry * COLS + rx];
      if (rx + 1 < COLS)
        corridor(room.cx, room.cy, rooms[ry * COLS + rx + 1].cx, rooms[ry * COLS + rx + 1].cy);
      if (ry + 1 < ROWS)
        corridor(room.cx, room.cy, rooms[(ry + 1) * COLS + rx].cx, rooms[(ry + 1) * COLS + rx].cy);
    }
  }

  const entranceRoom = rooms[(ROWS - 1) * COLS + 1];
  const portal = { x: entranceRoom.cx, y: entranceRoom.cy + 2 };
  carve(portal.x, portal.y);
  const dist = new Map<string, number>([[`${portal.x},${portal.y}`, 0]]);
  const queue = [{ ...portal }];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(`${cur.x},${cur.y}`)!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const key = `${nx},${ny}`;
      if (dist.has(key) || !floor.has(key)) continue;
      dist.set(key, d + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  const roomDist = rooms.map((r) => dist.get(`${r.cx},${r.cy}`) ?? 0);
  const deepestIdx = roomDist.indexOf(Math.max(...roomDist));
  const deepest = rooms[deepestIdx];

  const doors: RuinsDoor[] = [];
  {
    const candidates: { x: number; y: number }[] = [];
    for (const key of floor) {
      const [x, y] = key.split(",").map(Number);
      const inDeep =
        x >= deepest.x && x < deepest.x + deepest.w && y >= deepest.y && y < deepest.y + deepest.h;
      if (inDeep) continue;
      const touchesDeep = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return (
          nx >= deepest.x &&
          nx < deepest.x + deepest.w &&
          ny >= deepest.y &&
          ny < deepest.y + deepest.h &&
          floor.has(`${nx},${ny}`)
        );
      });
      if (touchesDeep) candidates.push({ x, y });
    }
    candidates.sort((a, b) => (dist.get(`${b.x},${b.y}`) ?? 0) - (dist.get(`${a.x},${a.y}`) ?? 0));
    if (candidates.length > 0) doors.push({ idx: 0, x: candidates[0].x, y: candidates[0].y });
  }
  const doorSet = new Set(doors.map((d) => `${d.x},${d.y}`));

  const chests: RuinsChest[] = [];
  chests.push({ idx: 0, x: deepest.cx, y: deepest.cy, main: true, requiresKey: doors.length > 0 });
  let chestIdx = 1;
  for (const [i, room] of rooms.entries()) {
    if (i === deepestIdx || room === entranceRoom) continue;
    if (rng() < 0.25) continue;
    chests.push({
      idx: chestIdx++,
      x: room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2)),
      y: room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2)),
      main: false,
      requiresKey: false,
    });
  }

  const traps: RuinsTrap[] = [];
  const floorList = [...floor]
    .map((k) => {
      const [x, y] = k.split(",").map(Number);
      return { x, y };
    })
    .filter((t) => Math.hypot(t.x - portal.x, t.y - portal.y) > 4 && !doorSet.has(`${t.x},${t.y}`))
    .filter((t) => !chests.some((c) => c.x === t.x && c.y === t.y));
  for (let i = 0; i < 10 && floorList.length > 0; i++) {
    const pick = floorList.splice(Math.floor(rng() * floorList.length), 1)[0];
    traps.push({
      idx: i,
      x: pick.x,
      y: pick.y,
      kind: RUINS_TRAP_KINDS[i % RUINS_TRAP_KINDS.length],
    });
  }

  const objects: LobbyObject[] = [
    { sprite: "warp_pad", x: portal.x, y: portal.y, w: 1, h: 1, solid: false },
    ...doors.map((d) => ({ sprite: "gold_door", x: d.x, y: d.y, w: 1, h: 1, solid: true })),
    ...chests.map((c) => ({ sprite: "ruins_chest", x: c.x, y: c.y, w: 1, h: 1, solid: true })),
  ];
  const blocked = new Set<string>();
  for (const o of objects) if (o.solid) blocked.add(`${o.x},${o.y}`);
  const moveTiles = new Uint8Array(RUINS_W * RUINS_H);
  for (let i = 0; i < tiles.length; i++)
    moveTiles[i] = isSolidLobbyTile(tiles[i]) ? T_ROCK : T_GRASS;
  const moveMap: TopDownMap = tilesSource(0, RUINS_W, RUINS_H, moveTiles);
  const result: RuinsMap = {
    data: { width: RUINS_W, height: RUINS_H, tiles, objects, npcs: [], blocked, moveMap },
    portal,
    chests,
    doors,
    traps,
    roomCenters: rooms.map((r) => ({ x: r.cx, y: r.cy })),
  };
  ruinsCache.set(cacheKey, result);
  return result;
}

export const DUNGEON_W = 52;
export const DUNGEON_H = 52;
export const DUNGEON_FLOORS = 4;
export const DUNGEON_CLEAR_EARN = 500;
export type DungeonChest = { idx: number; x: number; y: number; main: boolean };
export type DungeonFloorData = {
  data: LobbyData;
  portal: { x: number; y: number };
  stairsDown: { x: number; y: number } | null;
  chests: DungeonChest[];
  floor: number;
};

const dungeonCache = new Map<string, DungeonFloorData>();

export function buildDungeonFloor(
  seed: number,
  entranceX: number,
  entranceY: number,
  layer: number,
): DungeonFloorData {
  const f = Math.max(1, Math.min(DUNGEON_FLOORS, (Math.floor(layer) || 0) + 1));
  const cacheKey = `dungeon:${seed}:${entranceX},${entranceY}:${f}`;
  const cached = dungeonCache.get(cacheKey);
  if (cached) return cached;

  const rng = makeRng(hashSeed(seed, entranceX, entranceY, 9000 + f * 131));
  const tiles = new Uint8Array(DUNGEON_W * DUNGEON_H).fill(L_WALL);
  const floorSet = new Set<string>();
  const carve = (x: number, y: number) => {
    if (x < 1 || y < 1 || x >= DUNGEON_W - 1 || y >= DUNGEON_H - 1) return;
    tiles[y * DUNGEON_W + x] = L_DARK;
    floorSet.add(`${x},${y}`);
  };
  const COLS = 3;
  const ROWS = 3;
  const rooms: { x: number; y: number; w: number; h: number; cx: number; cy: number }[] = [];
  for (let ry = 0; ry < ROWS; ry++) {
    for (let rx = 0; rx < COLS; rx++) {
      const w = 7 + Math.floor(rng() * 3);
      const h = 6 + Math.floor(rng() * 3);
      const x = 2 + rx * 16 + Math.floor(rng() * 3);
      const y = 2 + ry * 16 + Math.floor(rng() * 3);
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) carve(x + dx, y + dy);
      rooms.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
    }
  }
  const corridor = (x0: number, y0: number, x1: number, y1: number) => {
    let x = x0;
    let y = y0;
    while (x !== x1) {
      carve(x, y);
      carve(x, y + 1);
      x += Math.sign(x1 - x);
    }
    while (y !== y1) {
      carve(x, y);
      carve(x + 1, y);
      y += Math.sign(y1 - y);
    }
    carve(x, y);
  };
  for (let ry = 0; ry < ROWS; ry++) {
    for (let rx = 0; rx < COLS; rx++) {
      const room = rooms[ry * COLS + rx];
      if (rx + 1 < COLS)
        corridor(room.cx, room.cy, rooms[ry * COLS + rx + 1].cx, rooms[ry * COLS + rx + 1].cy);
      if (ry + 1 < ROWS)
        corridor(room.cx, room.cy, rooms[(ry + 1) * COLS + rx].cx, rooms[(ry + 1) * COLS + rx].cy);
    }
  }
  const entranceRoom = rooms[(ROWS - 1) * COLS + 1];
  const portal = { x: entranceRoom.cx, y: entranceRoom.cy + 2 };
  carve(portal.x, portal.y);
  const dist = new Map<string, number>([[`${portal.x},${portal.y}`, 0]]);
  const queue = [{ ...portal }];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(`${cur.x},${cur.y}`)!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const key = `${nx},${ny}`;
      if (dist.has(key) || !floorSet.has(key)) continue;
      dist.set(key, d + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  const roomDist = rooms.map((r) => dist.get(`${r.cx},${r.cy}`) ?? 0);
  const deepestRoomIdx = roomDist.indexOf(Math.max(...roomDist));
  const deepestRoom = rooms[deepestRoomIdx];

  const chests: DungeonChest[] = [];
  if (f >= DUNGEON_FLOORS) {
    chests.push({ idx: 0, x: deepestRoom.cx + 2, y: deepestRoom.cy, main: true });
  } else {
    let idx = 0;
    for (const room of rooms) {
      if (room === entranceRoom || room === deepestRoom) continue;
      if (rng() < 0.35) continue;
      chests.push({
        idx: idx++,
        x: room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2)),
        y: room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2)),
        main: false,
      });
    }
  }
  const stairsDown = f < DUNGEON_FLOORS ? { x: deepestRoom.cx - 2, y: deepestRoom.cy } : null;

  const objects: LobbyObject[] = [
    { sprite: "warp_pad", x: portal.x, y: portal.y, w: 1, h: 1, solid: false },
    ...(stairsDown
      ? [
          {
            sprite: "stairs",
            x: stairsDown.x,
            y: stairsDown.y,
            w: 1,
            h: 1,
            solid: false,
          } as LobbyObject,
        ]
      : []),
    ...chests.map((c) => ({ sprite: "dungeon_chest", x: c.x, y: c.y, w: 1, h: 1, solid: true })),
  ];
  const blocked = new Set<string>();
  for (const o of objects) if (o.solid) blocked.add(`${o.x},${o.y}`);
  const moveTiles = new Uint8Array(DUNGEON_W * DUNGEON_H);
  for (let i = 0; i < tiles.length; i++)
    moveTiles[i] = isSolidLobbyTile(tiles[i]) ? T_ROCK : T_GRASS;
  const moveMap: TopDownMap = tilesSource(0, DUNGEON_W, DUNGEON_H, moveTiles);
  const result: DungeonFloorData = {
    data: { width: DUNGEON_W, height: DUNGEON_H, tiles, objects, npcs: [], blocked, moveMap },
    portal,
    stairsDown,
    chests,
    floor: f,
  };
  dungeonCache.set(cacheKey, result);
  return result;
}
