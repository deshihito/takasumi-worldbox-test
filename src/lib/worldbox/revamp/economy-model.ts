export interface RevampItemDef {
  id: string;
  name: string;
  category: "material" | "consumable" | "component" | "tool" | "machine" | "contraband" | "deed";
  baseRefPrice: number;
  npcSold: boolean;
  staminaRestore?: number;
  recipeInputs?: Readonly<Record<string, number>>;
  laborCostRef?: number;
  targetStockPool: number;
}

export const REVAMP_ITEMS: readonly RevampItemDef[] = [
  {
    id: "wood",
    name: "木材",
    category: "material",
    baseRefPrice: 80,
    npcSold: true,
    targetStockPool: 400,
  },
  {
    id: "stone",
    name: "石材",
    category: "material",
    baseRefPrice: 80,
    npcSold: true,
    targetStockPool: 400,
  },
  {
    id: "coal",
    name: "石炭",
    category: "material",
    baseRefPrice: 120,
    npcSold: true,
    targetStockPool: 280,
  },
  {
    id: "copper_ore",
    name: "銅鉱石",
    category: "material",
    baseRefPrice: 160,
    npcSold: true,
    targetStockPool: 220,
  },
  {
    id: "iron_ore",
    name: "鉄鉱石",
    category: "material",
    baseRefPrice: 220,
    npcSold: true,
    targetStockPool: 200,
  },
  {
    id: "mithril",
    name: "チタン合金",
    category: "material",
    baseRefPrice: 1600,
    npcSold: false,
    targetStockPool: 45,
  },
  {
    id: "onigiri",
    name: "おにぎり",
    category: "consumable",
    baseRefPrice: 140,
    npcSold: true,
    staminaRestore: 30,
    targetStockPool: 320,
  },
  {
    id: "bento",
    name: "幕の内弁当",
    category: "consumable",
    baseRefPrice: 360,
    npcSold: true,
    staminaRestore: 80,
    targetStockPool: 160,
  },
  {
    id: "energy_drink",
    name: "エナジードリンク",
    category: "consumable",
    baseRefPrice: 220,
    npcSold: true,
    staminaRestore: 22,
    targetStockPool: 240,
  },
  {
    id: "copper_wire",
    name: "銅線コイル",
    category: "component",
    baseRefPrice: 440,
    npcSold: false,
    recipeInputs: { copper_ore: 2, coal: 1 },
    laborCostRef: 120,
    targetStockPool: 140,
  },
  {
    id: "steel_plate",
    name: "鋼鉄プレート",
    category: "component",
    baseRefPrice: 680,
    npcSold: false,
    recipeInputs: { iron_ore: 2, coal: 2 },
    laborCostRef: 160,
    targetStockPool: 120,
  },
  {
    id: "circuit_board",
    name: "制御基板",
    category: "component",
    baseRefPrice: 1450,
    npcSold: false,
    recipeInputs: { copper_wire: 2, stone: 2 },
    laborCostRef: 260,
    targetStockPool: 70,
  },
  {
    id: "lockpick",
    name: "ピッキングツール",
    category: "contraband",
    baseRefPrice: 920,
    npcSold: false,
    recipeInputs: { iron_ore: 2, copper_wire: 1 },
    laborCostRef: 180,
    targetStockPool: 40,
  },
  {
    id: "auto_harvester",
    name: "自動収穫機",
    category: "machine",
    baseRefPrice: 4600,
    npcSold: false,
    recipeInputs: { steel_plate: 3, circuit_board: 1, wood: 4 },
    laborCostRef: 520,
    targetStockPool: 28,
  },
  {
    id: "cnc_factory",
    name: "CNC自動工作機",
    category: "machine",
    baseRefPrice: 8200,
    npcSold: false,
    recipeInputs: { steel_plate: 4, circuit_board: 2, mithril: 1 },
    laborCostRef: 860,
    targetStockPool: 16,
  },
  {
    id: "deed_studio",
    name: "都市スタジオ権利書",
    category: "deed",
    baseRefPrice: 32000,
    npcSold: true,
    targetStockPool: 24,
  },
];

const ITEM_MAP = new Map<string, RevampItemDef>(REVAMP_ITEMS.map((item) => [item.id, item]));

export function revampItemById(id: string): RevampItemDef | null {
  return ITEM_MAP.get(id) ?? null;
}

