export type PinIconId = "pin" | "home" | "mine" | "city" | "shop" | "star";

export interface MapPin {
  id: string;
  label: string;
  icon: PinIconId;
  color: string;
  space: string;
  x: number;
  y: number;
  createdAt: number;
}

export type TrackedTarget =
  | {
      kind: "pin" | "poi" | "settlement" | "job";
      space: string;
      x: number;
      y: number;
      label: string;
      color?: string;
      pinId?: string;
    }
  | {
      kind: "player";
      presenceId: string;
      label: string;
      color?: string;
    };

export type PoiIconId =
  | "fountain"
  | "door"
  | "bank"
  | "chart"
  | "cafe"
  | "anvil"
  | "bag"
  | "dice"
  | "anchor"
  | "race"
  | "gov"
  | "drink"
  | "stairs"
  | "gamepad"
  | "piano"
  | "telescope"
  | "card"
  | "gift"
  | "vent"
  | "car";

export interface SpacePoi {
  id: string;
  space: string;
  x: number;
  y: number;
  label: string;
  badge: PoiIconId;
  color: string;
}

export const PIN_ICONS: readonly { icon: PinIconId; label: string; color: string }[] = [
  { icon: "pin", label: "ピン", color: "#38bdf8" },
  { icon: "home", label: "拠点", color: "#4ade80" },
  { icon: "mine", label: "採掘", color: "#f59e0b" },
  { icon: "city", label: "街", color: "#818cf8" },
  { icon: "shop", label: "店舗", color: "#fb7185" },
  { icon: "star", label: "重要", color: "#facc15" },
];

export const MAP_PINS_STORAGE_KEY = "wb-map-pins-v1";

export const SPACE_POIS: readonly SpacePoi[] = [
  // Central Lobby 1F (156 x 92)
  {
    id: "lobby:plaza",
    space: "lobby",
    x: 28,
    y: 24,
    label: "中央噴水広場",
    badge: "fountain",
    color: "#38bdf8",
  },
  {
    id: "lobby:exit",
    space: "lobby",
    x: 28,
    y: 31,
    label: "ワールド出口ゲート",
    badge: "door",
    color: "#4ade80",
  },
  {
    id: "lobby:bank_ne",
    space: "lobby",
    x: 40,
    y: 10,
    label: "北東メトロ銀行・大金庫",
    badge: "bank",
    color: "#facc15",
  },
  {
    id: "lobby:atm_ne",
    space: "lobby",
    x: 43,
    y: 5,
    label: "金融街・証券＆ATM",
    badge: "chart",
    color: "#34d399",
  },
  {
    id: "lobby:cafe_nw",
    space: "lobby",
    x: 5,
    y: 7,
    label: "西グルメ・カフェカウンター",
    badge: "cafe",
    color: "#fb923c",
  },
  {
    id: "lobby:smith",
    space: "lobby",
    x: 28,
    y: 38,
    label: "蒸気鍛冶工房",
    badge: "anvil",
    color: "#94a3b8",
  },
  {
    id: "lobby:guild_shop",
    space: "lobby",
    x: 14,
    y: 34,
    label: "ギルド商店・販売街",
    badge: "bag",
    color: "#f472b6",
  },
  {
    id: "lobby:casino",
    space: "lobby",
    x: 11,
    y: 56,
    label: "メトロ・ロイヤルカジノ",
    badge: "dice",
    color: "#c084fc",
  },
  {
    id: "lobby:harbor",
    space: "lobby",
    x: 38,
    y: 71,
    label: "南部ハーバー桟橋カフェ",
    badge: "anchor",
    color: "#22d3ee",
  },
  {
    id: "lobby:race",
    space: "lobby",
    x: 63,
    y: 45,
    label: "タカスミ競馬場",
    badge: "race",
    color: "#f59e0b",
  },
  {
    id: "lobby:bank_se",
    space: "lobby",
    x: 106,
    y: 52,
    label: "南東商業ギルド・金庫",
    badge: "gov",
    color: "#fbbf24",
  },
  {
    id: "lobby:dealer_se",
    space: "lobby",
    x: 109,
    y: 73,
    label: "南東モビリティ・車両ディーラー",
    badge: "car",
    color: "#38bdf8",
  },
  {
    id: "lobby:resort",
    space: "lobby",
    x: 140,
    y: 9,
    label: "東リゾート カフェバー",
    badge: "drink",
    color: "#38bdf8",
  },
  {
    id: "lobby:stairs_2f",
    space: "lobby",
    x: 17,
    y: 50,
    label: "2F ラウンジ＆ゲームへ",
    badge: "stairs",
    color: "#e2e8f0",
  },

  // Lobby 2F
  {
    id: "lobby2:arcade",
    space: "lobby2",
    x: 20,
    y: 12,
    label: "2F アーケード街",
    badge: "gamepad",
    color: "#22d3ee",
  },
  {
    id: "lobby2:piano",
    space: "lobby2",
    x: 20,
    y: 5,
    label: "グランドピアノ＆舞台",
    badge: "piano",
    color: "#f472b6",
  },

  // Lobby 3F
  {
    id: "lobby3:arcade",
    space: "lobby3",
    x: 18,
    y: 10,
    label: "3F パーティー筐体階",
    badge: "gamepad",
    color: "#818cf8",
  },
  {
    id: "lobby3:tele",
    space: "lobby3",
    x: 18,
    y: 4,
    label: "展望天体望遠鏡",
    badge: "telescope",
    color: "#38bdf8",
  },

  // Prison
  {
    id: "prison:work",
    space: "prison",
    x: 35,
    y: 9,
    label: "東棟・懲役ワークプレス",
    badge: "anvil",
    color: "#4ade80",
  },
  {
    id: "prison:desk",
    space: "prison",
    x: 25,
    y: 26,
    label: "面会室・保釈申請デスク",
    badge: "card",
    color: "#fbbf24",
  },
  {
    id: "prison:visit",
    space: "prison",
    x: 18,
    y: 26,
    label: "面会差し入れカウンター",
    badge: "gift",
    color: "#38bdf8",
  },
  {
    id: "prison:escape",
    space: "prison",
    x: 4,
    y: 27,
    label: "南西メンテナンス換気口",
    badge: "vent",
    color: "#ef4444",
  },
];

