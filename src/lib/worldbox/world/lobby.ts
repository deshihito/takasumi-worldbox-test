import { T_GRASS, T_ROCK, tilesSource, type TopDownMap } from "./mapgen";
import type { ShopGenreId } from "../economy/shops";

export const SEAT_SPRITES: ReadonlySet<string> = new Set(["bench", "chair", "sofa"]);

export function isSeatSprite(sprite: string): boolean {
  return SEAT_SPRITES.has(sprite);
}

export const LOBBY_W = 156;
export const LOBBY_H = 92;

export const L_VOID = 0;
export const L_WALL = 1;
export const L_MARBLE = 2;
export const L_PLAZA = 3;
export const L_RING = 4;
export const L_CARPET = 5;
export const L_WOOD = 6;
export const L_SAND = 7;
export const L_DARK = 8;
export const L_CHECK = 9;
export const L_CONCRETE = 10;

export const LOBBY_FLOOR_SPRITE: Record<number, string | null> = {
  [L_WALL]: "wall_stone",
  [L_MARBLE]: "floor_marble",
  [L_PLAZA]: "floor_marble",
  [L_RING]: "carpet_red",
  [L_CARPET]: "carpet_plain",
  [L_WOOD]: "floor_wood",
  [L_SAND]: null,
  [L_DARK]: "floor_marble_dark",
  [L_CHECK]: "floor_check",
  [L_CONCRETE]: "floor_concrete",
};

export const LOBBY_FLOOR_FALLBACK: Record<number, string> = {
  [L_WALL]: "#5c6076",
  [L_MARBLE]: "#e4e2de",
  [L_PLAZA]: "#eceae6",
  [L_RING]: "#922a34",
  [L_CARPET]: "#922a34",
  [L_WOOD]: "#ac7c4e",
  [L_SAND]: "#ddd29a",
  [L_DARK]: "#434854",
  [L_CHECK]: "#cfd0d4",
  [L_CONCRETE]: "#666e7b",
};

export function isSolidLobbyTile(id: number): boolean {
  return id === L_VOID || id === L_WALL;
}

const PLAZA = { cx: 28, cy: 24, r: 11 };
const APSE = { cx: 28, cy: 10, r: 10 };
const SMITH_CIRCLE = { cx: 28, cy: 39, r: 4 };

export const RACETRACK = { cx: 93, cy: 26, rx: 29, ry: 18, innerRx: 24, innerRy: 13 };
export const RACE_CORRIDOR = { x0: 54, y0: 21, x1: 59, y1: 27 };
export const RACECOURSE = { x0: 60, y0: 4, x1: 125, y1: 47 };

function ellipseRatio(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  x: number,
  y: number,
): number {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy;
}

export function isRaceTrackTile(x: number, y: number): boolean {
  return (
    ellipseRatio(RACETRACK.cx, RACETRACK.cy, RACETRACK.rx, RACETRACK.ry, x, y) <= 1 &&
    ellipseRatio(RACETRACK.cx, RACETRACK.cy, RACETRACK.innerRx, RACETRACK.innerRy, x, y) >= 1
  );
}

export function isRaceInfieldTile(x: number, y: number): boolean {
  return ellipseRatio(RACETRACK.cx, RACETRACK.cy, RACETRACK.innerRx, RACETRACK.innerRy, x, y) < 1;
}