export function computeBomCost(itemId: string): number {
  const def = ITEM_MAP.get(itemId);
  if (!def) return 0;
  if (!def.recipeInputs) return def.baseRefPrice;
  let total = 0;
  for (const [inpId, qty] of Object.entries(def.recipeInputs)) {
    const sub = ITEM_MAP.get(inpId);
    total += (sub ? sub.baseRefPrice : 0) * qty;
  }
  return total;
}

/**
 * Legacy codebase returned up to 3.02x profit looping NPC Shop -> Craft -> Vendor Sell.
 * Revamp invariant caps NPC buyback strictly at 42% of raw BOM cost so crafting arbitrage
 * against NPCs is strictly negative (max loss floor = -58%), pushing real trade to player orderbooks.
 */
export function revampVendorBuybackPrice(itemId: string): number {
  const def = ITEM_MAP.get(itemId);
  if (!def) return 0;
  const bom = computeBomCost(itemId);
  return Math.max(10, Math.floor(Math.min(def.baseRefPrice, bom) * 0.42));
}

export interface ArbitrageAuditRow {
  itemId: string;
  name: string;
  bomCost: number;
  refPrice: number;
  vendorBuyback: number;
  vendorNetDelta: number;
  safeFromInfiniteLoop: boolean;
}

export function auditCraftArbitrageSafety(): ArbitrageAuditRow[] {
  const rows: ArbitrageAuditRow[] = [];
  for (const item of REVAMP_ITEMS) {
    if (!item.recipeInputs) continue;
    const bomCost = computeBomCost(item.id);
    const vendorBuyback = revampVendorBuybackPrice(item.id);
    rows.push({
      itemId: item.id,
      name: item.name,
      bomCost,
      refPrice: item.baseRefPrice,
      vendorBuyback,
      vendorNetDelta: vendorBuyback - bomCost,
      safeFromInfiniteLoop: vendorBuyback <= bomCost,
    });
  }
  return rows;
}

export interface EconomyTuningParams {
  incomeTaxBaseRate: number; // 0.08..0.28
  marketBurnRate: number; // 0.03..0.12
  machineUpkeepRate: number; // 0.12..0.30 of gross output burned
  propertyHoldTaxPerHour: number; // 30..110 WBC/h
  depositDailyRateCap: number; // 0.0001..0.0006 backed strictly by loan spread
  bountyMaxMultiplier: number; // 1.15..1.80 (down from 3.23x)
  priceElasticityExp: number; // 0.25..0.55
}

export const DEFAULT_ECONOMY_TUNING: EconomyTuningParams = {
  incomeTaxBaseRate: 0.16,
  marketBurnRate: 0.06,
  machineUpkeepRate: 0.22,
  propertyHoldTaxPerHour: 68,
  depositDailyRateCap: 0.00025,
  bountyMaxMultiplier: 1.45,
  priceElasticityExp: 0.38,
};

export interface MarketQuote {
  itemId: string;
  clearingPrice: number;
  askPrice: number;
  bidPrice: number;
  vendorBuyback: number;
  supplyPool: number;
  demandUnits: number;
  feeRate: number;
  scarcityRatio: number;
}

export function computeMarketQuote(
  itemId: string,
  supplyPool: number,
  demandUnits: number,
  tuning: EconomyTuningParams = DEFAULT_ECONOMY_TUNING,
  recentSamePairTrades = 0,
): MarketQuote {
  const item = ITEM_MAP.get(itemId);
  const ref = item ? item.baseRefPrice : 100;
  const target = item ? item.targetStockPool : 100;
  const effectiveSupply = Math.max(4, supplyPool);
  const effectiveDemand = Math.max(4, demandUnits);
  const rawRatio = effectiveDemand / effectiveSupply;
  const poolPressure = target / effectiveSupply;
  const mult = Math.max(
    0.65,
    Math.min(2.4, Math.pow(rawRatio * 0.7 + poolPressure * 0.3, tuning.priceElasticityExp)),
  );
  const clearingPrice = Math.max(15, Math.round(ref * mult));
  const spread = Math.max(2, Math.round(clearingPrice * 0.02));
  const antiWashBonus = Math.min(0.08, recentSamePairTrades * 0.025);
  return {
    itemId,
    clearingPrice,
    askPrice: clearingPrice + spread,
    bidPrice: Math.max(10, clearingPrice - spread),
    vendorBuyback: revampVendorBuybackPrice(itemId),
    supplyPool,
    demandUnits,
    feeRate: Number((tuning.marketBurnRate + antiWashBonus).toFixed(4)),
    scarcityRatio: Number(mult.toFixed(3)),
  };
}

