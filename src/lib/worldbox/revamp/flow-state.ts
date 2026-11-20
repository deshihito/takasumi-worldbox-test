import {
  DEFAULT_ECONOMY_TUNING,
  computeMarketQuote,
  executeBankCoverToCash,
  executeCraftInFactory,
  executeEmergencyRelief,
  executeGigDelivery,
  executeMarketBuy,
  executePrisonEscapeOrBail,
  type EconomyTuningParams,
  type WalletAccount,
} from "./economy-model";

export type RevampScreenId = "field" | "dispatch" | "market" | "factory" | "finance" | "prison";

export type FaultInjectionMode = "none" | "latency_600ms" | "conflict_409";

export interface ScreenMeta {
  id: RevampScreenId;
  label: string;
  shortLabel: string;
  replacesLegacyPanels: readonly string[];
  primaryPurpose: string;
}

export const REVAMP_SCREENS: readonly ScreenMeta[] = [
  {
    id: "field",
    label: "フィールド・生活圏マップ",
    shortLabel: "マップ",
    replacesLegacyPanels: ["WorldBoxClient Canvas", "WorldBoxMapModal"],
    primaryPurpose: "移動・空間スポット検知・NPC追跡・各業務への直接ディープリンク",
  },
  {
    id: "dispatch",
    label: "仕事・配車・カフェ運営",
    shortLabel: "仕事",
    replacesLegacyPanels: ["WorldBoxJobPanel", "WorldBoxGuildBoardPanel", "WorldBoxMetroPanel"],
    primaryPurpose: "配送受注・マップ自動ピン連携・カフェ接客・緊急救済ワーク",
  },
  {
    id: "market",
    label: "動的取引所・P2P交換",
    shortLabel: "取引所",
    replacesLegacyPanels: [
      "WorldBoxMarketPanel",
      "WorldBoxEconomyPanel (Shop/Sell)",
      "WorldBoxTradePanel",
      "WorldBoxGuildShopPanel",
    ],
    primaryPurpose: "需給連動板売買・工場BOM不足のワンクリック調達・P2Pエスクロー交換",
  },
  {
    id: "factory",
    label: "精密工房・機械ライン",
    shortLabel: "工房",
    replacesLegacyPanels: [
      "WorldBoxEngineeringPanel",
      "WorldBoxMachinePanel",
      "WorldBoxCompanyPanel (Factory)",
    ],
    primaryPurpose: "レシピBOM不足自動検出・取引所ラウンドトリップ・製造・維持焼却",
  },
  {
    id: "finance",
    label: "統合ウォレット・銀行・不動産",
    shortLabel: "財務",
    replacesLegacyPanels: [
      "WorldBoxFinancePanel",
      "WorldBoxStockPanel",
      "WorldBoxRealEstatePanel",
      "WorldBoxGovernancePanel",
    ],
    primaryPurpose: "現金/銀行/負債/資産の一元精算・不足額即時融資カバー・固定資産税",
  },
  {
    id: "prison",
    label: "治安・司法・刑務所ループ",
    shortLabel: "司法",
    replacesLegacyPanels: ["WorldBoxPrisonPanel", "WorldBoxGovernancePanel (Court)"],
    primaryPurpose: "手配監視・保釈(銀行/現金)・懲役減刑・ステルス換気口脱獄",
  },
];

export interface FlowContextPayload {
  selectedRecipeId: string;
  marketItemId: string;
  marketQty: number;
  shortfallWbc: number;
  selectedDistrictId: string;
  targetCitizenId: string;
  activeDeliverySpot: { id: string; label: string; x: number; y: number } | null;
  lastErrorBanner: string | null;
  interruptedScreen: RevampScreenId | null;
}

export interface FlowNavFrame {
  screen: RevampScreenId;
  reasonLabel: string;
  draftItemId?: string;
  draftQty?: number;
}

export interface TelemetryEvent {
  seq: number;
  atLabel: string;
  fromScreen: RevampScreenId;
  toScreen: RevampScreenId;
  action: string;
  cashDelta: number;
  bankDelta: number;
  sinkBurned: number;
  status: "ok" | "blocked" | "rolled_back" | "interrupted";
  detail: string;
}