function inCircle(cx: number, cy: number, r: number, x: number, y: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function inRect(x0: number, y0: number, x1: number, y1: number, x: number, y: number): boolean {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

const INTERIOR_COURTYARDS: readonly [number, number, number, number][] = [
  [9, 8, 13, 11], // 北西・グルメ夜市の中庭
  [46, 8, 50, 11], // 北東・金融取引街の金庫中庭
  [28, 53, 32, 57], // エメラルド迷宮・西アトリウム
  [38, 58, 42, 62], // エメラルド迷宮・南中庭（40,60 VOID保持）
  [50, 52, 54, 56], // エメラルド迷宮・東アトリウム
  [30, 74, 34, 79], // 祭り小路・西入り江
  [46, 75, 51, 80], // 祭り小路・東入り江
  [8, 76, 14, 83], // ハーバー桟橋・中央ラグーン
  [136, 16, 145, 36], // 東回廊リゾート・大中庭
  [71, 56, 76, 61], // ロイヤル迷宮・西石庭
  [85, 67, 92, 74], // ロイヤル迷宮・王立中庭
  [102, 76, 109, 82], // 商業アトリウム・石庭
  [122, 56, 129, 64], // サンセット城・北堀（125,60 VOID保持）
  [136, 70, 144, 78], // 屋外劇場・内庭
  [59, 80, 66, 85], // ハーバー南東・入り江石庭
  [74, 80, 81, 86], // 南バラ庭園・中庭
  [96, 54, 98, 61], // ロイヤル迷宮・商業街の境界柱中庭
  [114, 76, 118, 83], // 商業東・回廊石庭
  [128, 70, 132, 74], // サンセット城・西回廊石庭
];

export function inLobbyShape(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= LOBBY_W || y >= LOBBY_H) return false;

  // 擬似2F（ギルドモール）は周囲2タイル以上の VOID で 1F と完全分離する
  if (inRect(2, 48, 19, 63, x, y)) return true;
  if (inRect(0, 46, 21, 66, x, y)) return false;

  for (const [x0, y0, x1, y1] of INTERIOR_COURTYARDS) {
    if (inRect(x0, y0, x1, y1, x, y)) return false;
  }

  // コロッセオ・中央噴水広場・東西翼・鍛冶場（従来アンカー領域）
  if (y <= APSE.cy && inCircle(APSE.cx, APSE.cy, APSE.r, x, y)) return true;
  if (inRect(26, 8, 30, 15, x, y)) return true;
  if (inCircle(PLAZA.cx, PLAZA.cy, PLAZA.r, x, y)) return true;
  if (inRect(2, 18, 19, 30, x, y)) return true;
  if (inRect(37, 18, 53, 30, x, y)) return true;
  if (inRect(24, 34, 32, 41, x, y)) return true;
  if (inCircle(SMITH_CIRCLE.cx, SMITH_CIRCLE.cy, SMITH_CIRCLE.r, x, y)) return true;

  // 北西・グルメ夜市通り ＆ アーチ連絡橋
  if (inRect(2, 4, 22, 16, x, y)) return true;
  if (inRect(6, 15, 8, 19, x, y)) return true;
  if (inRect(14, 15, 17, 19, x, y)) return true;
  if (inRect(20, 10, 24, 14, x, y)) return true;

  // 北東・金融株式取引街 ＆ アーチ連絡橋
  if (inRect(39, 4, 58, 16, x, y)) return true;
  if (inRect(34, 10, 40, 14, x, y)) return true;
  if (inRect(43, 15, 46, 19, x, y)) return true;
  if (inRect(57, 7, 61, 11, x, y)) return true;

  // 鍛冶場ツイン回廊・カジノ南プロムナード
  if (inRect(22, 36, 25, 49, x, y)) return true;
  if (inRect(31, 36, 36, 49, x, y)) return true;
  if (inRect(44, 29, 51, 49, x, y)) return true;

  // 中央南・エメラルド迷宮庭園
  if (inRect(22, 48, 59, 69, x, y)) return true;

  // 南西・ハーバー祭り小路＆桟橋
  if (inRect(22, 68, 59, 90, x, y)) return true;
  if (inRect(2, 70, 23, 90, x, y)) return true;

  // 競馬場・連絡通路
  if (inRect(RACE_CORRIDOR.x0, RACE_CORRIDOR.y0, RACE_CORRIDOR.x1, RACE_CORRIDOR.y1, x, y))
    return true;
  if (inRect(RACECOURSE.x0, RACECOURSE.y0, RACECOURSE.x1, RACECOURSE.y1, x, y)) return true;

  // 東回廊リゾート ＆ 競馬場東ツイン橋（x=125, y=26 の壁は維持）
  if (inRect(127, 6, 154, 47, x, y)) return true;
  if (inRect(124, 12, 128, 16, x, y)) return true;
  if (inRect(124, 34, 128, 38, x, y)) return true;

  // 南東・ロイヤル迷宮・商業広場・サンセット城
  if (inRect(59, 49, 154, 90, x, y)) return true;
  if (inRect(65, 46, 70, 50, x, y)) return true;
  if (inRect(110, 46, 114, 50, x, y)) return true;
  if (inRect(132, 46, 136, 50, x, y)) return true;
  if (inRect(147, 46, 151, 50, x, y)) return true;

  return false;
}

function dist2(cx: number, cy: number, x: number, y: number): number {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy;
}

function floorAt(x: number, y: number): number {
  let floor = L_MARBLE;
  if (y <= APSE.cy && inCircle(APSE.cx, APSE.cy, APSE.r, x, y)) {
    floor = dist2(APSE.cx, APSE.cy, x, y) <= 49 ? L_SAND : L_MARBLE;
  }
  if (inRect(2, 4, 22, 16, x, y)) {
    floor = y >= 13 ? L_CHECK : L_WOOD;
  }
  if (inRect(39, 4, 58, 16, x, y)) {
    floor = x >= 52 ? L_CHECK : L_DARK;
    if (y <= 6) floor = L_MARBLE;
  }
  if (inRect(37, 18, 53, 30, x, y)) floor = L_CARPET;
  if (inRect(2, 18, 19, 30, x, y)) floor = L_WOOD;
  if (
    inRect(24, 34, 32, 41, x, y) ||
    inCircle(SMITH_CIRCLE.cx, SMITH_CIRCLE.cy, SMITH_CIRCLE.r, x, y) ||
    inRect(22, 36, 25, 49, x, y) ||
    inRect(31, 36, 36, 49, x, y)
  ) {
    floor = L_DARK;
  }
  if (inRect(44, 29, 51, 49, x, y)) floor = L_CARPET;
  if (inRect(2, 48, 19, 63, x, y)) floor = L_CHECK;

  if (inRect(22, 48, 59, 69, x, y)) {
    floor = (x + y) % 8 <= 1 ? L_WOOD : L_PLAZA;
    if (inRect(42, 52, 48, 58, x, y)) floor = L_RING;
  }
  if (inRect(22, 68, 59, 90, x, y)) {
    floor = inRect(36, 81, 45, 89, x, y) ? L_CHECK : L_WOOD;
  }
  if (inRect(2, 70, 23, 90, x, y)) {
    floor = y >= 84 ? L_CHECK : L_WOOD;
    if (inRect(7, 74, 16, 85, x, y) && !inRect(8, 76, 14, 83, x, y)) floor = L_SAND;
  }

  if (inRect(RACE_CORRIDOR.x0, RACE_CORRIDOR.y0, RACE_CORRIDOR.x1, RACE_CORRIDOR.y1, x, y))
    floor = L_CARPET;
  if (inRect(RACECOURSE.x0, RACECOURSE.y0, RACECOURSE.x1, RACECOURSE.y1, x, y)) {
    floor = L_MARBLE;
    if (isRaceInfieldTile(x, y)) {
      floor = inRect(83, 23, 99, 29, x, y) ? L_CARPET : L_PLAZA;
      if (inRect(91, 24, 95, 28, x, y)) floor = L_PLAZA;
    } else if (isRaceTrackTile(x, y)) {
      floor = L_SAND;
    } else if (x <= 70 && y <= 14) {
      floor = L_WOOD;
    } else if (x >= 115 && y <= 14) {
      floor = L_CARPET;
    }
  }

  if (inRect(127, 6, 154, 47, x, y)) {
    floor = x >= 147 ? L_WOOD : L_MARBLE;
    if (y <= 14) floor = L_CARPET;
  }
  if (inRect(59, 49, 154, 90, x, y)) {
    if (x <= 96) {
      floor = inRect(78, 56, 84, 62, x, y) ? L_RING : L_PLAZA;
    } else if (x <= 120) {
      floor = L_CHECK;
    } else {
      floor = y >= 79 ? L_WOOD : L_CARPET;
      if (inRect(131, 79, 137, 85, x, y)) floor = L_RING;
    }
  }

  if (inCircle(PLAZA.cx, PLAZA.cy, PLAZA.r, x, y)) {
    floor = dist2(PLAZA.cx, PLAZA.cy, x, y) <= 100 ? L_PLAZA : L_RING;
  }
  return floor;
}

export function lobbyDistrictAt(x: number, y: number): string {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx <= 21 && ty >= 46 && ty <= 66) return "ギルドモール（擬似2F）";
  if (inRect(20, 0, 36, 14, tx, ty)) return "コロッセオ闘技場";
  if (inRect(2, 4, 22, 16, tx, ty)) return "北西・グルメ夜市通り";
  if (inRect(2, 17, 19, 31, tx, ty)) return "グランドバザール";
  if (inRect(38, 4, 58, 16, tx, ty)) return "金融・株式取引街";
  if (inRect(37, 17, 54, 31, tx, ty)) return "モンテカルロ・カジノ";
  if (inRect(22, 34, 36, 48, tx, ty)) return "スチーム鍛冶街";
  if (inRect(60, 4, 125, 47, tx, ty))
    return isRaceInfieldTile(tx, ty) ? "競馬場インフィールド庭園" : "グランド競馬場";
  if (inRect(22, 48, 59, 69, tx, ty)) return "エメラルド迷宮庭園";
  if (inRect(2, 68, 59, 90, tx, ty)) return "ハーバー祭り小路";
  if (inRect(126, 6, 154, 48, tx, ty)) return "東回廊リゾート";
  if (inRect(59, 49, 96, 90, tx, ty)) return "ロイヤル迷宮庭園";
  if (inRect(97, 49, 120, 90, tx, ty)) return "南東・商業ギルド街";
  if (inRect(121, 49, 154, 90, tx, ty)) return "サンセット城・屋外劇場";
  return "中央噴水広場";
}

