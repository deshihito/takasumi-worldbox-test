import {
  MAP_SEED,
  T_DIRT,
  T_GRASS,
  T_SAND,
  T_SNOW,
  T_WATER,
  isSolidMapTile,
  tileAt,
} from "./mapgen";

export type SettlementTier = "city" | "town" | "village";

export interface SettlementBuilding {
  id: string;
  kind: "city_hall" | "convenience" | "cafe" | "bank_kiosk" | "house" | "cottage";
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  roofColor: string;
  wallColor: string;
}

export interface SettlementCitizen {
  id: string;
  name: string;
  role: "barista" | "shopkeeper" | "engineer" | "guard" | "delivery" | "resident";
  roleLabel: string;
  shirtColor: string;
  hairColor: string;
  homeX: number;
  homeY: number;
  workX: number;
  workY: number;
  plazaX: number;
  plazaY: number;
  phaseOffset: number;
  phrases: readonly string[];
}

export interface Settlement {
  id: string;
  cellX: number;
  cellY: number;
  name: string;
  tier: SettlementTier;
  population: number;
  cx: number;
  cy: number;
  radius: number;
  buildings: readonly SettlementBuilding[];
  lamps: readonly { x: number; y: number }[];
  citizens: readonly SettlementCitizen[];
}

export interface CitizenPose {
  x: number;
  y: number;
  face: 1 | -1;
  walkSpeed: number;
  walkPhase: number;
  sleeping: boolean;
  activity: string;
}

export const SETTLEMENT_CELL = 160;