export interface RevampSessionState {
  activeScreen: RevampScreenId;
  returnStack: FlowNavFrame[];
  context: FlowContextPayload;
  account: WalletAccount;
  marketSupply: Record<string, number>;
  marketDemand: Record<string, number>;
  tuning: EconomyTuningParams;
  faultMode: FaultInjectionMode;
  busyTxId: string | null;
  stepCount: number;
  telemetry: TelemetryEvent[];
}

export function createInitialSessionState(
  preset: "standard" | "low_cash_deadlock_test" | "jailed_inmate" = "standard",
): RevampSessionState {
  const baseAccount: WalletAccount =
    preset === "low_cash_deadlock_test"
      ? {
          id: "citizen_01",
          name: "検証市民（残高枯渇状態）",
          cash: 45,
          bank: 0,
          debt: 0,
          escrow: 0,
          stamina: 4,
          jailed: false,
          sentenceLeftSec: 0,
          wantedLevel: 0,
          bounty: 0,
          hourlyNetFaucet: 0,
          hourlySinkPaid: 0,
          inventory: { wood: 1 },
          deedsOwned: 0,
          machinesOwned: 0,
        }
      : preset === "jailed_inmate"
        ? {
            id: "citizen_03",
            name: "検証囚人（収監ロック状態）",
            cash: 380,
            bank: 3400,
            debt: 0,
            escrow: 0,
            stamina: 62,
            jailed: true,
            sentenceLeftSec: 180,
            wantedLevel: 0,
            bounty: 0,
            hourlyNetFaucet: 920,
            hourlySinkPaid: 310,
            inventory: { stone: 2, lockpick: 1 },
            deedsOwned: 0,
            machinesOwned: 0,
          }
        : {
            id: "citizen_02",
            name: "テストオペレータ（標準状態）",
            cash: 1150,
            bank: 6800,
            debt: 0,
            escrow: 0,
            stamina: 82,
            jailed: false,
            sentenceLeftSec: 0,
            wantedLevel: 1,
            bounty: 450,
            hourlyNetFaucet: 1840,
            hourlySinkPaid: 420,
            inventory: {
              wood: 4,
              stone: 2,
              copper_ore: 3,
              coal: 2,
              steel_plate: 3,
              onigiri: 2,
            },
            deedsOwned: 1,
            machinesOwned: 1,
          };

  return {
    activeScreen: preset === "jailed_inmate" ? "prison" : "field",
    returnStack: [],
    context: {
      selectedRecipeId: "auto_harvester",
      marketItemId: "circuit_board",
      marketQty: 1,
      shortfallWbc: 0,
      selectedDistrictId: "shinjuku_central",
      targetCitizenId: "npc_courier_7",
      activeDeliverySpot: { id: "station_east", label: "メトロ東口ターミナル", x: 64, y: 38 },
      lastErrorBanner: null,
      interruptedScreen: null,
    },
    account: baseAccount,
    marketSupply: {
      wood: 340,
      stone: 360,
      coal: 210,
      copper_ore: 165,
      iron_ore: 135,
      mithril: 32,
      copper_wire: 95,
      steel_plate: 76,
      circuit_board: 42,
      lockpick: 24,
      auto_harvester: 19,
      cnc_factory: 11,
      onigiri: 250,
      bento: 110,
      energy_drink: 185,
      deed_studio: 18,
    },
    marketDemand: {
      wood: 360,
      stone: 350,
      coal: 250,
      copper_ore: 215,
      iron_ore: 190,
      mithril: 52,
      copper_wire: 120,
      steel_plate: 110,
      circuit_board: 68,
      lockpick: 38,
      auto_harvester: 25,
      cnc_factory: 16,
      onigiri: 290,
      bento: 135,
      energy_drink: 205,
      deed_studio: 22,
    },
    tuning: { ...DEFAULT_ECONOMY_TUNING },
    faultMode: "none",
    busyTxId: null,
    stepCount: 0,
    telemetry: [],
  };
}

function appendLog(
  state: RevampSessionState,
  entry: Omit<TelemetryEvent, "seq" | "atLabel">,
): TelemetryEvent[] {
  const seq = state.stepCount + 1;
  const sec = seq * 4;
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return [{ ...entry, seq, atLabel: `T+${mm}:${ss}` }, ...state.telemetry].slice(0, 24);
}

