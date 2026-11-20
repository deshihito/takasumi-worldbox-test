import {
  MAP_SEED,
  T_DIRT,
  T_GRASS,
  T_ROCK,
  T_SAND,
  T_SNOW,
  T_WATER,
  isSolidMapTile,
  tileAt,
} from "./mapgen";

export type SettlementTier = "city" | "town" | "village";

export type SettlementBiomeTheme =
  | "sakura_metro"
  | "coastal_harbor"
  | "snow_alpine"
  | "desert_oasis"
  | "mining_ridge"
  | "pastoral_valley";

export type SettlementBuildingKind =
  | "city_hall"
  | "vehicle_dealer"
  | "convenience"
  | "cafe"
  | "bank_kiosk"
  | "smith_workshop"
  | "house"
  | "cottage";

export type BuildingFacing = "n" | "s" | "e" | "w";

export interface SettlementBuilding {
  id: string;
  tag: string;
  kind: SettlementBuildingKind;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  facing: BuildingFacing;
  doorX: number;
  doorY: number;
  porchX: number;
  porchY: number;
  roofColor: string;
  wallColor: string;
  trimColor: string;
  signColor: string;
  signText: string;
}

export type CitizenRole =
  | "resident"
  | "merchant"
  | "barista"
  | "guard"
  | "farmer"
  | "dealer_staff"
  | "smith"
  | "banker"
  | "mayor";

export interface SettlementWayPoint {
  x: number;
  y: number;
  label?: string;
}

export interface SettlementCitizen {
  id: string;
  name: string;
  role: CitizenRole;
  roleLabel: string;
  shirtColor: string;
  hairColor: string;
  homeX: number;
  homeY: number;
  workX: number;
  workY: number;
  workBuildingTag?: string;
  workBuildingKind?: SettlementBuildingKind;
  workBuildingLabel?: string;
  patrol: SettlementWayPoint[];
  phrases: string[];
  phaseOffset: number;
}

export type SettlementSurfaceKind = "plaza" | "road" | "sidewalk" | "pier" | "farm";

export interface SettlementFarmPlot {
  x: number;
  y: number;
  w: number;
  h: number;
  cropColor: string;
}

export interface Settlement {
  id: string;
  name: string;
  tier: SettlementTier;
  biomeTheme: SettlementBiomeTheme;
  biomeLabel: string;
  cellX: number;
  cellY: number;
  cx: number;
  cy: number;
  radius: number;
  population: number;
  specialty: string;
  color: string;
  roadRects: { x: number; y: number; w: number; h: number }[];
  lamps: { x: number; y: number }[];
  farms: SettlementFarmPlot[];
  surfaces: Map<string, SettlementSurfaceKind>;
  buildings: SettlementBuilding[];
  citizens: SettlementCitizen[];
}

export interface CitizenPose {
  x: number;
  y: number;
  face: 1 | -1;
  walking: boolean;
  walkPhase: number;
  walkSpeed: number;
  sleeping: boolean;
  activity: string;
}

export interface SettlementSolidTile {
  x: number;
  y: number;
  buildingId: string;
  kind: SettlementBuildingKind;
  wallColor: string;
}

export const SETTLEMENT_CELL = 160;
const EDGE_MARGIN = 30;

const SYLLABLES_A = [
  "桜",
  "港",
  "翠",
  "陽",
  "風",
  "白",
  "星",
  "朝",
  "雲",
  "清",
  "暁",
  "若",
  "青",
  "望",
  "彩",
  "悠",
];

const SYLLABLES_B = [
  "見",
  "川",
  "野",
  "ヶ丘",
  "浜",
  "の里",
  "原",
  "谷",
  "森",
  "町",
  "津",
  "咲",
  "橋",
  "郷",
  "台",
  "浦",
];

const FIRST_NAMES = [
  "ハル",
  "レン",
  "アオイ",
  "ソラ",
  "カエデ",
  "ユイ",
  "タクミ",
  "ミオ",
  "コウ",
  "ヒナ",
  "ナギ",
  "リク",
  "ツムギ",
  "セナ",
  "ユズキ",
  "イト",
];

const BIOME_PALETTES: Record<
  SettlementBiomeTheme,
  {
    label: string;
    specialty: string;
    roof: [string, string, string];
    wall: string;
    trim: string;
    plaza: string;
    road: string;
    crop: string;
  }
> = {
  sakura_metro: {
    label: "桜並木都心",
    specialty: "物流車両・都市交易",
    roof: ["#be185d", "#334155", "#0369a1"],
    wall: "#f8fafc",
    trim: "#e2e8f0",
    plaza: "#cbd5e1",
    road: "#94a3b8",
    crop: "#4ade80",
  },
  coastal_harbor: {
    label: "汐風港町",
    specialty: "海産交易・港湾運輸",
    roof: ["#0284c7", "#0f766e", "#1d4ed8"],
    wall: "#f1f5f9",
    trim: "#bae6fd",
    plaza: "#cbd5e1",
    road: "#d6b88d",
    crop: "#22c55e",
  },
  snow_alpine: {
    label: "白銀山麓",
    specialty: "寒冷装備・暖房資材",
    roof: ["#1e3a8a", "#312e81", "#475569"],
    wall: "#e2e8f0",
    trim: "#cbd5e1",
    plaza: "#94a3b8",
    road: "#64748b",
    crop: "#65a30d",
  },
  desert_oasis: {
    label: "砂丘オアシス",
    specialty: "香辛料・太陽光部品",
    roof: ["#b45309", "#c2410c", "#0e7490"],
    wall: "#fef3c7",
    trim: "#fde68a",
    plaza: "#e7d3a8",
    road: "#d4b483",
    crop: "#84cc16",
  },
  mining_ridge: {
    label: "岩稜鉱山街",
    specialty: "精錬金属・重機整備",
    roof: ["#9a3412", "#3f3f46", "#854d0e"],
    wall: "#d4d4d8",
    trim: "#a1a1aa",
    plaza: "#71717a",
    road: "#52525b",
    crop: "#4d7c0f",
  },
  pastoral_valley: {
    label: "緑野の郷",
    specialty: "農作物・手工芸",
    roof: ["#b91c1c", "#15803d", "#a16207"],
    wall: "#faf5eb",
    trim: "#e7d8c5",
    plaza: "#cbd5e1",
    road: "#b89f78",
    crop: "#22c55e",
  },
};