function cellHash(cx: number, cy: number, salt: number, seed = MAP_SEED): number {
  let h = (cx * 374761393 + cy * 668265263 + salt * 2654435761 + seed) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function isDryLand(x: number, y: number, seed: number): boolean {
  const t = tileAt(x, y, seed);
  if (isSolidMapTile(t) || t === T_WATER) return false;
  return t === T_GRASS || t === T_DIRT || t === T_SAND || t === T_SNOW;
}

const CITY_NAMES = [
  "新東京メトロ市",
  "葵ヶ丘市",
  "桜並木市",
  "みなと陽だまり市",
  "緑風中央市",
  "白銀ステーション市",
  "茜台スマート市",
  "星見ヶ原新都",
];

const TOWN_NAMES = [
  "白銀アルプス町",
  "汐留埠頭町",
  "翠川商店街",
  "紅葉温泉町",
  "常盤通り町",
  "凪浜港町",
  "富士見台町",
  "雲母坂町",
];

const VILLAGE_NAMES = [
  "若葉農村",
  "ほたる里村",
  "風車ヶ原集落",
  "山彦村",
  "清流の郷",
  "陽だまり村",
  "雪見宿場村",
  "木漏れ日村",
];

const FAMILY_NAMES = [
  "佐藤",
  "鈴木",
  "高橋",
  "田中",
  "渡辺",
  "伊藤",
  "中村",
  "小林",
  "山本",
  "加藤",
];
const GIVEN_NAMES = [
  "ハル",
  "レン",
  "ミオ",
  "ユウ",
  "アオイ",
  "ケンジ",
  "サクラ",
  "カイ",
  "ヒナ",
  "タクミ",
];

const ROLE_DEFS: readonly {
  role: SettlementCitizen["role"];
  roleLabel: string;
  shirt: string;
  phrases: readonly string[];
}[] = [
  {
    role: "barista",
    roleLabel: "カフェ店員",
    shirt: "#d97706",
    phrases: [
      "淹れたてのエスプレッソがおすすめ！",
      "朝の通勤ラッシュが落ち着いてきたよ",
      "街のラウンジも賑やかだね",
    ],
  },
  {
    role: "shopkeeper",
    roleLabel: "商店街店主",
    shirt: "#059669",
    phrases: [
      "駅前プラザで新鮮なパンや珈琲をどうぞ",
      "今日は金属インゴットの流通が多いらしい",
      "地元住民みんなで街を盛り上げてます",
    ],
  },
  {
    role: "engineer",
    roleLabel: "機械技師",
    shirt: "#0284c7",
    phrases: [
      "ベルトコンベアで工場と自販機を繋ぐのが流行りさ",
      "新しい電動スクーターの走り心地はどう？",
      "発電グリッドの電圧、今日も安定中！",
    ],
  },
  {
    role: "guard",
    roleLabel: "地域警備員",
    shirt: "#1e3a8a",
    phrases: [
      "管轄エリアのパトロール、異常なし！",
      "夜間も街灯が明るく安全を守ってます",
      "指名手配犯には十分ご注意を",
    ],
  },
  {
    role: "delivery",
    roleLabel: "地元配達員",
    shirt: "#e11d48",
    phrases: [
      "ピンをマップに置くと配送ルートが分かりやすいよ",
      "次の荷物を積み込んで出発だ！",
      "道が舗装されていて配達しやすい街です",
    ],
  },
  {
    role: "resident",
    roleLabel: "市民",
    shirt: "#64748b",
    phrases: [
      "今日も住みよい一日になりそうだね",
      "ロビーの中央市場にも遊びに行こうかな",
      "夜は街灯の明かりが綺麗なんだよ",
    ],
  },
];

const settlementCache = new Map<string, Settlement | null>();

export function settlementAtCell(cellX: number, cellY: number, seed = MAP_SEED): Settlement | null {
  const key = `${seed}:${cellX},${cellY}`;
  if (settlementCache.has(key)) return settlementCache.get(key) ?? null;

  // Deterministic presence probability: ~88% so vast majority of macro regions host a living settlement,
  // and core spawn region (|cellX|<=2 && |cellY|<=2) always has 100% settlements.
  const core = Math.abs(cellX) <= 2 && Math.abs(cellY) <= 2;
  if (!core && cellHash(cellX, cellY, 3, seed) > 0.88) {
    settlementCache.set(key, null);
    return null;
  }

  const baseAnchorX =
    cellX === 0 && cellY === 0
      ? 24
      : cellX * SETTLEMENT_CELL +
        Math.round((cellHash(cellX, cellY, 7, seed) - 0.5) * 44) +
        Math.floor(SETTLEMENT_CELL / 2);
  const baseAnchorY =
    cellX === 0 && cellY === 0
      ? 18
      : cellY * SETTLEMENT_CELL +
        Math.round((cellHash(cellX, cellY, 11, seed) - 0.5) * 44) +
        Math.floor(SETTLEMENT_CELL / 2);

  // Spiral scan for a solid dry plaza site so settlements never spawn on ocean water
  let cx: number | null = null;
  let cy: number | null = null;
  for (let r = 0; r <= 28 && cx === null; r += 2) {
    for (let dy = -r; dy <= r && cx === null; dy += 2) {
      for (let dx = -r; dx <= r && cx === null; dx += 2) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = baseAnchorX + dx;
        const ty = baseAnchorY + dy;
        if (
          isDryLand(tx, ty, seed) &&
          isDryLand(tx + 2, ty, seed) &&
          isDryLand(tx - 2, ty, seed) &&
          isDryLand(tx, ty + 2, seed) &&
          isDryLand(tx, ty - 2, seed)
        ) {
          cx = tx;
          cy = ty;
        }
      }
    }
  }
  if (cx === null || cy === null) {
    settlementCache.set(key, null);
    return null;
  }

  const tierRoll = cellHash(cellX, cellY, 19, seed);
  const tier: SettlementTier =
    cellX === 0 && cellY === 0
      ? "city"
      : tierRoll < 0.28
        ? "city"
        : tierRoll < 0.68
          ? "town"
          : "village";

  const idxHash = Math.floor(cellHash(cellX, cellY, 29, seed) * 100);
  let name: string;
  if (cellX === 0 && cellY === 0) name = CITY_NAMES[0];
  else if (cellX === 0 && cellY === -1) name = TOWN_NAMES[0];
  else if (tier === "city")
    name = CITY_NAMES[(idxHash + Math.abs(cellX + cellY)) % CITY_NAMES.length];
  else if (tier === "town")
    name = TOWN_NAMES[(idxHash + Math.abs(cellX * 2 + cellY)) % TOWN_NAMES.length];
  else name = VILLAGE_NAMES[(idxHash + Math.abs(cellX + cellY * 3)) % VILLAGE_NAMES.length];

  const radius = tier === "city" ? 13 : tier === "town" ? 9 : 6;
  const population =
    tier === "city"
      ? 240 + Math.floor(cellHash(cellX, cellY, 41, seed) * 260)
      : tier === "town"
        ? 85 + Math.floor(cellHash(cellX, cellY, 41, seed) * 120)
        : 22 + Math.floor(cellHash(cellX, cellY, 41, seed) * 44);

  const buildings: SettlementBuilding[] = [];
  if (tier === "city") {
    buildings.push(
      {
        id: `${key}:hall`,
        kind: "city_hall",
        label: `${name} 庁舎`,
        x: cx - 5,
        y: cy - 6,
        w: 4,
        h: 3,
        roofColor: "#1d4ed8",
        wallColor: "#cbd5e1",
      },
      {
        id: `${key}:conv`,
        kind: "convenience",
        label: "24Hマート",
        x: cx + 2,
        y: cy - 5,
        w: 3,
        h: 2,
        roofColor: "#059669",
        wallColor: "#e2e8f0",
      },
      {
        id: `${key}:cafe`,
        kind: "cafe",
        label: "駅前カフェ",
        x: cx - 6,
        y: cy + 3,
        w: 3,
        h: 2,
        roofColor: "#b45309",
        wallColor: "#fde68a",
      },
      {
        id: `${key}:house1`,
        kind: "house",
        label: "都市マンション",
        x: cx + 3,
        y: cy + 3,
        w: 4,
        h: 3,
        roofColor: "#334155",
        wallColor: "#94a3b8",
      },
      {
        id: `${key}:house2`,
        kind: "house",
        label: "市民レジデンス",
        x: cx - 10,
        y: cy - 4,
        w: 3,
        h: 2,
        roofColor: "#475569",
        wallColor: "#cbd5e1",
      },
      {
        id: `${key}:bank`,
        kind: "bank_kiosk",
        label: "ATM出張所",
        x: cx + 8,
        y: cy - 4,
        w: 2,
        h: 2,
        roofColor: "#0369a1",
        wallColor: "#e0f2fe",
      },
    );
  } else if (tier === "town") {
    buildings.push(
      {
        id: `${key}:conv`,
        kind: "convenience",
        label: "地元マーケット",
        x: cx - 5,
        y: cy - 5,
        w: 3,
        h: 2,
        roofColor: "#0d9488",
        wallColor: "#f1f5f9",
      },
      {
        id: `${key}:cafe`,
        kind: "cafe",
        label: "街角ベーカリー",
        x: cx + 2,
        y: cy - 5,
        w: 3,
        h: 2,
        roofColor: "#c2410c",
        wallColor: "#fef3c7",
      },
      {
        id: `${key}:house1`,
        kind: "house",
        label: "町屋",
        x: cx - 5,
        y: cy + 3,
        w: 3,
        h: 2,
        roofColor: "#57534e",
        wallColor: "#e7e5e4",
      },
      {
        id: `${key}:house2`,
        kind: "cottage",
        label: "住宅",
        x: cx + 2,
        y: cy + 3,
        w: 3,
        h: 2,
        roofColor: "#7c2d12",
        wallColor: "#f5f5f4",
      },
    );
  } else {
    buildings.push(
      {
        id: `${key}:cot1`,
        kind: "cottage",
        label: "古民家",
        x: cx - 4,
        y: cy - 4,
        w: 2,
        h: 2,
        roofColor: "#78350f",
        wallColor: "#e7e5e4",
      },
      {
        id: `${key}:cot2`,
        kind: "cottage",
        label: "農家",
        x: cx + 2,
        y: cy - 4,
        w: 2,
        h: 2,
        roofColor: "#365314",
        wallColor: "#f5f5f4",
      },
      {
        id: `${key}:cafe`,
        kind: "cafe",
        label: "旅人の茶屋",
        x: cx - 4,
        y: cy + 2,
        w: 3,
        h: 2,
        roofColor: "#9a3412",
        wallColor: "#fef3c7",
      },
    );
  }

  const lamps: { x: number; y: number }[] = [
    { x: cx - 2, y: cy - 2 },
    { x: cx + 2, y: cy - 2 },
    { x: cx - 2, y: cy + 2 },
    { x: cx + 2, y: cy + 2 },
  ];
  if (tier === "city") {
    lamps.push(
      { x: cx - 7, y: cy },
      { x: cx + 7, y: cy },
      { x: cx, y: cy - 7 },
      { x: cx, y: cy + 7 },
    );
  }

  const citizenCount = tier === "city" ? 8 : tier === "town" ? 5 : 3;
  const citizens: SettlementCitizen[] = [];
  for (let i = 0; i < citizenCount; i++) {
    const rdef = ROLE_DEFS[(i + Math.abs(cellX + cellY)) % ROLE_DEFS.length];
    const fam =
      FAMILY_NAMES[Math.floor(cellHash(cellX, cellY, 100 + i, seed) * FAMILY_NAMES.length)];
    const giv = GIVEN_NAMES[Math.floor(cellHash(cellX, cellY, 200 + i, seed) * GIVEN_NAMES.length)];
    const bHome = buildings[(i + 1) % buildings.length];
    const bWork = buildings[i % buildings.length];
    citizens.push({
      id: `${key}:c${i}`,
      name: `${fam} ${giv}`,
      role: i === 0 ? "guard" : rdef.role,
      roleLabel: i === 0 ? "地域警備員" : rdef.roleLabel,
      shirtColor: i === 0 ? "#1e3a8a" : rdef.shirt,
      hairColor: i % 3 === 0 ? "#1e293b" : i % 3 === 1 ? "#78350f" : "#475569",
      homeX: bHome.x + bHome.w / 2,
      homeY: bHome.y + bHome.h + 0.6,
      workX: bWork.x + bWork.w / 2,
      workY: bWork.y + bWork.h + 0.6,
      plazaX: cx + ((i % 3) - 1) * 1.4,
      plazaY: cy + (Math.floor(i / 3) - 0.5) * 1.3,
      phaseOffset: cellHash(cellX, cellY, 300 + i, seed) * Math.PI * 2,
      phrases: rdef.phrases,
    });
  }

  const stl: Settlement = {
    id: `stl:${cellX},${cellY}`,
    cellX,
    cellY,
    name,
    tier,
    population,
    cx,
    cy,
    radius,
    buildings,
    lamps,
    citizens,
  };
  if (settlementCache.size > 256) settlementCache.clear();
  settlementCache.set(key, stl);
  return stl;
}

