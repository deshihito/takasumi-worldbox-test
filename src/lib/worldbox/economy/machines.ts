import { cropById, itemById, recipeById, type Recipe } from "./items";
import type { TileOverride } from "../world/tiles";

export const MACHINE_ITEM_ID = "auto_harvester";

export const MACHINE_ITEM_IDS: readonly string[] = [
  "auto_harvester",
  "auto_planter",
  "auto_miner",
  "cnc_factory",
  "power_generator",
  "smart_vending",
  "security_camera",
  "logistics_sorter",
  "conveyor_relay",
  "custom_machine",
];

const MACHINE_ITEM_SET = new Set<string>(MACHINE_ITEM_IDS);

export function isMachineItem(itemId: string): boolean {
  return MACHINE_ITEM_SET.has(itemId);
}

export interface MachineSpec {
  id: string;
  name: string;
  roleLabel: string;
  desc: string;
  radius: number;
  defaultIntervalSec: number;
  accentColor: string;
}

export const MACHINE_SPECS: Readonly<Record<string, MachineSpec>> = {
  auto_harvester: {
    id: "auto_harvester",
    name: "自動収穫機",
    roleLabel: "AGRO HARVEST",
    desc: "周囲3×3の成熟した作物を自動で刈り取り保管します。",
    radius: 1,
    defaultIntervalSec: 60,
    accentColor: "#22c55e",
  },
  auto_planter: {
    id: "auto_planter",
    name: "自動播種ドローン",
    roleLabel: "AUTO SEEDER",
    desc: "格納した種を周囲3×3の空き畑へ自動で植え付けます。",
    radius: 1,
    defaultIntervalSec: 60,
    accentColor: "#84cc16",
  },
  auto_miner: {
    id: "auto_miner",
    name: "自動採掘ドリル",
    roleLabel: "DEEP DRILL",
    desc: "地下地質を掘削して石材・石炭・銅・鉄・宝石を連続採掘します。",
    radius: 1,
    defaultIntervalSec: 60,
    accentColor: "#f59e0b",
  },
  cnc_factory: {
    id: "cnc_factory",
    name: "CNC自動工作機",
    roleLabel: "CNC FAB",
    desc: "選択した電子部品や資材レシピを自動加工・データ抽出します。",
    radius: 0,
    defaultIntervalSec: 60,
    accentColor: "#06b6d4",
  },
  power_generator: {
    id: "power_generator",
    name: "ソーラー発電ユニット",
    roleLabel: "POWER GRID",
    desc: "周囲5×5の機械へ電力を供給し、稼働速度を最大2倍へブーストします。",
    radius: 2,
    defaultIntervalSec: 30,
    accentColor: "#38bdf8",
  },
  smart_vending: {
    id: "smart_vending",
    name: "スマート自動販売機",
    roleLabel: "24H KIOSK",
    desc: "設定価格で商品を無人販売し、売上を即座にオーナーへ届けます。",
    radius: 0,
    defaultIntervalSec: 60,
    accentColor: "#14b8a6",
  },
  security_camera: {
    id: "security_camera",
    name: "AI防犯カメラ",
    roleLabel: "AI SECURITY",
    desc: "周囲7×7の資産・周囲のプレイヤーへの盗難を防御し通報します。",
    radius: 3,
    defaultIntervalSec: 60,
    accentColor: "#ef4444",
  },
  logistics_sorter: {
    id: "logistics_sorter",
    name: "物流ソーター",
    roleLabel: "LOGISTICS",
    desc: "周囲5×5にある他マシンの生産バッファを1か所に集約し、CNC加工機・自販機へ自動供給します。",
    radius: 2,
    defaultIntervalSec: 30,
    accentColor: "#6366f1",
  },
  conveyor_relay: {
    id: "conveyor_relay",
    name: "自動ベルトコンベア中継機",
    roleLabel: "BELT RELAY",
    desc: "周囲5×5のマシンと物流ソーターの生産配管を延長接続し、工場ラインを構築します。",
    radius: 2,
    defaultIntervalSec: 30,
    accentColor: "#14b8a6",
  },
  custom_machine: {
    id: "custom_machine",
    name: "カスタム設計マシン",
    roleLabel: "MODULAR RIG",
    desc: "フレーム・コア・機能モジュールを組み合わせて設計した特注産業機。",
    radius: 2,
    defaultIntervalSec: 30,
    accentColor: "#f97316",
  },
};