const RESTRICTED_IN_PRISON: ReadonlySet<RevampScreenId> = new Set([
  "dispatch",
  "market",
  "factory",
]);

export function navigateToScreen(
  state: RevampSessionState,
  target: RevampScreenId,
  opts: {
    pushReturn?: boolean;
    reasonLabel?: string;
    contextPatch?: Partial<FlowContextPayload>;
  } = {},
): RevampSessionState {
  const nextContext: FlowContextPayload = {
    ...state.context,
    ...opts.contextPatch,
    lastErrorBanner: null,
  };

  // Edge case: Jailed user attempting to open commercial/dispatch surfaces
  if (state.account.jailed && RESTRICTED_IN_PRISON.has(target)) {
    const blockedMsg = `収監中のため「${target}」はロック中。刑務所端末または保釈で解除（作業中ドラフトを保持）`;
    return {
      ...state,
      activeScreen: "prison",
      context: {
        ...nextContext,
        interruptedScreen: state.context.interruptedScreen ?? target,
        lastErrorBanner: blockedMsg,
      },
      stepCount: state.stepCount + 1,
      telemetry: appendLog(state, {
        fromScreen: state.activeScreen,
        toScreen: "prison",
        action: `guard_redirect:${target}`,
        cashDelta: 0,
        bankDelta: 0,
        sinkBurned: 0,
        status: "blocked",
        detail: blockedMsg,
      }),
    };
  }

  const nextStack = opts.pushReturn
    ? [
        ...state.returnStack,
        {
          screen: state.activeScreen,
          reasonLabel: opts.reasonLabel ?? "作業継続",
          draftItemId: nextContext.marketItemId,
          draftQty: nextContext.marketQty,
        },
      ].slice(-5)
    : state.returnStack;

  return {
    ...state,
    activeScreen: target,
    returnStack: nextStack,
    context: nextContext,
    stepCount: state.stepCount + 1,
    telemetry: appendLog(state, {
      fromScreen: state.activeScreen,
      toScreen: target,
      action: opts.pushReturn ? `deeplink_push:${target}` : `switch:${target}`,
      cashDelta: 0,
      bankDelta: 0,
      sinkBurned: 0,
      status: "ok",
      detail: opts.reasonLabel ?? `${target} 画面へ状態引継遷移`,
    }),
  };
}

export function returnFromStack(state: RevampSessionState): RevampSessionState {
  if (state.returnStack.length === 0) return state;
  const top = state.returnStack[state.returnStack.length - 1];
  const rest = state.returnStack.slice(0, -1);
  return navigateToScreen({ ...state, returnStack: rest }, top.screen, {
    pushReturn: false,
    reasonLabel: `戻り遷移 (${top.reasonLabel} 完了)`,
    contextPatch: {
      marketItemId: top.draftItemId ?? state.context.marketItemId,
      marketQty: top.draftQty ?? state.context.marketQty,
      lastErrorBanner: null,
    },
  });
}

export function triggerArrestInterrupt(
  state: RevampSessionState,
  sentenceSec = 180,
): RevampSessionState {
  const pausedScreen =
    state.activeScreen !== "prison" ? state.activeScreen : state.context.interruptedScreen;
  const nextAccount: WalletAccount = {
    ...state.account,
    jailed: true,
    sentenceLeftSec: sentenceSec,
    wantedLevel: 0,
    bounty: 0,
  };
  return {
    ...state,
    activeScreen: "prison",
    account: nextAccount,
    context: {
      ...state.context,
      interruptedScreen: pausedScreen,
      lastErrorBanner: `現行犯逮捕: 商取引を一時凍結し刑務所へ強制連行（解放後 ${pausedScreen ?? "field"} へ復帰可能）`,
    },
    stepCount: state.stepCount + 1,
    telemetry: appendLog(state, {
      fromScreen: state.activeScreen,
      toScreen: "prison",
      action: "arrest_interrupt",
      cashDelta: 0,
      bankDelta: 0,
      sinkBurned: 0,
      status: "interrupted",
      detail: `強制収監 (${sentenceSec}s)、直前作業「${pausedScreen}」の状態を退避`,
    }),
  };
}

