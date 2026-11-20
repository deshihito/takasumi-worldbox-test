import { PRISON_CELLS } from "../world/prison-map";

export type PrisonStatus = "free" | "jailed";

export type CrimeTypeId = "pickpocket" | "atm_hack" | "smuggle_run" | "vault_heist" | "fraud";

export interface CrimeDef {
  id: CrimeTypeId;
  name: string;
  desc: string;
  baseSuccess: number;
  minReward: number;
  maxReward: number;
  wantedHeat: number;
  sentenceSec: number;
  bailPerSec: number;
  cooldownMs: number;
  boostItemId?: string;
}

export const CRIMES: readonly CrimeDef[] = [
  {
    id: "pickpocket",
    name: "繁華街のスリ",
    desc: "人混みに紛れて小銭を狙う軽犯罪。足がつきにくいが失敗時は即勾留。",
    baseSuccess: 0.62,
    minReward: 220,
    maxReward: 680,
    wantedHeat: 1,
    sentenceSec: 90,
    bailPerSec: 18,
    cooldownMs: 45_000,
    boostItemId: "thief_mask",
  },
  {
    id: "atm_hack",
    name: "ATM・決済網スキミング",
    desc: "暗号化モバイルで決済ノードに不正侵入。成功すれば高額報酬。",
    baseSuccess: 0.5,
    minReward: 700,
    maxReward: 1900,
    wantedHeat: 2,
    sentenceSec: 150,
    bailPerSec: 25,
    cooldownMs: 75_000,
    boostItemId: "burner_phone",
  },
  {
    id: "smuggle_run",
    name: "禁制品密輸ルート",
    desc: "規制パーツと暗号データを闇ルートで捌く密輸ビジネス。",
    baseSuccess: 0.55,
    minReward: 950,
    maxReward: 2400,
    wantedHeat: 2,
    sentenceSec: 180,
    bailPerSec: 28,
    cooldownMs: 90_000,
    boostItemId: "lockpick",
  },
  {
    id: "fraud",
    name: "インサイダー・架空請求",
    desc: "証券市場の隙を突いた大規模ホワイトカラー犯罪。",
    baseSuccess: 0.45,
    minReward: 1400,
    maxReward: 3600,
    wantedHeat: 3,
    sentenceSec: 220,
    bailPerSec: 35,
    cooldownMs: 110_000,
    boostItemId: "burner_phone",
  },
  {
    id: "vault_heist",
    name: "中央金庫・強盗計画",
    desc: "タカスミ最大の禁断ハイスト。超ハイリスク・超高リターン。",
    baseSuccess: 0.34,
    minReward: 2800,
    maxReward: 7500,
    wantedHeat: 4,
    sentenceSec: 320,
    bailPerSec: 45,
    cooldownMs: 150_000,
    boostItemId: "lockpick",
  },
];

const CRIME_BY_ID = new Map<string, CrimeDef>(CRIMES.map((c) => [c.id, c]));

export function crimeById(id: unknown): CrimeDef | null {
  return typeof id === "string" ? (CRIME_BY_ID.get(id) ?? null) : null;
}

export type PrisonLaborId = "quarry" | "plate_press" | "clean";

export interface PrisonLaborDef {
  id: PrisonLaborId;
  name: string;
  desc: string;
  wage: number;
  reduceSec: number;
  cooldownMs: number;
  bonusItem?: string;
}

export const PRISON_LABOR_TASKS: readonly PrisonLaborDef[] = [
  {
    id: "plate_press",
    name: "工業プレートプレス作業",
    desc: "刑務所工場で精密部品やナンバープレートを製造。刑期短縮＆少額報酬。",
    wage: 220,
    reduceSec: 45,
    cooldownMs: 12_000,
    bonusItem: "copper_wire",
  },
  {
    id: "quarry",
    name: "採石・資材破砕",
    desc: "矯正ヤードで岩石を砕く重労働。石材と大きな減刑を得られる。",
    wage: 260,
    reduceSec: 60,
    cooldownMs: 15_000,
    bonusItem: "stone",
  },
  {
    id: "clean",
    name: "施設清掃・洗濯奉仕",
    desc: "施設内の衛生管理を行う模範囚タスク。",
    wage: 140,
    reduceSec: 35,
    cooldownMs: 9_000,
  },
];