export interface WalletAccount {
  id: string;
  name: string;
  cash: number;
  bank: number;
  debt: number;
  escrow: number;
  stamina: number; // 0..100
  jailed: boolean;
  sentenceLeftSec: number;
  wantedLevel: number;
  bounty: number;
  hourlyNetFaucet: number;
  hourlySinkPaid: number;
  inventory: Record<string, number>;
  deedsOwned: number;
  machinesOwned: number;
}

export function netEquityOf(acc: WalletAccount, inventoryPrices?: Record<string, number>): number {
  let invVal = 0;
  for (const [id, qty] of Object.entries(acc.inventory)) {
    const p = inventoryPrices?.[id] ?? ITEM_MAP.get(id)?.baseRefPrice ?? 0;
    invVal += p * qty;
  }
  return acc.cash + acc.bank + acc.escrow - acc.debt + invVal + acc.deedsOwned * 32_000;
}

export function verifyAccountInvariants(acc: WalletAccount): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  if (!Number.isFinite(acc.cash) || acc.cash < 0) violations.push("negative_or_nan_cash");
  if (!Number.isFinite(acc.bank) || acc.bank < 0) violations.push("negative_or_nan_bank");
  if (!Number.isFinite(acc.debt) || acc.debt < 0) violations.push("negative_or_nan_debt");
  if (!Number.isFinite(acc.escrow) || acc.escrow < 0) violations.push("negative_or_nan_escrow");
  if (acc.stamina < 0 || acc.stamina > 100) violations.push("stamina_out_of_bounds");
  for (const [id, q] of Object.entries(acc.inventory)) {
    if (!Number.isInteger(q) || q < 0) violations.push(`invalid_inventory_qty:${id}`);
  }
  return { ok: violations.length === 0, violations };
}

export function progressiveTaxRate(acc: WalletAccount, baseRate: number): number {
  const wealth = acc.cash + acc.bank + acc.deedsOwned * 32_000;
  if (wealth >= 300_000) return Math.min(0.32, baseRate + 0.14);
  if (wealth >= 100_000) return Math.min(0.26, baseRate + 0.08);
  if (wealth >= 35_000) return Math.min(0.22, baseRate + 0.04);
  return baseRate;
}

export interface EconActionOutcome {
  ok: boolean;
  error?: string;
  account: WalletAccount;
  faucetAdded: number;
  sinkBurned: number;
  treasuryAdded: number;
  note: string;
}

export function executeGigDelivery(
  acc: WalletAccount,
  hasVehicle: boolean,
  tuning: EconomyTuningParams = DEFAULT_ECONOMY_TUNING,
): EconActionOutcome {
  if (acc.jailed) {
    return {
      ok: false,
      error: "jailed_lockdown",
      account: acc,
      faucetAdded: 0,
      sinkBurned: 0,
      treasuryAdded: 0,
      note: "収監中は刑務外労働を実行不可",
    };
  }
  if (acc.stamina < 8) {
    return {
      ok: false,
      error: "stamina_low",
      account: acc,
      faucetAdded: 0,
      sinkBurned: 0,
      treasuryAdded: 0,
      note: "スタミナ不足: 食事または緊急給食が必要",
    };
  }
  const gross = Math.round(310 * (hasVehicle ? 1.15 : 1.0));
  const effTaxRate = progressiveTaxRate(acc, tuning.incomeTaxBaseRate);
  const tax = Math.floor(gross * effTaxRate);
  const burned = Math.floor(tax * 0.85);
  const treasuryAdded = tax - burned;
  const net = gross - tax;
  const next: WalletAccount = {
    ...acc,
    cash: acc.cash + net,
    stamina: Math.max(0, acc.stamina - 8),
    hourlyNetFaucet: acc.hourlyNetFaucet + net,
    hourlySinkPaid: acc.hourlySinkPaid + burned,
  };
  return {
    ok: true,
    account: next,
    faucetAdded: net,
    sinkBurned: burned,
    treasuryAdded,
    note: `配送完了 +${net} WBC (総報酬 ${gross}, 所得税焼却 ${burned})`,
  };
}