export function machineSpecFor(itemId: string): MachineSpec {
  return MACHINE_SPECS[itemId] ?? MACHINE_SPECS.auto_harvester;
}

export type DeviceTrigger = "mature";
export type DeviceAction = "harvest";

export interface DeviceProgram {
  version: 1;
  trigger: DeviceTrigger;
  action: DeviceAction;
  intervalSec: number;
  enabled: boolean;
}

export const DEVICE_INTERVAL_CHOICES: readonly number[] = [30, 60, 300];

export function defaultProgram(): DeviceProgram {
  return { version: 1, trigger: "mature", action: "harvest", intervalSec: 60, enabled: true };
}

export function parseProgram(raw: unknown): DeviceProgram {
  const base = defaultProgram();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const v = raw as Record<string, unknown>;
  return {
    version: 1,
    trigger: "mature",
    action: "harvest",
    intervalSec: DEVICE_INTERVAL_CHOICES.includes(v.intervalSec as number)
      ? (v.intervalSec as number)
      : base.intervalSec,
    enabled: v.enabled !== false,
  };
}

export function encodeProgram(program: DeviceProgram): string {
  const json = JSON.stringify(parseProgram(program));
  return "WB1." + Buffer.from(json, "utf8").toString("base64url");
}

export function decodeProgram(code: unknown): DeviceProgram | null {
  if (typeof code !== "string" || !code.startsWith("WB1.")) return null;
  try {
    const raw = JSON.parse(Buffer.from(code.slice(4), "base64url").toString("utf8")) as unknown;
    if (!raw || typeof raw !== "object") return null;
    return parseProgram(raw);
  } catch {
    return null;
  }
}

export const DEVICE_PRESETS: readonly { id: string; name: string; program: DeviceProgram }[] = [
  { id: "standard", name: "標準収穫", program: defaultProgram() },
  { id: "swift", name: "こまめ収穫", program: { ...defaultProgram(), intervalSec: 30 } },
  { id: "eco", name: "のんびり収穫", program: { ...defaultProgram(), intervalSec: 300 } },
];

export type CustomFrameId = "aluminum" | "steel" | "titanium";
export type CustomCoreId = "battery" | "solar" | "quantum";
export type CustomModuleId = "agro" | "mining" | "cnc" | "compute" | "security";
export type CustomChipId = "timer" | "smart_filter" | "overclock";

export interface CustomMachineBlueprint {
  version: 2;
  name: string;
  frame: CustomFrameId;
  core: CustomCoreId;
  module: CustomModuleId;
  chip: CustomChipId;
  intervalSec: number;
  targetRecipeId?: string | null;
}

export const CUSTOM_FRAMES: readonly {
  id: CustomFrameId;
  name: string;
  yieldMult: number;
  cost: Record<string, number>;
  desc: string;
}[] = [
  {
    id: "aluminum",
    name: "軽量スタンダード筐体",
    yieldMult: 1,
    cost: { steel_plate: 1, iron_ingot: 2 },
    desc: "扱いやすい基本筐体（基本出力1.0倍）",
  },
  {
    id: "steel",
    name: "重装甲インダストリアル筐体",
    yieldMult: 1.5,
    cost: { steel_plate: 2, hydraulic_piston: 1 },
    desc: "高耐久・出力1.5倍",
  },
  {
    id: "titanium",
    name: "精密切削ミスリル筐体",
    yieldMult: 2,
    cost: { steel_plate: 2, mithril: 1, hydraulic_piston: 1 },
    desc: "最上級フレーム（出力2.0倍）",
  },
];