export interface ChargeEntry {
  at: number;
  code: string;
  label: string;
  bountyDelta: number;
}

export interface CareLogEntry {
  at: number;
  fromName: string;
  message: string;
}

export interface PrisonRecord {
  ownerKey: string;
  name: string;
  status: PrisonStatus;
  wantedLevel: number; // 0..5
  bounty: number;
  jailedAt: number;
  releaseAt: number;
  totalSentenceMs: number;
  bailAmount: number;
  cellId: string;
  inmateNumber: string;
  laborCount: number;
  escapeAttempts: number;
  escapedCount: number;
  arrestsCount: number;
  lastCrimeAt: number;
  lastLaborAt: number;
  lastEscapeAt: number;
  arrestedBy: string;
  charges: ChargeEntry[];
  careLogs: CareLogEntry[];
}

export function inmateCodeFor(ownerKey: string): string {
  let h = 2166136261;
  for (let i = 0; i < ownerKey.length; i++) {
    h ^= ownerKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `TKM-${(((h >>> 0) % 9000) + 1000).toString()}`;
}

export function cellForOwnerKey(ownerKey: string): string {
  let sum = 0;
  for (let i = 0; i < ownerKey.length; i++) sum += ownerKey.charCodeAt(i);
  return PRISON_CELLS[sum % PRISON_CELLS.length].id;
}

export function defaultPrisonRecord(ownerKey: string, name = "市民"): PrisonRecord {
  return {
    ownerKey,
    name: name.slice(0, 24) || "市民",
    status: "free",
    wantedLevel: 0,
    bounty: 0,
    jailedAt: 0,
    releaseAt: 0,
    totalSentenceMs: 0,
    bailAmount: 0,
    cellId: cellForOwnerKey(ownerKey),
    inmateNumber: inmateCodeFor(ownerKey),
    laborCount: 0,
    escapeAttempts: 0,
    escapedCount: 0,
    arrestsCount: 0,
    lastCrimeAt: 0,
    lastLaborAt: 0,
    lastEscapeAt: 0,
    arrestedBy: "",
    charges: [],
    careLogs: [],
  };
}

export function parsePrisonRecord(
  raw: unknown,
  ownerKey: string,
  fallbackName = "市民",
): PrisonRecord {
  const base = defaultPrisonRecord(ownerKey, fallbackName);
  let data: unknown = raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return base;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return base;
  const v = data as Record<string, unknown>;
  const num = (x: unknown, def = 0) =>
    typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : def;
  const status: PrisonStatus = v.status === "jailed" ? "jailed" : "free";
  const charges = Array.isArray(v.charges)
    ? v.charges
        .filter(
          (c): c is ChargeEntry =>
            !!c &&
            typeof c === "object" &&
            typeof (c as ChargeEntry).at === "number" &&
            typeof (c as ChargeEntry).label === "string",
        )
        .slice(0, 12)
    : [];
  const careLogs = Array.isArray(v.careLogs)
    ? v.careLogs
        .filter(
          (c): c is CareLogEntry =>
            !!c &&
            typeof c === "object" &&
            typeof (c as CareLogEntry).at === "number" &&
            typeof (c as CareLogEntry).message === "string",
        )
        .slice(0, 10)
    : [];
  return {
    ownerKey,
    name: typeof v.name === "string" && v.name.trim() ? v.name.trim().slice(0, 24) : base.name,
    status,
    wantedLevel: Math.min(5, num(v.wantedLevel)),
    bounty: Math.min(500_000, num(v.bounty)),
    jailedAt: num(v.jailedAt),
    releaseAt: num(v.releaseAt),
    totalSentenceMs: num(v.totalSentenceMs),
    bailAmount: Math.min(1_000_000, num(v.bailAmount)),
    cellId:
      typeof v.cellId === "string" && PRISON_CELLS.some((c) => c.id === v.cellId)
        ? v.cellId
        : base.cellId,
    inmateNumber:
      typeof v.inmateNumber === "string" && v.inmateNumber ? v.inmateNumber : base.inmateNumber,
    laborCount: num(v.laborCount),
    escapeAttempts: num(v.escapeAttempts),
    escapedCount: num(v.escapedCount),
    arrestsCount: num(v.arrestsCount),
    lastCrimeAt: num(v.lastCrimeAt),
    lastLaborAt: num(v.lastLaborAt),
    lastEscapeAt: num(v.lastEscapeAt),
    arrestedBy: typeof v.arrestedBy === "string" ? v.arrestedBy.slice(0, 32) : "",
    charges,
    careLogs,
  };
}

export function isActivelyJailed(record: PrisonRecord, now: number): boolean {
  return record.status === "jailed" && record.releaseAt > now;
}

export function remainingBailAmount(record: PrisonRecord, now: number, isLawyer = false): number {
  if (!isActivelyJailed(record, now)) return 0;
  const totalMs = Math.max(1, record.totalSentenceMs || record.releaseAt - record.jailedAt);
  const leftRatio = Math.max(0.15, Math.min(1, (record.releaseAt - now) / totalMs));
  const raw = Math.max(200, Math.round(record.bailAmount * leftRatio));
  return isLawyer ? Math.round(raw * 0.75) : raw;
}

export function sentencePlayer(
  record: PrisonRecord,
  opts: {
    code: string;
    label: string;
    sentenceMs: number;
    bailAmount: number;
    arrestedBy: string;
    now: number;
  },
): PrisonRecord {
  const cappedMs = Math.max(30_000, Math.min(10 * 60_000, opts.sentenceMs));
  const baseStart =
    record.status === "jailed" && record.releaseAt > opts.now ? record.releaseAt : opts.now;
  const nextRelease = Math.min(opts.now + 12 * 60_000, baseStart + cappedMs);
  return {
    ...record,
    status: "jailed",
    wantedLevel: 0,
    bounty: 0,
    jailedAt: record.status === "jailed" && record.jailedAt > 0 ? record.jailedAt : opts.now,
    releaseAt: nextRelease,
    totalSentenceMs: Math.max(cappedMs, nextRelease - opts.now),
    bailAmount: Math.max(record.bailAmount, opts.bailAmount),
    arrestedBy: opts.arrestedBy,
    charges: [
      { at: opts.now, code: opts.code, label: opts.label, bountyDelta: 0 },
      ...record.charges,
    ].slice(0, 12),
  };
}

export function releasePrisoner(record: PrisonRecord): PrisonRecord {
  return {
    ...record,
    status: "free",
    jailedAt: 0,
    releaseAt: 0,
    totalSentenceMs: 0,
    bailAmount: 0,
    arrestedBy: "",
  };
}

export interface NpcSuspect {
  id: string;
  name: string;
  crime: string;
  wantedLevel: number;
  bounty: number;
  district: string;
}

export function dailyNpcSuspects(now: number): readonly NpcSuspect[] {
  const hourSlot = Math.floor(now / (60 * 60 * 1000));
  const pool: readonly Omit<NpcSuspect, "bounty">[] = [
    {
      id: "npc_zero",
      name: "怪盗ゼロ",
      crime: "高級宝石店侵入・窃盗容疑",
      wantedLevel: 3,
      district: "グランドバザール",
    },
    {
      id: "npc_v",
      name: "暗号ハッカーV",
      crime: "中央ATMスキミング容疑",
      wantedLevel: 4,
      district: "金融・株式取引街",
    },
    {
      id: "npc_galo",
      name: "密輸ブローカー・ガロ",
      crime: "違法パーツ密売容疑",
      wantedLevel: 2,
      district: "ハーバー祭り小路",
    },
    {
      id: "npc_ortega",
      name: "偽札師オルテガ",
      crime: "偽造紙幣製造容疑",
      wantedLevel: 5,
      district: "モンテカルロ・カジノ",
    },
    {
      id: "npc_moth",
      name: "産業スパイ・モス",
      crime: "CNC設計図流出容疑",
      wantedLevel: 3,
      district: "スチーム鍛冶街",
    },
  ];
  return [0, 1, 2].map((i) => {
    const p = pool[(hourSlot + i) % pool.length];
    return {
      ...p,
      bounty: p.wantedLevel * 450 + ((hourSlot * 73 + i * 191) % 300),
    };
  });
}

export interface SpatialSpot {
  space: string;
  x: number;
  y: number;
  label: string;
}

export const CRIME_TARGET_SPOTS: Readonly<Record<CrimeTypeId, readonly SpatialSpot[]>> = {
  pickpocket: [
    { space: "lobby", x: 28, y: 24, label: "中央噴水広場（人混み）" },
    { space: "lobby", x: 11, y: 24, label: "グランドバザール通り" },
    { space: "lobby", x: 38, y: 71, label: "ハーバー祭り小路" },
  ],
  atm_hack: [
    { space: "lobby", x: 40, y: 11, label: "金融街・銀行ATM" },
    { space: "lobby", x: 43, y: 5, label: "取引所前・北ATM" },
    { space: "lobby", x: 55, y: 5, label: "金融街・東ATM" },
    { space: "lobby", x: 104, y: 53, label: "商業ギルド街・ATM" },
  ],
  smuggle_run: [
    { space: "lobby", x: 38, y: 72, label: "ハーバー祭り小路・桟橋裏" },
    { space: "lobby", x: 18, y: 86, label: "ハーバー西桟橋コンテナ裏" },
  ],
  fraud: [
    { space: "lobby", x: 48, y: 6, label: "金融街・株式証券ボード前" },
    { space: "lobby", x: 104, y: 52, label: "商業ギルド・取引端末" },
  ],
  vault_heist: [
    { space: "lobby", x: 40, y: 10, label: "北東中央銀行・大金庫室" },
    { space: "lobby", x: 108, y: 52, label: "南東商業ギルド金庫室" },
  ],
};

export function nearAnyCrimeSpot(
  crimeId: CrimeTypeId,
  space: string,
  x: number,
  y: number,
  radius = 4.2,
): SpatialSpot | null {
  const spots = CRIME_TARGET_SPOTS[crimeId];
  if (!spots) return null;
  for (const s of spots) {
    if (s.space !== space) continue;
    if (Math.hypot(x - (s.x + 0.5), y - (s.y + 0.5)) <= radius) return s;
  }
  return null;
}

/**
 * 刑務所内の巡回看守が現在南西メンテナンス通路(脱獄導線)に接近・監視しているか判定する。
 * 16秒周期のパトロールサイクルで、監視ウィンドウを避けて換気口へ潜り込むリアル性を持たせる。
 */
export function isPrisonGuardSweepingVent(now: number): boolean {
  const phase = (now % 16_000) / 16_000;
  // 看守が南西エリアを巡回警戒している時間帯 (0.0 .. 0.30)
  return phase < 0.3;
}

export interface PinChallenge {
  id: string;
  targetSequence: number[]; // length 3..4 digits 1..4
  hintLabel: string;
}

export function generateSecuritySequence(kind: string, seedNow: number, length = 3): PinChallenge {
  const seq: number[] = [];
  let h = (seedNow ^ 0x5f3759df) >>> 0;
  for (let i = 0; i < length; i++) {
    h = Math.imul(h ^ (h >>> 13), 1664525) + 1013904223;
    seq.push(((h >>> 0) % 4) + 1);
  }
  return {
    id: `${kind}-${seedNow}`,
    targetSequence: seq,
    hintLabel:
      kind === "vault_heist"
        ? "金庫室ダイヤル・ピン解除順序"
        : kind === "jailbreak"
          ? "換気ダクトボルト・ピッキング順序"
          : "セキュリティ暗号キー解除順序",
  };
}