export type LobbyStation =
  | "board"
  | "shop"
  | "bank"
  | "casino"
  | "arena"
  | "smith"
  | "guild"
  | "fountain"
  | "rest"
  | "arcade"
  | "race"
  | "sell"
  | "telescope"
  | "piano"
  | "stock"
  | "dealer"
  | "prison_work"
  | "prison_desk"
  | "prison_escape"
  | "prison_visit";

export type LobbyObject = {
  sprite: string;
  x: number;
  y: number;
  w: number;
  h: number;
  solid: boolean;
  station?: LobbyStation;
  genre?: ShopGenreId;
  arcade?: string;
};

const objects: LobbyObject[] = [];
const occupied = new Set<string>();

type PutOpts = {
  w?: number;
  h?: number;
  solid?: boolean;
  station?: LobbyStation;
  genre?: ShopGenreId;
};

function put(sprite: string, x: number, y: number, opts: PutOpts = {}): void {
  const w = opts.w ?? 1;
  const h = opts.h ?? 1;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const key = `${x + dx},${y + dy}`;
      if (occupied.has(key)) throw new Error(`lobby object overlap at ${key} (${sprite})`);
      occupied.add(key);
    }
  }
  objects.push({
    sprite,
    x,
    y,
    w,
    h,
    solid: opts.solid ?? true,
    station: opts.station,
    genre: opts.genre,
  });
}
function row(sprite: string, x0: number, x1: number, y: number, opts: PutOpts = {}): void {
  for (let x = x0; x <= x1; x++) put(sprite, x, y, opts);
}
function col(sprite: string, x: number, y0: number, y1: number, opts: PutOpts = {}): void {
  for (let y = y0; y <= y1; y++) put(sprite, x, y, opts);
}

// ===== 1. 中央噴水広場（アンカー座標をすべて維持しつつ庭園小路で充実） =====
put("fountain", 27, 23, { w: 3, h: 3, station: "fountain" });
put("telescope", 28, 27, { station: "telescope" });
row("bulletin_board", 27, 29, 15, { station: "board" });
row("guild_board", 24, 25, 15, { station: "guild" });
put("warp_pad", 28, 34, { solid: false });
row("bench", 23, 24, 17);
row("bench", 30, 31, 17);
for (const [x, y] of [
  [19, 19],
  [37, 19],
  [19, 29],
  [37, 29],
] as const)
  put("lamp", x, y);
