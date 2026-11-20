import { MAP_SEED, T_GRASS, T_ROCK, tilesSource } from "./mapgen";
import {
  L_CARPET,
  L_CHECK,
  L_CONCRETE,
  L_DARK,
  L_MARBLE,
  L_PLAZA,
  L_SAND,
  L_WALL,
  L_WOOD,
  type LobbyData,
  type LobbyObject,
  isSeatSprite,
  isSolidLobbyTile,
} from "./lobby";
import {
  type Settlement,
  type SettlementBiomeTheme,
  type SettlementBuilding,
  type SettlementBuildingKind,
  settlementAtCell,
  settlementInteriorSpace,
} from "./settlements";

export const INTERIOR_W = 20;
export const INTERIOR_H = 15;

export const INTERIOR_SPACE_RE = /^interior:(-?\d+),(-?\d+):([a-z0-9_]{1,20})$/;

export interface ParsedInteriorSpace {
  cellX: number;
  cellY: number;
  tag: string;
}

export function parseInteriorSpace(raw: unknown): ParsedInteriorSpace | null {
  if (typeof raw !== "string") return null;
  const m = INTERIOR_SPACE_RE.exec(raw);
  if (!m) return null;
  return {
    cellX: Number(m[1]),
    cellY: Number(m[2]),
    tag: m[3],
  };
}

export interface SettlementInteriorStaff {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  shirtColor: string;
  hairColor: string;
  x: number;
  y: number;
  phrases: string[];
  workBuildingKind: SettlementBuildingKind;
}

export interface DealerShowroomBay {
  vehicleId: "electric_scooter" | "delivery_moped" | "cargo_truck" | "police_cruiser";
  label: string;
  price: number;
  x: number;
  y: number;
  accent: string;
}

export interface SettlementInteriorSpec {
  space: string;
  settlement: Settlement;
  building: SettlementBuilding;
  biomeTheme: SettlementBiomeTheme;
  data: LobbyData;
  entryPoint: { x: number; y: number };
  exitMat: { x: number; y: number; w: number; h: number };
  exteriorReturn: { x: number; y: number };
  dealerBays: DealerShowroomBay[];
  staff: SettlementInteriorStaff[];
  accentColor: string;
  subtitle: string;
}

function floorPaletteForBiome(
  biome: SettlementBiomeTheme,
  kind: SettlementBuildingKind,
): { main: number; accent: number; rug: number } {
  if (kind === "smith_workshop") {
    return { main: L_CONCRETE, accent: L_DARK, rug: L_DARK };
  }
  if (kind === "vehicle_dealer") {
    return { main: L_MARBLE, accent: L_CHECK, rug: L_PLAZA };
  }
  if (kind === "bank_kiosk" || kind === "city_hall") {
    return { main: L_MARBLE, accent: L_PLAZA, rug: L_CARPET };
  }
  switch (biome) {
    case "coastal_harbor":
      return { main: L_WOOD, accent: L_PLAZA, rug: L_CARPET };
    case "desert_oasis":
      return { main: L_SAND, accent: L_WOOD, rug: L_CARPET };
    case "snow_alpine":
      return { main: L_WOOD, accent: L_CHECK, rug: L_CARPET };
    case "mining_ridge":
      return { main: L_CONCRETE, accent: L_DARK, rug: L_CARPET };
    case "sakura_metro":
      return { main: L_MARBLE, accent: L_CHECK, rug: L_CARPET };
    case "pastoral_valley":
      return { main: L_WOOD, accent: L_MARBLE, rug: L_CARPET };
  }
}

const interiorCache = new Map<string, SettlementInteriorSpec>();
const MAX_INTERIOR_CACHE = 48;