function hash2d(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function isDryBuildTile(id: number): boolean {
  return id === T_GRASS || id === T_DIRT || id === T_SAND || id === T_SNOW;
}

function surfaceKey(x: number, y: number): string {
  return `${x},${y}`;
}

function classifyBiomeTheme(
  cx: number,
  cy: number,
  tier: SettlementTier,
  seed: number,
): SettlementBiomeTheme {
  let waterCount = 0;
  let sandCount = 0;
  let snowCount = 0;
  let rockCount = 0;
  for (let dy = -22; dy <= 22; dy += 2) {
    for (let dx = -22; dx <= 22; dx += 2) {
      const t = tileAt(cx + dx, cy + dy, seed);
      if (t === T_WATER) waterCount++;
      else if (t === T_SAND) sandCount++;
      else if (t === T_SNOW) snowCount++;
      else if (t === T_ROCK) rockCount++;
    }
  }
  const center = tileAt(cx, cy, seed);
  if (center === T_SNOW || snowCount >= 22) return "snow_alpine";
  if (waterCount >= 18) return "coastal_harbor";
  if (center === T_SAND || sandCount >= 32) return "desert_oasis";
  if (rockCount >= 16) return "mining_ridge";
  return tier === "city" ? "sakura_metro" : "pastoral_valley";
}

function makeBuildingPalette(
  kind: SettlementBuildingKind,
  biome: SettlementBiomeTheme,
  index: number,
): {
  label: string;
  roofColor: string;
  wallColor: string;
  trimColor: string;
  signColor: string;
  signText: string;
} {
  const bp = BIOME_PALETTES[biome];
  switch (kind) {
    case "vehicle_dealer":
      return {
        label: "乗り物ディーラー",
        roofColor: "#0284c7",
        wallColor: bp.wall,
        trimColor: "#38bdf8",
        signColor: "#0ea5e9",
        signText: "DEALER",
      };
    case "city_hall":
      return {
        label: "街の総合案内・役場",
        roofColor: "#4f46e5",
        wallColor: "#f8fafc",
        trimColor: "#c7d2fe",
        signColor: "#6366f1",
        signText: "HALL",
      };
    case "convenience":
      return {
        label: "よろず商店",
        roofColor: "#0f766e",
        wallColor: bp.wall,
        trimColor: "#99f6e4",
        signColor: "#14b8a6",
        signText: "SHOP",
      };
    case "cafe":
      return {
        label: "街角カフェ",
        roofColor: "#c2410c",
        wallColor: bp.wall,
        trimColor: "#fed7aa",
        signColor: "#f97316",
        signText: "CAFE",
      };
    case "bank_kiosk":
      return {
        label: "市民銀行・金庫",
        roofColor: "#b45309",
        wallColor: "#f1f5f9",
        trimColor: "#fde68a",
        signColor: "#f59e0b",
        signText: "BANK",
      };
    case "smith_workshop":
      return {
        label: "鍛冶・クラフト工房",
        roofColor: "#7c2d12",
        wallColor: "#e2e8f0",
        trimColor: "#cbd5e1",
        signColor: "#ea580c",
        signText: "FORGE",
      };
    case "house":
      return {
        label: "街の邸宅",
        roofColor: bp.roof[index % bp.roof.length],
        wallColor: bp.wall,
        trimColor: bp.trim,
        signColor: bp.roof[index % bp.roof.length],
        signText: "HOME",
      };
    case "cottage":
      return {
        label: "暮らしのコテージ",
        roofColor: bp.roof[(index + 1) % bp.roof.length],
        wallColor: bp.wall,
        trimColor: bp.trim,
        signColor: bp.roof[(index + 1) % bp.roof.length],
        signText: "HOUSE",
      };
  }
}

export function settlementInteriorSpace(
  stl: Pick<Settlement, "cellX" | "cellY">,
  building: Pick<SettlementBuilding, "tag">,
): string {
  return `interior:${stl.cellX},${stl.cellY}:${building.tag}`;
}

export function settlementSurfaceAt(
  stl: Settlement,
  tx: number,
  ty: number,
): SettlementSurfaceKind | null {
  return stl.surfaces.get(surfaceKey(Math.floor(tx), Math.floor(ty))) ?? null;
}

export function settlementRoadAt(stl: Settlement, tx: number, ty: number): "plaza" | "road" | null {
  const s = settlementSurfaceAt(stl, tx, ty);
  if (s === "plaza") return "plaza";
  if (s === "road" || s === "pier" || s === "sidewalk") return "road";
  return null;
}

export function settlementSolidTilesInRect(
  stl: Settlement,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): SettlementSolidTile[] {
  const out: SettlementSolidTile[] = [];
  for (const b of stl.buildings) {
    if (b.x + b.w - 1 < minX || b.x > maxX || b.y + b.h - 1 < minY || b.y > maxY) {
      continue;
    }
    for (let yy = b.y; yy < b.y + b.h; yy++) {
      if (yy < minY || yy > maxY) continue;
      for (let xx = b.x; xx < b.x + b.w; xx++) {
        if (xx < minX || xx > maxX) continue;
        // Leave exact door coordinate walkable so stepping into doorway enters interior!
        if (xx === b.doorX && yy === b.doorY) continue;
        out.push({
          x: xx,
          y: yy,
          buildingId: b.id,
          kind: b.kind,
          wallColor: b.wallColor,
        });
      }
    }
  }
  return out;
}

export function settlementBuildingDoorAt(
  tx: number,
  ty: number,
  seed: number = MAP_SEED,
): { settlement: Settlement; building: SettlementBuilding } | null {
  const x = Math.floor(tx);
  const y = Math.floor(ty);
  const near = settlementsNear(x, y, 42, seed);
  for (const stl of near) {
    for (const b of stl.buildings) {
      if (b.doorX === x && b.doorY === y) {
        return { settlement: stl, building: b };
      }
    }
  }
  return null;
}

export function settlementBuildingAdjacentDoor(
  px: number,
  py: number,
  seed: number = MAP_SEED,
): { settlement: Settlement; building: SettlementBuilding; dist: number } | null {
  const near = settlementsNear(px, py, 42, seed);
  let best: { settlement: Settlement; building: SettlementBuilding; dist: number } | null = null;
  for (const stl of near) {
    for (const b of stl.buildings) {
      const dist = Math.hypot(b.doorX + 0.5 - px, b.doorY + 0.5 - py);
      if (dist <= 2.35 && (!best || dist < best.dist)) {
        best = { settlement: stl, building: b, dist };
      }
    }
  }
  return best;
}

const MAX_SETTLEMENTS_CACHE = 96;
const settlementCache = new Map<string, Settlement | null>();

function findBestCenter(
  cellX: number,
  cellY: number,
  seed: number,
): { cx: number; cy: number } | null {
  const h = hash2d(cellX, cellY, seed ^ 0x517cc1b7);
  if (h % 100 < 28) return null;

  const baseX = cellX * SETTLEMENT_CELL;
  const baseY = cellY * SETTLEMENT_CELL;
  const candX =
    baseX + EDGE_MARGIN + (hash2d(cellX, cellY, seed ^ 0x11) % (SETTLEMENT_CELL - EDGE_MARGIN * 2));
  const candY =
    baseY + EDGE_MARGIN + (hash2d(cellX, cellY, seed ^ 0x22) % (SETTLEMENT_CELL - EDGE_MARGIN * 2));

  let best: { cx: number; cy: number; score: number } | null = null;
  for (let sy = -14; sy <= 14; sy += 2) {
    for (let sx = -14; sx <= 14; sx += 2) {
      const x = candX + sx;
      const y = candY + sy;
      if (!isDryBuildTile(tileAt(x, y, seed))) continue;
      // Ensure plaza + (cx + 3, cy) boulevard anchor are clear & dry
      let dryPlaza = 0;
      let solidCenter = false;
      for (let oy = -2; oy <= 2; oy++) {
        for (let ox = -2; ox <= 3; ox++) {
          const t = tileAt(x + ox, y + oy, seed);
          if (isDryBuildTile(t)) dryPlaza++;
          else if (ox >= -1 && ox <= 3 && oy >= -1 && oy <= 1) solidCenter = true;
        }
      }
      if (solidCenter || dryPlaza < 22) continue;
      const score = dryPlaza * 10 - (Math.abs(sx) + Math.abs(sy));
      if (!best || score > best.score) best = { cx: x, cy: y, score };
    }
  }
  return best ? { cx: best.cx, cy: best.cy } : null;
}

export function settlementAtCell(
  cellX: number,
  cellY: number,
  seed: number = MAP_SEED,
): Settlement | null {
  const key = `${seed}:${cellX},${cellY}`;
  if (settlementCache.has(key)) return settlementCache.get(key) ?? null;

  const center = findBestCenter(cellX, cellY, seed);
  if (!center) {
    settlementCache.set(key, null);
    return null;
  }

  const h = hash2d(cellX, cellY, seed ^ 0x517cc1b7);
  const { cx, cy } = center;
  const tierRoll = (h >>> 8) % 100;
  const tier: SettlementTier = tierRoll < 22 ? "city" : tierRoll < 56 ? "town" : "village";
  const radius = tier === "city" ? 24 : tier === "town" ? 16 : 10;
  const biomeTheme = classifyBiomeTheme(cx, cy, tier, seed);
  const biomePalette = BIOME_PALETTES[biomeTheme];

  const a = SYLLABLES_A[hash2d(cellX, cellY, seed ^ 0x31) % SYLLABLES_A.length];
  const b = SYLLABLES_B[hash2d(cellX, cellY, seed ^ 0x41) % SYLLABLES_B.length];
  const suffix = tier === "city" ? "市" : tier === "town" ? "町" : "";
  const name = `${a}${b}${suffix}`;

  const surfaces = new Map<string, SettlementSurfaceKind>();
  const setSurface = (x: number, y: number, kind: SettlementSurfaceKind) => {
    const k = surfaceKey(x, y);
    const prev = surfaces.get(k);
    if (prev === "plaza") return;
    if (prev === "road" && kind !== "plaza") return;
    surfaces.set(k, kind);
  };

  // 1. Central Plaza (5x5 around cx, cy)
  const plazaR = 2;
  for (let py = cy - plazaR; py <= cy + plazaR; py++) {
    for (let px = cx - plazaR; px <= cx + plazaR; px++) {
      setSurface(px, py, "plaza");
    }
  }

  const roadNodes: SettlementWayPoint[] = [{ x: cx + 0.5, y: cy + 0.5, label: "中央広場" }];

  // 2. Terrain-adaptive Jigsaw Avenues & Branches
  const streetWidth = tier === "city" ? 2 : 1;
  const carveStreetStep = (x: number, y: number, isPierEligible: boolean): boolean => {
    const t = tileAt(x, y, seed);
    if (t === T_ROCK) return false;
    if (t === T_WATER) {
      if (!isPierEligible) return false;
      setSurface(x, y, "pier");
      return true;
    }
    setSurface(x, y, "road");
    return true;
  };

  const traceJigsawArm = (
    startX: number,
    startY: number,
    dirX: number,
    dirY: number,
    maxLen: number,
    allowBranch: boolean,
    salt: number,
  ) => {
    let x = startX;
    let y = startY;
    let dx = dirX;
    let dy = dirY;
    let pierSteps = 0;

    for (let step = 1; step <= maxLen; step++) {
      let nx = x + dx;
      let ny = y + dy;
      const nextTile = tileAt(nx, ny, seed);

      // Terrain-contour deflection if hitting rock or non-harbor water after guaranteed anchor steps
      if (
        step > 4 &&
        (nextTile === T_ROCK ||
          (nextTile === T_WATER && biomeTheme !== "coastal_harbor" && pierSteps >= 2))
      ) {
        const turnSign = hash2d(nx, ny, seed ^ salt ^ step) % 2 === 0 ? 1 : -1;
        const altDx = dy !== 0 ? turnSign : 0;
        const altDy = dx !== 0 ? turnSign : 0;
        const altTile = tileAt(x + altDx, y + altDy, seed);
        if (!isSolidMapTile(altTile)) {
          dx = altDx;
          dy = altDy;
          nx = x + dx;
          ny = y + dy;
        } else {
          break;
        }
      }

      const t = tileAt(nx, ny, seed);
      if (t === T_WATER) {
        pierSteps++;
        if (pierSteps > (biomeTheme === "coastal_harbor" ? 6 : 3)) break;
      } else {
        pierSteps = 0;
      }

      if (!carveStreetStep(nx, ny, biomeTheme === "coastal_harbor" || step <= 4)) break;
      if (streetWidth === 2 && t !== T_WATER) {
        const sx = dy !== 0 ? nx + 1 : nx;
        const sy = dx !== 0 ? ny + 1 : ny;
        if (!isSolidMapTile(tileAt(sx, sy, seed))) setSurface(sx, sy, "road");
      }

      x = nx;
      y = ny;

      if (step % 5 === 0) {
        roadNodes.push({ x: x + 0.5, y: y + 0.5 });
      }

      // Jigsaw perpendicular side-streets inside medium/large towns
      if (allowBranch && (step === 7 || step === 14)) {
        const branchLen = tier === "city" ? 9 : 6;
        const sideDirs: [number, number][] =
          dx !== 0
            ? [
                [0, -1],
                [0, 1],
              ]
            : [
                [-1, 0],
                [1, 0],
              ];
        for (let bi = 0; bi < sideDirs.length; bi++) {
          const [bdx, bdy] = sideDirs[bi];
          if (hash2d(x + bi, y, seed ^ salt) % 100 < 78) {
            traceJigsawArm(x, y, bdx, bdy, branchLen, false, salt ^ ((bi + 1) * 97));
          }
        }
      }
    }
  };

  const mainArmLen = tier === "city" ? 20 : tier === "town" ? 13 : 7;
  // East arm starts from plaza edge (cx+2, cy) so (cx+3, cy) is ALWAYS "road"
  traceJigsawArm(cx + plazaR, cy, 1, 0, mainArmLen, tier !== "village", 0x101);
  traceJigsawArm(cx - plazaR, cy, -1, 0, mainArmLen, tier !== "village", 0x202);
  traceJigsawArm(cx, cy + plazaR, 0, 1, mainArmLen - 1, tier !== "village", 0x303);
  traceJigsawArm(cx, cy - plazaR, 0, -1, mainArmLen - 1, tier !== "village", 0x404);

  // Build bounding roadRects summary for coarse minimap/fast visual fallback while exact roads use `surfaces`
  const roadRects: { x: number; y: number; w: number; h: number }[] = [];
  for (const [k, v] of surfaces.entries()) {
    if (v === "plaza" || v === "road" || v === "pier") {
      const [xs, ys] = k.split(",");
      roadRects.push({ x: Number(xs), y: Number(ys), w: 1, h: 1 });
    }
  }

  // 3. Roadside Jigsaw Lot Generator (Lots face actual road tiles!)
  const occupiedLot = new Set<string>(surfaces.keys());
  const buildings: SettlementBuilding[] = [];

  const canPlaceBuildingLot = (
    bx: number,
    by: number,
    bw: number,
    bh: number,
    doorX: number,
    doorY: number,
    porchX: number,
    porchY: number,
  ): boolean => {
    // Keep safe margin around (cx+3, cy) east plaza exit & plaza itself
    for (let yy = by; yy < by + bh; yy++) {
      for (let xx = bx; xx < bx + bw; xx++) {
        if (occupiedLot.has(surfaceKey(xx, yy))) return false;
        const t = tileAt(xx, yy, seed);
        if (t === T_ROCK) return false;
        if (t === T_WATER && biomeTheme !== "coastal_harbor") return false;
      }
    }
    // Check 1-tile alley spacing on all 4 sides except porch side doesn't collide with other buildings
    for (const other of buildings) {
      if (
        bx <= other.x + other.w &&
        bx + bw >= other.x &&
        by <= other.y + other.h &&
        by + bh >= other.y
      ) {
        return false;
      }
    }
    // Door must border porch tile (street/sidewalk)
    if (isSolidMapTile(tileAt(porchX, porchY, seed)) && !surfaces.has(surfaceKey(porchX, porchY))) {
      return false;
    }
    if (doorX < bx || doorX >= bx + bw || doorY < by || doorY >= by + bh) return false;
    return true;
  };

  interface LotCandidate {
    bx: number;
    by: number;
    bw: number;
    bh: number;
    facing: BuildingFacing;
    doorX: number;
    doorY: number;
    porchX: number;
    porchY: number;
    dist: number;
  }

  const candidates: LotCandidate[] = [];
  for (const [k, s] of surfaces.entries()) {
    if (s !== "road" && s !== "plaza") continue;
    const [sxStr, syStr] = k.split(",");
    const rx = Number(sxStr);
    const ry = Number(syStr);
    const dCenter = Math.hypot(rx - cx, ry - cy);
    if (dCenter < 3.2) continue;

    // Propose north-of-road lot (facing south toward road ry)
    candidates.push({
      bx: rx - 2,
      by: ry - 4,
      bw: 5,
      bh: 4,
      facing: "s",
      doorX: rx,
      doorY: ry - 1,
      porchX: rx,
      porchY: ry,
      dist: dCenter,
    });
    // Propose south-of-road lot (facing north toward road ry)
    candidates.push({
      bx: rx - 2,
      by: ry + 1,
      bw: 5,
      bh: 4,
      facing: "n",
      doorX: rx,
      doorY: ry + 1,
      porchX: rx,
      porchY: ry,
      dist: dCenter,
    });
    // Propose west-of-road lot (facing east toward road rx)
    candidates.push({
      bx: rx - 5,
      by: ry - 2,
      bw: 5,
      bh: 4,
      facing: "e",
      doorX: rx - 1,
      doorY: ry,
      porchX: rx,
      porchY: ry,
      dist: dCenter,
    });
    // Propose east-of-road lot (facing west toward road rx)
    candidates.push({
      bx: rx + 1,
      by: ry - 2,
      bw: 5,
      bh: 4,
      facing: "w",
      doorX: rx + 1,
      doorY: ry,
      porchX: rx,
      porchY: ry,
      dist: dCenter,
    });
  }

  // Deterministic sort: closest central commercial lots first, jittered by seed
  candidates.sort((a, b) => {
    const da = a.dist + (hash2d(a.bx, a.by, seed) % 100) * 0.025;
    const db = b.dist + (hash2d(b.bx, b.by, seed) % 100) * 0.025;
    return da - db;
  });

  const roster: SettlementBuildingKind[] =
    tier === "city"
      ? [
          "vehicle_dealer",
          "city_hall",
          "cafe",
          "convenience",
          "bank_kiosk",
          "smith_workshop",
          "house",
          "house",
          "convenience",
          "cottage",
        ]
      : tier === "town"
        ? [
            "vehicle_dealer",
            "convenience",
            "cafe",
            "bank_kiosk",
            "smith_workshop",
            "house",
            "cottage",
          ]
        : ["convenience", "cafe", "smith_workshop", "cottage"];

  for (let i = 0; i < candidates.length && buildings.length < roster.length; i++) {
    const c = candidates[i];
    const kind = roster[buildings.length];
    const bw = kind === "city_hall" || kind === "vehicle_dealer" ? 6 : c.bw;
    const bh = kind === "city_hall" || kind === "vehicle_dealer" ? 4 : c.bh;
    const bx = c.facing === "w" ? c.bx : c.facing === "e" ? c.porchX - bw : c.bx;
    const by = c.by;
    if (!canPlaceBuildingLot(bx, by, bw, bh, c.doorX, c.doorY, c.porchX, c.porchY)) continue;

    for (let yy = by; yy < by + bh; yy++) {
      for (let xx = bx; xx < bx + bw; xx++) {
        occupiedLot.add(surfaceKey(xx, yy));
      }
    }
    const palette = makeBuildingPalette(kind, biomeTheme, buildings.length);
    const tag = `${kind.slice(0, 8)}_${buildings.length}`;
    buildings.push({
      id: `${cellX},${cellY}:${tag}`,
      tag,
      kind,
      label: palette.label,
      x: bx,
      y: by,
      w: bw,
      h: bh,
      facing: c.facing,
      doorX: c.doorX,
      doorY: c.doorY,
      porchX: c.porchX,
      porchY: c.porchY,
      roofColor: palette.roofColor,
      wallColor: palette.wallColor,
      trimColor: palette.trimColor,
      signColor: palette.signColor,
      signText: palette.signText,
    });
    roadNodes.push({
      x: c.porchX + 0.5,
      y: c.porchY + 0.5,
      label: `${palette.label}前`,
    });
  }

  // Fallback anchor buildings if rugged terrain blocked roadside candidates
  if (buildings.length === 0) {
    const p0 = makeBuildingPalette("convenience", biomeTheme, 0);
    buildings.push({
      id: `${cellX},${cellY}:convenie_0`,
      tag: "convenie_0",
      kind: "convenience",
      label: p0.label,
      x: cx - 4,
      y: cy - 6,
      w: 5,
      h: 4,
      facing: "s",
      doorX: cx - 2,
      doorY: cy - 3,
      porchX: cx - 2,
      porchY: cy - 2,
      roofColor: p0.roofColor,
      wallColor: p0.wallColor,
      trimColor: p0.trimColor,
      signColor: p0.signColor,
      signText: p0.signText,
    });
  }
  if (buildings.length === 1) {
    const p1 = makeBuildingPalette("cafe", biomeTheme, 1);
    buildings.push({
      id: `${cellX},${cellY}:cafe_1`,
      tag: "cafe_1",
      kind: "cafe",
      label: p1.label,
      x: cx + 2,
      y: cy - 6,
      w: 5,
      h: 4,
      facing: "s",
      doorX: cx + 4,
      doorY: cy - 3,
      porchX: cx + 4,
      porchY: cy - 2,
      roofColor: p1.roofColor,
      wallColor: p1.wallColor,
      trimColor: p1.trimColor,
      signColor: p1.signColor,
      signText: p1.signText,
    });
  }

  // Streetlamps anchored at Plaza corners and avenue nodes (minimum >= 4)
  const lampSet = new Set<string>();
  const lamps: { x: number; y: number }[] = [];
  const pushLamp = (lx: number, ly: number) => {
    const lk = surfaceKey(lx, ly);
    if (lampSet.has(lk)) return;
    if (buildings.some((bd) => lx >= bd.x && lx < bd.x + bd.w && ly >= bd.y && ly < bd.y + bd.h)) {
      return;
    }
    lampSet.add(lk);
    lamps.push({ x: lx, y: ly });
  };
  pushLamp(cx - 2, cy - 2);
  pushLamp(cx + 2, cy - 2);
  pushLamp(cx - 2, cy + 2);
  pushLamp(cx + 2, cy + 2);
  for (let ni = 1; ni < roadNodes.length && lamps.length < 14; ni += 2) {
    const rn = roadNodes[ni];
    pushLamp(Math.floor(rn.x), Math.floor(rn.y));
  }

  // 4. Irrigated Farmland Plots on open fertile edges (especially villages & towns)
  const farms: SettlementFarmPlot[] = [];
  const maxFarms = tier === "village" ? 3 : tier === "town" ? 2 : 1;
  for (let fi = 0; fi < 16 && farms.length < maxFarms; fi++) {
    const fh = hash2d(cellX + fi, cellY - fi, seed ^ 0x92c4);
    const fx = cx + ((fh % 19) - 9);
    const fy = cy + (((fh >>> 6) % 19) - 9);
    const fw = 4;
    const fht = 3;
    let clear = true;
    for (let yy = fy; yy < fy + fht && clear; yy++) {
      for (let xx = fx; xx < fx + fw; xx++) {
        if (occupiedLot.has(surfaceKey(xx, yy))) {
          clear = false;
          break;
        }
        const t = tileAt(xx, yy, seed);
        if (t !== T_GRASS && t !== T_DIRT) {
          clear = false;
          break;
        }
      }
    }
    if (!clear) continue;
    for (let yy = fy; yy < fy + fht; yy++) {
      for (let xx = fx; xx < fx + fw; xx++) {
        occupiedLot.add(surfaceKey(xx, yy));
        setSurface(xx, yy, "farm");
      }
    }
    farms.push({ x: fx, y: fy, w: fw, h: fht, cropColor: biomePalette.crop });
  }

  // 5. Intelligent Citizens linked to Actual Buildings & Street Patrol Loops
  const citizens: SettlementCitizen[] = [];
  const dealerB = buildings.find((bd) => bd.kind === "vehicle_dealer");
  const cafeB = buildings.find((bd) => bd.kind === "cafe");
  const shopB = buildings.find((bd) => bd.kind === "convenience");
  const bankB = buildings.find((bd) => bd.kind === "bank_kiosk");
  const smithB = buildings.find((bd) => bd.kind === "smith_workshop");
  const hallB = buildings.find((bd) => bd.kind === "city_hall");
  const houseB = buildings.find((bd) => bd.kind === "house" || bd.kind === "cottage");

  interface RoleSlot {
    role: CitizenRole;
    roleLabel: string;
    shirt: string;
    building?: SettlementBuilding;
    phrases: string[];
  }

  const roleSlots: RoleSlot[] = [
    {
      role: "guard",
      roleLabel: "治安パトロール",
      shirt: "#1d4ed8",
      building: hallB,
      phrases: [
        `${name}の治安は良好だ。夜間も大通りを見回っている。`,
        `怪しい取引や脱獄犯を見かけたらすぐ警察署へ通報してくれ。`,
      ],
    },
    {
      role: "merchant",
      roleLabel: "商店主",
      shirt: "#0f766e",
      building: shopB,
      phrases: [
        `いらっしゃい！お店のドアから中に入って直接品物を探せるよ。`,
        `このあたりの名産は「${biomePalette.specialty}」なんだ。`,
      ],
    },
    ...(dealerB
      ? [
          {
            role: "dealer_staff" as CitizenRole,
            roleLabel: "車両ディーラー担当",
            shirt: "#0284c7",
            building: dealerB,
            phrases: [
              `新車スクーターからトラックまで取り揃えてます。試乗や購入は店内で！`,
              `長距離の輸送依頼なら配送モペッドや貨物トラックが圧倒的に速いですよ。`,
            ],
          },
        ]
      : []),
    ...(cafeB
      ? [
          {
            role: "barista" as CitizenRole,
            roleLabel: "バリスタ",
            shirt: "#c2410c",
            building: cafeB,
            phrases: [
              `温かい珈琲を淹れて待ってます。深夜営業もやってますよ。`,
              `店内のテーブルで一息つくと旅の疲れも取れます。`,
            ],
          },
        ]
      : []),
    ...(bankB
      ? [
          {
            role: "banker" as CitizenRole,
            roleLabel: "銀行員",
            shirt: "#b45309",
            building: bankB,
            phrases: [
              `出納窓口や送金のご利用は銀行建物のカウンターへどうぞ。`,
              `資産が増えたら都市の車両ディーラーを覗いてみるのもおすすめです。`,
            ],
          },
        ]
      : []),
    ...(smithB
      ? [
          {
            role: "smith" as CitizenRole,
            roleLabel: "鍛冶職人",
            shirt: "#9a3412",
            building: smithB,
            phrases: [
              `炉に火が入ってるぞ。ツール強化やクラフトは工房の中へ入りな！`,
              `${biomePalette.label}の地形に合わせた機材を鍛えているところさ。`,
            ],
          },
        ]
      : []),
    ...(hallB
      ? [
          {
            role: "mayor" as CitizenRole,
            roleLabel: "街の案内役",
            shirt: "#4f46e5",
            building: hallB,
            phrases: [
              `ようこそ${name}へ！各店舗の玄関を踏むと屋内へ入れます。`,
              `地図を開いてピンを立てれば道案内や追跡ができますよ。`,
            ],
          },
        ]
      : []),
    {
      role: "farmer",
      roleLabel: "農園管理人",
      shirt: "#15803d",
      building: houseB ?? shopB,
      phrases: [
        `${biomePalette.label}の土壌に合わせて畑を整えているんだ。`,
        `採れた作物は商店で買い取ってもらえるぞ。`,
      ],
    },
    {
      role: "resident",
      roleLabel: "住民",
      shirt: "#7c3aed",
      building: houseB,
      phrases: [
        `ここの街路は地形に沿って伸びていて歩きやすいよね。`,
        `${name}で急ぎの届け物があったら声をかけてみて！`,
      ],
    },
  ];

  const targetCitizens = tier === "city" ? 9 : tier === "town" ? 6 : 4;
  const hairColors = ["#1e293b", "#78350f", "#b45309", "#475569", "#7c2d12"];

  for (let i = 0; i < Math.min(targetCitizens, roleSlots.length); i++) {
    const slot = roleSlots[i];
    const workB = slot.building;
    const workX = workB ? workB.porchX + 0.5 : cx + ((i % 3) - 1) * 1.4 + 0.5;
    const workY = workB ? workB.porchY + 0.5 : cy + (((i + 1) % 3) - 1) * 1.4 + 0.5;
    const homeB = houseB ?? workB;
    const homeX = homeB ? homeB.porchX + 0.5 : cx + 0.5;
    const homeY = homeB ? homeB.porchY + 0.5 : cy + 0.5;

    // Build deterministic non-degenerate patrol loop along generated streets and plaza
    const fallbackA = { x: cx + 2.5, y: cy + 0.5 };
    const fallbackB = { x: cx + 0.5, y: cy + 2.5 };
    const fallbackC = { x: cx - 1.5, y: cy + 0.5 };
    const cand1 = roadNodes[(i * 2 + 1) % roadNodes.length] ?? fallbackA;
    const cand2 = roadNodes[(i * 3 + 2) % roadNodes.length] ?? fallbackB;
    const rawPts: SettlementWayPoint[] =
      slot.role === "guard" || slot.role === "resident" || slot.role === "farmer"
        ? [{ x: workX, y: workY }, cand1, { x: cx + 0.5, y: cy + 0.5 }, cand2]
        : [{ x: workX, y: workY }, cand1, fallbackA, fallbackC];
    const patrol: SettlementWayPoint[] = [];
    for (const pt of rawPts) {
      if (
        patrol.length === 0 ||
        Math.hypot(pt.x - patrol[patrol.length - 1].x, pt.y - patrol[patrol.length - 1].y) >= 0.9
      ) {
        patrol.push(pt);
      }
    }
    if (patrol.length < 2) {
      patrol.push({ x: patrol[0].x + 2.0, y: patrol[0].y });
    }
    if (
      Math.hypot(
        patrol[0].x - patrol[patrol.length - 1].x,
        patrol[0].y - patrol[patrol.length - 1].y,
      ) < 0.9
    ) {
      patrol.push(
        Math.hypot(patrol[0].x - fallbackB.x, patrol[0].y - fallbackB.y) >= 1
          ? fallbackB
          : { x: patrol[0].x, y: patrol[0].y + 2.0 },
      );
    }

    const nameIdx = hash2d(cellX + i * 7, cellY - i * 3, seed ^ 0xabc) % FIRST_NAMES.length;
    citizens.push({
      id: `${cellX},${cellY}:cit:${i}`,
      name: `${FIRST_NAMES[nameIdx]}`,
      role: slot.role,
      roleLabel: slot.roleLabel,
      shirtColor: slot.shirt,
      hairColor: hairColors[i % hairColors.length],
      homeX,
      homeY,
      workX,
      workY,
      workBuildingTag: workB?.tag,
      workBuildingKind: workB?.kind,
      workBuildingLabel: workB?.label,
      patrol,
      phrases: slot.phrases,
      phaseOffset: (hash2d(cellX + i, cellY, seed) % 1000) / 1000,
    });
  }

  const stl: Settlement = {
    id: `stl:${cellX},${cellY}`,
    name,
    tier,
    biomeTheme,
    biomeLabel: biomePalette.label,
    cellX,
    cellY,
    cx,
    cy,
    radius,
    population: tier === "city" ? 180 + (h % 240) : tier === "town" ? 65 + (h % 90) : 18 + (h % 35),
    specialty: biomePalette.specialty,
    color: tier === "city" ? "#38bdf8" : tier === "town" ? "#4ade80" : "#facc15",
    roadRects,
    lamps,
    farms,
    surfaces,
    buildings,
    citizens,
  };

  if (settlementCache.size >= MAX_SETTLEMENTS_CACHE) {
    const firstKey = settlementCache.keys().next().value;
    if (firstKey) settlementCache.delete(firstKey);
  }
  settlementCache.set(key, stl);
  return stl;
}

export function settlementsNear(
  x: number,
  y: number,
  radius: number,
  seed: number = MAP_SEED,
): Settlement[] {
  const minCx = Math.floor((x - radius) / SETTLEMENT_CELL);
  const maxCx = Math.floor((x + radius) / SETTLEMENT_CELL);
  const minCy = Math.floor((y - radius) / SETTLEMENT_CELL);
  const maxCy = Math.floor((y + radius) / SETTLEMENT_CELL);
  const out: Settlement[] = [];
  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      const stl = settlementAtCell(cx, cy, seed);
      if (!stl) continue;
      if (Math.hypot(stl.cx - x, stl.cy - y) <= radius + stl.radius) {
        out.push(stl);
      }
    }
  }
  out.sort((a, b) => Math.hypot(a.cx - x, a.cy - y) - Math.hypot(b.cx - x, b.cy - y));
  return out;
}