export const CUSTOM_CORES: readonly {
  id: CustomCoreId;
  name: string;
  speedMult: number;
  cost: Record<string, number>;
  desc: string;
}[] = [
  {
    id: "battery",
    name: "高密度バッテリーコア",
    speedMult: 1,
    cost: { battery_cell: 1 },
    desc: "標準1.0倍クロック",
  },
  {
    id: "solar",
    name: "ソーラーハイブリッドコア",
    speedMult: 1.4,
    cost: { solar_cell: 1, battery_cell: 1 },
    desc: "太陽光補助（稼働速度1.4倍）",
  },
  {
    id: "quantum",
    name: "量子オーバークロックコア",
    speedMult: 2,
    cost: { microchip: 2, battery_cell: 1 },
    desc: "超高速駆動（稼働速度2.0倍）",
  },
];

export const CUSTOM_MODULES: readonly {
  id: CustomModuleId;
  name: string;
  cost: Record<string, number>;
  desc: string;
}[] = [
  {
    id: "agro",
    name: "統合アグロモジュール",
    cost: { servo_motor: 1, wood: 4 },
    desc: "自動収穫＆種植えの農園自動化を実行",
  },
  {
    id: "mining",
    name: "深層ボーリングモジュール",
    cost: { hydraulic_piston: 1, servo_motor: 1 },
    desc: "鉱石・石炭・レア宝石を高効率採掘",
  },
  {
    id: "cnc",
    name: "CNC精密加工モジュール",
    cost: { microchip: 1, servo_motor: 1 },
    desc: "設定された工作・精錬レシピを自動生産",
  },
  {
    id: "compute",
    name: "市場マイニング・演算ユニット",
    cost: { microchip: 2, circuit_board: 1 },
    desc: "暗号データシャードを自動生成して経済収益を生む",
  },
  {
    id: "security",
    name: "AIセキュリティタレット",
    cost: { sensor_unit: 1, circuit_board: 1 },
    desc: "周囲7×7を監視し窃盗・破壊をブロック＆自動通報",
  },
];

export const CUSTOM_CHIPS: readonly {
  id: CustomChipId;
  name: string;
  bonusDesc: string;
  cost: Record<string, number>;
}[] = [
  {
    id: "timer",
    name: "標準スケジューラチップ",
    bonusDesc: "安定稼働モード",
    cost: { circuit_board: 1 },
  },
  {
    id: "smart_filter",
    name: "品質選別AIチップ",
    bonusDesc: "レア素材・副産物ドロップ率大幅UP",
    cost: { sensor_unit: 1, circuit_board: 1 },
  },
  {
    id: "overclock",
    name: "高負荷バッチAIチップ",
    bonusDesc: "1回の処理で追加+1個の成果物を生産",
    cost: { microchip: 1, copper_wire: 2 },
  },
];

export function defaultCustomBlueprint(): CustomMachineBlueprint {
  return {
    version: 2,
    name: "特注マシン Mk-I",
    frame: "aluminum",
    core: "battery",
    module: "mining",
    chip: "timer",
    intervalSec: 60,
    targetRecipeId: "copper_wire",
  };
}

export function parseCustomBlueprint(raw: unknown): CustomMachineBlueprint {
  const base = defaultCustomBlueprint();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const v = raw as Record<string, unknown>;
  const nameRaw = typeof v.name === "string" ? v.name.trim().slice(0, 28) : "";
  const frame = CUSTOM_FRAMES.some((f) => f.id === v.frame)
    ? (v.frame as CustomFrameId)
    : base.frame;
  const core = CUSTOM_CORES.some((c) => c.id === v.core) ? (v.core as CustomCoreId) : base.core;
  const mod = CUSTOM_MODULES.some((m) => m.id === v.module)
    ? (v.module as CustomModuleId)
    : base.module;
  const chip = CUSTOM_CHIPS.some((c) => c.id === v.chip) ? (v.chip as CustomChipId) : base.chip;
  const intervalSec = DEVICE_INTERVAL_CHOICES.includes(v.intervalSec as number)
    ? (v.intervalSec as number)
    : base.intervalSec;
  const targetRecipe =
    typeof v.targetRecipeId === "string" && recipeById(v.targetRecipeId) ? v.targetRecipeId : null;
  return {
    version: 2,
    name: nameRaw || base.name,
    frame,
    core,
    module: mod,
    chip,
    intervalSec,
    targetRecipeId: targetRecipe,
  };
}

