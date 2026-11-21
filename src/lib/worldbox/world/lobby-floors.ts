import { T_GRASS, T_ROCK, tilesSource } from "./mapgen";
import {
  L_CARPET,
  L_MARBLE,
  L_PLAZA,
  L_WALL,
  L_WOOD,
  LOBBY_2F_LANDING,
  LOBBY_STAIRS_2F,
  isSolidLobbyTile,
  type LobbyData,
  type LobbyObject,
  type LobbyStation,
  isSeatSprite,
} from "./lobby";
import type { ShopGenreId } from "../economy/shops";

export const LOBBY2_W = 40;
export const LOBBY2_H = 28;
export const LOBBY3_W = 32;
export const LOBBY3_H = 24;

const L2_CIRCLE = { cx: 20, cy: 14, r: 8 };

function inCircle2(cx: number, cy: number, r: number, x: number, y: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function inRect2(x0: number, y0: number, x1: number, y1: number, x: number, y: number): boolean {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

export function inLobby2Shape(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= LOBBY2_W || y >= LOBBY2_H) return false;
  if (inCircle2(L2_CIRCLE.cx, L2_CIRCLE.cy, L2_CIRCLE.r, x, y)) return true;
  if (inRect2(2, 9, 12, 19, x, y)) return true;
  if (inRect2(28, 9, 38, 19, x, y)) return true;
  if (inRect2(17, 3, 23, 7, x, y)) return true;
  if (inRect2(17, 21, 23, 25, x, y)) return true;
  return false;
}

function floor2At(x: number, y: number): number {
  let floor = L_MARBLE;
  if (inRect2(2, 9, 12, 19, x, y) || inRect2(28, 9, 38, 19, x, y)) floor = L_WOOD;
  if (inCircle2(L2_CIRCLE.cx, L2_CIRCLE.cy, L2_CIRCLE.r, x, y)) floor = L_CARPET;
  return floor;
}

const objects2: LobbyObject[] = [];
const occupied2 = new Set<string>();

type PutOpts = {
  w?: number;
  h?: number;
  solid?: boolean;
  station?: LobbyStation;
  genre?: ShopGenreId;
  arcade?: string;
};

function arcadeFields(sprite: string, opts: PutOpts): { station?: LobbyStation; arcade?: string } {
  if (!sprite.startsWith("arcade_")) return { station: opts.station, arcade: opts.arcade };
  return {
    station: opts.station ?? "arcade",
    arcade: opts.arcade ?? sprite.slice("arcade_".length),
  };
}

function put2(sprite: string, x: number, y: number, opts: PutOpts = {}): void {
  const w = opts.w ?? 1;
  const h = opts.h ?? 1;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const key = `${x + dx},${y + dy}`;
      if (occupied2.has(key)) throw new Error(`lobby2 object overlap at ${key} (${sprite})`);
      occupied2.add(key);
    }
  }
  const af = arcadeFields(sprite, opts);
  objects2.push({
    sprite,
    x,
    y,
    w,
    h,
    solid: opts.solid ?? true,
    station: af.station,
    genre: opts.genre,
    arcade: af.arcade,
  });
}

put2("stairs", 19, 4, { solid: false });
put2("stairs", 20, 4, { solid: false });
put2("stairs", 19, 24, { solid: false });
put2("stairs", 20, 24, { solid: false });

put2("planter", 20, 8);
put2("pillar", 15, 11);
put2("pillar", 25, 11);
put2("pillar", 15, 17);
put2("pillar", 25, 17);
put2("bench", 17, 12);
put2("bench", 18, 12);
put2("bench", 22, 12);
put2("bench", 23, 12);
put2("table_round", 20, 14);
put2("chair", 19, 14);
put2("chair", 21, 14);
put2("lamp", 18, 6);
put2("lamp", 22, 6);
put2("lamp", 18, 22);
put2("lamp", 22, 22);

put2("arcade_reversi", 15, 9);
put2("arcade_connect4", 17, 9);
put2("arcade_battleship", 19, 9);
put2("arcade_werewolf", 21, 9);
put2("arcade_wordwolf", 23, 9);
put2("arcade_majority", 25, 9);

put2("arcade_territory", 15, 19);
put2("arcade_drawguess", 17, 19);
put2("arcade_daifugo", 19, 19);
put2("arcade_babanuki", 21, 19);
put2("arcade_quizbattle", 23, 19);
put2("arcade_bombpass", 25, 19);

put2("bench", 4, 11);
put2("bench", 5, 11);
put2("table_round", 7, 14);
put2("sofa", 4, 17);
put2("chair", 5, 17);
put2("planter", 11, 10);
put2("lamp", 3, 18);
put2("lamp", 11, 18);

put2("bookshelf", 31, 11, { station: "rest" });
put2("bookshelf", 32, 11, { station: "rest" });
put2("bookshelf", 33, 11, { station: "rest" });
put2("sofa", 35, 17, { station: "rest" });
put2("table_round", 34, 17);
put2("chair", 35, 18);
put2("planter", 29, 18);
put2("lamp", 37, 10);
put2("tapestry", 37, 14, { solid: false });