export function poisForSpace(space: string): SpacePoi[] {
  return SPACE_POIS.filter((p) => p.space === space);
}

function normalizePinIcon(raw: unknown): PinIconId {
  const s = String(raw ?? "pin");
  const matched = PIN_ICONS.find((p) => p.icon === s);
  if (matched) return matched.icon;
  const cp = s.codePointAt(0);
  if (cp === 0x1f3e0) return "home";
  if (cp === 0x26cf) return "mine";
  if (cp === 0x1f3d9) return "city";
  if (cp === 0x1f3ea) return "shop";
  if (cp === 0x2b50) return "star";
  return "pin";
}

export function parseMapPins(raw: unknown): MapPin[] {
  if (!raw) return [];
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  const out: MapPin[] = [];
  for (const row of data.slice(0, 40)) {
    if (!row || typeof row !== "object") continue;
    const v = row as Record<string, unknown>;
    if (
      typeof v.id !== "string" ||
      typeof v.space !== "string" ||
      typeof v.x !== "number" ||
      !Number.isFinite(v.x) ||
      typeof v.y !== "number" ||
      !Number.isFinite(v.y)
    ) {
      continue;
    }
    const iconId = normalizePinIcon(v.icon);
    const matched = PIN_ICONS.find((p) => p.icon === iconId) ?? PIN_ICONS[0];
    out.push({
      id: v.id,
      label: typeof v.label === "string" && v.label.trim() ? v.label.trim().slice(0, 24) : "ピン",
      icon: matched.icon,
      color: typeof v.color === "string" ? v.color : matched.color,
      space: v.space,
      x: Math.round(v.x * 10) / 10,
      y: Math.round(v.y * 10) / 10,
      createdAt: typeof v.createdAt === "number" ? v.createdAt : 0,
    });
  }
  return out;
}

export function loadLocalMapPins(): MapPin[] {
  try {
    if (typeof window === "undefined") return [];
    return parseMapPins(window.localStorage.getItem(MAP_PINS_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveLocalMapPins(pins: readonly MapPin[]): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MAP_PINS_STORAGE_KEY, JSON.stringify(pins.slice(0, 40)));
  } catch {
    /* noop */
  }
}
