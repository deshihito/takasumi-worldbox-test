import { CHUNK_SIZE, T_GRASS, T_ROCK, tilesSource, type TopDownMap } from "./mapgen";
import {
  L_CHECK,
  L_MARBLE,
  L_VOID,
  L_WALL,
  L_WOOD,
  isSeatSprite,
  isSolidLobbyTile,
  type LobbyData,
  type LobbyObject,
} from "./lobby";
import type { TileOverridesMap } from "./tiles";

export type ZoneType = "residential" | "commercial" | "industrial";

export interface PropertyDeed {
  chunkKey: string; // "cx,cy"
  cx: number;
  cy: number;
  zone: ZoneType;
  ownerKey: string;
  ownerName: string;
  tenantKey: string | null;
  tenantName: string | null;
  rentPerHour: number;
  lastRentAt: number;
  claimedAt: number;
  name: string;
}

export type ApartmentTierId = "studio" | "penthouse" | "commercial_office";

export interface ApartmentUnitDef {
  id: ApartmentTierId;
  name: string;
  price: number;
  hourlyPassiveRent: number;
  desc: string;
}

export const APARTMENT_TIERS: readonly ApartmentUnitDef[] = [
  {
    id: "studio",
    name: "メトロ・レジデンス 1K",
    price: 12000,
    hourlyPassiveRent: 180,
    desc: "作業台・収納完備の都市型スマートワンルーム",
  },
  {
    id: "commercial_office",
    name: "商業テナントオフィス",
    price: 28000,
    hourlyPassiveRent: 460,
    desc: "金融・制作ステーション付きの企業向け貸出オフィス",
  },
  {
    id: "penthouse",
    name: "タカスミ・スカイペントハウス",
    price: 65000,
    hourlyPassiveRent: 1200,
    desc: "大理石フロア＆最高級資産評価を得る超高層住居",
  },
];

export interface ApartmentOwnership {
  unitId: string; // "unit:<id>" -> space = "apartment:<id>"
  tier: ApartmentTierId;
  ownerKey: string;
  ownerName: string;
  purchasedAt: number;
  lastIncomeAt: number;
}

export const CHUNK_DEED_BASE_PRICE = 8000;
export const APARTMENT_W = 24;
export const APARTMENT_H = 18;
export const APARTMENT_ENTRY = { x: 12.5, y: 15.5 };
export const APARTMENT_EXIT = { x: 12, y: 16 };
export const APARTMENT_SPACE_REGEX = /^apartment:([a-zA-Z0-9_-]{1,24})$/;

export function parseApartmentSpace(space: string): string | null {
  const m = APARTMENT_SPACE_REGEX.exec(space);
  return m ? m[1] : null;
}

export function chunkKeyFromWorld(x: number, y: number): { cx: number; cy: number; key: string } {
  const cx = Math.floor(Math.floor(x) / CHUNK_SIZE);
  const cy = Math.floor(Math.floor(y) / CHUNK_SIZE);
  return { cx, cy, key: `${cx},${cy}` };
}

export function computeChunkValuation(
  cx: number,
  cy: number,
  overrides: TileOverridesMap,
  zone: ZoneType = "residential",
): number {
  let score = CHUNK_DEED_BASE_PRICE;
  const x0 = cx * CHUNK_SIZE;
  const y0 = cy * CHUNK_SIZE;
  for (let dy = 0; dy < CHUNK_SIZE; dy++) {
    for (let dx = 0; dx < CHUNK_SIZE; dx++) {
      const ov = overrides[`${x0 + dx},${y0 + dy}`];
      if (!ov?.block) continue;
      const id = ov.block.itemId;
      if (id === "path_block") score += 120;
      else if (id === "smart_vending" || id === "power_generator") score += 2800;
      else if (id === "cnc_factory" || id === "auto_miner" || id === "custom_machine")
        score += 2200;
      else score += 350;
    }
  }
  const zoneMult = zone === "commercial" ? 1.3 : zone === "industrial" ? 1.2 : 1.0;
  return Math.round(score * zoneMult);
}

