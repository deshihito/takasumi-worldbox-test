"use client";
import { WbIcon, type WbIconName } from "@/app/games/worldbox/WbIcon";
import {
  REVAMP_ITEMS,
  computeBomCost,
  computeMarketQuote,
  progressiveTaxRate,
  revampItemById,
} from "@/lib/worldbox/revamp/economy-model";
import type {
  PrototypeAction,
  RevampScreenId,
  RevampSessionState,
} from "@/lib/worldbox/revamp/flow-state";

interface WireframeScreensProps {
  state: RevampSessionState;
  onNavigate: (
    screen: RevampScreenId,
    opts?: { pushReturn?: boolean; reasonLabel?: string; contextPatch?: Record<string, unknown> },
  ) => void;
  onAction: (action: PrototypeAction) => void;
  onPopReturn: () => void;
}

const boxStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.85)",
  border: "1px solid rgba(148, 163, 184, 0.25)",
  borderRadius: 12,
  padding: 14,
  display: "grid",
  gap: 12,
};

const btnPrimary: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid rgba(56, 189, 248, 0.55)",
  background: "rgba(2, 132, 199, 0.35)",
  color: "#e0f2fe",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const btnGreen: React.CSSProperties = {
  ...btnPrimary,
  border: "1px solid rgba(52, 211, 153, 0.55)",
  background: "rgba(5, 150, 105, 0.35)",
  color: "#d1fae5",
};

const btnWarn: React.CSSProperties = {
  ...btnPrimary,
  border: "1px solid rgba(251, 191, 36, 0.55)",
  background: "rgba(217, 119, 6, 0.35)",
  color: "#fef3c7",
};

const btnDanger: React.CSSProperties = {
  ...btnPrimary,
  border: "1px solid rgba(248, 113, 113, 0.55)",
  background: "rgba(220, 38, 38, 0.35)",
  color: "#fee2e2",
};

const FIELD_DISTRICTS: readonly {
  id: string;
  label: string;
  x: number;
  y: number;
  icon: WbIconName;
  screen: RevampScreenId;
  summary: string;
}[] = [
  {
    id: "shinjuku_central",
    label: "新東京メトロ中央プラザ",
    x: 42,
    y: 44,
    icon: "city",
    screen: "dispatch",
    summary: "カフェ稼働 / 市役所 / 緊急給食窓口",
  },
  {
    id: "station_east",
    label: "メトロ東口ロジスティクス",
    x: 72,
    y: 34,
    icon: "truck",
    screen: "dispatch",
    summary: "配送ターゲット / 物流ターミナル",
  },
  {
    id: "market_exchange",
    label: "グランド証券・商品取引所",
    x: 68,
    y: 70,
    icon: "bag",
    screen: "market",
    summary: "動的需給板 / P2Pエスクロー交換",
  },
  {
    id: "industrial_park",
    label: "スチーム精密工業区",
    x: 24,
    y: 28,
    icon: "factory",
    screen: "factory",
    summary: "BOM精密工房 / 自動収穫機ライン",
  },
  {
    id: "central_bank",
    label: "中央銀行・都市登記庁",
    x: 28,
    y: 72,
    icon: "bank",
    screen: "finance",
    summary: "預金 / 融資担保 / 不動産維持税",
  },
  {
    id: "central_prison",
    label: "中央矯正刑務所・面会棟",
    x: 84,
    y: 80,
    icon: "lock",
    screen: "prison",
    summary: "保釈窓口 / 懲役プレス / 換気口",
  },
];