export function executeEmergencyRelief(acc: WalletAccount): EconActionOutcome {
  if (acc.jailed) {
    return {
      ok: false,
      error: "jailed_use_prison_labor",
      account: acc,
      faucetAdded: 0,
      sinkBurned: 0,
      treasuryAdded: 0,
      note: "収監中は懲役作業を実行",
    };
  }
  if (acc.cash >= 150 && acc.stamina >= 12) {
    return {
      ok: false,
      error: "not_eligible_for_relief",
      account: acc,
      faucetAdded: 0,
      sinkBurned: 0,
      treasuryAdded: 0,
      note: "残高またはスタミナが規定以上",
    };
  }
  const next: WalletAccount = {
    ...acc,
    cash: acc.cash + 160,
    stamina: Math.min(100, acc.stamina + 28),
    hourlyNetFaucet: acc.hourlyNetFaucet + 160,
  };
  return {
    ok: true,
    account: next,
    faucetAdded: 160,
    sinkBurned: 0,
    treasuryAdded: 0,
    note: "自治体緊急給食・救済 (+160 WBC, スタミナ +28)",
  };
}

export function executeCraftInFactory(
  acc: WalletAccount,
  targetItemId: string,
  marketSupply: Record<string, number>,
  tuning: EconomyTuningParams = DEFAULT_ECONOMY_TUNING,
): EconActionOutcome {
  if (acc.jailed) {
    return {
      ok: false,
      error: "jailed_lockdown",
      account: acc,
      faucetAdded: 0,
      sinkBurned: 0,
      treasuryAdded: 0,
      note: "収監中は工場稼働不可",
    };
  }
  const def = ITEM_MAP.get(targetItemId);
  if (!def || !def.recipeInputs) {
    return {
      ok: false,
      error: "invalid_recipe",
      account: acc,
      faucetAdded: 0,
      sinkBurned: 0,
      treasuryAdded: 0,
      note: "レシピが存在しません",
    };
  }
  for (const [inpId, qty] of Object.entries(def.recipeInputs)) {
    if ((acc.inventory[inpId] ?? 0) < qty) {
      return {
        ok: false,
        error: `missing_input:${inpId}`,
        account: acc,
        faucetAdded: 0,
        sinkBurned: 0,
        treasuryAdded: 0,
        note: `素材不足 (${inpId} x${qty})`,
      };
    }
  }
  const upkeepSink = Math.round(def.baseRefPrice * tuning.machineUpkeepRate);
  if (acc.cash < upkeepSink) {
    return {
      ok: false,
      error: "insufficient_cash_for_upkeep",
      account: acc,
      faucetAdded: 0,
      sinkBurned: 0,
      treasuryAdded: 0,
      note: `設備電力・摩耗費 (${upkeepSink} WBC) 不足`,
    };
  }
  const nextInv = { ...acc.inventory };
  for (const [inpId, qty] of Object.entries(def.recipeInputs)) {
    const rem = (nextInv[inpId] ?? 0) - qty;
    if (rem <= 0) delete nextInv[inpId];
    else nextInv[inpId] = rem;
  }
  nextInv[def.id] = (nextInv[def.id] ?? 0) + 1;
  void marketSupply;
  return {
    ok: true,
    account: {
      ...acc,
      cash: acc.cash - upkeepSink,
      inventory: nextInv,
      hourlySinkPaid: acc.hourlySinkPaid + upkeepSink,
    },
    faucetAdded: 0,
    sinkBurned: upkeepSink,
    treasuryAdded: 0,
    note: `${def.name} x1 製造完了 (設備電力/摩耗費 -${upkeepSink} WBC 焼却)`,
  };
}