export function settlementsNear(
  wx: number,
  wy: number,
  rangeTiles = 220,
  seed = MAP_SEED,
): Settlement[] {
  const minCx = Math.floor((wx - rangeTiles) / SETTLEMENT_CELL);
  const maxCx = Math.floor((wx + rangeTiles) / SETTLEMENT_CELL);
  const minCy = Math.floor((wy - rangeTiles) / SETTLEMENT_CELL);
  const maxCy = Math.floor((wy + rangeTiles) / SETTLEMENT_CELL);
  const out: Settlement[] = [];
  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      const s = settlementAtCell(cx, cy, seed);
      if (s) out.push(s);
    }
  }
  out.sort((a, b) => Math.hypot(a.cx - wx, a.cy - wy) - Math.hypot(b.cx - wx, b.cy - wy));
  return out;
}

export function settlementRoadAt(stl: Settlement, tx: number, ty: number): "plaza" | "road" | null {
  const dx = Math.abs(tx - stl.cx);
  const dy = Math.abs(ty - stl.cy);
  if (dx <= 2 && dy <= 2) return "plaza";
  if ((dx <= 1 && dy <= stl.radius) || (dy <= 1 && dx <= stl.radius)) return "road";
  return null;
}

export function nearestSettlement(
  wx: number,
  wy: number,
  maxDist = 26,
  seed = MAP_SEED,
): Settlement | null {
  const cx = Math.floor(wx / SETTLEMENT_CELL);
  const cy = Math.floor(wy / SETTLEMENT_CELL);
  let best: Settlement | null = null;
  let bestDist = maxDist;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const s = settlementAtCell(cx + ox, cy + oy, seed);
      if (!s) continue;
      const d = Math.hypot(s.cx - wx, s.cy - wy);
      if (d <= bestDist) {
        best = s;
        bestDist = d;
      }
    }
  }
  return best;
}