export const LOBBY2_OBJECTS: readonly LobbyObject[] = objects2;

export const LOBBY2_ENTRY = { x: 19.5, y: 6.5 };
export const LOBBY2_STAIRS_DOWN: readonly { x: number; y: number }[] = [
  { x: 19, y: 4 },
  { x: 20, y: 4 },
];
export const LOBBY2_STAIRS_UP: readonly { x: number; y: number }[] = [
  { x: 19, y: 24 },
  { x: 20, y: 24 },
];
export const LOBBY2_UP_LANDING = { x: 19.5, y: 22.5 };

export function lobby2TileAt(tiles: Uint8Array, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= LOBBY2_W || y >= LOBBY2_H) return 0;
  return tiles[y * LOBBY2_W + x];
}

let cached2: LobbyData | null = null;

export function buildLobby2(): LobbyData {
  if (cached2) return cached2;
  const tiles = new Uint8Array(LOBBY2_W * LOBBY2_H);
  for (let y = 0; y < LOBBY2_H; y++) {
    for (let x = 0; x < LOBBY2_W; x++) {
      if (!inLobby2Shape(x, y)) continue;
      const boundary =
        !inLobby2Shape(x - 1, y) ||
        !inLobby2Shape(x + 1, y) ||
        !inLobby2Shape(x, y - 1) ||
        !inLobby2Shape(x, y + 1);
      tiles[y * LOBBY2_W + x] = boundary ? L_WALL : floor2At(x, y);
    }
  }
  const blocked = new Set<string>();
  for (const o of LOBBY2_OBJECTS) {
    for (let dy = 0; dy < o.h; dy++) {
      for (let dx = 0; dx < o.w; dx++) {
        if (tiles[(o.y + dy) * LOBBY2_W + o.x + dx] === L_WALL) {
          throw new Error(`lobby2 object on wall at ${o.x + dx},${o.y + dy} (${o.sprite})`);
        }
      }
    }
    if (!o.solid) continue;
    if (isSeatSprite(o.sprite)) continue;
    for (let dy = 0; dy < o.h; dy++) {
      for (let dx = 0; dx < o.w; dx++) blocked.add(`${o.x + dx},${o.y + dy}`);
    }
  }
  const moveTiles = new Uint8Array(LOBBY2_W * LOBBY2_H);
  for (let i = 0; i < tiles.length; i++) {
    moveTiles[i] = isSolidLobbyTile(tiles[i]) ? T_ROCK : T_GRASS;
  }
  cached2 = {
    width: LOBBY2_W,
    height: LOBBY2_H,
    tiles,
    objects: LOBBY2_OBJECTS,
    npcs: [],
    blocked,
    moveMap: tilesSource(0, LOBBY2_W, LOBBY2_H, moveTiles),
  };
  return cached2;
}

const L3_CIRCLE = { cx: 16, cy: 13, r: 9 };

function inCircle3(cx: number, cy: number, r: number, x: number, y: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function inRect3(x0: number, y0: number, x1: number, y1: number, x: number, y: number): boolean {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

export function inLobby3Shape(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= LOBBY3_W || y >= LOBBY3_H) return false;
  if (inCircle3(L3_CIRCLE.cx, L3_CIRCLE.cy, L3_CIRCLE.r, x, y)) return true;
  if (inRect3(10, 2, 22, 5, x, y)) return true;
  return false;
}

function dist3Sq(cx: number, cy: number, x: number, y: number): number {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy;
}

function floor3At(x: number, y: number): number {
  let floor = L_MARBLE;
  if (inRect3(10, 2, 22, 5, x, y)) floor = L_WOOD;
  if (inCircle3(L3_CIRCLE.cx, L3_CIRCLE.cy, L3_CIRCLE.r, x, y)) {
    floor = dist3Sq(L3_CIRCLE.cx, L3_CIRCLE.cy, x, y) <= 16 ? L_PLAZA : L_MARBLE;
  }
  return floor;
}

const objects3: LobbyObject[] = [];
const occupied3 = new Set<string>();

function put3(sprite: string, x: number, y: number, opts: PutOpts = {}): void {
  const w = opts.w ?? 1;
  const h = opts.h ?? 1;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const key = `${x + dx},${y + dy}`;
      if (occupied3.has(key)) throw new Error(`lobby3 object overlap at ${key} (${sprite})`);
      occupied3.add(key);
    }
  }
  const af = arcadeFields(sprite, opts);
  objects3.push({
    sprite,
    x,
    y,
    w,
    h,
    solid: opts.solid ?? true,
    station: af.station,
    genre: opts.genre,
    arcade: af.arcade,
  });
}

put3("stairs", 15, 3, { solid: false });
put3("stairs", 16, 3, { solid: false });