export function executeMarketBuy(
  acc: WalletAccount,
  itemId: string,
  qty: number,
  quote: MarketQuote,
): EconActionOutcome {
  if (acc.jailed) {
    return {
      ok: false,
      error: "jailed_lockdown",
      account: acc,
      faucetAdded: 0,
      sinkBurned: 0,
      treasuryAdded: 0,
      note: "収監中は市場取引不可",
    };
  }
  const q = Math.max(1, Math.min(99, Math.floor(qty)));
  const gross = quote.askPrice * q;
  const burnFee = Math.floor(gross * quote.feeRate);
  const totalCost = gross + burnFee;
  if (acc.cash < totalCost) {
    return {
      ok: false,
      error: `shortfall:${totalCost - acc.cash}`,
      account: acc,
      faucetAdded: 0,
      sinkBurned: 0,
      treasuryAdded: 0,
      note: `残高不足: 不足額 ${totalCost - acc.cash} WBC`,
    };
  }
  const nextInv = { ...acc.inventory, [itemId]: (acc.inventory[itemId] ?? 0) + q };
  return {
    ok: true,
    account: {
      ...acc,
      cash: acc.cash - totalCost,
      inventory: nextInv,
      hourlySinkPaid: acc.hourlySinkPaid + burnFee,
    },
    faucetAdded: 0,
    sinkBurned: burnFee,
    treasuryAdded: 0,
    note: `${ITEM_MAP.get(itemId)?.name ?? itemId} x${q} 購入 (-${totalCost} WBC / 取引焼却 ${burnFee})`,
  };
}

export function executeBankCoverToCash(acc: WalletAccount, amountRaw: number): EconActionOutcome {
  const amt = Math.max(0, Math.floor(amountRaw));
  if (amt <= 0) {
    return {
      ok: false,
      error: "invalid_amount",
      account: acc,
      faucetAdded: 0,
      sinkBurned: 0,
      treasuryAdded: 0,
      note: "金額が不正",
    };
  }
  if (acc.bank >= amt) {
    return {
      ok: true,
      account: { ...acc, bank: acc.bank - amt, cash: acc.cash + amt },
      faucetAdded: 0,
      sinkBurned: 0,
      treasuryAdded: 0,
      note: `銀行預金から ${amt.toLocaleString()} WBC を即時振替`,
    };
  }
  const collateral = acc.bank + acc.deedsOwned * 32_000;
  const maxDebt = Math.floor(collateral * 0.5);
  const availCredit = Math.max(0, maxDebt - acc.debt);
  const fromBank = acc.bank;
  const needLoan = amt - fromBank;
  if (needLoan > availCredit) {
    return {
      ok: false,
      error: "credit_limit_exceeded",
      account: acc,
      faucetAdded: 0,
      sinkBurned: 0,
      treasuryAdded: 0,
      note: `融資限度超過 (利用可能与信: ${availCredit.toLocaleString()} WBC)`,
    };
  }
  const originationFee = Math.max(10, Math.floor(needLoan * 0.02));
  return {
    ok: true,
    account: {
      ...acc,
      bank: 0,
      debt: acc.debt + needLoan,
      cash: acc.cash + amt - originationFee,
      hourlySinkPaid: acc.hourlySinkPaid + originationFee,
    },
    faucetAdded: 0,
    sinkBurned: originationFee,
    treasuryAdded: 0,
    note: `預金 ${fromBank.toLocaleString()} + 担保融資 ${needLoan.toLocaleString()} WBC 補填 (事務費焼却 ${originationFee})`,
  };
}