export type PrototypeAction =
  | { kind: "gig_delivery"; hasVehicle: boolean }
  | { kind: "emergency_relief" }
  | { kind: "factory_craft"; itemId: string }
  | { kind: "market_buy"; itemId: string; qty: number }
  | { kind: "bank_cover"; amount: number; autoReturn?: boolean }
  | { kind: "prison_action"; mode: "bail_cash" | "bail_bank" | "labor" | "stealth_escape" };

export function executeFlowAction(
  state: RevampSessionState,
  action: PrototypeAction,
): RevampSessionState {
  if (state.faultMode === "conflict_409") {
    return {
      ...state,
      stepCount: state.stepCount + 1,
      context: {
        ...state.context,
        lastErrorBanner:
          "409 競合検知（フォールトインジェクション）: オプティミスティック更新を自動ロールバック済み（残高・在庫に欠損なし）",
      },
      telemetry: appendLog(state, {
        fromScreen: state.activeScreen,
        toScreen: state.activeScreen,
        action: `rollback_409:${action.kind}`,
        cashDelta: 0,
        bankDelta: 0,
        sinkBurned: 0,
        status: "rolled_back",
        detail: "409 conflict simulated; snapshot rolled back cleanly",
      }),
    };
  }

  const prevCash = state.account.cash;
  const prevBank = state.account.bank;

  if (action.kind === "gig_delivery") {
    const out = executeGigDelivery(state.account, action.hasVehicle, state.tuning);
    if (!out.ok) {
      return {
        ...state,
        stepCount: state.stepCount + 1,
        context: { ...state.context, lastErrorBanner: out.note },
        telemetry: appendLog(state, {
          fromScreen: state.activeScreen,
          toScreen: state.activeScreen,
          action: "gig_delivery_failed",
          cashDelta: 0,
          bankDelta: 0,
          sinkBurned: 0,
          status: "blocked",
          detail: out.note,
        }),
      };
    }
    return {
      ...state,
      account: out.account,
      stepCount: state.stepCount + 1,
      context: { ...state.context, lastErrorBanner: null },
      telemetry: appendLog(state, {
        fromScreen: state.activeScreen,
        toScreen: state.activeScreen,
        action: "gig_delivery",
        cashDelta: out.account.cash - prevCash,
        bankDelta: 0,
        sinkBurned: out.sinkBurned,
        status: "ok",
        detail: out.note,
      }),
    };
  }

  if (action.kind === "emergency_relief") {
    const out = executeEmergencyRelief(state.account);
    if (!out.ok) {
      return {
        ...state,
        stepCount: state.stepCount + 1,
        context: { ...state.context, lastErrorBanner: out.note },
        telemetry: appendLog(state, {
          fromScreen: state.activeScreen,
          toScreen: state.activeScreen,
          action: "emergency_relief_denied",
          cashDelta: 0,
          bankDelta: 0,
          sinkBurned: 0,
          status: "blocked",
          detail: out.note,
        }),
      };
    }
    return {
      ...state,
      account: out.account,
      stepCount: state.stepCount + 1,
      context: { ...state.context, lastErrorBanner: null },
      telemetry: appendLog(state, {
        fromScreen: state.activeScreen,
        toScreen: state.activeScreen,
        action: "emergency_relief",
        cashDelta: out.account.cash - prevCash,
        bankDelta: 0,
        sinkBurned: 0,
        status: "ok",
        detail: out.note,
      }),
    };
  }

  if (action.kind === "factory_craft") {
    const out = executeCraftInFactory(
      state.account,
      action.itemId,
      state.marketSupply,
      state.tuning,
    );
    if (!out.ok) {
      return {
        ...state,
        stepCount: state.stepCount + 1,
        context: { ...state.context, lastErrorBanner: out.note },
        telemetry: appendLog(state, {
          fromScreen: state.activeScreen,
          toScreen: state.activeScreen,
          action: "factory_craft_failed",
          cashDelta: 0,
          bankDelta: 0,
          sinkBurned: 0,
          status: "blocked",
          detail: out.note,
        }),
      };
    }
    return {
      ...state,
      account: out.account,
      stepCount: state.stepCount + 1,
      context: { ...state.context, lastErrorBanner: null },
      telemetry: appendLog(state, {
        fromScreen: state.activeScreen,
        toScreen: state.activeScreen,
        action: `factory_craft:${action.itemId}`,
        cashDelta: out.account.cash - prevCash,
        bankDelta: 0,
        sinkBurned: out.sinkBurned,
        status: "ok",
        detail: out.note,
      }),
    };
  }

  if (action.kind === "market_buy") {
    const quote = computeMarketQuote(
      action.itemId,
      state.marketSupply[action.itemId] ?? 60,
      state.marketDemand[action.itemId] ?? 60,
      state.tuning,
    );
    const out = executeMarketBuy(state.account, action.itemId, action.qty, quote);
    if (!out.ok) {
      const shortfallMatch = /^shortfall:(\d+)$/.exec(out.error ?? "");
      const shortfallWbc = shortfallMatch ? Number(shortfallMatch[1]) : 0;
      return {
        ...state,
        stepCount: state.stepCount + 1,
        context: { ...state.context, shortfallWbc, lastErrorBanner: out.note },
        telemetry: appendLog(state, {
          fromScreen: state.activeScreen,
          toScreen: state.activeScreen,
          action: "market_buy_shortfall",
          cashDelta: 0,
          bankDelta: 0,
          sinkBurned: 0,
          status: "blocked",
          detail: out.note,
        }),
      };
    }
    const nextSupply = {
      ...state.marketSupply,
      [action.itemId]: Math.max(4, (state.marketSupply[action.itemId] ?? 60) - action.qty),
    };
    const nextDemand = {
      ...state.marketDemand,
      [action.itemId]: (state.marketDemand[action.itemId] ?? 60) + action.qty,
    };
    let nextState: RevampSessionState = {
      ...state,
      account: out.account,
      marketSupply: nextSupply,
      marketDemand: nextDemand,
      stepCount: state.stepCount + 1,
      context: { ...state.context, shortfallWbc: 0, lastErrorBanner: null },
      telemetry: appendLog(state, {
        fromScreen: state.activeScreen,
        toScreen: state.activeScreen,
        action: `market_buy:${action.itemId}x${action.qty}`,
        cashDelta: out.account.cash - prevCash,
        bankDelta: 0,
        sinkBurned: out.sinkBurned,
        status: "ok",
        detail: out.note,
      }),
    };
    if (
      nextState.returnStack.length > 0 &&
      nextState.returnStack[nextState.returnStack.length - 1].screen === "factory"
    ) {
      nextState = returnFromStack(nextState);
    }
    return nextState;
  }

  if (action.kind === "bank_cover") {
    const out = executeBankCoverToCash(state.account, action.amount);
    if (!out.ok) {
      return {
        ...state,
        stepCount: state.stepCount + 1,
        context: { ...state.context, lastErrorBanner: out.note },
        telemetry: appendLog(state, {
          fromScreen: state.activeScreen,
          toScreen: state.activeScreen,
          action: "bank_cover_failed",
          cashDelta: 0,
          bankDelta: 0,
          sinkBurned: 0,
          status: "blocked",
          detail: out.note,
        }),
      };
    }
    let nextState: RevampSessionState = {
      ...state,
      account: out.account,
      stepCount: state.stepCount + 1,
      context: { ...state.context, shortfallWbc: 0, lastErrorBanner: null },
      telemetry: appendLog(state, {
        fromScreen: state.activeScreen,
        toScreen: state.activeScreen,
        action: "bank_cover",
        cashDelta: out.account.cash - prevCash,
        bankDelta: out.account.bank - prevBank,
        sinkBurned: out.sinkBurned,
        status: "ok",
        detail: out.note,
      }),
    };
    if (action.autoReturn && nextState.returnStack.length > 0) {
      nextState = returnFromStack(nextState);
    }
    return nextState;
  }

  // prison_action
  const out = executePrisonEscapeOrBail(state.account, action.mode, state.tuning);
  if (!out.ok) {
    return {
      ...state,
      stepCount: state.stepCount + 1,
      context: { ...state.context, lastErrorBanner: out.note },
      telemetry: appendLog(state, {
        fromScreen: state.activeScreen,
        toScreen: state.activeScreen,
        action: `prison_failed:${action.mode}`,
        cashDelta: 0,
        bankDelta: 0,
        sinkBurned: 0,
        status: "blocked",
        detail: out.note,
      }),
    };
  }
  const justReleased = state.account.jailed && !out.account.jailed;
  const resumeTo =
    justReleased && state.context.interruptedScreen
      ? state.context.interruptedScreen
      : state.activeScreen;
  return {
    ...state,
    activeScreen: resumeTo,
    account: out.account,
    stepCount: state.stepCount + 1,
    context: {
      ...state.context,
      interruptedScreen: justReleased ? null : state.context.interruptedScreen,
      lastErrorBanner: null,
    },
    telemetry: appendLog(state, {
      fromScreen: state.activeScreen,
      toScreen: resumeTo,
      action: `prison:${action.mode}`,
      cashDelta: out.account.cash - prevCash,
      bankDelta: out.account.bank - prevBank,
      sinkBurned: out.sinkBurned,
      status: "ok",
      detail: out.note,
    }),
  };
}

