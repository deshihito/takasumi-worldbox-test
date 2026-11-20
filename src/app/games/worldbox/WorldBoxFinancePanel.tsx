"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { onEconomyApplied } from "@/lib/worldbox/economy/economy-push";

export type FinanceTab = "fx_spot" | "fx_margin" | "prediction" | "house_pool";

interface FxPairView {
  id: string;
  name: string;
  desc: string;
  apr: number;
  mid: number;
  bid: number;
  ask: number;
  volumeWbc: number;
  skewBps: number;
  history: number[];
}

interface FxMarginView {
  id: string;
  mine: boolean;
  currency: string;
  side: "long" | "short";
  leverage: 2 | 5 | 10;
  marginWbc: number;
  notionalWbc: number;
  entryRate: number;
  currentRate: number;
  unrealizedPnl: number;
  swapAccrued: number;
  equity: number;
  marginRatio: number;
  liquidatable: boolean;
  openedAt: number;
}

interface FxResponse {
  guest: boolean;
  unitScale?: number;
  pairs: FxPairView[];
  wallet: Record<string, number>;
  walletValueWbc: number;
  positions: FxMarginView[];
  liquidatablePositions: FxMarginView[];
  balance: number | null;
}

interface PredictionRoundView {
  id: string;
  kind: "fx" | "stock";
  symbol: string;
  label: string;
  strikePrice: number;
  currentPrice: number;
  opensAt: number;
  closesAt: number;
  settlesAt: number;
  upPool: number;
  downPool: number;
  totalPool: number;
  settled: boolean;
  bettingOpen: boolean;
  finalPrice: number | null;
  winner: "up" | "down" | null;
}

interface PredictionBetView {
  id: string;
  roundId: string;
  side: "up" | "down";
  amount: number;
  placedAt: number;
  claimed: boolean;
  payout: number;
}

interface PredictionResponse {
  guest: boolean;
  rounds: PredictionRoundView[];
  myBets: PredictionBetView[];
  claimedNow: number;
  balance: number | null;
}

interface HousePoolResponse {
  guest: boolean;
  pool: {
    poolWbc: number;
    playerDepositWbc: number;
    totalShares: number;
    navPerShare: number;
    cumulativeYield: number;
    cumulativeLoss: number;
  };
  myShares: number;
  myValue: number;
  company: {
    id: string;
    name: string;
    assets: number;
    isOwner: boolean;
    shares: number;
    value: number;
  } | null;
  balance: number | null;
}

const ERROR_LABEL: Record<string, string> = {
  unauthorized: "ログインが必要です",
  guest_not_allowed: "ゲストは利用できません",
  not_enough_coins: "所持金が不足しています",
  not_enough_assets: "会社資産が不足しています",
  not_enough_currency: "外貨残高が不足しています",
  insufficient_shares: "保有LPシェアが不足しています",
  insufficient_pool: "プール流動性上限により引き出せません",
  betting_closed: "このラウンドの締切を過ぎました",
  invalid_amount: "金額が不正です",
  invalid_leverage: "倍率は 2 / 5 / 10 のみ選択できます",
  too_many_positions: "保有ポジション数の上限に達しています",
  not_owner: "会社オーナーのみ操作できます",
  store_failed: "保存に失敗しました",
};

const panel: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(640px, calc(100% - 20px))",
  maxHeight: "calc(100% - 20px)",
  overflowY: "auto",
  overscrollBehavior: "contain",
  touchAction: "pan-y",
  padding: 14,
  borderRadius: 14,
  zIndex: 6,
  textAlign: "left",
  border: "1px solid rgba(255,255,255,0.22)",
  background: "rgba(10,12,18,0.95)",
  color: "#f2f2f2",
  boxShadow: "0 14px 40px rgba(0,0,0,0.55)",
};

const btn: React.CSSProperties = {
  minHeight: 36,
  padding: "4px 12px",
  borderRadius: 9,
  cursor: "pointer",
  border: "1px solid rgba(255,255,255,0.25)",
  background: "rgba(255,255,255,0.08)",
  color: "inherit",
  fontSize: 13,
  touchAction: "manipulation",
};