export default function WireframeScreens({
  state,
  onNavigate,
  onAction,
  onPopReturn,
}: WireframeScreensProps) {
  const { activeScreen, account, context, marketSupply, marketDemand, tuning } = state;

  if (activeScreen === "field") {
    return (
      <div style={boxStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 15 }}
          >
            <WbIcon name="map" size={18} color="#38bdf8" />
            <span>Screen 0: 統合フィールド・空間コンテキスト直結ワイヤーフレーム</span>
          </div>
          <span style={{ fontSize: 11.5, color: "#94a3b8" }}>
            ノードをクリックすると現場座標を維持して各業務画面へディープリンク遷移します
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(260px, 1.3fr) minmax(240px, 1fr)",
            gap: 12,
          }}
        >
          <svg
            viewBox="0 0 100 100"
            style={{
              width: "100%",
              maxHeight: 280,
              background: "linear-gradient(160deg, #0b1220 0%, #111c2d 100%)",
              border: "1px solid rgba(56,189,248,0.3)",
              borderRadius: 10,
            }}
          >
            {/* District connector roads */}
            <line
              x1="42"
              y1="44"
              x2="72"
              y2="34"
              stroke="rgba(148,163,184,0.35)"
              strokeWidth="1.2"
            />
            <line
              x1="42"
              y1="44"
              x2="68"
              y2="70"
              stroke="rgba(148,163,184,0.35)"
              strokeWidth="1.2"
            />
            <line
              x1="42"
              y1="44"
              x2="24"
              y2="28"
              stroke="rgba(148,163,184,0.35)"
              strokeWidth="1.2"
            />
            <line
              x1="42"
              y1="44"
              x2="28"
              y2="72"
              stroke="rgba(148,163,184,0.35)"
              strokeWidth="1.2"
            />
            <line
              x1="68"
              y1="70"
              x2="84"
              y2="80"
              stroke="rgba(248,113,113,0.35)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />

            {context.activeDeliverySpot && (
              <line
                x1="42"
                y1="44"
                x2={context.activeDeliverySpot.x}
                y2={context.activeDeliverySpot.y}
                stroke="#34d399"
                strokeWidth="1.4"
                strokeDasharray="3 2"
              />
            )}

            {FIELD_DISTRICTS.map((d) => {
              const selected = context.selectedDistrictId === d.id;
              return (
                <g
                  key={d.id}
                  style={{ cursor: "pointer" }}
                  onClick={() =>
                    onNavigate("field", {
                      contextPatch: { selectedDistrictId: d.id },
                    })
                  }
                >
                  <circle
                    cx={d.x}
                    cy={d.y}
                    r={selected ? 5.2 : 3.8}
                    fill={d.screen === "prison" ? "rgba(220,38,38,0.45)" : "rgba(2,132,199,0.4)"}
                    stroke={selected ? "#34d399" : "#38bdf8"}
                    strokeWidth={selected ? "1.3" : "0.8"}
                  />
                  <text
                    x={d.x}
                    y={d.y - 6}
                    textAnchor="middle"
                    fill="#e2e8f0"
                    fontSize="3.4"
                    fontWeight="bold"
                  >
                    {d.label}
                  </text>
                </g>
              );
            })}
          </svg>

          <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
            {FIELD_DISTRICTS.map((d) => {
              const active = context.selectedDistrictId === d.id;
              return (
                <div
                  key={d.id}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: active
                      ? "1px solid rgba(52,211,153,0.6)"
                      : "1px solid rgba(148,163,184,0.2)",
                    background: active ? "rgba(5,150,105,0.12)" : "rgba(255,255,255,0.03)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontWeight: 700,
                        fontSize: 12.5,
                      }}
                    >
                      <WbIcon name={d.icon} size={14} color="#38bdf8" />
                      <span>{d.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{d.summary}</div>
                  </div>
                  <button
                    type="button"
                    style={btnPrimary}
                    onClick={() =>
                      onNavigate(d.screen, {
                        pushReturn: true,
                        reasonLabel: `${d.label} から起動`,
                        contextPatch: { selectedDistrictId: d.id },
                      })
                    }
                  >
                    開く
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (activeScreen === "dispatch") {
    const needsRelief = account.cash < 150 || account.stamina < 12;
    return (
      <div style={boxStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 15 }}
          >
            <WbIcon name="truck" size={18} color="#34d399" />
            <span>Screen 1: 仕事・配車・カフェシフト統合デスク</span>
          </div>
          {state.returnStack.length > 0 && (
            <button type="button" style={btnPrimary} onClick={onPopReturn}>
              元画面へ戻る
            </button>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(148,163,184,0.2)",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>
              現在受注中ルート: {context.activeDeliverySpot?.label ?? "メトロ東口ターミナル"}
            </div>
            <div style={{ fontSize: 12, color: "#cbd5e1", display: "grid", gap: 4 }}>
              <span>基本報酬: 310 WBC (車両保有補正 +15% = 357 WBC)</span>
              <span>
                実効所得税率（資産階層スライド）:{" "}
                {(progressiveTaxRate(account, tuning.incomeTaxBaseRate) * 100).toFixed(0)}%
              </span>
              <span>消費スタミナ: 8 / 現在スタミナ: {account.stamina}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                style={btnGreen}
                onClick={() => onAction({ kind: "gig_delivery", hasVehicle: true })}
              >
                <WbIcon name="truck" size={14} color="#d1fae5" />
                車両配送を完了
              </button>
              <button
                type="button"
                style={btnPrimary}
                onClick={() => onAction({ kind: "gig_delivery", hasVehicle: false })}
              >
                徒歩配送を完了
              </button>
            </div>
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: needsRelief ? "rgba(217,119,6,0.16)" : "rgba(255,255,255,0.03)",
              border: needsRelief
                ? "1px solid rgba(251,191,36,0.6)"
                : "1px solid rgba(148,163,184,0.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontWeight: 700,
                fontSize: 13.5,
                marginBottom: 6,
              }}
            >
              <WbIcon name="shield" size={15} color="#fbbf24" />
              <span>デッドロック回避: 自治体緊急給食＆即時清掃</span>
            </div>
            <div style={{ fontSize: 12, color: "#cbd5e1" }}>
              発動条件: 所持現金 150 WBC 未満 または スタミナ 12
              未満（クールダウン待機なし・所持品不要）。 付与: 現金 +160 WBC / スタミナ +28。
            </div>
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                style={needsRelief ? btnWarn : btnPrimary}
                onClick={() => onAction({ kind: "emergency_relief" })}
              >
                緊急救済を受給する
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeScreen === "market") {
    const selectedId = context.marketItemId || "circuit_board";
    const quote = computeMarketQuote(
      selectedId,
      marketSupply[selectedId] ?? 50,
      marketDemand[selectedId] ?? 50,
      tuning,
    );
    const totalNeeded = Math.round(quote.askPrice * context.marketQty * (1 + quote.feeRate));

    return (
      <div style={boxStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 15 }}
          >
            <WbIcon name="bag" size={18} color="#38bdf8" />
            <span>Screen 2: 動的需給取引所・BOM不足即時調達デスク</span>
          </div>
          {state.returnStack.length > 0 && (
            <button type="button" style={btnPrimary} onClick={onPopReturn}>
              戻り先 ({state.returnStack[state.returnStack.length - 1].screen}) へ戻る
            </button>
          )}
        </div>

        <div
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid rgba(56,189,248,0.4)",
            background: "rgba(2,132,199,0.12)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 12.5 }}>
            <strong>発注対象: {revampItemById(selectedId)?.name ?? selectedId}</strong>{" "}
            <span style={{ color: "#94a3b8" }}>
              (Ask {quote.askPrice.toLocaleString()} WBC / 焼却費 {(quote.feeRate * 100).toFixed(1)}
              % / NPC買取床 {quote.vendorBuyback} WBC)
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input
              type="number"
              min={1}
              max={20}
              value={context.marketQty}
              onChange={(e) =>
                onNavigate("market", {
                  contextPatch: {
                    marketQty: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                  },
                })
              }
              style={{
                width: 64,
                padding: "5px 8px",
                borderRadius: 6,
                border: "1px solid rgba(148,163,184,0.4)",
                background: "#0f172a",
                color: "#f8fafc",
              }}
            />
            <button
              type="button"
              style={btnGreen}
              onClick={() =>
                onAction({ kind: "market_buy", itemId: selectedId, qty: context.marketQty })
              }
            >
              購入実行 ({totalNeeded.toLocaleString()} WBC)
            </button>
            {account.cash < totalNeeded && (
              <button
                type="button"
                style={btnWarn}
                onClick={() =>
                  onNavigate("finance", {
                    pushReturn: true,
                    reasonLabel: `取引不足補填 (${totalNeeded - account.cash} WBC)`,
                    contextPatch: { shortfallWbc: totalNeeded - account.cash },
                  })
                }
              >
                銀行から不足額 ({(totalNeeded - account.cash).toLocaleString()} WBC) を補填
              </button>
            )}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid rgba(148,163,184,0.28)",
                  color: "#94a3b8",
                  textAlign: "left",
                }}
              >
                <th style={{ padding: "5px 6px" }}>品目</th>
                <th style={{ padding: "5px 6px" }}>基準価格</th>
                <th style={{ padding: "5px 6px" }}>現在板 Ask</th>
                <th style={{ padding: "5px 6px" }}>需給倍率</th>
                <th style={{ padding: "5px 6px" }}>在庫プール / 需要</th>
                <th style={{ padding: "5px 6px" }}>所持数</th>
                <th style={{ padding: "5px 6px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {REVAMP_ITEMS.filter((i) => i.category !== "deed").map((item) => {
                const q = computeMarketQuote(
                  item.id,
                  marketSupply[item.id] ?? 60,
                  marketDemand[item.id] ?? 60,
                  tuning,
                );
                const isSel = item.id === selectedId;
                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: "1px solid rgba(148,163,184,0.12)",
                      background: isSel ? "rgba(56,189,248,0.1)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "6px", fontWeight: 600 }}>{item.name}</td>
                    <td style={{ padding: "6px" }}>{item.baseRefPrice.toLocaleString()}</td>
                    <td style={{ padding: "6px", fontWeight: 700, color: "#38bdf8" }}>
                      {q.askPrice.toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: "6px",
                        color: q.scarcityRatio > 1.1 ? "#fbbf24" : "#34d399",
                      }}
                    >
                      {q.scarcityRatio}x
                    </td>
                    <td style={{ padding: "6px", color: "#94a3b8" }}>
                      {q.supplyPool} / {q.demandUnits}
                    </td>
                    <td style={{ padding: "6px" }}>{account.inventory[item.id] ?? 0}</td>
                    <td style={{ padding: "6px" }}>
                      <button
                        type="button"
                        style={{ ...btnPrimary, padding: "3px 8px", fontSize: 11 }}
                        onClick={() =>
                          onNavigate("market", {
                            contextPatch: { marketItemId: item.id, marketQty: 1 },
                          })
                        }
                      >
                        選択
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeScreen === "factory") {
    const recipes = REVAMP_ITEMS.filter((i) => i.recipeInputs);
    const activeRecipe = revampItemById(context.selectedRecipeId) ?? recipes[0];
    const inputs = Object.entries(activeRecipe.recipeInputs ?? {});
    const upkeepCost = Math.round(activeRecipe.baseRefPrice * tuning.machineUpkeepRate);
    const missing = inputs
      .map(([id, req]) => {
        const have = account.inventory[id] ?? 0;
        const needMore = Math.max(0, req - have);
        const quote = computeMarketQuote(
          id,
          marketSupply[id] ?? 50,
          marketDemand[id] ?? 50,
          tuning,
        );
        return {
          id,
          name: revampItemById(id)?.name ?? id,
          req,
          have,
          needMore,
          estCost: needMore * Math.round(quote.askPrice * (1 + quote.feeRate)),
        };
      })
      .filter((x) => x.needMore > 0);
    const allReady = missing.length === 0 && account.cash >= upkeepCost;

    return (
      <div style={boxStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 15 }}
          >
            <WbIcon name="factory" size={18} color="#fbbf24" />
            <span>Screen 3: 精密工房・BOM解析・取引所自動往復ライン</span>
          </div>
          {state.returnStack.length > 0 && (
            <button type="button" style={btnPrimary} onClick={onPopReturn}>
              元画面へ戻る
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {recipes.map((r) => (
            <button
              key={r.id}
              type="button"
              style={r.id === activeRecipe.id ? btnGreen : btnPrimary}
              onClick={() => onNavigate("factory", { contextPatch: { selectedRecipeId: r.id } })}
            >
              {r.name} (所持 {account.inventory[r.id] ?? 0})
            </button>
          ))}
        </div>

        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(148,163,184,0.2)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
            製造ターゲット: {activeRecipe.name}（原材料BOM{" "}
            {computeBomCost(activeRecipe.id).toLocaleString()} WBC / 設備摩耗焼却{" "}
            {upkeepCost.toLocaleString()} WBC）
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {inputs.map(([id, req]) => {
              const have = account.inventory[id] ?? 0;
              const short = Math.max(0, req - have);
              return (
                <div
                  key={id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    borderRadius: 8,
                    background: short > 0 ? "rgba(217,119,6,0.14)" : "rgba(5,150,105,0.12)",
                    border:
                      short > 0
                        ? "1px solid rgba(251,191,36,0.45)"
                        : "1px solid rgba(52,211,153,0.4)",
                  }}
                >
                  <span>
                    {revampItemById(id)?.name ?? id}: 必要 {req} / 所持 {have}
                  </span>
                  {short > 0 ? (
                    <button
                      type="button"
                      style={btnWarn}
                      onClick={() =>
                        onNavigate("market", {
                          pushReturn: true,
                          reasonLabel: `${activeRecipe.name} 不足資材 (${revampItemById(id)?.name} x${short})`,
                          contextPatch: { marketItemId: id, marketQty: short },
                        })
                      }
                    >
                      取引所で不足 {short} 個を調達
                    </button>
                  ) : (
                    <span style={{ color: "#34d399", fontWeight: 700, fontSize: 12 }}>
                      充足済み
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              style={allReady ? btnGreen : btnPrimary}
              onClick={() => onAction({ kind: "factory_craft", itemId: activeRecipe.id })}
            >
              <WbIcon name="wrench" size={14} color="#fff" />
              製造実行（電力・摩耗費 {upkeepCost.toLocaleString()} WBC 焼却）
            </button>
            {account.cash < upkeepCost && (
              <button
                type="button"
                style={btnWarn}
                onClick={() =>
                  onNavigate("finance", {
                    pushReturn: true,
                    reasonLabel: `製造維持費 (${upkeepCost - account.cash} WBC) 補填`,
                    contextPatch: { shortfallWbc: upkeepCost - account.cash },
                  })
                }
              >
                維持費不足 ({upkeepCost - account.cash} WBC) を銀行振替
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (activeScreen === "finance") {
    const collateral = account.bank + account.deedsOwned * 32_000;
    const creditAvail = Math.max(0, Math.floor(collateral * 0.5) - account.debt);
    const requestedCover = context.shortfallWbc > 0 ? context.shortfallWbc : 1000;

    return (
      <div style={boxStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 15 }}
          >
            <WbIcon name="bank" size={18} color="#34d399" />
            <span>Screen 4: 統合ウォレット・銀行・不動産維持税管理</span>
          </div>
          {state.returnStack.length > 0 && (
            <button type="button" style={btnPrimary} onClick={onPopReturn}>
              戻り先 ({state.returnStack[state.returnStack.length - 1].screen}) へ戻る
            </button>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 8,
          }}
        >
          <div style={{ padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>手元現金 (Cash)</div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{account.cash.toLocaleString()} WBC</div>
          </div>
          <div style={{ padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>銀行預金 (貸出利鞘上限 0.025%/日)</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#38bdf8" }}>
              {account.bank.toLocaleString()} WBC
            </div>
          </div>
          <div style={{ padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>担保借入 / 与信残枠 (LTV 50%)</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fbbf24" }}>
              {account.debt.toLocaleString()} / 枠 {creditAvail.toLocaleString()}
            </div>
          </div>
          <div style={{ padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              保有不動産 ({account.deedsOwned}区画) 維持税
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fca5a5" }}>
              -{(account.deedsOwned * tuning.propertyHoldTaxPerHour).toLocaleString()} WBC/h
            </div>
          </div>
        </div>

        <div
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(52,211,153,0.45)",
            background: "rgba(5,150,105,0.12)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12.5 }}>
            <strong>ワンクリック資金補填: {requestedCover.toLocaleString()} WBC</strong>
            <div style={{ color: "#cbd5e1", fontSize: 11.5 }}>
              銀行預金から優先充当し、不足分のみ担保与信枠から即時融資実行（融資時 2% 焼却事務費）。
            </div>
          </div>
          <button
            type="button"
            style={btnGreen}
            onClick={() =>
              onAction({
                kind: "bank_cover",
                amount: requestedCover,
                autoReturn: state.returnStack.length > 0,
              })
            }
          >
            {requestedCover.toLocaleString()} WBC を現金へ補填
            {state.returnStack.length > 0 ? "して元画面へ戻る" : ""}
          </button>
        </div>
      </div>
    );
  }

  // activeScreen === "prison"
  const bailRequired = Math.max(
    450,
    Math.round(account.sentenceLeftSec * 14 * Math.min(1.5, tuning.bountyMaxMultiplier / 1.1)),
  );
  return (
    <div style={boxStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 15 }}
        >
          <WbIcon name="lock" size={18} color="#f87171" />
          <span>Screen 5: 治安・司法・刑務所ループ（割り込み防御・直接銀行保釈）</span>
        </div>
        {context.interruptedScreen && account.jailed && (
          <span style={{ fontSize: 11.5, color: "#fde68a" }}>
            釈放後の自動復帰予約先: {context.interruptedScreen}
          </span>
        )}
      </div>

      <div
        style={{
          padding: 12,
          borderRadius: 10,
          background: account.jailed ? "rgba(127,29,29,0.35)" : "rgba(5,150,105,0.12)",
          border: account.jailed
            ? "1px solid rgba(248,113,113,0.6)"
            : "1px solid rgba(52,211,153,0.4)",
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <strong>
            拘束状態:{" "}
            {account.jailed
              ? `収監中 (残刑期 ${account.sentenceLeftSec}秒)`
              : "一般市民（自由行動可）"}
          </strong>
          <span>
            指名手配 Lv{account.wantedLevel} / 懸賞金 {account.bounty.toLocaleString()} WBC /
            ツール保有: {account.inventory.lockpick ?? 0}
          </span>
        </div>

        {account.jailed ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={btnGreen}
              onClick={() => onAction({ kind: "prison_action", mode: "bail_bank" })}
            >
              銀行預金から直接保釈 ({bailRequired.toLocaleString()} WBC)
            </button>
            <button
              type="button"
              style={btnPrimary}
              onClick={() => onAction({ kind: "prison_action", mode: "bail_cash" })}
            >
              手元現金で保釈 ({bailRequired.toLocaleString()} WBC)
            </button>
            <button
              type="button"
              style={btnWarn}
              onClick={() => onAction({ kind: "prison_action", mode: "labor" })}
            >
              懲役ワークプレス実行 (-50秒減刑 / +120 WBC)
            </button>
            <button
              type="button"
              style={btnDanger}
              onClick={() => onAction({ kind: "prison_action", mode: "stealth_escape" })}
            >
              換気口ステルス脱獄 (ツール消費・手配+2)
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#cbd5e1" }}>
            自由状態です。エッジケーステストバーから「現行犯逮捕割り込み」を発火すると、商取引ブロックと作業退避復帰を検証できます。
          </div>
        )}
      </div>
    </div>
  );
}