for (const [x, y] of [
  [21, 21],
  [35, 21],
  [21, 27],
  [35, 27],
] as const)
  put("pillar", x, y);
for (const [x, y] of [
  [25, 32],
  [31, 32],
  [25, 21],
  [31, 21],
  [25, 27],
  [31, 27],
] as const)
  put("planter", x, y);
put("vending", 24, 32);
put("vending", 32, 32);
put("table_round", 22, 19);
put("chair", 23, 19);
put("bench", 20, 22);
put("table_round", 34, 23);
put("chair", 34, 24);
put("bench", 36, 22);
put("lamp", 24, 24);
put("lamp", 32, 24);

// 金融取引所・銀行（テスト参照の 32,17 stock_board 等をそのまま維持）
row("bank_counter", 33, 34, 17, { station: "bank" });
put("vault", 35, 17, { station: "bank" });
put("atm", 35, 18, { station: "bank" });
put("stock_board", 32, 17, { station: "stock" });
put("atm", 32, 18, { station: "stock" });

// ===== 2. 西翼・グランドバザール（19列未満 y<31 に vending 禁止） =====
row("shop_counter", 4, 6, 20, { station: "shop", genre: "tools" });
row("shop_counter", 8, 10, 20, { station: "shop", genre: "blocks" });
row("shop_counter", 12, 14, 20, { station: "shop", genre: "furniture" });
row("shop_counter", 4, 6, 27, { station: "shop", genre: "food" });
row("shop_counter", 12, 14, 27, { station: "shop", genre: "farm" });
row("shop_counter", 15, 16, 27, { station: "sell" });
put("sign_board", 16, 20);
put("planter", 3, 19);
put("planter", 17, 19);
col("item_shelf", 3, 23, 24, { station: "shop", genre: "tools" });
col("display_case", 7, 23, 24, { station: "shop", genre: "blocks" });
col("display_case", 11, 23, 24, { station: "shop", genre: "blocks" });
row("display_case", 8, 10, 27, { station: "shop", genre: "farm" });
put("sign_board", 9, 26);
row("display_case", 8, 10, 29, { station: "shop", genre: "farm" });
put("crate", 16, 23);
put("crate", 16, 24);
put("barrel", 15, 24);
put("barrel", 3, 29);
put("lamp", 7, 28);
put("lamp", 18, 22);
put("stairs", 17, 29, { solid: false });
put("stairs", 18, 29, { solid: false });

// ===== 3. 北西・グルメ夜市通り（中庭 9..13, 8..11 を囲む商店街） =====
row("shop_counter", 4, 6, 6, { station: "shop", genre: "food" });
row("shop_counter", 16, 18, 6, { station: "shop", genre: "farm" });
put("sign_board", 15, 6);
put("barrel", 3, 8);
put("crate", 3, 9);
put("sign_board", 7, 8);
put("lamp", 3, 12);
put("table_round", 5, 12);
put("chair", 5, 13);
put("chair", 6, 12);
put("planter", 3, 15);
put("bench", 9, 13);
put("bench", 13, 13);
put("table_round", 11, 14);
put("chair", 10, 14);
put("chair", 12, 14);
put("lamp", 18, 15);
put("planter", 20, 15);
put("vending", 20, 14);
put("hedge", 16, 9);
put("hedge", 17, 9);
put("lamp", 21, 11);
put("planter", 21, 13);

// ===== 4. 東翼・モンテカルロ・カジノ ＆ 音楽ラウンジ =====
for (const x of [39, 41, 43]) put("slot_machine", x, 19, { station: "casino" });
for (const x of [46, 48, 50]) put("slot7_machine", x, 19, { station: "casino" });
put("roulette_table", 40, 24, { station: "casino" });
put("dice_table", 44, 24, { station: "casino" });
put("blackjack_table", 48, 24, { station: "casino" });
put("chair", 40, 25);
put("chair", 44, 25);
put("chair", 48, 25);
for (const x of [40, 43, 46]) put("double_machine", x, 29, { station: "casino" });
put("slot_machine", 50, 29, { station: "casino" });
put("table_round", 44, 22);
put("sofa", 51, 24);
put("sofa", 51, 25);
put("table_round", 50, 22);
put("piano", 39, 26, { station: "piano" });
put("hedge", 44, 21);
put("hedge", 44, 27);
put("casino_table", 42, 27, { station: "casino" });
put("casino_table", 48, 27, { station: "casino" });
put("planter", 52, 19);
put("lamp", 38, 19);
put("lamp", 52, 29);
put("lamp", 38, 28);
put("tapestry", 52, 22, { solid: false });

// カジノ南ベルベット回廊
put("pillar", 46, 34);
put("pillar", 49, 34);
put("pillar", 46, 42);
put("pillar", 49, 42);
put("sofa", 45, 37);
put("table_round", 46, 37);
put("vending", 50, 37);
put("hedge", 45, 40);
put("hedge", 50, 40);
put("lamp", 45, 32);
put("lamp", 50, 45);

