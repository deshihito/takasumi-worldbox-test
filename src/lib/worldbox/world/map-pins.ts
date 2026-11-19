export type PinIconId = "📌" | "🏠" | "⛏️" | "🏙️" | "🏪" | "⭐";

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

export interface SpacePoi {
  id: string;
  space: string;
  x: number;
  y: number;
  label: string;
  badge: string;
  color: string;
}

export const PIN_ICONS: readonly { icon: PinIconId; label: string; color: string }[] = [
  { icon: "📌", label: "ピン", color: "#38bdf8" },
  { icon: "🏠", label: "拠点", color: "#4ade80" },
  { icon: "⛏️", label: "採掘", color: "#f59e0b" },
  { icon: "🏙️", label: "街", color: "#818cf8" },
  { icon: "🏪", label: "店舗", color: "#fb7185" },
  { icon: "⭐", label: "重要", color: "#facc15" },
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
    badge: "⛲",
    color: "#38bdf8",
  },
  {
    id: "lobby:exit",
    space: "lobby",
    x: 28,
    y: 31,
    label: "ワールド出口ゲート",
    badge: "🚪",
    color: "#4ade80",
  },
  {
    id: "lobby:bank_ne",
    space: "lobby",
    x: 40,
    y: 10,
    label: "北東メトロ銀行・大金庫",
    badge: "🏦",
    color: "#facc15",
  },
  {
    id: "lobby:atm_ne",
    space: "lobby",
    x: 43,
    y: 5,
    label: "金融街・証券＆ATM",
    badge: "📈",
    color: "#34d399",
  },
  {
    id: "lobby:cafe_nw",
    space: "lobby",
    x: 5,
    y: 7,
    label: "西グルメ・カフェカウンター",
    badge: "☕",
    color: "#fb923c",
  },
  {
    id: "lobby:smith",
    space: "lobby",
    x: 28,
    y: 38,
    label: "蒸気鍛冶工房",
    badge: "⚒️",
    color: "#94a3b8",
  },
  {
    id: "lobby:guild_shop",
    space: "lobby",
    x: 14,
    y: 34,
    label: "ギルド商店・販売街",
    badge: "🛍️",
    color: "#f472b6",
  },
  {
    id: "lobby:casino",
    space: "lobby",
    x: 11,
    y: 56,
    label: "メトロ・ロイヤルカジノ",
    badge: "🎰",
    color: "#c084fc",
  },
  {
    id: "lobby:harbor",
    space: "lobby",
    x: 38,
    y: 71,
    label: "南部ハーバー桟橋カフェ",
    badge: "⚓",
    color: "#22d3ee",
  },
  {
    id: "lobby:race",
    space: "lobby",
    x: 63,
    y: 45,
    label: "タカスミ競馬場",
    badge: "🐎",
    color: "#f59e0b",
  },
  {
    id: "lobby:bank_se",
    space: "lobby",
    x: 106,
    y: 52,
    label: "南東商業ギルド・金庫",
    badge: "🏛️",
    color: "#fbbf24",
  },
  {
    id: "lobby:resort",
    space: "lobby",
    x: 140,
    y: 9,
    label: "東リゾート カフェバー",
    badge: "🍹",
    color: "#38bdf8",
  },
  {
    id: "lobby:stairs_2f",
    space: "lobby",
    x: 17,
    y: 50,
    label: "2F ラウンジ＆ゲームへ",
    badge: "🪜",
    color: "#e2e8f0",
  },

  // Lobby 2F
  {
    id: "lobby2:arcade",
    space: "lobby2",
    x: 20,
    y: 12,
    label: "2F アーケード街",
    badge: "🕹️",
    color: "#22d3ee",
  },
  {
    id: "lobby2:piano",
    space: "lobby2",
    x: 20,
    y: 5,
    label: "グランドピアノ＆舞台",
    badge: "🎹",
    color: "#f472b6",
  },

  // Lobby 3F
  {
    id: "lobby3:arcade",
    space: "lobby3",
    x: 18,
    y: 10,
    label: "3F パーティー筐体階",
    badge: "🎮",
    color: "#818cf8",
  },
  {
    id: "lobby3:tele",
    space: "lobby3",
    x: 18,
    y: 4,
    label: "展望天体望遠鏡",
    badge: "🔭",
    color: "#38bdf8",
  },

  // Prison
  {
    id: "prison:work",
    space: "prison",
    x: 35,
    y: 9,
    label: "東棟・懲役ワークプレス",
    badge: "⚒️",
    color: "#4ade80",
  },
  {
    id: "prison:desk",
    space: "prison",
    x: 25,
    y: 26,
    label: "面会室・保釈申請デスク",
    badge: "💳",
    color: "#fbbf24",
  },
  {
    id: "prison:visit",
    space: "prison",
    x: 18,
    y: 26,
    label: "面会差し入れカウンター",
    badge: "🎁",
    color: "#38bdf8",
  },
  {
    id: "prison:escape",
    space: "prison",
    x: 4,
    y: 27,
    label: "南西メンテナンス換気口",
    badge: "🕳️",
    color: "#ef4444",
  },
];

export function poisForSpace(space: string): SpacePoi[] {
  return SPACE_POIS.filter((p) => p.space === space);
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
    const iconRaw = String(v.icon ?? "📌") as PinIconId;
    const matched = PIN_ICONS.find((p) => p.icon === iconRaw) ?? PIN_ICONS[0];
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