export function parsePropertyDeed(raw: unknown): PropertyDeed | null {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const v = data as Record<string, unknown>;
  if (typeof v.chunkKey !== "string" || typeof v.ownerKey !== "string") return null;
  const parts = v.chunkKey.split(",").map(Number);
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  const zone: ZoneType =
    v.zone === "commercial" || v.zone === "industrial" ? v.zone : "residential";
  return {
    chunkKey: v.chunkKey,
    cx: parts[0],
    cy: parts[1],
    zone,
    ownerKey: v.ownerKey,
    ownerName: typeof v.ownerName === "string" ? v.ownerName.slice(0, 24) : "地主",
    tenantKey: typeof v.tenantKey === "string" ? v.tenantKey : null,
    tenantName: typeof v.tenantName === "string" ? v.tenantName.slice(0, 24) : null,
    rentPerHour:
      typeof v.rentPerHour === "number" && Number.isFinite(v.rentPerHour)
        ? Math.max(0, Math.min(50_000, Math.floor(v.rentPerHour)))
        : 200,
    lastRentAt: typeof v.lastRentAt === "number" ? v.lastRentAt : 0,
    claimedAt: typeof v.claimedAt === "number" ? v.claimedAt : 0,
    name:
      typeof v.name === "string" && v.name
        ? v.name.slice(0, 28)
        : `区画 (${parts[0]}, ${parts[1]})`,
  };
}

export function computeRealEstateCollateral(
  ownerKey: string,
  deeds: readonly PropertyDeed[],
  apartments: readonly ApartmentOwnership[],
  overrides: TileOverridesMap,
): number {
  let total = 0;
  for (const d of deeds) {
    if (d.ownerKey === ownerKey) {
      total += computeChunkValuation(d.cx, d.cy, overrides, d.zone);
    }
  }
  for (const apt of apartments) {
    if (apt.ownerKey === ownerKey) {
      const def = APARTMENT_TIERS.find((t) => t.id === apt.tier);
      if (def) total += def.price;
    }
  }
  return total;
}

const apartmentCache = new Map<ApartmentTierId, LobbyData>();

export function buildApartment(tier: ApartmentTierId = "studio"): LobbyData {
  const existing = apartmentCache.get(tier);
  if (existing) return existing;

  const tiles = new Uint8Array(APARTMENT_W * APARTMENT_H);
  for (let y = 0; y < APARTMENT_H; y++) {
    for (let x = 0; x < APARTMENT_W; x++) {
      const border = x === 0 || y === 0 || x === APARTMENT_W - 1 || y === APARTMENT_H - 1;
      const door = x === APARTMENT_EXIT.x && y === APARTMENT_EXIT.y + 1;
      if (border && !door) tiles[y * APARTMENT_W + x] = L_WALL;
      else if (tier === "penthouse")
        tiles[y * APARTMENT_W + x] = (x + y) % 2 === 0 ? L_MARBLE : L_CHECK;
      else if (tier === "commercial_office") tiles[y * APARTMENT_W + x] = L_CHECK;
      else tiles[y * APARTMENT_W + x] = L_WOOD;
    }
  }

  const objects: LobbyObject[] = [
    { sprite: "workbench", x: 3, y: 2, w: 1, h: 1, solid: true, station: "smith" },
    { sprite: "furnace", x: 5, y: 2, w: 1, h: 1, solid: true, station: "smith" },
    { sprite: "atm", x: 18, y: 2, w: 1, h: 1, solid: true, station: "bank" },
    { sprite: "stock_board", x: 20, y: 2, w: 1, h: 1, solid: true, station: "stock" },
    { sprite: "sofa", x: 10, y: 7, w: 2, h: 1, solid: false, station: "rest" },
    { sprite: "table_round", x: 11, y: 9, w: 1, h: 1, solid: true },
    { sprite: "bookshelf", x: 2, y: 8, w: 1, h: 1, solid: true },
    { sprite: "vending", x: 21, y: 8, w: 1, h: 1, solid: true },
    { sprite: "lamp", x: 2, y: 15, w: 1, h: 1, solid: true },
    { sprite: "lamp", x: 21, y: 15, w: 1, h: 1, solid: true },
    { sprite: "warp_pad", x: APARTMENT_EXIT.x, y: APARTMENT_EXIT.y, w: 1, h: 1, solid: false },
  ];

  const blocked = new Set<string>();
  for (const o of objects) {
    if (!o.solid || isSeatSprite(o.sprite)) continue;
    for (let dy = 0; dy < o.h; dy++) {
      for (let dx = 0; dx < o.w; dx++) blocked.add(`${o.x + dx},${o.y + dy}`);
    }
  }

  const moveTiles = new Uint8Array(APARTMENT_W * APARTMENT_H);
  for (let i = 0; i < tiles.length; i++) {
    moveTiles[i] = isSolidLobbyTile(tiles[i]) ? T_ROCK : T_GRASS;
  }

  const data: LobbyData = {
    width: APARTMENT_W,
    height: APARTMENT_H,
    tiles,
    objects,
    npcs: [],
    blocked,
    moveMap: tilesSource(0, APARTMENT_W, APARTMENT_H, moveTiles),
  };
  apartmentCache.set(tier, data);
  return data;
}

export function apartmentTileAt(tiles: Uint8Array, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= APARTMENT_W || y >= APARTMENT_H) return L_VOID;
  return tiles[y * APARTMENT_W + x];
}