// ===== 5. 北東・金融株式取引街（中庭 46..50, 8..11 を囲む金融回廊） =====
put("stock_board", 42, 5, { station: "stock" });
put("atm", 43, 5, { station: "stock" });
put("bulletin_board", 45, 5, { station: "board" });
put("stock_board", 48, 5, { station: "stock" });
put("stock_board", 54, 5, { station: "stock" });
put("atm", 55, 5, { station: "stock" });
put("lamp", 40, 5);
put("lamp", 57, 5);
row("bank_counter", 40, 41, 9, { station: "bank" });
put("vault", 40, 10, { station: "bank" });
put("atm", 40, 11, { station: "bank" });
put("pillar", 43, 8);
put("pillar", 43, 12);
put("sofa", 41, 14);
put("table_round", 42, 14);
col("bookshelf", 57, 7, 8, { station: "rest" });
put("table_round", 54, 9);
put("chair", 53, 9);
put("chair", 55, 9);
put("sofa", 56, 12);
put("planter", 52, 14);
put("vending", 57, 15);
put("bench", 47, 13);
put("bench", 49, 13);
put("lamp", 47, 15);
put("lamp", 50, 15);

// ===== 6. グランド競馬場 ＆ インフィールド庭園・パークコーナー =====
row("shop_counter", 72, 77, 25, { station: "race" });
row("bulletin_board", 72, 75, 21, { station: "race" });
put("sign_board", 61, 21, { station: "race" });
col("arena_gate", 65, 23, 28);
row("bench", 84, 102, 5);
put("telescope", 93, 6, { station: "telescope" });
row("bench", 84, 102, 46);
row("fence_wood", 104, 111, 22);
row("fence_wood", 104, 111, 30);
col("fence_wood", 111, 23, 29);
put("planter", 107, 26);
put("hedge", 84, 34);
put("hedge", 102, 34);
put("lamp", 61, 5);
put("lamp", 124, 5);
put("lamp", 61, 46);
put("lamp", 124, 46);
col("bench", 124, 14, 21);
col("bench", 124, 31, 38);
row("bench", 78, 83, 46);
row("bench", 103, 108, 46);
row("bench", 78, 83, 45);
row("bench", 103, 108, 45);
row("hedge", 82, 86, 36);
row("hedge", 100, 104, 36);
put("lamp", 93, 34);
put("planter", 90, 34);
put("planter", 96, 34);
put("planter", 89, 38);
put("planter", 97, 38);
put("sign_board", 114, 39);
row("fence_wood", 116, 119, 39);
row("fence_wood", 122, 124, 39);
col("fence_wood", 115, 40, 45);
row("fence_wood", 116, 124, 45);
col("fence_wood", 124, 40, 44);
put("lamp", 116, 40);
put("crate", 116, 44);
put("barrel", 117, 44);
put("fence_wood", 119, 43);
put("fence_wood", 119, 44);
put("fence_wood", 122, 43);
put("fence_wood", 122, 44);
put("workbench", 123, 40);
put("planter", 123, 44);

// インフィールド北・バラ庭園＆迷路
row("hedge", 82, 87, 16);
row("hedge", 99, 104, 16);
row("hedge", 87, 90, 19);
row("hedge", 96, 99, 19);
put("planter", 80, 17);
put("planter", 93, 15);
put("planter", 106, 17);
put("bench", 92, 16);
put("bench", 94, 16);
put("table_round", 93, 17);
put("chair", 92, 17);
put("chair", 94, 17);
put("lamp", 85, 18);
put("lamp", 101, 18);

// インフィールド中央・ウィナーズサークルラウンジ（93,26 中央とパドック動線は開放）
put("pillar", 86, 23);
put("pillar", 100, 23);
put("pillar", 86, 29);
put("pillar", 100, 29);
put("display_case", 89, 23);
put("display_case", 97, 23);
put("display_case", 89, 29);
put("display_case", 97, 29);
put("sofa", 83, 24);
put("sofa", 83, 28);
put("table_round", 84, 26);
put("lamp", 93, 22);
put("lamp", 93, 30);

// 競馬場四隅・テーマコーナー
row("bookshelf", 62, 64, 5, { station: "rest" });
put("sofa", 62, 7);
put("table_round", 63, 7);
row("hedge", 65, 66, 8);
put("vending", 61, 10);
row("shop_counter", 62, 64, 45, { station: "shop", genre: "food" });
row("display_case", 62, 64, 41);
put("lamp", 66, 43);
put("planter", 66, 45);
row("bookshelf", 120, 122, 5, { station: "rest" });
put("sofa", 122, 7);
put("table_round", 121, 7);
row("hedge", 117, 119, 8);
put("planter", 123, 10);

// ===== 7. 北・コロッセオ闘技場 =====
for (let y = 0; y <= 9; y++) {
  for (let x = 0; x < LOBBY_W; x++) {
    const d2 = dist2(APSE.cx, APSE.cy, x, y);
    if (d2 >= 36 && d2 <= 52) put("arena_gate", x, y, { station: "arena" });
  }
}
for (const [x, y] of [
  [20, 6],
  [21, 5],
  [35, 6],
  [34, 5],
  [24, 2],
  [32, 2],
] as const) {
  put("bench", x, y, { station: "arena" });
}
put("sign_board", 29, 13, { station: "arena" });