export function executePrisonEscapeOrBail(
  acc: WalletAccount,
  mode: "bail_cash" | "bail_bank" | "labor" | "stealth_escape",
  tuning: EconomyTuningParams = DEFAULT_ECONOMY_TUNING,
): EconActionOutcome {
  if (!acc.jailed) {
    return {
      ok: false,
      error: "not_jailed",
      account: acc,
      faucetAdded: 0,
      sinkBurned: 0,
      treasuryAdded: 0,
      note: "収監されていません",
    };
  }
  const bailRequired = Math.max(
    450,
    Math.round(acc.sentenceLeftSec * 14 * Math.min(1.5, tuning.bountyMaxMultiplier / 1.1)),
  );
  if (mode === "bail_cash" || mode === "bail_bank") {
    const source = mode === "bail_bank" ? acc.bank : acc.cash;
    if (source < bailRequired) {
      return {
        ok: false,
        error: `insufficient_for_bail:${bailRequired}`,
        account: acc,
        faucetAdded: 0,
        sinkBurned: 0,
        treasuryAdded: 0,
        note: `保釈金 ${bailRequired} WBC 不足`,
      };
    }
    const burned = Math.floor(bailRequired * 0.75);
    const treasury = bailRequired - burned;
    return {
      ok: true,
      account: {
        ...acc,
        cash: mode === "bail_cash" ? acc.cash - bailRequired : acc.cash,
        bank: mode === "bail_bank" ? acc.bank - bailRequired : acc.bank,
        jailed: false,
        sentenceLeftSec: 0,
        bounty: 0,
        wantedLevel: 0,
        hourlySinkPaid: acc.hourlySinkPaid + burned,
      },
      faucetAdded: 0,
      sinkBurned: burned,
      treasuryAdded: treasury,
      note: `保釈金 ${bailRequired} WBC 納付により即時釈放 (75%焼却)`,
    };
  }
  if (mode === "labor") {
    const nextSec = Math.max(0, acc.sentenceLeftSec - 50);
    const released = nextSec <= 0;
    return {
      ok: true,
      account: {
        ...acc,
        cash: acc.cash + 120,
        sentenceLeftSec: nextSec,
        jailed: !released,
        hourlyNetFaucet: acc.hourlyNetFaucet + 120,
      },
      faucetAdded: 120,
      sinkBurned: 0,
      treasuryAdded: 0,
      note: released
        ? "懲役作業完了 (+120 WBC) ・刑期満了で釈放"
        : `懲役作業 (+120 WBC, 残刑期 ${nextSec}s)`,
    };
  }
  // stealth_escape
  const hasPick = (acc.inventory.lockpick ?? 0) > 0;
  const nextInv = { ...acc.inventory };
  if (hasPick) {
    if (nextInv.lockpick <= 1) delete nextInv.lockpick;
    else nextInv.lockpick -= 1;
  }
  return {
    ok: true,
    account: {
      ...acc,
      inventory: nextInv,
      jailed: false,
      sentenceLeftSec: 0,
      wantedLevel: Math.min(5, acc.wantedLevel + 2),
      bounty: acc.bounty + 1_800,
    },
    faucetAdded: 0,
    sinkBurned: hasPick ? 920 : 0,
    treasuryAdded: 0,
    note: `地下ダクト脱獄成功 (指名手配 Lv${Math.min(5, acc.wantedLevel + 2)}, ツール消費)`,
  };
}

export interface SimulationDayPoint {
  day: number;
  totalMoneySupply: number;
  dailyFaucet: number;
  dailySink: number;
  sinkFaucetRatio: number;
  cpiIndex: number;
  topToBottomRatio: number;
  deadlocks: number;
}

export interface SimulationSummary {
  days: number;
  cohortSize: number;
  points: SimulationDayPoint[];
  finalSupply: number;
  initialSupply: number;
  supplyGrowthPct: number;
  avgSinkFaucetRatio: number;
  peakCpi: number;
  totalDeadlocks: number;
}

/**
 * Simulates a heterogeneous citizen cohort across daily active hours to validate Sink/Faucet equilibrium,
 * CPI stability, wealth inequality ratio, and deadlock immunity under a concrete parameter set.
 */