export function encodeCustomBlueprint(bp: CustomMachineBlueprint): string {
  const json = JSON.stringify(parseCustomBlueprint(bp));
  return "WB2." + Buffer.from(json, "utf8").toString("base64url");
}

export function decodeCustomBlueprint(code: unknown): CustomMachineBlueprint | null {
  if (typeof code !== "string" || !code.startsWith("WB2.")) return null;
  try {
    const raw = JSON.parse(Buffer.from(code.slice(4), "base64url").toString("utf8")) as unknown;
    if (!raw || typeof raw !== "object") return null;
    return parseCustomBlueprint(raw);
  } catch {
    return null;
  }
}

export function customBlueprintCost(bp: CustomMachineBlueprint): Record<string, number> {
  const clean = parseCustomBlueprint(bp);
  const out: Record<string, number> = { circuit_board: 1 };
  const f = CUSTOM_FRAMES.find((x) => x.id === clean.frame)!;
  const c = CUSTOM_CORES.find((x) => x.id === clean.core)!;
  const m = CUSTOM_MODULES.find((x) => x.id === clean.module)!;
  const ch = CUSTOM_CHIPS.find((x) => x.id === clean.chip)!;
  for (const partMap of [f.cost, c.cost, m.cost, ch.cost]) {
    for (const [id, n] of Object.entries(partMap)) {
      out[id] = (out[id] ?? 0) + n;
    }
  }
  return out;
}

export interface VendingSlot {
  itemId: string;
  price: number;
  stock: number;
}

export type LogisticsRouteMode = "buffer" | "feed_cnc" | "feed_vending";

export interface MachineState {
  ownerId: string;
  ownerKey?: string;
  machineType?: string;
  program: DeviceProgram;
  buffer: Record<string, number>;
  inputs?: Record<string, number>;
  targetRecipeId?: string | null;
  blueprint?: CustomMachineBlueprint | null;
  vending?: VendingSlot[];
  vendingSales?: number;
  alerts?: { at: number; message: string; actorId?: string }[];
  poweredByNearby?: boolean;
  routeMode?: LogisticsRouteMode;
  lastEvalAt: number;
  updatedAt: number;
}

function parseItemCounts(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [itemId, count] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof count === "number" && Number.isFinite(count) && count > 0) {
        out[itemId] = Math.min(9999, Math.floor(count));
      }
    }
  }
  return out;
}

function parseVendingSlots(raw: unknown): VendingSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: VendingSlot[] = [];
  for (const row of raw.slice(0, 6)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const def = itemById(r.itemId);
    if (!def) continue;
    const price =
      typeof r.price === "number" && Number.isFinite(r.price)
        ? Math.max(10, Math.min(1_000_000, Math.floor(r.price)))
        : def.price;
    const stock =
      typeof r.stock === "number" && Number.isFinite(r.stock)
        ? Math.max(0, Math.min(999, Math.floor(r.stock)))
        : 0;
    if (stock > 0) out.push({ itemId: def.id, price, stock });
  }
  return out;
}