put3("bench", 11, 3);
put3("bench", 12, 3);
put3("bench", 20, 3);
put3("bench", 21, 3);
put3("telescope", 18, 4, { station: "telescope" });
put3("bookshelf", 13, 4);
put3("bookshelf", 14, 4);
put3("planter", 11, 4);
put3("planter", 21, 4);
put3("hedge", 12, 5);
put3("hedge", 20, 5);

put3("lamp", 11, 9);
put3("lamp", 21, 9);
put3("lamp", 11, 17);
put3("lamp", 21, 17);

put3("arcade_shiritori", 9, 10);
put3("arcade_nanja", 9, 12);
put3("arcade_liarsdice", 9, 14);
put3("arcade_cheat", 9, 16);
put3("arcade_hagetaka", 23, 10);
put3("arcade_burst", 23, 12);
put3("arcade_texas", 23, 14);
put3("arcade_countdown", 23, 16);
put3("arcade_musicalchairs", 10, 18);
put3("arcade_wordbasket", 12, 18);
put3("arcade_speed", 20, 18);
put3("arcade_typerace", 22, 18);
put3("arcade_calcrace", 17, 3);
put3("arcade_stopbattle", 19, 3);

put3("sofa", 14, 19, { station: "rest" });
put3("table_round", 15, 19);
put3("chair", 16, 19);
put3("bookshelf", 18, 19, { station: "rest" });

export const LOBBY3_OBJECTS: readonly LobbyObject[] = objects3;

export const LOBBY3_ENTRY = { x: 15.5, y: 5.5 };
export const LOBBY3_STAIRS_DOWN: readonly { x: number; y: number }[] = [
  { x: 15, y: 3 },
  { x: 16, y: 3 },
];
export const LOBBY3_DOWN_LANDING = { x: 19.5, y: 22.5 };

export function lobby3TileAt(tiles: Uint8Array, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= LOBBY3_W || y >= LOBBY3_H) return 0;
  return tiles[y * LOBBY3_W + x];
}

let cached3: LobbyData | null = null;

export function buildLobby3(): LobbyData {
  if (cached3) return cached3;
  const tiles = new Uint8Array(LOBBY3_W * LOBBY3_H);
  for (let y = 0; y < LOBBY3_H; y++) {
    for (let x = 0; x < LOBBY3_W; x++) {
      if (!inLobby3Shape(x, y)) continue;
      const boundary =
        !inLobby3Shape(x - 1, y) ||
        !inLobby3Shape(x + 1, y) ||
        !inLobby3Shape(x, y - 1) ||
        !inLobby3Shape(x, y + 1);
      tiles[y * LOBBY3_W + x] = boundary ? L_WALL : floor3At(x, y);
    }
  }
  const blocked = new Set<string>();
  for (const o of LOBBY3_OBJECTS) {
    for (let dy = 0; dy < o.h; dy++) {
      for (let dx = 0; dx < o.w; dx++) {
        if (tiles[(o.y + dy) * LOBBY3_W + o.x + dx] === L_WALL) {
          throw new Error(`lobby3 object on wall at ${o.x + dx},${o.y + dy} (${o.sprite})`);
        }
      }
    }
    if (!o.solid) continue;
    if (isSeatSprite(o.sprite)) continue;
    for (let dy = 0; dy < o.h; dy++) {
      for (let dx = 0; dx < o.w; dx++) blocked.add(`${o.x + dx},${o.y + dy}`);
    }
  }
  const moveTiles = new Uint8Array(LOBBY3_W * LOBBY3_H);
  for (let i = 0; i < tiles.length; i++) {
    moveTiles[i] = isSolidLobbyTile(tiles[i]) ? T_ROCK : T_GRASS;
  }
  cached3 = {
    width: LOBBY3_W,
    height: LOBBY3_H,
    tiles,
    objects: LOBBY3_OBJECTS,
    npcs: [],
    blocked,
    moveMap: tilesSource(0, LOBBY3_W, LOBBY3_H, moveTiles),
  };
  return cached3;
}

export type LobbyFloorSpace = "lobby" | "lobby2" | "lobby3";

export type FloorWarp = { to: LobbyFloorSpace; entry: { x: number; y: number } };

const onTiles = (tiles: readonly { x: number; y: number }[], tx: number, ty: number): boolean =>
  tiles.some((t) => t.x === tx && t.y === ty);

export function floorWarpAt(space: string, tx: number, ty: number): FloorWarp | null {
  if (space === "lobby") {
    if (onTiles(LOBBY_STAIRS_2F, tx, ty)) return { to: "lobby2", entry: LOBBY2_ENTRY };
    return null;
  }
  if (space === "lobby2") {
    if (onTiles(LOBBY2_STAIRS_DOWN, tx, ty)) return { to: "lobby", entry: LOBBY_2F_LANDING };
    if (onTiles(LOBBY2_STAIRS_UP, tx, ty)) return { to: "lobby3", entry: LOBBY3_ENTRY };
    return null;
  }
  if (space === "lobby3") {
    if (onTiles(LOBBY3_STAIRS_DOWN, tx, ty)) return { to: "lobby2", entry: LOBBY2_UP_LANDING };
    return null;
  }
  return null;
}