export function nearestSettlement(
  x: number,
  y: number,
  maxDist: number = 32,
  seed: number = MAP_SEED,
): Settlement | null {
  const list = settlementsNear(x, y, maxDist, seed);
  if (list.length === 0) return null;
  const top = list[0];
  return Math.hypot(top.cx - x, top.cy - y) <= Math.max(maxDist, top.radius + 4) ? top : null;
}

export function evaluateCitizenPose(
  stl: Settlement,
  c: SettlementCitizen,
  dayPhase: number,
  timeMs: number = 0,
): CitizenPose {
  const p = ((dayPhase % 1) + 1) % 1;
  const nightWorker = c.role === "guard" || c.role === "barista" || c.role === "dealer_staff";
  const isNight = p < 0.21 || p >= 0.86;

  if (isNight && !nightWorker) {
    return {
      x: c.homeX,
      y: c.homeY,
      face: 1,
      walking: false,
      walkPhase: 0,
      walkSpeed: 0,
      sleeping: true,
      activity: "自宅で休息中",
    };
  }

  // Smooth waypoint street-following cycle driven by continuous real-time + phase
  const pts =
    c.patrol.length >= 2
      ? c.patrol
      : [
          { x: c.workX, y: c.workY },
          { x: stl.cx + 0.5, y: stl.cy + 0.5 },
          { x: stl.cx + 2.5, y: stl.cy + 0.5 },
        ];
  const speedRate = c.role === "guard" ? 0.000034 : c.role === "resident" ? 0.000028 : 0.000022;
  const cycle = (((timeMs * speedRate + p * 1.4 + c.phaseOffset) % 1) + 1) % 1;
  const totalSegs = pts.length;
  const scaled = cycle * totalSegs;
  const segIdx = Math.floor(scaled) % totalSegs;
  const nextIdx = (segIdx + 1) % totalSegs;
  const segT = scaled - Math.floor(scaled);

  // Smooth cosine ease-in-out along each street segment so NPCs naturally decelerate at corners
  const walkT = 0.5 - 0.5 * Math.cos(segT * Math.PI);
  const a = pts[segIdx];
  const b = pts[nextIdx];
  const x = a.x + (b.x - a.x) * walkT;
  const y = a.y + (b.y - a.y) * walkT;
  const walking = Math.hypot(b.x - a.x, b.y - a.y) > 0.12;
  const face: 1 | -1 = b.x < a.x - 0.03 ? -1 : 1;
  const walkPhase = walking ? (timeMs * 0.006 + c.phaseOffset * 6) % (Math.PI * 2) : 0;
  const walkSpeed = walking ? 2.2 * Math.sin(segT * Math.PI) : 0;

  const activity =
    c.role === "dealer_staff"
      ? "展示車両の整備・案内"
      : c.role === "barista"
        ? "珈琲の仕込み・接客"
        : c.role === "merchant"
          ? "店頭での取引案内"
          : c.role === "banker"
            ? "出納・口座案内"
            : c.role === "smith"
              ? "資材の鍛造・整備"
              : c.role === "guard"
                ? "街通りの巡回中"
                : c.role === "mayor"
                  ? "街の案内・相談"
                  : c.role === "farmer"
                    ? "農園の見回り"
                    : "街歩き中";

  return {
    x,
    y,
    face,
    walking,
    walkPhase,
    walkSpeed,
    sleeping: false,
    activity,
  };
}