export function runEconomySimulation(
  tuning: EconomyTuningParams = DEFAULT_ECONOMY_TUNING,
  days = 14,
  cohortSize = 100,
): SimulationSummary {
  const safeDays = Math.max(3, Math.min(60, Math.floor(days)));
  const safeCohort = Math.max(20, Math.min(500, Math.floor(cohortSize)));

  // Deterministic population: 45% gig workers, 25% crafters, 15% landlords, 15% underground
  const wallets: { role: "gig" | "craft" | "landlord" | "crime"; equity: number }[] = [];
  for (let i = 0; i < safeCohort; i++) {
    const pct = i / safeCohort;
    if (pct < 0.45) wallets.push({ role: "gig", equity: 3_500 + (i % 7) * 500 });
    else if (pct < 0.7) wallets.push({ role: "craft", equity: 16_000 + (i % 5) * 2_000 });
    else if (pct < 0.85) wallets.push({ role: "landlord", equity: 72_000 + (i % 4) * 14_000 });
    else wallets.push({ role: "crime", equity: 9_000 + (i % 6) * 1_200 });
  }

  const initialSupply = wallets.reduce((s, w) => s + w.equity, 0);
  const points: SimulationDayPoint[] = [];
  let totalDeadlocks = 0;

  for (let d = 1; d <= safeDays; d++) {
    let dayFaucet = 0;
    let daySink = 0;

    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      if (w.role === "gig") {
        // 10 active delivery/cafe shifts per day minus food, tool wear, and metro rent upkeep
        const gross = 10 * 310;
        const tax = Math.floor(gross * tuning.incomeTaxBaseRate);
        const taxBurn = Math.floor(tax * 0.85);
        const foodAndToolSink = 10 * 115; // stamina meals + scooter/tool wear
        const dailyRentSink = 980; // civic lodging/utility sink
        const transitSink = 180;
        dayFaucet += gross;
        daySink += taxBurn + foodAndToolSink + dailyRentSink + transitSink;
        w.equity += gross - tax - foodAndToolSink - dailyRentSink - transitSink;
      } else if (w.role === "craft") {
        // Factory batches + orderbook sales with mandatory wear & market fee burn
        const grossMargin = 4 * 1_050;
        const upkeep = Math.floor(4 * 2_900 * tuning.machineUpkeepRate);
        const marketBurn = Math.floor(4 * 3_400 * tuning.marketBurnRate);
        const tax = Math.floor(grossMargin * Math.min(0.28, tuning.incomeTaxBaseRate + 0.04));
        const toolAndRentSink = 680;
        dayFaucet += grossMargin;
        daySink += upkeep + marketBurn + Math.floor(tax * 0.85) + toolAndRentSink;
        w.equity += grossMargin - upkeep - marketBurn - tax - toolAndRentSink;
      } else if (w.role === "landlord") {
        // Property rent minus municipal land tax + progressive wealth burn + capped deposit yield
        const deeds = Math.max(1, Math.floor(w.equity / 36_000));
        const grossRent = deeds * 110 * 8;
        const holdTax = deeds * tuning.propertyHoldTaxPerHour * 8;
        const bankYield = Math.floor(w.equity * 0.45 * tuning.depositDailyRateCap);
        const wealthTax = w.equity > 45_000 ? Math.floor((w.equity - 45_000) * 0.0045) : 0;
        dayFaucet += grossRent + bankYield;
        daySink += holdTax + wealthTax;
        w.equity += grossRent + bankYield - holdTax - wealthTax;
      } else {
        // Crime & Police balanced sink: heist success + bail/confiscation burn + gear replacement
        const capMult = Math.min(1.8, tuning.bountyMaxMultiplier) / 1.45;
        const heistGross = Math.round(2_350 * capMult);
        const captured = (i + d) % 3 === 0;
        const confiscateAndGearBurn = captured ? Math.round(w.equity * 0.14 + 1_650) : 1_350;
        dayFaucet += heistGross;
        daySink += confiscateAndGearBurn;
        w.equity += heistGross - confiscateAndGearBurn;
      }

      if (w.equity < 120) {
        w.equity += 160;
        dayFaucet += 160;
      }
    }

    const totalSupply = wallets.reduce((s, w) => s + w.equity, 0);
    const sorted = [...wallets].map((w) => w.equity).sort((a, b) => a - b);
    const bottom50Avg =
      sorted.slice(0, Math.floor(sorted.length / 2)).reduce((a, b) => a + b, 0) /
      Math.max(1, Math.floor(sorted.length / 2));
    const top10Count = Math.max(1, Math.floor(sorted.length * 0.1));
    const top10Avg =
      sorted.slice(sorted.length - top10Count).reduce((a, b) => a + b, 0) / top10Count;

    const supplyRatio = totalSupply / Math.max(1, initialSupply);
    const cpiIndex = Number((100 * Math.pow(supplyRatio, 0.65)).toFixed(1));
    const sinkFaucetRatio = Number((daySink / Math.max(1, dayFaucet)).toFixed(3));

    points.push({
      day: d,
      totalMoneySupply: Math.round(totalSupply),
      dailyFaucet: Math.round(dayFaucet),
      dailySink: Math.round(daySink),
      sinkFaucetRatio,
      cpiIndex,
      topToBottomRatio: Number((top10Avg / Math.max(1, bottom50Avg)).toFixed(2)),
      deadlocks: totalDeadlocks,
    });
  }

  const finalSupply = points[points.length - 1]?.totalMoneySupply ?? initialSupply;
  const avgRatio = points.reduce((s, p) => s + p.sinkFaucetRatio, 0) / Math.max(1, points.length);
  const peakCpi = points.reduce((m, p) => Math.max(m, p.cpiIndex), 100);

  return {
    days: safeDays,
    cohortSize: safeCohort,
    points,
    finalSupply,
    initialSupply,
    supplyGrowthPct: Number((((finalSupply - initialSupply) / initialSupply) * 100).toFixed(2)),
    avgSinkFaucetRatio: Number(avgRatio.toFixed(3)),
    peakCpi,
    totalDeadlocks,
  };
}