/**
 * Computes seamless continuous 60fps autonomous daily life motion for each settlement citizen
 * using the server/local day-night cycle (`phase01` in [0..1]).
 */
export function evaluateCitizenPose(
  stl: Settlement,
  cit: SettlementCitizen,
  dayPhase01: number,
  nowMs: number,
): CitizenPose {
  const hour = (((dayPhase01 % 1) + 1) % 1) * 24;
  const isGuard = cit.role === "guard" || cit.role === "barista";
  const sleeping = !isGuard && (hour < 5.5 || hour >= 22.0);
  if (sleeping) {
    return {
      x: cit.homeX,
      y: cit.homeY - 1,
      face: 1,
      walkSpeed: 0,
      walkPhase: 0,
      sleeping: true,
      activity: "就寝中",
    };
  }

  // Pick anchor based on daily schedule
  let anchorX = cit.plazaX;
  let anchorY = cit.plazaY;
  let activity = "駅前を散歩中";
  if (hour >= 6 && hour < 12) {
    anchorX = cit.workX;
    anchorY = cit.workY;
    activity = `${cit.roleLabel}・午前勤務中`;
  } else if (hour >= 12 && hour < 18) {
    anchorX = cit.plazaX;
    anchorY = cit.plazaY;
    activity = `${cit.roleLabel}・商店街交流中`;
  } else if (hour >= 18 && hour < 22) {
    anchorX = stl.cx + Math.cos(cit.phaseOffset) * 2.5;
    anchorY = stl.cy + Math.sin(cit.phaseOffset) * 2.5;
    activity = "夕方・商店街でくつろぎ中";
  } else {
    // Late night guard / night convenience stroll around town avenues
    anchorX = stl.cx;
    anchorY = stl.cy;
    activity = "夜間パトロール中";
  }

  // Smooth periodic figure-8 / road patrol walk around anchor
  const sec = nowMs / 1000;
  const patrolRad = cit.role === "guard" ? 4.2 : 2.1;
  const freq = cit.role === "guard" ? 0.34 : 0.22;
  const t = sec * freq + cit.phaseOffset;
  const offsetX = Math.sin(t) * patrolRad;
  const offsetY = Math.sin(t * 2) * (patrolRad * 0.45);
  const dx = Math.cos(t) * patrolRad * freq;
  const dy = Math.cos(t * 2) * 2 * (patrolRad * 0.45) * freq;
  const speed = Math.hypot(dx, dy);

  return {
    x: anchorX + offsetX,
    y: anchorY + offsetY,
    face: dx >= -0.02 ? 1 : -1,
    walkSpeed: speed,
    walkPhase: sec * 5.2 + cit.phaseOffset,
    sleeping: false,
    activity,
  };
}
