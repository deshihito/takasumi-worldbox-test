import { T_GRASS, T_ROCK, tilesSource } from "./mapgen";
import {
  L_CHECK,
  L_CONCRETE,
  L_DARK,
  L_VOID,
  L_WALL,
  L_WOOD,
  isSolidLobbyTile,
  isSeatSprite,
  type LobbyData,
  type LobbyObject,
  type LobbyStation,
} from "./lobby";

export const PRISON_W = 44;
export const PRISON_H = 32;

export const PRISON_CELLS: readonly { id: string; x: number; y: number }[] = [
  { id: "A-101", x: 5.5, y: 6.5 },
  { id: "A-102", x: 11.5, y: 6.5 },
  { id: "B-201", x: 5.5, y: 12.5 },
  { id: "B-202", x: 11.5, y: 12.5 },
];

export const PRISON_VISITOR_ENTRY = { x: 22.5, y: 26.5 };

export function prisonCellEntry(cellId: string | null | undefined): { x: number; y: number } {
  const found = PRISON_CELLS.find((c) => c.id === cellId);
  return found ? { x: found.x, y: found.y } : PRISON_CELLS[0];
}

function inPrisonRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x: number,
  y: number,
): boolean {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

export function inPrisonShape(x: number, y: number): boolean {
  return x >= 1 && x <= PRISON_W - 2 && y >= 1 && y <= PRISON_H - 2;
}

function floorPrisonAt(x: number, y: number): number {
  // West cellblocks: dark slate steel floor
  if (inPrisonRect(2, 2, 15, 16, x, y)) {
    // Wall dividers between cells A-101 / A-102 / B-201 / B-202 with doorway openings
    if (
      (x === 8 && y >= 3 && y <= 14 && y !== 9 && y !== 10) ||
      (y === 9 && x >= 3 && x <= 14 && x !== 5 && x !== 11)
    ) {
      return L_WALL;
    }
    return L_DARK;
  }
  // North center: Warden / Justice Terminal (checkered floor)
  if (inPrisonRect(17, 2, 27, 10, x, y)) {
    return L_CHECK;
  }
  // South center: Cafeteria / Visiting Lounge
  if (inPrisonRect(15, 20, 29, 29, x, y)) {
    return L_WOOD;
  }
  // Secret Maintenance Alcove (South-West corner)
  if (inPrisonRect(2, 21, 9, 29, x, y)) {
    if (x === 9 && y >= 21 && y <= 29 && y !== 25) return L_WALL;
    return L_DARK;
  }
  return L_CONCRETE;
}

const pObjects: LobbyObject[] = [];
const pOccupied = new Set<string>();

function putPrison(
  sprite: string,
  x: number,
  y: number,
  opts: { w?: number; h?: number; solid?: boolean; station?: LobbyStation } = {},
): void {
  const w = opts.w ?? 1;
  const h = opts.h ?? 1;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const k = `${x + dx},${y + dy}`;
      if (pOccupied.has(k)) throw new Error(`prison object overlap at ${k} (${sprite})`);
      pOccupied.add(k);
    }
  }
  pObjects.push({
    sprite,
    x,
    y,
    w,
    h,
    solid: opts.solid ?? true,
    station: opts.station,
  });
}

