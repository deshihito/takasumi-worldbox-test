"use client";
import { useCallback, useEffect, useState } from "react";
import { WbIcon, type WbIconName } from "@/app/games/worldbox/WbIcon";
import { netEquityOf } from "@/lib/worldbox/revamp/economy-model";
import {
  REVAMP_SCREENS,
  createInitialSessionState,
  executeFlowAction,
  navigateToScreen,
  returnFromStack,
  triggerArrestInterrupt,
  type FaultInjectionMode,
  type PrototypeAction,
  type RevampScreenId,
  type RevampSessionState,
} from "@/lib/worldbox/revamp/flow-state";
import { REVAMP_PERSONAS } from "@/lib/worldbox/revamp/personas";
import EconomySimPanel from "./EconomySimPanel";
import WireframeScreens from "./WireframeScreens";

const SCREEN_ICONS: Record<RevampScreenId, WbIconName> = {
  field: "map",
  dispatch: "truck",
  market: "bag",
  factory: "factory",
  finance: "bank",
  prison: "lock",
};

const pillBtn: React.CSSProperties = {
  padding: "6px 11px",
  borderRadius: 8,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "rgba(30, 41, 59, 0.85)",
  color: "#e2e8f0",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

export default function RevampWorkbenchClient() {
  const [state, setState] = useState<RevampSessionState>(() =>
    createInitialSessionState("standard"),
  );
  const [viewMode, setViewMode] = useState<"wireframe" | "hcd_econ">("wireframe");
  const [personaId, setPersonaId] = useState<string>(REVAMP_PERSONAS[0].id);
  const [personaCursor, setPersonaCursor] = useState<number>(0);
  const [pendingNotice, setPendingNotice] = useState<string>("");

  const activePersona = REVAMP_PERSONAS.find((p) => p.id === personaId) ?? REVAMP_PERSONAS[0];

  const handleNavigate = useCallback(
    (
      screen: RevampScreenId,
      opts?: { pushReturn?: boolean; reasonLabel?: string; contextPatch?: Record<string, unknown> },
    ) => {
      setViewMode("wireframe");
      setState((prev) =>
        navigateToScreen(prev, screen, {
          pushReturn: opts?.pushReturn,
          reasonLabel: opts?.reasonLabel,
          contextPatch: opts?.contextPatch as Partial<typeof prev.context>,
        }),
      );
    },
    [],
  );

  const handleAction = useCallback((action: PrototypeAction) => {
    setState((prev) => {
      if (prev.faultMode === "latency_600ms") {
        setPendingNotice("非同期処理中（600ms 遅延インジェクション / 重複送信ロック中）…");
        window.setTimeout(() => {
          setState((latest) => executeFlowAction(latest, action));
          setPendingNotice("");
        }, 600);
        return prev;
      }
      return executeFlowAction(prev, action);
    });
  }, []);

  const handlePopReturn = useCallback(() => {
    setState((prev) => returnFromStack(prev));
  }, []);

  // Keyboard shortcuts 1..6 for screen dock switching
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < REVAMP_SCREENS.length) {
        handleNavigate(REVAMP_SCREENS[idx].id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNavigate]);

  const loadPreset = (preset: "standard" | "low_cash_deadlock_test" | "jailed_inmate") => {
    setState(createInitialSessionState(preset));
    setPersonaCursor(0);
    setViewMode("wireframe");
  };

  const runNextPersonaStep = () => {
    const step = activePersona.steps[personaCursor];
    if (!step) return;
    setViewMode("wireframe");
    setState((prev) => step.execute(prev));
    setPersonaCursor((c) => c + 1);
  };

  const resetPersonaFlow = () => {
    setState(createInitialSessionState(activePersona.preset));
    setPersonaCursor(0);
    setViewMode("wireframe");
  };

  const netEq = netEquityOf(state.account);

  return (
    <div
      style={{
        minHeight: "100svh",
        background: "radial-gradient(circle at top, #0f172a 0%, #020617 75%)",
        color: "#f1f5f9",
        padding: "14px 16px 32px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1220, margin: "0 auto", display: "grid", gap: 12 }}>
        {/* Persistent Top State-Carrier Bar */}
        <header
          style={{
            background: "rgba(15, 23, 42, 0.92)",
            border: "1px solid rgba(56, 189, 248, 0.3)",
            borderRadius: 12,
            padding: "12px 14px",
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <WbIcon name="hub" size={18} color="#38bdf8" />
              <strong style={{ fontSize: 15 }}>
                TAKASUMI WORLD BOX 開発・運用チーム向け HCD統合プロトタイプ検証ベンチ
              </strong>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setViewMode("wireframe")}
                style={{
                  ...pillBtn,
                  background: viewMode === "wireframe" ? "#0284c7" : pillBtn.background,
                  borderColor: viewMode === "wireframe" ? "#38bdf8" : undefined,
                }}
              >
                <WbIcon name="map" size={13} color="#fff" />
                横断ワイヤーフレーム（6画面）
              </button>
              <button
                type="button"
                onClick={() => setViewMode("hcd_econ")}
                style={{
                  ...pillBtn,
                  background: viewMode === "hcd_econ" ? "#059669" : pillBtn.background,
                  borderColor: viewMode === "hcd_econ" ? "#34d399" : undefined,
                }}
              >
                <WbIcon name="chart" size={13} color="#fff" />
                HCD負荷 & シンク/フォーセット試算
              </button>
            </div>
          </div>

          {/* Unified Single-Source State Strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
              gap: 8,
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <div
              style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)" }}
            >
              <span style={{ color: "#94a3b8" }}>現金 (Cash)</span>
              <div style={{ fontWeight: 700, color: "#34d399" }}>
                {state.account.cash.toLocaleString()} WBC
              </div>
            </div>
            <div
              style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)" }}
            >
              <span style={{ color: "#94a3b8" }}>銀行 / 借入負債</span>
              <div style={{ fontWeight: 700, color: "#38bdf8" }}>
                {state.account.bank.toLocaleString()} / -{state.account.debt.toLocaleString()}
              </div>
            </div>
            <div
              style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)" }}
            >
              <span style={{ color: "#94a3b8" }}>純資産 (Net Equity)</span>
              <div style={{ fontWeight: 700 }}>{netEq.toLocaleString()} WBC</div>
            </div>
            <div
              style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)" }}
            >
              <span style={{ color: "#94a3b8" }}>スタミナ / 手配Lv</span>
              <div
                style={{
                  fontWeight: 700,
                  color: state.account.stamina < 12 ? "#fbbf24" : "#f1f5f9",
                }}
              >
                {state.account.stamina}/100 ・ Lv{state.account.wantedLevel}
              </div>
            </div>
            <div
              style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)" }}
            >
              <span style={{ color: "#94a3b8" }}>累積焼却シンク / 取得報酬</span>
              <div style={{ fontWeight: 700, color: "#f59e0b" }}>
                -{state.account.hourlySinkPaid.toLocaleString()} / +
                {state.account.hourlyNetFaucet.toLocaleString()}
              </div>
            </div>
            <div
              style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)" }}
            >
              <span style={{ color: "#94a3b8" }}>自動収穫機所持 / 勾留</span>
              <div style={{ fontWeight: 700, color: state.account.jailed ? "#f87171" : "#a7f3d0" }}>
                {state.account.inventory.auto_harvester ?? 0} 台 /{" "}
                {state.account.jailed ? `収監(${state.account.sentenceLeftSec}s)` : "自由"}
              </div>
            </div>
          </div>

          {/* Primary Consolidated Navigation Bar + Return Stack Breadcrumbs */}
          {viewMode === "wireframe" && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {REVAMP_SCREENS.map((scr, idx) => {
                  const active = state.activeScreen === scr.id;
                  return (
                    <button
                      key={scr.id}
                      type="button"
                      onClick={() => handleNavigate(scr.id)}
                      style={{
                        ...pillBtn,
                        background: active
                          ? scr.id === "prison"
                            ? "#dc2626"
                            : "#0284c7"
                          : "rgba(30,41,59,0.7)",
                        borderColor: active ? "#7dd3fc" : "rgba(148,163,184,0.22)",
                      }}
                    >
                      <WbIcon name={SCREEN_ICONS[scr.id]} size={13} color="#fff" />
                      <span>
                        [{idx + 1}] {scr.shortLabel}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexWrap: "wrap",
                  fontSize: 11.5,
                }}
              >
                <span style={{ color: "#94a3b8" }}>戻りスタック:</span>
                {state.returnStack.length === 0 ? (
                  <span style={{ color: "#64748b" }}>なし</span>
                ) : (
                  state.returnStack.map((frame, i) => (
                    <span
                      key={`${frame.screen}-${i}`}
                      style={{
                        padding: "2px 7px",
                        borderRadius: 999,
                        background: "rgba(56,189,248,0.16)",
                        border: "1px solid rgba(56,189,248,0.4)",
                        color: "#bae6fd",
                      }}
                    >
                      {frame.screen} ({frame.reasonLabel})
                    </span>
                  ))
                )}
              </div>
            </div>
          )}
        </header>

        {/* Fault Injection & Edge Case Test Controls */}
        <section
          style={{
            background: "rgba(15, 23, 42, 0.72)",
            border: "1px solid rgba(148, 163, 184, 0.22)",
            borderRadius: 10,
            padding: "8px 12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ color: "#94a3b8", fontWeight: 700 }}>テスト状態読込:</span>
            <button type="button" style={pillBtn} onClick={() => loadPreset("standard")}>
              標準市民
            </button>
            <button
              type="button"
              style={pillBtn}
              onClick={() => loadPreset("low_cash_deadlock_test")}
            >
              残高45・空腹4枯渇状態
            </button>
            <button type="button" style={pillBtn} onClick={() => loadPreset("jailed_inmate")}>
              収監囚人状態
            </button>
            <button
              type="button"
              style={{
                ...pillBtn,
                background: "rgba(220,38,38,0.3)",
                borderColor: "rgba(248,113,113,0.5)",
                color: "#fecaca",
              }}
              onClick={() => setState((prev) => triggerArrestInterrupt(prev, 180))}
            >
              現行犯逮捕割り込み発火
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ color: "#94a3b8", fontWeight: 700 }}>異常系フォールト注入:</span>
            {(
              [
                { id: "none", label: "正常 (0ms)" },
                { id: "latency_600ms", label: "遅延 (600ms)" },
                { id: "conflict_409", label: "409競合ロールバック" },
              ] as const
            ).map((fm) => (
              <button
                key={fm.id}
                type="button"
                onClick={() =>
                  setState((prev) => ({ ...prev, faultMode: fm.id as FaultInjectionMode }))
                }
                style={{
                  ...pillBtn,
                  background: state.faultMode === fm.id ? "#d97706" : pillBtn.background,
                  borderColor: state.faultMode === fm.id ? "#fbbf24" : undefined,
                }}
              >
                {fm.label}
              </button>
            ))}
          </div>
        </section>

        {(pendingNotice || state.context.lastErrorBanner) && (
          <div
            role="status"
            style={{
              padding: "9px 14px",
              borderRadius: 10,
              background: "rgba(217, 119, 6, 0.22)",
              border: "1px solid rgba(251, 191, 36, 0.6)",
              color: "#fef3c7",
              fontSize: 12.5,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <WbIcon name="alert" size={16} color="#fbbf24" />
            <span>{pendingNotice || state.context.lastErrorBanner}</span>
          </div>
        )}

        {/* Active Wireframe Surface OR HCD/Econ Bench */}
        {viewMode === "wireframe" ? (
          <WireframeScreens
            state={state}
            onNavigate={handleNavigate}
            onAction={handleAction}
            onPopReturn={handlePopReturn}
          />
        ) : (
          <EconomySimPanel
            tuning={state.tuning}
            onChangeTuning={(next) => setState((prev) => ({ ...prev, tuning: next }))}
          />
        )}

        {/* Bottom Cross-Cutting Persona Walkthrough + Real-Time State Telemetry */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
            gap: 12,
          }}
        >
          <section
            style={{
              background: "rgba(15, 23, 42, 0.8)",
              border: "1px solid rgba(148, 163, 184, 0.24)",
              borderRadius: 12,
              padding: 12,
              display: "grid",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              <strong style={{ fontSize: 13.5 }}>ペルソナ利用シナリオステップ検証</strong>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  disabled={personaCursor >= activePersona.steps.length}
                  onClick={runNextPersonaStep}
                  style={{
                    ...pillBtn,
                    background: "#059669",
                    borderColor: "#34d399",
                    opacity: personaCursor >= activePersona.steps.length ? 0.45 : 1,
                  }}
                >
                  次ステップ実行 ({personaCursor}/{activePersona.steps.length})
                </button>
                <button type="button" onClick={resetPersonaFlow} style={pillBtn}>
                  初期化
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {REVAMP_PERSONAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPersonaId(p.id);
                    setState(createInitialSessionState(p.preset));
                    setPersonaCursor(0);
                  }}
                  style={{
                    ...pillBtn,
                    fontSize: 11,
                    background: p.id === personaId ? "#0284c7" : pillBtn.background,
                  }}
                >
                  {p.code}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
              目的: {activePersona.sessionGoal}
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              {activePersona.steps.map((st, idx) => {
                const done = idx < personaCursor;
                const cur = idx === personaCursor;
                return (
                  <div
                    key={st.stepNo}
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      fontSize: 11.5,
                      border: cur
                        ? "1px solid rgba(56,189,248,0.7)"
                        : done
                          ? "1px solid rgba(52,211,153,0.45)"
                          : "1px solid rgba(148,163,184,0.16)",
                      background: cur
                        ? "rgba(2,132,199,0.16)"
                        : done
                          ? "rgba(5,150,105,0.1)"
                          : "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div
                      style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}
                    >
                      <span>
                        Step {st.stepNo}: {st.actionTitle} [{st.loadAxis}]
                      </span>
                      <span style={{ color: "#34d399" }}>
                        負荷 {st.asIsLoadScore}/10 → {st.toBeLoadScore}/10
                      </span>
                    </div>
                    <div style={{ color: "#fca5a5", marginTop: 2 }}>
                      旧ボトルネック: {st.asIsFailureOrFriction}
                    </div>
                    <div style={{ color: "#bae6fd", marginTop: 2 }}>
                      統合機構: {st.toBeMechanism}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section
            style={{
              background: "rgba(15, 23, 42, 0.8)",
              border: "1px solid rgba(148, 163, 184, 0.24)",
              borderRadius: 12,
              padding: 12,
              display: "grid",
              gap: 8,
              alignContent: "start",
            }}
          >
            <strong style={{ fontSize: 13.5 }}>横断遷移・残高・焼却シンク テレメトリログ</strong>
            {state.telemetry.length === 0 ? (
              <div style={{ fontSize: 12, color: "#64748b" }}>
                まだ操作イベントはありません。ワイヤーフレームボタンまたはペルソナ実行をクリックすると画面間状態引継と焼却ログが記録されます。
              </div>
            ) : (
              <div style={{ display: "grid", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {state.telemetry.map((ev) => (
                  <div
                    key={ev.seq}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 8,
                      fontSize: 11.5,
                      background: "rgba(255,255,255,0.03)",
                      border:
                        ev.status === "blocked" ||
                        ev.status === "interrupted" ||
                        ev.status === "rolled_back"
                          ? "1px solid rgba(248,113,113,0.45)"
                          : "1px solid rgba(148,163,184,0.16)",
                    }}
                  >
                    <div
                      style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}
                    >
                      <span>
                        {ev.atLabel} | {ev.fromScreen} → {ev.toScreen} ({ev.action})
                      </span>
                      <span
                        style={{
                          color:
                            ev.status === "ok"
                              ? "#34d399"
                              : ev.status === "rolled_back"
                                ? "#fbbf24"
                                : "#f87171",
                        }}
                      >
                        [{ev.status.toUpperCase()}]
                      </span>
                    </div>
                    <div style={{ color: "#cbd5e1", marginTop: 2 }}>
                      {ev.detail} | Cash {ev.cashDelta >= 0 ? "+" : ""}
                      {ev.cashDelta} / Sink Burn {ev.sinkBurned}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