export function buildSettlementInterior(
  space: string,
  seed: number = MAP_SEED,
): SettlementInteriorSpec | null {
  const parsed = parseInteriorSpace(space);
  if (!parsed) return null;
  const cacheKey = `${seed}:${space}`;
  const cached = interiorCache.get(cacheKey);
  if (cached) return cached;

  const stl = settlementAtCell(parsed.cellX, parsed.cellY, seed);
  if (!stl) return null;
  const building = stl.buildings.find((b) => b.tag === parsed.tag) ?? stl.buildings[0];
  if (!building) return null;

  const tiles = new Uint8Array(INTERIOR_W * INTERIOR_H);
  const pal = floorPaletteForBiome(stl.biomeTheme, building.kind);

  for (let y = 0; y < INTERIOR_H; y++) {
    for (let x = 0; x < INTERIOR_W; x++) {
      const isSouthDoor = y === INTERIOR_H - 1 && (x === 9 || x === 10);
      const isBorderWall =
        !isSouthDoor && (x === 0 || y === 0 || x === INTERIOR_W - 1 || y === INTERIOR_H - 1);
      if (isBorderWall) {
        tiles[y * INTERIOR_W + x] = L_WALL;
        continue;
      }
      if (isSouthDoor || (y === INTERIOR_H - 2 && (x === 9 || x === 10))) {
        tiles[y * INTERIOR_W + x] = L_CARPET;
        continue;
      }
      if (x >= 3 && x <= 16 && y >= 5 && y <= 10 && building.kind !== "smith_workshop") {
        tiles[y * INTERIOR_W + x] =
          building.kind === "vehicle_dealer"
            ? pal.accent
            : y >= 6 && y <= 9 && x >= 5 && x <= 14
              ? pal.rug
              : pal.accent;
      } else {
        tiles[y * INTERIOR_W + x] = pal.main;
      }
    }
  }

  const objects: LobbyObject[] = [];
  const put = (
    sprite: string,
    x: number,
    y: number,
    opts?: Partial<Pick<LobbyObject, "w" | "h" | "solid" | "station" | "genre">>,
  ) => {
    objects.push({
      sprite,
      x,
      y,
      w: opts?.w ?? 1,
      h: opts?.h ?? 1,
      solid: opts?.solid ?? true,
      station: opts?.station,
      genre: opts?.genre,
    });
  };

  const dealerBays: DealerShowroomBay[] = [];

  switch (building.kind) {
    case "vehicle_dealer": {
      put("shop_counter", 3, 2, { station: "dealer" });
      put("shop_counter", 4, 2, { station: "dealer" });
      put("shop_counter", 5, 2, { station: "dealer" });
      put("sign_board", 7, 2, { station: "dealer" });
      put("sign_board", 12, 2, { station: "dealer" });
      put("workbench", 14, 2, { station: "dealer" });
      put("sofa", 2, 11, { station: "rest" });
      put("table_round", 4, 11);
      put("planter", 1, 1);
      put("planter", 18, 1);
      put("planter", 1, 13);
      put("planter", 18, 13);
      put("lamp", 8, 1);
      put("lamp", 11, 1);
      dealerBays.push(
        {
          vehicleId: "electric_scooter",
          label: "電動スクーター",
          price: 4500,
          x: 4,
          y: 7,
          accent: "#38bdf8",
        },
        {
          vehicleId: "delivery_moped",
          label: "配送モペッド",
          price: 11000,
          x: 9,
          y: 7,
          accent: "#4ade80",
        },
        {
          vehicleId: "cargo_truck",
          label: "貨物トラック",
          price: 24000,
          x: 14,
          y: 7,
          accent: "#f59e0b",
        },
      );
      break;
    }
    case "cafe": {
      put("shop_counter", 3, 3, { station: "shop", genre: "food" });
      put("shop_counter", 4, 3, { station: "shop", genre: "food" });
      put("shop_counter", 5, 3, { station: "shop", genre: "food" });
      put("vending", 7, 2, { station: "shop", genre: "food" });
      put("table_round", 4, 7, { station: "rest" });
      put("chair", 3, 7, { solid: false });
      put("table_round", 13, 7, { station: "rest" });
      put("chair", 14, 7, { solid: false });
      put("sofa", 14, 3, { station: "rest" });
      put("bookshelf", 16, 2, { station: "rest" });
      put("planter", 2, 2);
      put("planter", 17, 12);
      put("lamp", 10, 2);
      break;
    }
    case "convenience": {
      put("shop_counter", 3, 3, { station: "shop", genre: "tools" });
      put("shop_counter", 4, 3, { station: "shop", genre: "food" });
      put("crate", 6, 3, { station: "sell" });
      put("item_shelf", 12, 3, { station: "shop", genre: "furniture" });
      put("item_shelf", 15, 3, { station: "shop", genre: "food" });
      put("item_shelf", 4, 8, { station: "shop", genre: "tools" });
      put("item_shelf", 14, 8, { station: "shop", genre: "farm" });
      put("vending", 17, 2, { station: "shop", genre: "food" });
      put("atm", 2, 11, { station: "bank" });
      put("planter", 1, 1);
      put("lamp", 9, 2);
      break;
    }
    case "bank_kiosk": {
      put("bank_counter", 7, 3, { station: "bank" });
      put("bank_counter", 8, 3, { station: "bank" });
      put("bank_counter", 11, 3, { station: "bank" });
      put("vault", 15, 2, { station: "bank" });
      put("atm", 3, 5, { station: "bank" });
      put("stock_board", 16, 6, { station: "stock" });
      put("sofa", 3, 10, { station: "rest" });
      put("planter", 2, 2);
      put("planter", 17, 12);
      put("lamp", 9, 1);
      break;
    }
    case "smith_workshop": {
      put("furnace", 3, 2, { station: "smith" });
      put("anvil", 6, 3, { station: "smith" });
      put("workbench", 9, 3, { station: "smith" });
      put("display_case", 13, 3, { station: "shop", genre: "smith" });
      put("crate", 16, 3, { station: "sell" });
      put("barrel", 16, 5, { station: "sell" });
      put("table_round", 4, 9, { station: "rest" });
      put("lamp", 7, 1);
      put("lamp", 12, 1);
      break;
    }
    case "city_hall": {
      put("bulletin_board", 4, 2, { station: "board" });
      put("guild_board", 14, 2, { station: "guild" });
      put("shop_counter", 8, 4, { station: "rest" });
      put("shop_counter", 9, 4, { station: "rest" });
      put("bookshelf", 2, 3, { station: "board" });
      put("bookshelf", 17, 3, { station: "guild" });
      put("sofa", 4, 10, { station: "rest" });
      put("sofa", 14, 10, { station: "rest" });
      put("planter", 2, 12);
      put("planter", 17, 12);
      put("lamp", 9, 1);
      break;
    }
    default: {
      put("bookshelf", 3, 2, { station: "rest" });
      put("table_round", 6, 5, { station: "rest" });
      put("chair", 5, 5, { solid: false });
      put("chair", 7, 5, { solid: false });
      put("sofa", 13, 4, { station: "rest" });
      put("crate", 16, 3, { station: "sell" });
      put("planter", 2, 2);
      put("planter", 17, 12);
      put("lamp", 10, 2);
      break;
    }
  }

  const blocked = new Set<string>();
  for (let y = 0; y < INTERIOR_H; y++) {
    for (let x = 0; x < INTERIOR_W; x++) {
      if (isSolidLobbyTile(tiles[y * INTERIOR_W + x])) {
        blocked.add(`${x},${y}`);
      }
    }
  }
  for (const o of objects) {
    if (!o.solid || isSeatSprite(o.sprite)) continue;
    for (let dy = 0; dy < o.h; dy++) {
      for (let dx = 0; dx < o.w; dx++) {
        blocked.add(`${o.x + dx},${o.y + dy}`);
      }
    }
  }

  // Assign indoor staff matching this building's citizen in settlement, or synthesize keeper
  const matchedCit =
    stl.citizens.find((c) => c.workBuildingTag === building.tag) ?? stl.citizens[0];
  const staffX =
    building.kind === "bank_kiosk" || building.kind === "city_hall"
      ? 9.5
      : building.kind === "smith_workshop"
        ? 7.5
        : building.kind === "vehicle_dealer" ||
            building.kind === "cafe" ||
            building.kind === "convenience"
          ? 4.5
          : 13.5;
  const staffY =
    building.kind === "bank_kiosk"
      ? 2.2
      : building.kind === "city_hall"
        ? 3.2
        : building.kind === "smith_workshop"
          ? 4.2
          : building.kind === "vehicle_dealer" ||
              building.kind === "cafe" ||
              building.kind === "convenience"
            ? 1.9
            : 5.5;

  const staff: SettlementInteriorStaff[] = matchedCit
    ? [
        {
          id: `${matchedCit.id}:indoor`,
          name: matchedCit.name,
          role: matchedCit.role,
          roleLabel: matchedCit.roleLabel,
          shirtColor: matchedCit.shirtColor,
          hairColor: matchedCit.hairColor,
          x: staffX,
          y: staffY,
          phrases: matchedCit.phrases,
          workBuildingKind: building.kind,
        },
      ]
    : [];

  const moveTiles = new Uint8Array(INTERIOR_W * INTERIOR_H);
  for (let i = 0; i < tiles.length; i++) {
    moveTiles[i] = isSolidLobbyTile(tiles[i]) ? T_ROCK : T_GRASS;
  }

  const data: LobbyData = {
    width: INTERIOR_W,
    height: INTERIOR_H,
    tiles,
    objects,
    npcs: staff.map((s) => ({ x: s.x, y: s.y })),
    blocked,
    moveMap: tilesSource(seed, INTERIOR_W, INTERIOR_H, moveTiles),
  };

  const spec: SettlementInteriorSpec = {
    space: settlementInteriorSpace(stl, building),
    settlement: stl,
    building,
    biomeTheme: stl.biomeTheme,
    data,
    entryPoint: { x: 10, y: 11.6 },
    exitMat: { x: 9, y: 13, w: 2, h: 1 },
    exteriorReturn: { x: building.porchX + 0.5, y: building.porchY + 0.5 },
    dealerBays,
    staff,
    accentColor: building.signColor,
    subtitle: `${stl.name} ・ ${stl.biomeLabel} ・ ${building.label}`,
  };

  if (interiorCache.size >= MAX_INTERIOR_CACHE) {
    const first = interiorCache.keys().next().value;
    if (first) interiorCache.delete(first);
  }
  interiorCache.set(cacheKey, spec);
  return spec;
}