export function parseMachineState(raw: unknown): MachineState | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const v = data as Record<string, unknown>;
  if (typeof v.ownerId !== "string" || v.ownerId.length === 0) return null;
  const buffer = parseItemCounts(v.buffer);
  const out: MachineState = {
    ownerId: v.ownerId,
    program: parseProgram(v.program),
    buffer,
    lastEvalAt:
      typeof v.lastEvalAt === "number" && Number.isFinite(v.lastEvalAt) ? v.lastEvalAt : 0,
    updatedAt: typeof v.updatedAt === "number" && Number.isFinite(v.updatedAt) ? v.updatedAt : 0,
  };
  if (typeof v.ownerKey === "string" && v.ownerKey.length > 0) {
    out.ownerKey = v.ownerKey;
  }
  if (typeof v.machineType === "string" && isMachineItem(v.machineType)) {
    out.machineType = v.machineType;
  }
  if (v.inputs && typeof v.inputs === "object") {
    const inp = parseItemCounts(v.inputs);
    if (Object.keys(inp).length > 0) out.inputs = inp;
  }
  if (typeof v.targetRecipeId === "string" && recipeById(v.targetRecipeId)) {
    out.targetRecipeId = v.targetRecipeId;
  }
  if (v.blueprint && typeof v.blueprint === "object") {
    out.blueprint = parseCustomBlueprint(v.blueprint);
  }
  if (Array.isArray(v.vending)) {
    const slots = parseVendingSlots(v.vending);
    if (slots.length > 0) out.vending = slots;
  }
  if (typeof v.vendingSales === "number" && Number.isFinite(v.vendingSales) && v.vendingSales > 0) {
    out.vendingSales = Math.floor(v.vendingSales);
  }
  if (Array.isArray(v.alerts)) {
    out.alerts = v.alerts
      .filter(
        (a): a is { at: number; message: string; actorId?: string } =>
          !!a && typeof a === "object" && typeof (a as { message?: unknown }).message === "string",
      )
      .slice(0, 12);
  }
  if (v.poweredByNearby === true) out.poweredByNearby = true;
  if (v.routeMode === "buffer" || v.routeMode === "feed_cnc" || v.routeMode === "feed_vending") {
    out.routeMode = v.routeMode;
  }
  return out;
}

export function machineBufferCount(state: MachineState): number {
  return Object.values(state.buffer).reduce((sum, n) => sum + n, 0);
}

export interface MachineEvalResult {
  state: MachineState;
  changed: Map<string, TileOverride>;
  harvested: number;
  evaluated: boolean;
}

export function evaluateMachine(
  state: MachineState,
  neighbors: ReadonlyMap<string, TileOverride>,
  now: number,
): MachineEvalResult {
  const unchanged: MachineEvalResult = {
    state,
    changed: new Map(),
    harvested: 0,
    evaluated: false,
  };
  if (!state.program.enabled) return unchanged;
  if (now - state.lastEvalAt < state.program.intervalSec * 1000) return unchanged;
  const buffer = { ...state.buffer };
  const changed = new Map<string, TileOverride>();
  let harvested = 0;
  for (const [key, ov] of neighbors) {
    if (!ov.crop || ov.ownerId !== state.ownerId) continue;
    if (ov.crop.readyAt > now) continue;
    const crop = cropById(ov.crop.cropId);
    if (!crop) continue;
    buffer[crop.produceId] = (buffer[crop.produceId] ?? 0) + crop.produceCount;
    harvested += crop.produceCount;
    changed.set(key, { ...ov, crop: null });
  }
  return {
    state: { ...state, buffer, lastEvalAt: now, updatedAt: now },
    changed,
    harvested,
    evaluated: true,
  };
}

export const CNC_RECIPES: readonly Recipe[] = [
  "copper_wire",
  "steel_plate",
  "circuit_board",
  "microchip",
  "servo_motor",
  "battery_cell",
  "solar_cell",
  "sensor_unit",
  "hydraulic_piston",
  "lockpick",
  "police_cuffs",
  "iron_ingot",
  "copper_ingot",
  "gold_ingot",
  "glass",
  "bread",
]
  .map((id) => recipeById(id))
  .filter((r): r is Recipe => r !== null);

const MINING_DROP_TABLE: readonly { itemId: string; weight: number }[] = [
  { itemId: "stone", weight: 40 },
  { itemId: "coal", weight: 25 },
  { itemId: "copper_ore", weight: 16 },
  { itemId: "iron_ore", weight: 12 },
  { itemId: "sulfur", weight: 4 },
  { itemId: "gold_ore", weight: 2 },
  { itemId: "ruby", weight: 1 },
];