export interface HcdFlowComparison {
  flowId: string;
  taskLabel: string;
  asIsClicks: number;
  toBeClicks: number;
  asIsModalHops: number;
  toBeModalHops: number;
  asIsApiFetches: number;
  toBeApiFetches: number;
  asIsMemoryRecallItems: number;
  toBeMemoryRecallItems: number;
  asIsEstSec: number;
  toBeEstSec: number;
  primaryBottleneck: string;
}

export const HCD_FLOW_COMPARISONS: readonly HcdFlowComparison[] = [
  {
    flowId: "craft_missing_bom_with_bank_cover",
    taskLabel: "BOM不足素材を市場調達＋銀行振替後に機械製造完了",
    asIsClicks: 16,
    toBeClicks: 4,
    asIsModalHops: 5,
    toBeModalHops: 2,
    asIsApiFetches: 6,
    toBeApiFetches: 2,
    asIsMemoryRecallItems: 6, // itemId x qty + unitPrice + cash shortfall
    toBeMemoryRecallItems: 0,
    asIsEstSec: 46,
    toBeEstSec: 9,
    primaryBottleneck: "モーダル閉鎖で選択品・不足数が揮発し、手入力と暗記を強制する記憶負荷",
  },
  {
    flowId: "delivery_dispatch_and_waypoint",
    taskLabel: "配送依頼受注→目的地自動コンパス設定→現地納品完了",
    asIsClicks: 7,
    toBeClicks: 3,
    asIsModalHops: 3,
    toBeModalHops: 1,
    asIsApiFetches: 3,
    toBeApiFetches: 2,
    asIsMemoryRecallItems: 3,
    toBeMemoryRecallItems: 0,
    asIsEstSec: 19,
    toBeEstSec: 6,
    primaryBottleneck: "JobPanel と MapModal の状態非連動・手動閉じる操作",
  },
  {
    flowId: "jailed_bail_from_bank",
    taskLabel: "収監中の残高確認→銀行資金での即時保釈→元画面復帰",
    asIsClicks: 11,
    toBeClicks: 2,
    asIsModalHops: 4,
    toBeModalHops: 1,
    asIsApiFetches: 4,
    toBeApiFetches: 1,
    asIsMemoryRecallItems: 4,
    toBeMemoryRecallItems: 0,
    asIsEstSec: 34,
    toBeEstSec: 5,
    primaryBottleneck: "収監中でも他パネルを一旦開けてから 409 error が出る遅延ガード",
  },
  {
    flowId: "zero_cash_zero_stamina_recovery",
    taskLabel: "残高0・空腹2状態からの労働可能ライン復帰",
    asIsClicks: 9,
    toBeClicks: 1,
    asIsModalHops: 3,
    toBeModalHops: 1,
    asIsApiFetches: 4,
    toBeApiFetches: 1,
    asIsMemoryRecallItems: 2,
    toBeMemoryRecallItems: 0,
    asIsEstSec: 31, // plus up to 600s wait if unemployment cooldown hit
    toBeEstSec: 3,
    primaryBottleneck: "雇用保険CDと空腹不足による行動デッドロック",
  },
];
