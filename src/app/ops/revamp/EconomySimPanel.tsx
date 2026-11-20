"use client";
import { useMemo, useState } from "react";
import { WbIcon } from "@/app/games/worldbox/WbIcon";
import {
  DEFAULT_ECONOMY_TUNING,
  auditCraftArbitrageSafety,
  runEconomySimulation,
  type EconomyTuningParams,
} from "@/lib/worldbox/revamp/economy-model";
import { HCD_FLOW_COMPARISONS } from "@/lib/worldbox/revamp/flow-state";

interface EconomySimPanelProps {
  tuning: EconomyTuningParams;
  onChangeTuning: (next: EconomyTuningParams) => void;
}

const cardStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.78)",
  border: "1px solid rgba(148, 163, 184, 0.24)",
  borderRadius: 12,
  padding: 14,
};

export default function EconomySimPanel({ tuning, onChangeTuning }: EconomySimPanelProps) {
  const [simDays, setSimDays] = useState(30);
  const [cohortSize, setCohortSize] = useState(100);

  const sim = useMemo(
    () => runEconomySimulation(tuning, simDays, cohortSize),
    [tuning, simDays, cohortSize],
  );
  const arbAudit = useMemo(() => auditCraftArbitrageSafety(), []);

  // Build SVG polyline coordinates for 30-day Sink vs Faucet chart
  const chartW = 540;
  const chartH = 160;
  const padX = 36;
  const padY = 18;
  const maxVal = Math.max(1, ...sim.points.map((p) => Math.max(p.dailyFaucet, p.dailySink)));
  const toX = (idx: number) =>
    padX + ((chartW - padX * 2) * idx) / Math.max(1, sim.points.length - 1);
  const toY = (val: number) => chartH - padY - ((chartH - padY * 2) * val) / (maxVal * 1.15);

  const faucetPts = sim.points
    .map((p, i) => `${toX(i).toFixed(1)},${toY(p.dailyFaucet).toFixed(1)}`)
    .join(" ");
  const sinkPts = sim.points
    .map((p, i) => `${toX(i).toFixed(1)},${toY(p.dailySink).toFixed(1)}`)
    .join(" ");

  const updateField = (key: keyof EconomyTuningParams, val: number) => {
    onChangeTuning({ ...tuning, [key]: val });
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Section 1: HCD Flow Workload Matrix */}
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14 }}
          >
            <WbIcon name="user" size={16} color="#38bdf8" />
            <span>
              HCD プレイヤー負荷比較ベンチマーク（現行 20モーダル構成 vs 状態引継ドック構成）
            </span>
          </div>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            対象ソース: WorldBoxClient.tsx (20パネル / 255 useState / 57 fetch)
          </span>
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
                <th style={{ padding: "6px 8px" }}>横断タスクフロー</th>
                <th style={{ padding: "6px 8px" }}>クリック数 (旧→新)</th>
                <th style={{ padding: "6px 8px" }}>画面切替 (旧→新)</th>
                <th style={{ padding: "6px 8px" }}>API待機回数</th>
                <th style={{ padding: "6px 8px" }}>暗記保持項目数</th>
                <th style={{ padding: "6px 8px" }}>推定所要時間</th>
                <th style={{ padding: "6px 8px" }}>現行の主要負荷要因</th>
              </tr>
            </thead>
            <tbody>
              {HCD_FLOW_COMPARISONS.map((row) => {
                const clickDropPct = Math.round(
                  ((row.asIsClicks - row.toBeClicks) / row.asIsClicks) * 100,
                );
                return (
                  <tr key={row.flowId} style={{ borderBottom: "1px solid rgba(148,163,184,0.14)" }}>
                    <td style={{ padding: "8px", fontWeight: 600, color: "#f8fafc" }}>
                      {row.taskLabel}
                    </td>
                    <td style={{ padding: "8px", fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ color: "#f87171" }}>{row.asIsClicks}</span> →{" "}
                      <strong style={{ color: "#34d399" }}>{row.toBeClicks}</strong>{" "}
                      <span style={{ fontSize: 11, color: "#38bdf8" }}>(-{clickDropPct}%)</span>
                    </td>
                    <td style={{ padding: "8px", fontVariantNumeric: "tabular-nums" }}>
                      {row.asIsModalHops} →{" "}
                      <strong style={{ color: "#34d399" }}>{row.toBeModalHops}</strong>
                    </td>
                    <td style={{ padding: "8px", fontVariantNumeric: "tabular-nums" }}>
                      {row.asIsApiFetches} →{" "}
                      <strong style={{ color: "#34d399" }}>{row.toBeApiFetches}</strong>
                    </td>
                    <td style={{ padding: "8px", fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ color: "#fbbf24" }}>{row.asIsMemoryRecallItems}項目</span> →{" "}
                      <strong style={{ color: "#34d399" }}>{row.toBeMemoryRecallItems}</strong>
                    </td>
                    <td style={{ padding: "8px", fontVariantNumeric: "tabular-nums" }}>
                      {row.asIsEstSec}s →{" "}
                      <strong style={{ color: "#34d399" }}>{row.toBeEstSec}s</strong>
                    </td>
                    <td style={{ padding: "8px", color: "#cbd5e1", fontSize: 11.5 }}>
                      {row.primaryBottleneck}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Sink / Faucet Equilibrium Simulator */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
          gap: 14,
        }}
      >
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              <WbIcon name="chart" size={16} color="#fbbf24" />
              <span>通貨シンク/フォーセット均衡パラメータ</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => onChangeTuning({ ...DEFAULT_ECONOMY_TUNING })}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid rgba(52,211,153,0.45)",
                  background: "rgba(5,150,105,0.22)",
                  color: "#a7f3d0",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                推奨均衡値
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeTuning({
                    incomeTaxBaseRate: 0.1,
                    marketBurnRate: 0.03,
                    machineUpkeepRate: 0.12,
                    propertyHoldTaxPerHour: 30,
                    depositDailyRateCap: 0.0006,
                    bountyMaxMultiplier: 1.8,
                    priceElasticityExp: 0.45,
                  })
                }
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid rgba(248,113,113,0.45)",
                  background: "rgba(220,38,38,0.22)",
                  color: "#fecaca",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                緩和インフレテスト
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
            <label style={{ display: "grid", gap: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>基本所得税率（85%焼却）</span>
                <strong>{(tuning.incomeTaxBaseRate * 100).toFixed(0)}%</strong>
              </div>
              <input
                type="range"
                min={0.08}
                max={0.28}
                step={0.01}
                value={tuning.incomeTaxBaseRate}
                onChange={(e) => updateField("incomeTaxBaseRate", Number(e.target.value))}
              />
            </label>

            <label style={{ display: "grid", gap: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>取引所焼却手数料率（基本枠）</span>
                <strong>{(tuning.marketBurnRate * 100).toFixed(1)}%</strong>
              </div>
              <input
                type="range"
                min={0.03}
                max={0.12}
                step={0.005}
                value={tuning.marketBurnRate}
                onChange={(e) => updateField("marketBurnRate", Number(e.target.value))}
              />
            </label>

            <label style={{ display: "grid", gap: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>製造ライン電力・摩耗シンク率</span>
                <strong>{(tuning.machineUpkeepRate * 100).toFixed(0)}%</strong>
              </div>
              <input
                type="range"
                min={0.12}
                max={0.3}
                step={0.01}
                value={tuning.machineUpkeepRate}
                onChange={(e) => updateField("machineUpkeepRate", Number(e.target.value))}
              />
            </label>

            <label style={{ display: "grid", gap: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>不動産 土地維持税 (WBC/時間)</span>
                <strong>{tuning.propertyHoldTaxPerHour} WBC</strong>
              </div>
              <input
                type="range"
                min={30}
                max={110}
                step={2}
                value={tuning.propertyHoldTaxPerHour}
                onChange={(e) => updateField("propertyHoldTaxPerHour", Number(e.target.value))}
              />
            </label>

            <label style={{ display: "grid", gap: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>預金日利上限（貸出利鞘裏付け）</span>
                <strong>{(tuning.depositDailyRateCap * 100).toFixed(3)}%</strong>
              </div>
              <input
                type="range"
                min={0.0001}
                max={0.0006}
                step={0.00005}
                value={tuning.depositDailyRateCap}
                onChange={(e) => updateField("depositDailyRateCap", Number(e.target.value))}
              />
            </label>

            <label style={{ display: "grid", gap: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>検証日数 / コホート市民数</span>
                <strong>
                  {simDays}日 / {cohortSize}人
                </strong>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="range"
                  min={7}
                  max={60}
                  step={1}
                  style={{ flex: 1 }}
                  value={simDays}
                  onChange={(e) => setSimDays(Number(e.target.value))}
                />
                <input
                  type="range"
                  min={40}
                  max={300}
                  step={20}
                  style={{ flex: 1 }}
                  value={cohortSize}
                  onChange={(e) => setCohortSize(Number(e.target.value))}
                />
              </div>
            </label>
          </div>
        </div>

        {/* Simulation Chart & KPI Summary */}
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              <WbIcon name="bar_chart" size={16} color="#34d399" />
              <span>{simDays}日間コホート経済収支シミュレーション</span>
            </div>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                background:
                  sim.avgSinkFaucetRatio >= 0.88 && sim.avgSinkFaucetRatio <= 1.05
                    ? "rgba(5,150,105,0.28)"
                    : "rgba(217,119,6,0.28)",
                color:
                  sim.avgSinkFaucetRatio >= 0.88 && sim.avgSinkFaucetRatio <= 1.05
                    ? "#6ee7b7"
                    : "#fcd34d",
              }}
            >
              Sink/Faucet 比: {sim.avgSinkFaucetRatio.toFixed(3)}
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 6,
              marginBottom: 10,
              fontSize: 11.5,
            }}
          >
            <div style={{ padding: 8, borderRadius: 8, background: "rgba(255,255,255,0.04)" }}>
              <div style={{ color: "#94a3b8" }}>総通貨増減</div>
              <div
                style={{ fontWeight: 700, color: sim.supplyGrowthPct > 35 ? "#f87171" : "#34d399" }}
              >
                {sim.supplyGrowthPct >= 0 ? "+" : ""}
                {sim.supplyGrowthPct}%
              </div>
            </div>
            <div style={{ padding: 8, borderRadius: 8, background: "rgba(255,255,255,0.04)" }}>
              <div style={{ color: "#94a3b8" }}>CPI 物価ピーク</div>
              <div style={{ fontWeight: 700, color: sim.peakCpi > 130 ? "#f87171" : "#bae6fd" }}>
                {sim.peakCpi} (基準100)
              </div>
            </div>
            <div style={{ padding: 8, borderRadius: 8, background: "rgba(255,255,255,0.04)" }}>
              <div style={{ color: "#94a3b8" }}>最終通貨総量</div>
              <div style={{ fontWeight: 700 }}>{(sim.finalSupply / 1_000_000).toFixed(2)}M</div>
            </div>
            <div style={{ padding: 8, borderRadius: 8, background: "rgba(255,255,255,0.04)" }}>
              <div style={{ color: "#94a3b8" }}>進行不能件数</div>
              <div style={{ fontWeight: 700, color: "#34d399" }}>{sim.totalDeadlocks} 件</div>
            </div>
          </div>

          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            style={{
              width: "100%",
              height: "auto",
              background: "rgba(2,6,23,0.6)",
              borderRadius: 8,
            }}
          >
            <line
              x1={padX}
              y1={chartH - padY}
              x2={chartW - padX}
              y2={chartH - padY}
              stroke="#334155"
              strokeWidth="1"
            />
            <line
              x1={padX}
              y1={padY}
              x2={padX}
              y2={chartH - padY}
              stroke="#334155"
              strokeWidth="1"
            />
            <polyline fill="none" stroke="#38bdf8" strokeWidth="2.5" points={faucetPts} />
            <polyline
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2.5"
              strokeDasharray="5 3"
              points={sinkPts}
            />
            <text x={padX + 6} y={padY + 10} fill="#38bdf8" fontSize="10" fontWeight="bold">
              Faucet (総発行 WBC/日)
            </text>
            <text x={padX + 165} y={padY + 10} fill="#f59e0b" fontSize="10" fontWeight="bold">
              Sink (総焼却 WBC/日)
            </text>
          </svg>
        </div>
      </div>

      {/* Section 3: Zero-Arbitrage Proof Table */}
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 700,
            fontSize: 13.5,
            marginBottom: 8,
          }}
        >
          <WbIcon name="shield" size={16} color="#34d399" />
          <span>裁定ループ遮断検証（旧 51種無限製造売却バグ → BOM 42% 買戻上限モデル）</span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 8,
          }}
        >
          {arbAudit.map((row) => (
            <div
              key={row.itemId}
              style={{
                padding: 8,
                borderRadius: 8,
                border: "1px solid rgba(52,211,153,0.28)",
                background: "rgba(5,150,105,0.08)",
                fontSize: 11.5,
              }}
            >
              <div style={{ fontWeight: 700, color: "#f8fafc" }}>{row.name}</div>
              <div style={{ color: "#94a3b8", marginTop: 2 }}>
                原材料BOM: {row.bomCost.toLocaleString()} / 市場基準:{" "}
                {row.refPrice.toLocaleString()}
              </div>
              <div style={{ color: "#fca5a5", marginTop: 2 }}>
                NPC買戻上限: {row.vendorBuyback.toLocaleString()} WBC (差額{" "}
                {row.vendorNetDelta.toLocaleString()})
              </div>
              <div style={{ color: "#34d399", fontWeight: 700, marginTop: 2 }}>
                裁定ループ遮断: {row.safeFromInfiniteLoop ? "安全 (赤字強制)" : "要修正"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