// ===== 8. スチーム鍛冶街 ＆ ツイン回廊 =====
put("furnace", 25, 40, { station: "smith" });
put("furnace", 31, 40, { station: "smith" });
put("anvil", 28, 38, { station: "smith" });
put("workbench", 25, 36, { station: "smith" });
put("workbench", 31, 36, { station: "smith" });
put("fence_wood", 26, 38);
put("fence_wood", 30, 38);
put("crate", 26, 34);
put("barrel", 30, 34);
put("lamp", 28, 42);
put("barrel", 23, 41);
put("lamp", 23, 44);
put("planter", 23, 47);
put("crate", 35, 41);
put("lamp", 34, 44);
put("planter", 34, 47);

// ===== 9. 中央南・エメラルド迷宮庭園 =====
put("fountain", 44, 54, { w: 3, h: 3, station: "fountain" });
col("hedge", 25, 51, 56);
row("hedge", 25, 29, 60);
col("hedge", 25, 62, 65);
row("hedge", 34, 36, 51);
row("hedge", 34, 38, 55);
col("hedge", 42, 49, 51);
row("hedge", 46, 53, 49);
row("hedge", 31, 36, 65);
row("hedge", 44, 48, 65);
col("hedge", 56, 59, 65);
put("bookshelf", 24, 67, { station: "rest" });
put("sofa", 35, 67);
put("table_round", 36, 67);
put("vending", 57, 60);
put("lamp", 23, 50);
put("lamp", 43, 53);
put("lamp", 47, 58);
put("lamp", 57, 51);
put("planter", 35, 58);
put("planter", 57, 66);
put("bench", 45, 51);
put("bench", 45, 60);

// ===== 10. 南西・ハーバー祭り小路 ＆ 桟橋 =====
row("shop_counter", 26, 28, 71, { station: "shop", genre: "tools" });
row("shop_counter", 37, 39, 71, { station: "shop", genre: "food" });
row("shop_counter", 54, 55, 71, { station: "sell" });
row("shop_counter", 38, 40, 86, { station: "shop", genre: "furniture" });
put("sign_board", 29, 71);
put("sign_board", 40, 71);
put("crate", 25, 75);
put("barrel", 25, 76);
put("table_round", 27, 84);
put("chair", 26, 84);
put("chair", 28, 84);
put("lamp", 36, 75);
put("lamp", 56, 83);
put("vending", 43, 72);
put("planter", 36, 82);
put("bench", 42, 82);
put("bench", 43, 82);

// 桟橋西・図書館＆ラグーン＆カーニバル
row("bookshelf", 4, 6, 72, { station: "rest" });
row("display_case", 10, 12, 72);
put("sofa", 17, 72, { station: "rest" });
put("table_round", 18, 72);
put("chair", 19, 72);
put("lamp", 3, 71);
put("lamp", 20, 71);
put("bench", 4, 78);
put("bench", 4, 81);
put("planter", 3, 76);
put("planter", 3, 83);
put("lamp", 3, 80);
put("fountain", 10, 86, { w: 3, h: 3, station: "fountain" });
row("shop_counter", 17, 19, 86, { station: "shop", genre: "blocks" });
put("vending", 5, 88);
put("bench", 15, 88);
put("lamp", 19, 84);

// ===== 11. 東回廊リゾート =====
row("shop_counter", 139, 141, 8, { station: "shop", genre: "food" });
row("hedge", 136, 145, 13);
put("table_round", 132, 9);
put("chair", 131, 9);
put("chair", 133, 9);
put("table_round", 149, 9);
put("chair", 148, 9);
put("chair", 150, 9);
put("lamp", 129, 8);
put("lamp", 152, 8);
put("pillar", 130, 18);
put("pillar", 130, 24);
put("pillar", 130, 30);
put("pillar", 130, 36);
put("bench", 128, 21);
put("bench", 128, 29);
col("display_case", 133, 20, 22);
col("bookshelf", 152, 18, 20, { station: "rest" });
put("sofa", 152, 25, { station: "rest" });
put("sofa", 152, 26, { station: "rest" });
put("table_round", 151, 25);
put("bench", 152, 32);
put("lamp", 148, 16);
put("lamp", 148, 36);
row("hedge", 137, 143, 41);
row("bench", 139, 141, 39);
put("vending", 130, 45);
put("planter", 145, 42);

// ===== 12. 南東・ロイヤル迷宮・商業ギルド街・サンセット城 =====
put("fountain", 80, 58, { w: 3, h: 3, station: "fountain" });
col("hedge", 63, 52, 60);
col("hedge", 67, 55, 65);
row("hedge", 68, 72, 65);
col("hedge", 80, 52, 55);
row("hedge", 85, 92, 55);
col("hedge", 80, 64, 71);
row("hedge", 71, 76, 70);
row("hedge", 63, 67, 74);
put("lamp", 61, 51);
put("lamp", 79, 57);
put("lamp", 83, 61);
put("lamp", 94, 52);
put("planter", 73, 53);
put("planter", 94, 62);
put("bench", 88, 63);
put("bench", 89, 63);
row("hedge", 62, 66, 77);
row("hedge", 71, 76, 77);
row("hedge", 85, 92, 77);
row("hedge", 60, 65, 88);
row("hedge", 84, 91, 88);
put("table_round", 70, 83);
put("chair", 69, 83);
put("chair", 71, 83);
put("lamp", 68, 78);
put("lamp", 84, 83);
put("planter", 94, 82);
put("sofa", 87, 81, { station: "rest" });
put("table_round", 88, 81);
put("shop_counter", 49, 85, { station: "shop", genre: "farm" });
put("shop_counter", 50, 85, { station: "shop", genre: "farm" });
put("shop_counter", 51, 85, { station: "shop", genre: "farm" });
put("crate", 46, 86);
put("barrel", 47, 86);
put("hedge", 54, 83);
put("hedge", 55, 83);
put("lamp", 54, 87);

