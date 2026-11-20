import {
  createInitialSessionState,
  executeFlowAction,
  navigateToScreen,
  triggerArrestInterrupt,
  type RevampScreenId,
  type RevampSessionState,
} from "./flow-state";

export type LoadAxis = "認知負荷" | "入力負荷" | "待機負荷" | "状態復帰負荷";

export interface PersonaStepSpec {
  stepNo: number;
  targetScreen: RevampScreenId;
  actionTitle: string;
  loadAxis: LoadAxis;
  asIsLoadScore: number; // 1..10
  toBeLoadScore: number; // 1..10
  asIsFailureOrFriction: string;
  toBeMechanism: string;
  execute: (state: RevampSessionState) => RevampSessionState;
}

export interface PersonaScenario {
  id: string;
  code: string;
  archetype: string;
  sessionGoal: string;
  preset: "standard" | "low_cash_deadlock_test" | "jailed_inmate";
  hardwareAssumption: string;
  steps: readonly PersonaStepSpec[];
}

export const REVAMP_PERSONAS: readonly PersonaScenario[] = [
  {
    id: "persona_craft_bom",
    code: "ペルソナ1（工房・自動ライン経営層）",
    archetype: "高資本・複合レシピ運用・複数スクリーン横断プレイヤー",
    sessionGoal:
      "自動収穫機の不足素材（制御基板）を取引所で買い、現金不足を銀行から補填して製造完了する",
    preset: "standard",
    hardwareAssumption: "デスクトップ高解像度（1920x1080・60fps・2ボタン＋キーボード即時切替）",
    steps: [
      {
        stepNo: 1,
        targetScreen: "factory",
        actionTitle: "フィールドから工房を開き自動収穫機を選択",
        loadAxis: "認知負荷",
        asIsLoadScore: 7,
        toBeLoadScore: 2,
        asIsFailureOrFriction:
          "EngineeringPanel と EconomyPanel の作業台タブが分離し、不足材料を暗記して閉じる必要あり",
        toBeMechanism: "工房画面で在庫・不足BOM・市場参考単価を同一カード上に即時算出",
        execute: (s) =>
          navigateToScreen(s, "factory", {
            reasonLabel: "自動収穫機のBOM確認",
            contextPatch: { selectedRecipeId: "auto_harvester" },
          }),
      },
      {
        stepNo: 2,
        targetScreen: "market",
        actionTitle: "不足素材（制御基板 x1）を状態引継で取引所へディープリンク",
        loadAxis: "入力負荷",
        asIsLoadScore: 9,
        toBeLoadScore: 2,
        asIsFailureOrFriction:
          "351アイテムから手動検索し数量を再入力。MetroPanel経由だと zIndex 競合でモーダルが重なる",
        toBeMechanism:
          "returnStack に factory を積み、itemId=circuit_board と qty=1 を自動プリフィル遷移",
        execute: (s) =>
          navigateToScreen(s, "market", {
            pushReturn: true,
            reasonLabel: "不足素材調達: 制御基板 x1",
            contextPatch: { marketItemId: "circuit_board", marketQty: 1 },
          }),
      },
      {
        stepNo: 3,
        targetScreen: "market",
        actionTitle: "現金不足を検出し、銀行預金から不足額のみ即時補填",
        loadAxis: "状態復帰負荷",
        asIsLoadScore: 8,
        toBeLoadScore: 2,
        asIsFailureOrFriction:
          "購入失敗後に Finance/Economy 銀行タブを別開きし、不足金額を暗算入力して出金後に取引所を開き直す",
        toBeMechanism:
          "market_buy で不足額 shortfallWbc を算出し、財務画面へ exact amount 引継→自動戻り遷移",
        execute: (s) => {
          const attempted = executeFlowAction(s, {
            kind: "market_buy",
            itemId: "circuit_board",
            qty: 1,
          });
          // Pre-flight HCD cover: include market shortfall + downstream craft upkeep (1,012 WBC for auto_harvester)
          const upkeepReserve = Math.round(4600 * s.tuning.machineUpkeepRate);
          const totalNeededCover = (attempted.context.shortfallWbc || 850) + upkeepReserve;
          const toFin = navigateToScreen(attempted, "finance", {
            pushReturn: true,
            reasonLabel: `調達+稼働維持費 一括補填 (${totalNeededCover} WBC)`,
            contextPatch: { shortfallWbc: totalNeededCover },
          });
          return executeFlowAction(toFin, {
            kind: "bank_cover",
            amount: totalNeededCover,
            autoReturn: true,
          });
        },
      },
      {
        stepNo: 4,
        targetScreen: "factory",
        actionTitle: "不足補填済みで制御基板を購入し、自動で工房に戻って製造実行",
        loadAxis: "待機負荷",
        asIsLoadScore: 8,
        toBeLoadScore: 2,
        asIsFailureOrFriction: "各モーダル開閉ごとに個別 GET 待ち（計 6 回）が発生",
        toBeMechanism:
          "購入成功で returnStack から自動ポップし、工房で 1 クリック製造（維持費18%焼却）完了",
        execute: (s) => {
          const bought = executeFlowAction(s, {
            kind: "market_buy",
            itemId: "circuit_board",
            qty: 1,
          });
          return executeFlowAction(bought, { kind: "factory_craft", itemId: "auto_harvester" });
        },
      },
    ],
  },
  {
    id: "persona_outlaw_arrest",
    code: "ペルソナ2（犯罪・司法介入・脱獄/保釈層）",
    archetype: "高リスク行動・現行犯逮捕による割り込み状態遷移の検証対象",
    sessionGoal:
      "取引作業中の強制収監割り込みから、銀行資産または懲役労働で釈放され元作業へ復帰する",
    preset: "standard",
    hardwareAssumption: "デスクトップ環境・リアルタイム治安通報・複数画面割り込み発生",
    steps: [
      {
        stepNo: 1,
        targetScreen: "market",
        actionTitle: "取引所閲覧中に現行犯逮捕割り込みが発生",
        loadAxis: "状態復帰負荷",
        asIsLoadScore: 9,
        toBeLoadScore: 2,
        asIsFailureOrFriction:
          "逮捕されても旧モーダルが閉じず操作時に 409 in_prison エラーだけ返り迷子になる",
        toBeMechanism:
          "arrest_interrupt が全取引タブをロックし、直前画面 interruptedScreen を退避して司法画面へ切替",
        execute: (s) => {
          const mkt = navigateToScreen(s, "market", {
            reasonLabel: "相場確認中",
            contextPatch: { marketItemId: "mithril", marketQty: 2 },
          });
          return triggerArrestInterrupt(mkt, 180);
        },
      },
      {
        stepNo: 2,
        targetScreen: "prison",
        actionTitle: "収監ロック中の取引所再アクセスを検証",
        loadAxis: "認知負荷",
        asIsLoadScore: 7,
        toBeLoadScore: 1,
        asIsFailureOrFriction: "各パネルを開けるためプレイヤーが禁止事項に気づきにくい",
        toBeMechanism: "遷移前ガードがブロック理由と解除手段（銀行保釈／懲役／換気口脱獄）を明示",
        execute: (s) => navigateToScreen(s, "market"),
      },
      {
        stepNo: 3,
        targetScreen: "prison",
        actionTitle: "懲役ワークプレスで刑期短縮と労働報酬を取得後、銀行保釈で釈放＋元画面復帰",
        loadAxis: "入力負荷",
        asIsLoadScore: 8,
        toBeLoadScore: 2,
        asIsFailureOrFriction:
          "銀行残高しか十分でなくても保釈時に現金不足エラーとなり、銀行窓口へ行く矛盾が発生",
        toBeMechanism:
          "司法画面から銀行直接保釈を許可し、釈放と同時に退避していた market 画面へ自動復帰",
        execute: (s) => {
          const worked = executeFlowAction(s, { kind: "prison_action", mode: "labor" });
          return executeFlowAction(worked, { kind: "prison_action", mode: "bail_bank" });
        },
      },
    ],
  },
  {
    id: "persona_zero_cash_rescue",
    code: "ペルソナ3（残高枯渇・スタミナ切れ新規市民）",
    archetype: "現金45 WBC / スタミナ4 / クールタイム衝突のリカバリ検証対象",
    sessionGoal: "通常の労働や食事が不能なデッドロック状態から 1 操作で通常経済ループへ復帰する",
    preset: "low_cash_deadlock_test",
    hardwareAssumption: "初回セッション・アイテム未所持・食料購入不可状態",
    steps: [
      {
        stepNo: 1,
        targetScreen: "dispatch",
        actionTitle: "配送ギグ実行を試み、スタミナ不足（< 8）を検出",
        loadAxis: "状態復帰負荷",
        asIsLoadScore: 10,
        toBeLoadScore: 2,
        asIsFailureOrFriction:
          "現金 45 WBC のためパン (100 WBC) も買えず、doWork も実行不能、雇用保険CD中は完全停止",
        toBeMechanism:
          "スタミナ不足検知直下に条件達成型の「自治体緊急給食＆即時清掃」導線をインライン提示",
        execute: (s) => {
          const d = navigateToScreen(s, "dispatch", { reasonLabel: "配送業務開始" });
          return executeFlowAction(d, { kind: "gig_delivery", hasVehicle: false });
        },
      },
      {
        stepNo: 2,
        targetScreen: "dispatch",
        actionTitle: "緊急救済ワーク実行（現金 +160, スタミナ +28）後に通常の配送ギグ完了",
        loadAxis: "待機負荷",
        asIsLoadScore: 9,
        toBeLoadScore: 1,
        asIsFailureOrFriction: "10分クールダウン待機またはコンビニ移動が必要",
        toBeMechanism: "前提条件ゼロの救済アクションで即座に配送可能域へ復帰し、配送報酬獲得",
        execute: (s) => {
          const relieved = executeFlowAction(s, { kind: "emergency_relief" });
          return executeFlowAction(relieved, { kind: "gig_delivery", hasVehicle: false });
        },
      },
    ],
  },
];