const input: React.CSSProperties = {
  minHeight: 36,
  padding: "4px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.25)",
  background: "rgba(0,0,0,0.4)",
  color: "#fff",
  boxSizing: "border-box",
};

const yen = (n: number) => `${n.toLocaleString()}円`;

function Spark({ history }: { history: number[] }) {
  if (history.length < 2) return null;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const span = Math.max(1, max - min);
  const up = history[history.length - 1] >= history[0];
  const pts = history
    .map(
      (v, i) =>
        `${((i / (history.length - 1)) * 78 + 1).toFixed(1)},${(20 - ((v - min) / span) * 16).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg width="80" height="24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={up ? "#4ade80" : "#f87171"} strokeWidth="1.6" />
    </svg>
  );
}

export default function WorldBoxFinancePanel({
  initialTab,
  lockedTabs,
  title,
  onClose,
}: {
  initialTab?: FinanceTab;
  lockedTabs?: readonly FinanceTab[];
  title?: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<FinanceTab>(initialTab ?? lockedTabs?.[0] ?? "fx_spot");
  const [fx, setFx] = useState<FxResponse | null>(null);
  const [pred, setPred] = useState<PredictionResponse | null>(null);
  const [pool, setPool] = useState<HousePoolResponse | null>(null);
  const [selPair, setSelPair] = useState("GLD");
  const [wbcBuyStr, setWbcBuyStr] = useState("5000");
  const [sellUnitsStr, setSellUnitsStr] = useState("10");
  const [marginSide, setMarginSide] = useState<"long" | "short">("long");
  const [leverage, setLeverage] = useState<2 | 5 | 10>(5);
  const [marginStr, setMarginStr] = useState("5000");
  const [predBetStr, setPredBetStr] = useState("1000");
  const [lpAmountStr, setLpAmountStr] = useState("10000");
  const [lpSharesStr, setLpSharesStr] = useState("10000");
  const [lpAsCompany, setLpAsCompany] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const aliveRef = useRef(true);

  const refreshAll = useCallback(async () => {
    try {
      const [fxRes, prRes, hpRes] = await Promise.all([
        fetch("/api/worldbox/fx", { headers: { Accept: "application/json" } }),
        fetch("/api/worldbox/prediction", { headers: { Accept: "application/json" } }),
        fetch("/api/worldbox/house-pool", { headers: { Accept: "application/json" } }),
      ]);
      if (!aliveRef.current) return;
      if (fxRes.ok) setFx((await fxRes.json()) as FxResponse);
      if (prRes.ok) setPred((await prRes.json()) as PredictionResponse);
      if (hpRes.ok) setPool((await hpRes.json()) as HousePoolResponse);
    } catch {
      /* partial failure ok */
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refreshAll();
    const timer = window.setInterval(() => {
      void refreshAll();
    }, 6000);
    const off = onEconomyApplied(() => {
      void refreshAll();
    });
    return () => {
      aliveRef.current = false;
      window.clearInterval(timer);
      off();
    };
  }, [refreshAll]);

  const postAction = async (
    url: string,
    payload: Record<string, unknown>,
    describe: (res: Record<string, unknown>) => string,
  ) => {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
        error?: string;
      };
      if (!res.ok) {
        setMsg(
          ERROR_LABEL[json.error ?? ""] ?? `処理できませんでした (${json.error ?? res.status})`,
        );
        return;
      }
      setMsg(describe(json));
      await refreshAll();
    } catch {
      setMsg("通信に失敗しました");
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };

  const scale = fx?.unitScale ?? 100;
  const activePair = fx?.pairs.find((p) => p.id === selPair) ?? fx?.pairs[0] ?? null;
  const heldCenti = activePair ? (fx?.wallet[activePair.id] ?? 0) : 0;
  const balance = fx?.balance ?? pred?.balance ?? pool?.balance ?? null;

  return (
    <div
      style={panel}
      className="wb-panel"
      data-wb-se="self"
      role="dialog"
      aria-label="FX・金融・予測市場"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 16 }}>{title ?? "総合金融・予測マーケット"}</strong>
        {balance !== null && <span style={{ fontSize: 13 }}>残高 {yen(balance)}</span>}
        {fx &&
          !fx.guest &&
          (!lockedTabs || lockedTabs.includes("fx_spot") || lockedTabs.includes("fx_margin")) && (
            <span style={{ fontSize: 12, opacity: 0.8 }}>／ 外貨評価 {yen(fx.walletValueWbc)}</span>
          )}
        <span style={{ flex: 1 }} />
        <button type="button" style={btn} onClick={onClose}>
          閉じる
        </button>
      </div>

      {(!lockedTabs || lockedTabs.length > 1) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {(
            [
              ["fx_spot", "FX現物両替"],
              ["fx_margin", `FX信用 (${fx?.positions.length ?? 0})`],
              ["prediction", "バイナリー予測市場"],
              ["house_pool", "胴元LPプール"],
            ] as const
          )
            .filter(([t]) => !lockedTabs || lockedTabs.includes(t))
            .map(([t, label]) => (
              <button
                key={t}
                type="button"
                style={{
                  ...btn,
                  ...(tab === t
                    ? { background: "rgba(255,210,62,0.18)", borderColor: "rgba(255,210,62,0.55)" }
                    : {}),
                }}
                onClick={() => setTab(t)}
              >
                {label}
              </button>
            ))}
        </div>
      )}

      {msg && (
        <p
          role="status"
          style={{
            margin: "8px 0 0",
            padding: "6px 10px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.08)",
            fontSize: 13,
          }}
        >
          {msg}
        </p>
      )}

      {(tab === "fx_spot" || tab === "fx_margin") && fx && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            {fx.pairs.map((p) => {
              const held = (fx.wallet[p.id] ?? 0) / scale;
              const selected = p.id === activePair?.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelPair(p.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: selected ? "1px solid #4ade80" : "1px solid rgba(255,255,255,0.15)",
                    background: selected ? "rgba(74,222,128,0.10)" : "rgba(255,255,255,0.04)",
                    color: "#fff",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {p.id}/WBC ・ {p.name}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.75 }}>
                      {p.desc} ・ 金利年率 {(p.apr * 100).toFixed(1)}%
                      {held > 0 ? ` ・ 保有 ${held.toFixed(2)} ${p.id}` : ""}
                    </div>
                  </div>
                  <Spark history={p.history} />
                  <div style={{ textAlign: "right", flexShrink: 0, fontSize: 12 }}>
                    <div style={{ fontWeight: 700 }}>仲値 {yen(p.mid)}</div>
                    <div style={{ opacity: 0.75 }}>
                      売{p.bid} / 買{p.ask}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {activePair && !fx.guest && tab === "fx_spot" && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                {activePair.id} 現物両替（保有 {(heldCenti / scale).toFixed(2)} {activePair.id}）
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    style={{ ...input, width: 130 }}
                    inputMode="numeric"
                    value={wbcBuyStr}
                    onChange={(e) => setWbcBuyStr(e.target.value)}
                    placeholder="WBC額"
                  />
                  <button
                    type="button"
                    style={{ ...btn, borderColor: "#4ade80" }}
                    disabled={busy}
                    onClick={() =>
                      void postAction(
                        "/api/worldbox/fx",
                        {
                          action: "swap_buy",
                          currency: activePair.id,
                          wbcAmount: Math.trunc(Number(wbcBuyStr) || 0),
                        },
                        (res) =>
                          `${activePair.id}を ${(Number(res.centiReceived ?? 0) / scale).toFixed(2)} ${activePair.id} 購入（レート ${res.askRate}円）`,
                      )
                    }
                  >
                    WBCで買う (Ask {activePair.ask}円)
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    style={{ ...input, width: 130 }}
                    inputMode="decimal"
                    value={sellUnitsStr}
                    onChange={(e) => setSellUnitsStr(e.target.value)}
                    placeholder="外貨数量"
                  />
                  <button
                    type="button"
                    style={{ ...btn, borderColor: "#f87171" }}
                    disabled={busy || heldCenti < 1}
                    onClick={() =>
                      void postAction(
                        "/api/worldbox/fx",
                        {
                          action: "swap_sell",
                          currency: activePair.id,
                          centiUnits: Math.round((Number(sellUnitsStr) || 0) * scale),
                        },
                        (res) =>
                          `${(Number(res.centiSold ?? 0) / scale).toFixed(2)} ${activePair.id} を売却し ${yen(Number(res.wbcReceived ?? 0))} 受け取りました`,
                      )
                    }
                  >
                    外貨を売る (Bid {activePair.bid}円)
                  </button>
                  {heldCenti > 0 && (
                    <button
                      type="button"
                      style={{ ...btn, minHeight: 28, fontSize: 12 }}
                      onClick={() => setSellUnitsStr((heldCenti / scale).toFixed(2))}
                    >
                      全額セット
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {activePair && !fx.guest && tab === "fx_margin" && (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                  {activePair.id}/WBC 信用レバレッジ建玉
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  <button
                    type="button"
                    style={{
                      ...btn,
                      borderColor: marginSide === "long" ? "#4ade80" : undefined,
                      background: marginSide === "long" ? "rgba(74,222,128,0.2)" : undefined,
                    }}
                    onClick={() => setMarginSide("long")}
                  >
                    買い (Long)
                  </button>
                  <button
                    type="button"
                    style={{
                      ...btn,
                      borderColor: marginSide === "short" ? "#f87171" : undefined,
                      background: marginSide === "short" ? "rgba(248,113,113,0.2)" : undefined,
                    }}
                    onClick={() => setMarginSide("short")}
                  >
                    売り (Short)
                  </button>
                  {([2, 5, 10] as const).map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      style={{
                        ...btn,
                        borderColor: leverage === lv ? "#ffd23e" : undefined,
                      }}
                      onClick={() => setLeverage(lv)}
                    >
                      {lv}倍
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    style={{ ...input, width: 130 }}
                    inputMode="numeric"
                    value={marginStr}
                    onChange={(e) => setMarginStr(e.target.value)}
                    placeholder="証拠金"
                  />
                  <button
                    type="button"
                    style={{ ...btn, fontWeight: 700, borderColor: "#ffd23e" }}
                    disabled={busy}
                    onClick={() =>
                      void postAction(
                        "/api/worldbox/fx",
                        {
                          action: "open_margin",
                          currency: activePair.id,
                          side: marginSide,
                          leverage,
                          marginWbc: Math.trunc(Number(marginStr) || 0),
                        },
                        () =>
                          `${activePair.id} ${marginSide.toUpperCase()} ${leverage}x ポジションを建てました`,
                      )
                    }
                  >
                    建玉を開く（実質 {yen(Math.trunc((Number(marginStr) || 0) * leverage))}）
                  </button>
                </div>
                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
                  証拠金維持率 30%以下で強制ロスカット対象（他プレイヤーによる精算で5%報奨金）。
                </div>
              </div>

              <div style={{ fontWeight: 700, fontSize: 13, marginTop: 10 }}>保有ポジション</div>
              {fx.positions.length === 0 ? (
                <p style={{ fontSize: 12, opacity: 0.65 }}>保有中の信用ポジションはありません。</p>
              ) : (
                fx.positions.map((pos) => (
                  <div
                    key={pos.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      padding: "8px 0",
                      borderTop: "1px solid rgba(255,255,255,0.1)",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div>
                        <strong>
                          {pos.currency} {pos.side.toUpperCase()} {pos.leverage}x
                        </strong>{" "}
                        （証拠金 {yen(pos.marginWbc)} / 建値 {pos.entryRate}→現在 {pos.currentRate}
                        ）
                      </div>
                      <div
                        style={{
                          color: pos.unrealizedPnl >= 0 ? "#4ade80" : "#f87171",
                        }}
                      >
                        損益 {pos.unrealizedPnl >= 0 ? "+" : ""}
                        {yen(pos.unrealizedPnl)} ・ スワップ {pos.swapAccrued >= 0 ? "+" : ""}
                        {pos.swapAccrued} ・ 維持率 {(pos.marginRatio * 100).toFixed(1)}%
                      </div>
                    </div>
                    <button
                      type="button"
                      style={btn}
                      disabled={busy}
                      onClick={() =>
                        void postAction(
                          "/api/worldbox/fx",
                          { action: "close_margin", positionId: pos.id },
                          (res) => `決済しました（受取 ${yen(Number(res.payout ?? 0))}）`,
                        )
                      }
                    >
                      決済
                    </button>
                  </div>
                ))
              )}

              {fx.liquidatablePositions.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#f87171" }}>
                    ロスカット執行可能ポジション（5%報奨金）
                  </div>
                  {fx.liquidatablePositions.map((pos) => (
                    <div
                      key={pos.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 0",
                        borderTop: "1px solid rgba(255,255,255,0.1)",
                        fontSize: 12,
                      }}
                    >
                      <span style={{ flex: 1 }}>
                        {pos.currency} {pos.side.toUpperCase()} {pos.leverage}x ・ 維持率{" "}
                        {(pos.marginRatio * 100).toFixed(1)}%
                      </span>
                      <button
                        type="button"
                        style={{ ...btn, borderColor: "#f87171", color: "#fca5a5" }}
                        disabled={busy}
                        onClick={() =>
                          void postAction(
                            "/api/worldbox/fx",
                            { action: "close_margin", positionId: pos.id },
                            (res) =>
                              `強制清算を執行し、報奨金 ${yen(Number(res.liquidatorReward ?? 0))} を獲得しました`,
                          )
                        }
                      >
                        ロスカット執行
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "prediction" && pred && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 12, opacity: 0.8, margin: "0 0 8px" }}>
            毎時00分確定のパリミュチュエル方式 UP / DOWN
            予測市場（手数料4%のうち半額が胴元LPプールへ分配）。
            {pred.claimedNow > 0 && ` 配当 ${yen(pred.claimedNow)} を自動受け取りしました！`}
          </p>
          {!pred.guest && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>ベット額</span>
              <input
                style={{ ...input, width: 120 }}
                inputMode="numeric"
                value={predBetStr}
                onChange={(e) => setPredBetStr(e.target.value)}
              />
              {[500, 1000, 5000, 10000].map((v) => (
                <button
                  key={v}
                  type="button"
                  style={{ ...btn, minHeight: 28, padding: "2px 8px", fontSize: 12 }}
                  onClick={() => setPredBetStr(String(v))}
                >
                  {v.toLocaleString()}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "grid", gap: 8 }}>
            {pred.rounds.slice(0, 12).map((r) => (
              <div
                key={r.id}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <strong>{r.label}</strong>
                  <span>
                    {r.settled
                      ? `確定: ${r.winner === "up" ? "上昇 (UP)" : "下落 (DOWN)"} (${yen(r.finalPrice ?? r.strikePrice)})`
                      : r.bettingOpen
                        ? `締切 ${new Date(r.closesAt).toLocaleTimeString()}`
                        : "締切済（確定待ち）"}
                  </span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                  基準値 {yen(r.strikePrice)} → 現在値 {yen(r.currentPrice)} ／ プール UP{" "}
                  {yen(r.upPool)} vs DOWN {yen(r.downPool)}
                </div>
                {!r.settled && r.bettingOpen && !pred.guest && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      style={{
                        ...btn,
                        flex: 1,
                        borderColor: "#4ade80",
                        background: "rgba(74,222,128,0.16)",
                      }}
                      disabled={busy}
                      onClick={() =>
                        void postAction(
                          "/api/worldbox/prediction",
                          {
                            action: "bet",
                            roundId: r.id,
                            side: "up",
                            amount: Math.trunc(Number(predBetStr) || 0),
                          },
                          () => `${r.symbol} UP にベットしました`,
                        )
                      }
                    >
                      UP（以上）に賭ける
                    </button>
                    <button
                      type="button"
                      style={{
                        ...btn,
                        flex: 1,
                        borderColor: "#f87171",
                        background: "rgba(248,113,113,0.16)",
                      }}
                      disabled={busy}
                      onClick={() =>
                        void postAction(
                          "/api/worldbox/prediction",
                          {
                            action: "bet",
                            roundId: r.id,
                            side: "down",
                            amount: Math.trunc(Number(predBetStr) || 0),
                          },
                          () => `${r.symbol} DOWN にベットしました`,
                        )
                      }
                    >
                      DOWN（未満）に賭ける
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {!pred.guest && pred.myBets.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>最近の予測ベット</div>
              {pred.myBets.slice(0, 8).map((b) => (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    padding: "4px 0",
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <span>
                    {b.roundId} ・ {b.side.toUpperCase()}
                  </span>
                  <span>
                    賭け {yen(b.amount)}
                    {b.payout > 0 ? ` → 配当 ${yen(b.payout)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "house_pool" && pool && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.04)",
              marginBottom: 10,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14 }}>カジノ・競馬・予測市場 胴元LPプール</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              プール総流動性: <strong>{yen(pool.pool.poolWbc)}</strong> ／ 1シェア基準価額(NAV):{" "}
              <strong>{pool.pool.navPerShare.toFixed(4)}円</strong>
            </div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
              累計ハウス収益 +{yen(pool.pool.cumulativeYield)} ／ 累計払出損 -
              {yen(pool.pool.cumulativeLoss)}
            </div>
            {!pool.guest && (
              <div style={{ fontSize: 13, marginTop: 6, color: "#86efac" }}>
                あなたの保有LP: {pool.myShares.toLocaleString()}シェア（評価額 {yen(pool.myValue)}）
                {pool.company &&
                  ` ／ 会社LP: ${pool.company.shares.toLocaleString()}シェア（評価額 ${yen(pool.company.value)}）`}
              </div>
            )}
          </div>

          {!pool.guest && (
            <div style={{ display: "grid", gap: 8 }}>
              {pool.company?.isOwner && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    style={{ ...btn, flex: 1, borderColor: !lpAsCompany ? "#ffd23e" : undefined }}
                    onClick={() => setLpAsCompany(false)}
                  >
                    個人出資
                  </button>
                  <button
                    type="button"
                    style={{ ...btn, flex: 1, borderColor: lpAsCompany ? "#60a5fa" : undefined }}
                    onClick={() => setLpAsCompany(true)}
                  >
                    会社資産出資 ({yen(pool.company.assets)})
                  </button>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  style={{ ...input, width: 130 }}
                  inputMode="numeric"
                  value={lpAmountStr}
                  onChange={(e) => setLpAmountStr(e.target.value)}
                  placeholder="出資額"
                />
                <button
                  type="button"
                  style={{ ...btn, borderColor: "#4ade80" }}
                  disabled={busy}
                  onClick={() =>
                    void postAction(
                      "/api/worldbox/house-pool",
                      {
                        action: "deposit",
                        asCompany: lpAsCompany,
                        amount: Math.trunc(Number(lpAmountStr) || 0),
                      },
                      (res) =>
                        `胴元LPへ出資し、${Number(res.sharesMinted ?? 0).toLocaleString()}シェアを発行しました`,
                    )
                  }
                >
                  出資する (1,000円〜)
                </button>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  style={{ ...input, width: 130 }}
                  inputMode="numeric"
                  value={lpSharesStr}
                  onChange={(e) => setLpSharesStr(e.target.value)}
                  placeholder="解約シェア数"
                />
                <button
                  type="button"
                  style={{ ...btn, borderColor: "#f87171" }}
                  disabled={busy}
                  onClick={() =>
                    void postAction(
                      "/api/worldbox/house-pool",
                      {
                        action: "withdraw",
                        asCompany: lpAsCompany,
                        shares: Math.trunc(Number(lpSharesStr) || 0),
                      },
                      (res) =>
                        `LPシェアを解約し ${yen(Number(res.net ?? 0))}（解約手数料 ${yen(Number(res.fee ?? 0))}）を受け取りました`,
                    )
                  }
                >
                  引き出す (手数料0.5%)
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