// 南東・商業ギルド街
put("stock_board", 104, 52, { station: "stock" });
row("bank_counter", 106, 107, 52, { station: "bank" });
put("vault", 108, 52, { station: "bank" });
put("atm", 104, 53, { station: "stock" });
row("shop_counter", 101, 103, 60, { station: "shop", genre: "tools" });
row("shop_counter", 112, 114, 60, { station: "shop", genre: "blocks" });
row("shop_counter", 116, 117, 60, { station: "sell" });
put("sign_board", 100, 60);
put("crate", 100, 68);
put("barrel", 101, 68);
row("display_case", 112, 114, 66);
put("item_shelf", 116, 66);
put("vending", 118, 74);
put("table_round", 104, 72);
put("chair", 103, 72);
put("chair", 105, 72);
put("shop_counter", 107, 73, { station: "dealer" });
put("shop_counter", 108, 73, { station: "dealer" });
put("sign_board", 109, 73, { station: "dealer" });
put("display_case", 110, 73, { station: "dealer" });
put("lamp", 111, 73);
put("pillar", 103, 56);
put("pillar", 112, 56);
put("pillar", 103, 64);
put("pillar", 112, 64);
row("hedge", 102, 108, 86);
put("bench", 104, 87);
put("bench", 106, 87);
put("lamp", 99, 52);
put("lamp", 118, 52);
put("lamp", 99, 86);
put("lamp", 118, 86);

// サンセット城・屋外劇場
put("pillar", 134, 52);
put("pillar", 146, 52);
put("tapestry", 140, 51, { solid: false });
row("bookshelf", 138, 142, 53, { station: "rest" });
put("sofa", 136, 58, { station: "rest" });
put("sofa", 144, 58, { station: "rest" });
put("table_round", 140, 58);
row("display_case", 136, 144, 63);
put("lamp", 132, 52);
put("lamp", 151, 52);
put("pillar", 148, 56);
put("pillar", 148, 62);
put("pillar", 148, 72);
put("pillar", 148, 78);
put("bench", 151, 60);
put("bench", 151, 74);
put("fountain", 133, 81, { w: 3, h: 3, station: "fountain" });
row("bench", 126, 130, 83);
row("bench", 126, 130, 85);
row("bench", 138, 142, 83);
row("bench", 138, 142, 85);
put("lamp", 125, 81);
put("lamp", 144, 81);
put("vending", 151, 87);
put("planter", 148, 66);
put("planter", 148, 84);
row("hedge", 124, 130, 78);
put("table_round", 124, 67);
put("chair", 123, 67);
put("chair", 125, 67);

// ===== 13. 擬似2F（ギルドモール・既存座標を保持） =====
for (const y of [51, 57]) {
  for (const [x0, genre] of [
    [3, "tools"],
    [8, "blocks"],
    [13, "furniture"],
  ] as const) {
    row("shop_counter", x0, x0 + 2, y, { station: "shop", genre });
    put("sign_board", x0 + 3, y);
  }
}
row("bookshelf", 3, 5, 54, { station: "rest" });
row("item_shelf", 8, 10, 54, { station: "shop", genre: "blocks" });
row("bookshelf", 13, 15, 54, { station: "rest" });
put("sofa", 3, 60, { station: "rest" });
put("chair", 4, 60, { station: "rest" });
put("table_round", 4, 61, { station: "rest" });
put("planter", 18, 49);
put("lamp", 3, 49);
put("stairs", 17, 50, { solid: false });
put("stairs", 18, 50, { solid: false });
put("stairs", 17, 62, { solid: false });
put("stairs", 18, 62, { solid: false });

export const LOBBY_OBJECTS: readonly LobbyObject[] = objects;

export const LOBBY_NPCS: readonly { x: number; y: number }[] = [
  { x: 5, y: 19 },
  { x: 9, y: 19 },
  { x: 13, y: 19 }, // 北カウンターの店員レーン
  { x: 5, y: 28 },
  { x: 13, y: 28 },
  { x: 15, y: 28 }, // 南カウンターの店員レーン（15 は買取カウンター）
  { x: 74, y: 24 }, // 競馬場の馬券カウンターの係員レーン
  { x: 5, y: 5 }, // 北西・グルメ夜市（西屋台）
  { x: 17, y: 5 }, // 北西・グルメ夜市（東屋台）
  { x: 63, y: 46 }, // 競馬場南西スーベニア屋台
  { x: 27, y: 70 }, // ハーバー祭り小路・道具屋台
  { x: 38, y: 70 }, // ハーバー祭り小路・グルメ屋台
  { x: 54, y: 70 }, // ハーバー祭り小路・買取所
  { x: 39, y: 87 }, // ハーバー祭り小路・家具屋台
  { x: 18, y: 87 }, // ハーバー桟橋・ブロック屋台
  { x: 50, y: 84 }, // ハーバー南・青果屋台
  { x: 140, y: 7 }, // 東回廊リゾート・ティーカフェ
  { x: 102, y: 59 }, // 南東商業街・道具店
  { x: 113, y: 59 }, // 南東商業街・ブロック店
  { x: 116, y: 59 }, // 南東商業街・買取窓口
];