function buildPrisonObjects(): readonly LobbyObject[] {
  if (pObjects.length > 0) return pObjects;

  // Cellblock A-101, A-102, B-201, B-202 beds & cell bars (with open walkways!)
  putPrison("prison_bed", 3, 4);
  putPrison("prison_bed", 13, 4);
  putPrison("prison_bed", 3, 12);
  putPrison("prison_bed", 13, 12);
  // Bars along cellblock corridor perimeter leaving open corridor at y=8..9 and x=15
  putPrison("prison_bars", 15, 3);
  putPrison("prison_bars", 15, 4);
  putPrison("prison_bars", 15, 5);
  putPrison("prison_bars", 15, 7);
  putPrison("prison_bars", 15, 11);
  putPrison("prison_bars", 15, 13);
  putPrison("prison_bars", 15, 14);
  putPrison("prison_bars", 15, 15);
  // Decorative lamps inside cells & corridors
  putPrison("lamp", 7, 4);
  putPrison("lamp", 10, 4);
  putPrison("lamp", 17, 13);
  putPrison("lamp", 27, 13);

  // Warden / Justice & Bail Office (Center North)
  putPrison("prison_desk", 21, 5, { station: "prison_desk" });
  putPrison("prison_desk", 22, 5, { station: "prison_desk" });
  putPrison("bookshelf", 19, 3);
  putPrison("bookshelf", 25, 3);
  putPrison("vault", 20, 3);
  putPrison("vault", 24, 3);

  // Prison Workshop & Industrial Labor Press Zone (East Wing)
  putPrison("work_press", 33, 6, { station: "prison_work" });
  putPrison("work_press", 36, 6, { station: "prison_work" });
  putPrison("work_press", 33, 12, { station: "prison_work" });
  putPrison("work_press", 36, 12, { station: "prison_work" });
  putPrison("anvil", 39, 9, { station: "prison_work" });
  putPrison("crate", 31, 4);
  putPrison("crate", 32, 4);
  putPrison("crate", 39, 4);
  putPrison("barrel", 39, 15);
  putPrison("barrel", 40, 15);

  // Quarry / Exercise Bench Area (South-East)
  putPrison("bench", 33, 22, { w: 2, solid: false });
  putPrison("bench", 33, 25, { w: 2, solid: false });
  putPrison("planter", 31, 21);
  putPrison("planter", 38, 21);

  // Cafeteria, Commissary & Visiting Booth (South Center)
  putPrison("table_round", 20, 23);
  putPrison("chair", 19, 23, { solid: false });
  putPrison("chair", 21, 23, { solid: false });
  putPrison("table_round", 24, 23);
  putPrison("chair", 23, 23, { solid: false });
  putPrison("chair", 25, 23, { solid: false });
  putPrison("vending", 27, 21);
  putPrison("shop_counter", 17, 26, { station: "prison_visit" });
  putPrison("shop_counter", 18, 26, { station: "prison_visit" });
  putPrison("bulletin_board", 25, 27, { station: "prison_desk" });

  // Secret Ventilation / Escape Duct (South-West Alcove)
  putPrison("crate", 3, 23);
  putPrison("barrel", 3, 24);
  putPrison("vent_grate", 4, 27, { solid: false, station: "prison_escape" });

  return pObjects;
}

export function prisonDistrictAt(x: number, y: number): string {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (inPrisonRect(2, 2, 15, 16, tx, ty)) return "独房・収監ブロック (A/B棟)";
  if (inPrisonRect(17, 2, 27, 10, tx, ty)) return "看守指令室・保釈カウンター";
  if (inPrisonRect(30, 3, 41, 17, tx, ty)) return "懲役作業ファクトリー";
  if (inPrisonRect(30, 19, 41, 29, tx, ty)) return "矯正運動場・採石ヤード";
  if (inPrisonRect(15, 20, 29, 29, tx, ty)) return "食堂・面会カウンタールーム";
  if (inPrisonRect(2, 21, 9, 29, tx, ty)) return "地下メンテナンス通路";
  return "タカスミ中央刑務所・中央ホール";
}

export function prisonTileAt(tiles: Uint8Array, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= PRISON_W || y >= PRISON_H) return L_VOID;
  return tiles[y * PRISON_W + x];
}

let cachedPrison: LobbyData | null = null;

export function buildPrison(): LobbyData {
  if (cachedPrison) return cachedPrison;
  const tiles = new Uint8Array(PRISON_W * PRISON_H);
  for (let y = 0; y < PRISON_H; y++) {
    for (let x = 0; x < PRISON_W; x++) {
      if (!inPrisonShape(x, y)) continue;
      const boundary =
        !inPrisonShape(x - 1, y) ||
        !inPrisonShape(x + 1, y) ||
        !inPrisonShape(x, y - 1) ||
        !inPrisonShape(x, y + 1);
      tiles[y * PRISON_W + x] = boundary ? L_WALL : floorPrisonAt(x, y);
    }
  }
  const objs = buildPrisonObjects();
  const blocked = new Set<string>();
  for (const o of objs) {
    for (let dy = 0; dy < o.h; dy++) {
      for (let dx = 0; dx < o.w; dx++) {
        const tx = o.x + dx;
        const ty = o.y + dy;
        const t = prisonTileAt(tiles, tx, ty);
        if (t === L_WALL || t === L_VOID) {
          throw new Error(`prison object on wall/void at ${tx},${ty} (${o.sprite})`);
        }
      }
    }
    if (!o.solid || isSeatSprite(o.sprite)) continue;
    for (let dy = 0; dy < o.h; dy++) {
      for (let dx = 0; dx < o.w; dx++) blocked.add(`${o.x + dx},${o.y + dy}`);
    }
  }
  const moveTiles = new Uint8Array(PRISON_W * PRISON_H);
  for (let i = 0; i < tiles.length; i++) {
    moveTiles[i] = isSolidLobbyTile(tiles[i]) ? T_ROCK : T_GRASS;
  }
  cachedPrison = {
    width: PRISON_W,
    height: PRISON_H,
    tiles,
    objects: objs,
    npcs: [
      { x: 21, y: 7 }, // 刑務所長・看守
      { x: 31, y: 8 }, // 作業監督官
      { x: 18, y: 27 }, // 面会受付係
    ],
    blocked,
    moveMap: tilesSource(0, PRISON_W, PRISON_H, moveTiles),
  };
  return cachedPrison;
}