function deterministicRoll(x: number, y: number, step: number): number {
  let h = (x * 374761393 + y * 668265263 + step * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function pickMiningOre(x: number, y: number, step: number, luckBoost: boolean): string {
  let roll = deterministicRoll(x, y, step);
  if (luckBoost) roll = Math.min(0.9999, roll * 0.65 + 0.35);
  const total = MINING_DROP_TABLE.reduce((s, r) => s + r.weight, 0);
  let cursor = roll * total;
  for (const row of MINING_DROP_TABLE) {
    cursor -= row.weight;
    if (cursor <= 0) return row.itemId;
  }
  return "stone";
}

export interface ExtendedEvalContext {
  machineType: string;
  x: number;
  y: number;
  neighbors: ReadonlyMap<string, TileOverride>;
  neighborMachines?: ReadonlyMap<string, MachineState>;
  now: number;
  powered?: boolean;
}

export function evaluateExtendedMachine(
  state: MachineState,
  ctx: ExtendedEvalContext,
): MachineEvalResult {
  const { machineType, x, y, neighbors, now, powered } = ctx;
  const unchanged: MachineEvalResult = {
    state,
    changed: new Map(),
    harvested: 0,
    evaluated: false,
  };
  if (!state.program.enabled) return unchanged;

  const bp = machineType === "custom_machine" ? parseCustomBlueprint(state.blueprint) : null;
  const coreSpeed = bp ? (CUSTOM_CORES.find((c) => c.id === bp.core)?.speedMult ?? 1) : 1;
  const effectiveSpeed = coreSpeed * (powered ? 2 : 1);
  const baseIntervalMs = (bp ? bp.intervalSec : state.program.intervalSec) * 1000;
  const effectiveIntervalMs = Math.max(10_000, Math.floor(baseIntervalMs / effectiveSpeed));

  const elapsed = now - state.lastEvalAt;
  if (elapsed < effectiveIntervalMs) return unchanged;

  const cycles = Math.min(8, Math.max(1, Math.floor(elapsed / effectiveIntervalMs)));
  const buffer = { ...state.buffer };
  const inputs = { ...(state.inputs ?? {}) };
  const changed = new Map<string, TileOverride>();
  let harvested = 0;

  if (machineType === "auto_harvester") {
    return evaluateMachine(state, neighbors, now);
  }

  if (machineType === "auto_planter") {
    const seedKeys = Object.keys(inputs).filter(
      (id) => itemById(id)?.category === "seed" && inputs[id] > 0,
    );
    for (const [key, ov] of neighbors) {
      if (!ov.farmland || ov.crop || ov.ownerId !== state.ownerId) continue;
      const seedId = seedKeys.find((s) => (inputs[s] ?? 0) > 0);
      if (!seedId) break;
      const cropId = seedId.replace(/_seed$/, "");
      const crop = cropById(cropId);
      if (!crop) continue;
      inputs[seedId] -= 1;
      if (inputs[seedId] <= 0) delete inputs[seedId];
      changed.set(key, {
        ...ov,
        crop: { cropId: crop.id, plantedAt: now, readyAt: now + crop.growthMinutes * 60_000 },
      });
      harvested += 1;
    }
  } else if (machineType === "auto_miner") {
    for (let c = 0; c < cycles; c++) {
      const step = Math.floor(now / effectiveIntervalMs) + c;
      const oreId = pickMiningOre(x, y, step, Boolean(powered));
      buffer[oreId] = (buffer[oreId] ?? 0) + 1;
      harvested += 1;
    }
  } else if (machineType === "cnc_factory") {
    const recipe = recipeById(state.targetRecipeId ?? "copper_wire");
    if (recipe) {
      for (let c = 0; c < cycles; c++) {
        const canCraft = Object.entries(recipe.inputs).every(
          ([inId, req]) => (inputs[inId] ?? 0) >= req,
        );
        if (!canCraft) break;
        for (const [inId, req] of Object.entries(recipe.inputs)) {
          inputs[inId] = (inputs[inId] ?? 0) - req;
          if (inputs[inId] <= 0) delete inputs[inId];
        }
        buffer[recipe.output] = (buffer[recipe.output] ?? 0) + recipe.outputCount;
        harvested += recipe.outputCount;
      }
    }
  } else if (machineType === "power_generator") {
    // Passively stores clean battery charge bonus shards periodically when fueled or sunny
    if (cycles >= 2) {
      buffer.data_shard = (buffer.data_shard ?? 0) + 1;
      harvested += 1;
    }
  } else if (machineType === "custom_machine" && bp) {
    const frameMult = CUSTOM_FRAMES.find((f) => f.id === bp.frame)?.yieldMult ?? 1;
    const chipBonus = bp.chip === "overclock" ? 1 : 0;
    const smartFilter = bp.chip === "smart_filter";

    if (bp.module === "agro") {
      for (const [key, ov] of neighbors) {
        if (!ov.crop || ov.ownerId !== state.ownerId || ov.crop.readyAt > now) continue;
        const crop = cropById(ov.crop.cropId);
        if (!crop) continue;
        const amount = Math.max(1, Math.round(crop.produceCount * frameMult) + chipBonus);
        buffer[crop.produceId] = (buffer[crop.produceId] ?? 0) + amount;
        harvested += amount;
        changed.set(key, { ...ov, crop: null });
      }
    } else if (bp.module === "mining") {
      for (let c = 0; c < cycles; c++) {
        const oreId = pickMiningOre(x, y, Math.floor(now / effectiveIntervalMs) + c, smartFilter);
        const qty = Math.max(1, Math.floor(frameMult) + chipBonus);
        buffer[oreId] = (buffer[oreId] ?? 0) + qty;
        harvested += qty;
      }
    } else if (bp.module === "compute") {
      for (let c = 0; c < Math.min(4, cycles); c++) {
        const qty = Math.max(1, Math.floor(frameMult));
        buffer.data_shard = (buffer.data_shard ?? 0) + qty;
        harvested += qty;
      }
    } else if (bp.module === "cnc") {
      const recipe = recipeById(bp.targetRecipeId ?? state.targetRecipeId ?? "copper_wire");
      if (recipe) {
        for (let c = 0; c < cycles; c++) {
          const canCraft = Object.entries(recipe.inputs).every(
            ([inId, req]) => (inputs[inId] ?? 0) >= req,
          );
          if (!canCraft) break;
          for (const [inId, req] of Object.entries(recipe.inputs)) {
            inputs[inId] = (inputs[inId] ?? 0) - req;
            if (inputs[inId] <= 0) delete inputs[inId];
          }
          const outQty = Math.max(1, Math.round(recipe.outputCount * frameMult) + chipBonus);
          buffer[recipe.output] = (buffer[recipe.output] ?? 0) + outQty;
          harvested += outQty;
        }
      }
    }
  }

  return {
    state: {
      ...state,
      machineType,
      buffer,
      inputs: Object.keys(inputs).length > 0 ? inputs : undefined,
      poweredByNearby: Boolean(powered),
      lastEvalAt: now,
      updatedAt: now,
    },
    changed,
    harvested,
    evaluated: true,
  };
}

export function hasSecurityCoverage(
  overrides: Readonly<Record<string, TileOverride>>,
  x: number,
  y: number,
  ownerId?: string,
): { protected: boolean; ownerId: string | null } {
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const ov = overrides[`${Math.floor(x) + dx},${Math.floor(y) + dy}`];
      if (!ov?.block) continue;
      if (ov.block.itemId === "security_camera") {
        if (!ownerId || ov.block.ownerId === ownerId) {
          return { protected: true, ownerId: ov.block.ownerId };
        }
      }
    }
  }
  return { protected: false, ownerId: null };
}