export const LOBBY_ENTRY = { x: 28.5, y: 32.5 };
export const LOBBY_WARP_PAD = { x: 28, y: 34 };
export const LOBBY_STAIRS_UP: readonly { x: number; y: number }[] = [
  { x: 17, y: 29 },
  { x: 18, y: 29 },
];
export const LOBBY_STAIRS_DOWN: readonly { x: number; y: number }[] = [
  { x: 17, y: 62 },
  { x: 18, y: 62 },
];
export const LOBBY_UP_LANDING = { x: 17.5, y: 60.5 };
export const LOBBY_DOWN_LANDING = { x: 17.5, y: 27.5 };
export const LOBBY_STAIRS_2F: readonly { x: number; y: number }[] = [
  { x: 17, y: 50 },
  { x: 18, y: 50 },
];
export const LOBBY_2F_LANDING = { x: 17.5, y: 51.5 };

export type LobbyData = {
  width: number;
  height: number;
  tiles: Uint8Array;
  objects: readonly LobbyObject[];
  npcs: readonly { x: number; y: number }[];
  blocked: ReadonlySet<string>;
  moveMap: TopDownMap;
};

export function lobbyTileAt(tiles: Uint8Array, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= LOBBY_W || y >= LOBBY_H) return L_VOID;
  return tiles[y * LOBBY_W + x];
}

let cached: LobbyData | null = null;

export function buildLobby(): LobbyData {
  if (cached) return cached;
  const tiles = new Uint8Array(LOBBY_W * LOBBY_H);
  for (let y = 0; y < LOBBY_H; y++) {
    for (let x = 0; x < LOBBY_W; x++) {
      if (!inLobbyShape(x, y)) continue;
      const boundary =
        !inLobbyShape(x - 1, y) ||
        !inLobbyShape(x + 1, y) ||
        !inLobbyShape(x, y - 1) ||
        !inLobbyShape(x, y + 1);
      tiles[y * LOBBY_W + x] = boundary ? L_WALL : floorAt(x, y);
    }
  }
  const blocked = new Set<string>();
  for (const o of LOBBY_OBJECTS) {
    for (let dy = 0; dy < o.h; dy++) {
      for (let dx = 0; dx < o.w; dx++) {
        const tx = o.x + dx;
        const ty = o.y + dy;
        const t = lobbyTileAt(tiles, tx, ty);
        if (t === L_WALL || t === L_VOID) {
          throw new Error(`lobby object on wall/void at ${tx},${ty} (${o.sprite})`);
        }
      }
    }
    if (!o.solid) continue;
    if (isSeatSprite(o.sprite)) continue;
    for (let dy = 0; dy < o.h; dy++) {
      for (let dx = 0; dx < o.w; dx++) blocked.add(`${o.x + dx},${o.y + dy}`);
    }
  }
  const moveTiles = new Uint8Array(LOBBY_W * LOBBY_H);
  for (let i = 0; i < tiles.length; i++) {
    moveTiles[i] = isSolidLobbyTile(tiles[i]) ? T_ROCK : T_GRASS;
  }
  cached = {
    width: LOBBY_W,
    height: LOBBY_H,
    tiles,
    objects: LOBBY_OBJECTS,
    npcs: LOBBY_NPCS,
    blocked,
    moveMap: tilesSource(0, LOBBY_W, LOBBY_H, moveTiles),
  };
  return cached;
}

function stationMatchTier(o: LobbyObject, tx: number, ty: number): 0 | 1 | 2 {
  const inX = tx >= o.x && tx < o.x + o.w;
  const inY = ty >= o.y && ty < o.y + o.h;
  if (inX && (ty === o.y - 1 || ty === o.y + o.h)) return 1;
  if (inY && (tx === o.x - 1 || tx === o.x + o.w)) return 1;
  if (tx >= o.x - 1 && tx <= o.x + o.w && ty >= o.y - 1 && ty <= o.y + o.h) return 2;
  return 0;
}

export function stationNear(
  objectsList: readonly LobbyObject[],
  tx: number,
  ty: number,
): LobbyStation | null {
  let diagonal: LobbyStation | null = null;
  for (const o of objectsList) {
    if (!o.station) continue;
    const tier = stationMatchTier(o, tx, ty);
    if (tier === 1) return o.station;
    if (tier === 2 && diagonal === null) diagonal = o.station;
  }
  return diagonal;
}

export function stationArcadeNear(
  objectsList: readonly LobbyObject[],
  tx: number,
  ty: number,
): string | null {
  let diagonal: string | null = null;
  for (const o of objectsList) {
    if (o.station !== "arcade" || !o.arcade) continue;
    const tier = stationMatchTier(o, tx, ty);
    if (tier === 1) return o.arcade;
    if (tier === 2 && diagonal === null) diagonal = o.arcade;
  }
  return diagonal;
}

export function stationGenreNear(
  objectsList: readonly LobbyObject[],
  tx: number,
  ty: number,
): ShopGenreId | null {
  for (const o of objectsList) {
    if (o.station !== "shop" || !o.genre) continue;
    if (tx >= o.x - 1 && tx <= o.x + o.w && ty >= o.y - 1 && ty <= o.y + o.h) return o.genre;
  }
  return null;
}
