"use client";
import { useEffect, useRef, useState } from "react";
import { WbIcon } from "./WbIcon";
import type { CareerDef } from "@/lib/worldbox/social/jobs";

const ING_COLOR: Record<string, string> = {
  エスプレッソ: "#5b3219",
  スチームミルク: "#f5efe6",
  キャラメル: "#d97706",
  抹茶パウダー: "#15803d",
  氷: "#bae6fd",
  ホイップクリーム: "#ffffff",
  ブリオッシュ: "#f59e0b",
  ベーコンエッグ: "#ef4444",
};

export function BaristaBrewConsole({
  customerName,
  drinkName,
  recipe,
  palette,
  servedCount,
  atCafeNow,
  busy,
  onServe,
}: {
  customerName: string;
  drinkName: string;
  recipe: readonly string[];
  palette: readonly string[];
  servedCount: number;
  atCafeNow: boolean;
  busy: boolean;
  onServe: (ingredients: string[], qualityScore: number) => void;
}) {
  const [tray, setTray] = useState<string[]>([]);
  const [needle, setNeedle] = useState(50);
  const [lockedPressure, setLockedPressure] = useState<number | null>(null);
  const [patience, setPatience] = useState(100);
  const needleRef = useRef(50);
  const startedRef = useRef(Date.now());

  useEffect(() => {
    setTray([]);
    setLockedPressure(null);
    setPatience(100);
    startedRef.current = Date.now();
  }, [drinkName, customerName, servedCount]);

  useEffect(() => {
    if (lockedPressure !== null) return;
    let raf = 0;
    const tick = (t: number) => {
      const val = 50 + Math.sin(t * 0.0046) * 44;
      needleRef.current = val;
      setNeedle(val);
      const elapsedSec = (Date.now() - startedRef.current) / 1000;
      setPatience(Math.max(25, Math.round(100 - elapsedSec * 1.4)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lockedPressure]);

  const sweetMin = 60;
  const sweetMax = 82;
  const inSweetSpot = (v: number) => v >= sweetMin && v <= sweetMax;

  const lockBrew = () => {
    setLockedPressure(Math.round(needleRef.current));
  };

  const pressureQuality =
    lockedPressure === null
      ? 0
      : inSweetSpot(lockedPressure)
        ? 100
        : Math.max(
            35,
            100 -
              Math.min(Math.abs(lockedPressure - sweetMin), Math.abs(lockedPressure - sweetMax)) *
                2.2,
          );

  const combinedScore = Math.round(pressureQuality * 0.65 + patience * 0.35);

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: "rgba(15,23,42,0.82)",
        border: "1px solid rgba(251,191,36,0.42)",
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
      >
        <strong style={{ color: "#fbbf24", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <WbIcon name="receipt" size={14} color="#fbbf24" />
          {customerName}「{drinkName}」
        </strong>
        <span className="wb-mmo-stat-chip">連続 {servedCount} 杯</span>
      </div>

      {/* Patience bar */}
      <div style={{ display: "grid", gap: 3 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            color: "#94a3b8",
          }}
        >
          <span>提供スピード・鮮度</span>
          <span style={{ color: patience >= 70 ? "#4ade80" : "#fbbf24" }}>{patience}%</span>
        </div>
        <div
          style={{
            height: 5,
            borderRadius: 99,
            background: "rgba(148,163,184,0.2)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${patience}%`,
              height: "100%",
              background: patience >= 70 ? "#4ade80" : "#fbbf24",
              transition: "width 120ms linear",
            }}
          />
        </div>
      </div>

      {/* Cup Visualizer + Recipe */}
      <div
        style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: 12, alignItems: "center" }}
      >
        <svg
          width="92"
          height="96"
          viewBox="0 0 92 96"
          aria-label="ドリンクカップ"
          style={{
            background: "rgba(2,6,23,0.65)",
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.22)",
          }}
        >
          {/* Cup silhouette */}
          <path
            d="M22 20 L28 82 H64 L70 20 Z"
            fill="rgba(148,163,184,0.12)"
            stroke="#94a3b8"
            strokeWidth="2"
          />
          <path
            d="M68 34 Q82 34 82 48 Q82 62 66 62"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="2.2"
          />
          {/* Layered ingredients poured */}
          {tray.slice(0, 4).map((ing, i) => {
            const layerH = 14;
            const yTop = 80 - (i + 1) * layerH;
            const inset = 28 - i * 1.1;
            const width = 36 + i * 2.2;
            return (
              <rect
                key={`${ing}-${i}`}
                x={inset}
                y={yTop}
                width={width}
                height={layerH - 1}
                rx="2"
                fill={ING_COLOR[ing] ?? "#38bdf8"}
              />
            );
          })}
          {/* Steam lines when pressure locked */}
          {lockedPressure !== null && (
            <>
              <path
                d="M36 16 Q39 10 36 5"
                stroke="#e2e8f0"
                strokeWidth="1.8"
                fill="none"
                opacity="0.7"
              />
              <path
                d="M46 15 Q49 9 46 4"
                stroke="#e2e8f0"
                strokeWidth="1.8"
                fill="none"
                opacity="0.8"
              />
              <path
                d="M56 16 Q59 10 56 5"
                stroke="#e2e8f0"
                strokeWidth="1.8"
                fill="none"
                opacity="0.7"
              />
            </>
          )}
        </svg>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12 }}>
            注文レシピ: <strong style={{ color: "#f8fafc" }}>{recipe.join(" + ")}</strong>
          </div>
          <div style={{ fontSize: 11.5, color: "#38bdf8" }}>
            注いだ素材 ({tray.length}/{recipe.length}):{" "}
            {tray.length > 0 ? tray.join(" → ") : "下から順番に注いでください"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {palette.map((ing) => (
              <button
                key={ing}
                type="button"
                disabled={busy || !atCafeNow || tray.length >= 4}
                className="wb-mmo-btn"
                style={{
                  padding: "4px 8px",
                  fontSize: 11.5,
                  borderLeft: `3px solid ${ING_COLOR[ing] ?? "#38bdf8"}`,
                }}
                onClick={() => setTray((prev) => [...prev, ing])}
              >
                + {ing}
              </button>
            ))}
            <button
              type="button"
              className="wb-mmo-btn"
              style={{ padding: "4px 8px", fontSize: 11.5 }}
              onClick={() => {
                setTray([]);
                setLockedPressure(null);
              }}
            >
              作り直す
            </button>
          </div>
        </div>
      </div>

      {/* Live Extraction Pressure Bar */}
      <div
        style={{
          padding: "8px 10px",
          borderRadius: 8,
          background: "rgba(2,6,23,0.6)",
          border: "1px solid rgba(56,189,248,0.28)",
          display: "grid",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
          <span>
            スチーム抽出圧（9bar 黄金帯 {sweetMin}〜{sweetMax} でロック）
          </span>
          <strong
            style={{
              color:
                lockedPressure !== null
                  ? inSweetSpot(lockedPressure)
                    ? "#4ade80"
                    : "#fbbf24"
                  : "#38bdf8",
            }}
          >
            {lockedPressure !== null
              ? `${lockedPressure} bar (${inSweetSpot(lockedPressure) ? "完璧 +30%チップ" : "完了"})`
              : `${Math.round(needle)} bar`}
          </strong>
        </div>
        <div
          style={{
            position: "relative",
            height: 16,
            borderRadius: 8,
            background: "rgba(30,41,59,0.95)",
            overflow: "hidden",
          }}
        >
          {/* Golden sweet zone */}
          <div
            style={{
              position: "absolute",
              left: `${sweetMin}%`,
              width: `${sweetMax - sweetMin}%`,
              top: 0,
              bottom: 0,
              background: "rgba(250, 204, 21, 0.42)",
              borderLeft: "1px solid #facc15",
              borderRight: "1px solid #facc15",
            }}
          />
          {/* Moving needle */}
          <div
            style={{
              position: "absolute",
              left: `calc(${lockedPressure ?? needle}% - 2.5px)`,
              top: 0,
              bottom: 0,
              width: 5,
              borderRadius: 3,
              background: lockedPressure !== null ? "#4ade80" : "#38bdf8",
              boxShadow: "0 0 8px rgba(56,189,248,0.85)",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {lockedPressure === null ? (
            <button
              type="button"
              disabled={busy || !atCafeNow || tray.length === 0}
              className="wb-mmo-btn wb-mmo-btn-amber"
              style={{ flex: 1 }}
              onClick={lockBrew}
            >
              スチーム抽出をロック！
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !atCafeNow || tray.length === 0}
              className="wb-mmo-btn wb-mmo-btn-primary"
              style={{ flex: 1 }}
              onClick={() => onServe(tray, combinedScore)}
            >
              品質 {combinedScore}点 でカウンター提供する
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CareerInteractiveConsole({
  career,
  disabled,
  onComplete,
}: {
  career: CareerDef;
  disabled: boolean;
  onComplete: (skillScore: number) => void;
}) {
  const mode =
    career.category === "産業・技術"
      ? "calibrate"
      : career.category === "金融・情報"
        ? "chart"
        : career.category === "公共・治安"
          ? "radar"
          : "conveyor";

  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [buyPrice, setBuyPrice] = useState<number | null>(null);
  const [chartHistory, setChartHistory] = useState<number[]>([50, 52, 48, 55, 49, 51, 54]);
  const phaseRef = useRef(0);
  const targetRef = useRef(50);

  useEffect(() => {
    setStarted(false);
    setStep(0);
    setScores([]);
    setBuyPrice(null);
  }, [career.id]);

  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let lastPush = 0;
    const tick = (t: number) => {
      const speed = 0.0032 + step * 0.0009;
      const val =
        mode === "radar"
          ? (t * 0.14) % 360
          : mode === "conveyor"
            ? (t * (0.055 + step * 0.014)) % 100
            : 50 + Math.sin(t * speed) * 42 + Math.cos(t * speed * 1.7) * 6;
      phaseRef.current = val;
      setPhase(val);
      if (mode === "chart" && t - lastPush > 110) {
        lastPush = t;
        setChartHistory((prev) => [...prev.slice(-22), Math.max(8, Math.min(92, Math.round(val)))]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, step, mode]);

  const targets =
    mode === "radar" ? [65, 195, 305] : mode === "conveyor" ? [52, 52, 52] : [38, 66, 52];
  targetRef.current = targets[step % targets.length];

  const recordHit = () => {
    if (mode === "chart") {
      const cur = Math.max(8, Math.min(92, Math.round(phaseRef.current)));
      if (buyPrice === null) {
        setBuyPrice(cur);
        return;
      }
      const diff = cur - buyPrice;
      const roundScore = Math.max(30, Math.min(100, Math.round(62 + diff * 1.35)));
      const nextScores = [...scores, roundScore];
      setBuyPrice(null);
      if (nextScores.length >= 2) {
        const avg = Math.round(nextScores.reduce((a, b) => a + b, 0) / nextScores.length);
        setStarted(false);
        setScores([]);
        setStep(0);
        onComplete(avg);
      } else {
        setScores(nextScores);
        setStep((s) => s + 1);
      }
      return;
    }

    const cur = phaseRef.current;
    const tgt = targetRef.current;
    const dist =
      mode === "radar"
        ? Math.min(Math.abs(cur - tgt), 360 - Math.abs(cur - tgt))
        : Math.abs(cur - tgt);
    const tol = mode === "radar" ? 28 : 11;
    const roundScore =
      dist <= tol
        ? 100
        : Math.max(25, Math.round(100 - (dist - tol) * (mode === "radar" ? 1.4 : 2.8)));
    const nextScores = [...scores, roundScore];
    if (nextScores.length >= 3) {
      const avg = Math.round(nextScores.reduce((a, b) => a + b, 0) / nextScores.length);
      setStarted(false);
      setScores([]);
      setStep(0);
      onComplete(avg);
    } else {
      setScores(nextScores);
      setStep((s) => s + 1);
    }
  };

  const titleByMode =
    mode === "calibrate"
      ? "精密キャリブレーション制御盤（3ch 同期調整）"
      : mode === "chart"
        ? "リアルタイム相場スキャルピング端末（2トレード執行）"
        : mode === "radar"
          ? "360° 治安・救命シグナル捕捉レーダー（3目標スキャン）"
          : "高速バーコード仕分けコンベア（3荷物スキャン）";

  if (!started) {
    return (
      <div
        style={{
          marginTop: 10,
          padding: 12,
          borderRadius: 10,
          background: "rgba(15,23,42,0.75)",
          border: "1px solid rgba(56,189,248,0.35)",
          display: "grid",
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 700, color: "#38bdf8", fontSize: 12.5 }}>{titleByMode}</div>
        <div style={{ fontSize: 11.5, color: "#cbd5e1" }}>
          リアルタイム操作の精度ランクに応じて給与倍率が変動します（Sランク: 1.55倍 / Aランク:
          1.35倍 / Bランク: 1.12倍）。
        </div>
        <button
          type="button"
          disabled={disabled}
          className="wb-mmo-btn wb-mmo-btn-primary"
          onClick={() => {
            setScores([]);
            setStep(0);
            setBuyPrice(null);
            setStarted(true);
          }}
        >
          現場コンソールを起動してシフト開始
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 10,
        padding: 12,
        borderRadius: 10,
        background: "rgba(2,6,23,0.88)",
        border: "1px solid rgba(56,189,248,0.5)",
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 12,
        }}
      >
        <strong style={{ color: "#38bdf8" }}>{titleByMode}</strong>
        <span className="wb-mmo-stat-chip">
          工程 {scores.length + 1} / {mode === "chart" ? 2 : 3}
        </span>
      </div>

      {mode === "calibrate" && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
            緑の基準レンジ ({targets[step] - 11}〜{targets[step] + 11}) に針が入った瞬間にロック！
          </div>
          <div
            style={{
              position: "relative",
              height: 26,
              borderRadius: 8,
              background: "#0f172a",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: `${targets[step] - 11}%`,
                width: "22%",
                top: 0,
                bottom: 0,
                background: "rgba(74, 222, 128, 0.35)",
                borderLeft: "1.5px solid #4ade80",
                borderRight: "1.5px solid #4ade80",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: `calc(${phase}% - 3px)`,
                top: 0,
                bottom: 0,
                width: 6,
                background: "#38bdf8",
                boxShadow: "0 0 10px #38bdf8",
              }}
            />
          </div>
        </div>
      )}

      {mode === "chart" && (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
            <span style={{ color: "#94a3b8" }}>
              {buyPrice === null
                ? "安値圏でエントリー(BUY)を押す"
                : `建玉 ¥${buyPrice}00 — 高値圏で利確(SELL)！`}
            </span>
            <strong style={{ color: "#fde047" }}>現在値 ¥{Math.round(phase)}00</strong>
          </div>
          <svg
            width="100%"
            height="84"
            viewBox="0 0 260 84"
            style={{
              background: "#0f172a",
              borderRadius: 8,
              border: "1px solid rgba(148,163,184,0.22)",
            }}
          >
            {buyPrice !== null && (
              <line
                x1="0"
                y1={84 - (buyPrice / 100) * 76 - 4}
                x2="260"
                y2={84 - (buyPrice / 100) * 76 - 4}
                stroke="#4ade80"
                strokeDasharray="4 3"
                strokeWidth="1.2"
              />
            )}
            <polyline
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.2"
              points={chartHistory
                .map(
                  (v, i) =>
                    `${(i / Math.max(1, chartHistory.length - 1)) * 252 + 4},${80 - (v / 100) * 72}`,
                )
                .join(" ")}
            />
          </svg>
        </div>
      )}

      {mode === "radar" && (
        <div style={{ display: "grid", placeItems: "center" }}>
          <svg width="136" height="136" viewBox="0 0 136 136">
            <circle cx="68" cy="68" r="60" fill="#06121e" stroke="#0284c7" strokeWidth="1.5" />
            <circle cx="68" cy="68" r="38" fill="none" stroke="rgba(56,189,248,0.25)" />
            <circle cx="68" cy="68" r="18" fill="none" stroke="rgba(56,189,248,0.25)" />
            {(() => {
              const radT = ((targets[step] - 90) * Math.PI) / 180;
              const tx = 68 + Math.cos(radT) * 44;
              const ty = 68 + Math.sin(radT) * 44;
              const radP = ((phase - 90) * Math.PI) / 180;
              const px = 68 + Math.cos(radP) * 58;
              const py = 68 + Math.sin(radP) * 58;
              return (
                <>
                  <circle cx={tx} cy={ty} r="7" fill="#ef4444" stroke="#fecaca" strokeWidth="2" />
                  <line x1="68" y1="68" x2={px} y2={py} stroke="#4ade80" strokeWidth="2.5" />
                </>
              );
            })()}
          </svg>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            緑のレーダー針が赤い反応点に重なった瞬間に捕捉！
          </div>
        </div>
      )}

      {mode === "conveyor" && (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
            中央の青いレーザースキャナに荷物が重なった瞬間にスキャン！
          </div>
          <div
            style={{
              position: "relative",
              height: 42,
              borderRadius: 8,
              background: "#0f172a",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "44%",
                width: "16%",
                top: 0,
                bottom: 0,
                background: "rgba(56,189,248,0.28)",
                borderLeft: "2px solid #38bdf8",
                borderRight: "2px solid #38bdf8",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: `calc(${phase}% - 16px)`,
                top: 8,
                width: 32,
                height: 26,
                borderRadius: 5,
                background: "#f59e0b",
                border: "2px solid #fef3c7",
              }}
            />
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="wb-mmo-btn wb-mmo-btn-amber"
          style={{ flex: 1, fontWeight: 800 }}
          onClick={recordHit}
        >
          {mode === "chart"
            ? buyPrice === null
              ? "底値エントリー (BUY)"
              : "ピーク利確 (SELL)"
            : mode === "radar"
              ? "シグナル捕捉！"
              : mode === "conveyor"
                ? "レーザー検品スキャン！"
                : "レンジ固定ロック！"}
        </button>
        <button
          type="button"
          className="wb-mmo-btn"
          onClick={() => {
            setStarted(false);
            setScores([]);
            setStep(0);
          }}
        >
          中断
        </button>
      </div>
    </div>
  );
}

export function DeliveryHandoverConsole({
  disabled,
  atDestination,
  onDeliver,
}: {
  disabled: boolean;
  atDestination: boolean;
  onDeliver: (qualityScore: number) => void;
}) {
  const [needle, setNeedle] = useState(50);
  const needleRef = useRef(50);

  useEffect(() => {
    if (!atDestination) return;
    let raf = 0;
    const tick = (t: number) => {
      const v = 50 + Math.sin(t * 0.0052) * 44;
      needleRef.current = v;
      setNeedle(v);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [atDestination]);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      {atDestination && (
        <div
          style={{
            padding: 8,
            borderRadius: 8,
            background: "rgba(2,6,23,0.7)",
            border: "1px solid rgba(74,222,128,0.45)",
            display: "grid",
            gap: 5,
          }}
        >
          <div style={{ fontSize: 11, color: "#86efac" }}>
            現地到着！中央の緑エリアでバーコード受領スキャンすると速達チップ +20%
          </div>
          <div
            style={{
              position: "relative",
              height: 14,
              borderRadius: 7,
              background: "#0f172a",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "38%",
                width: "24%",
                top: 0,
                bottom: 0,
                background: "rgba(74,222,128,0.45)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: `calc(${needle}% - 2.5px)`,
                top: 0,
                bottom: 0,
                width: 5,
                background: "#facc15",
              }}
            />
          </div>
        </div>
      )}
      <button
        type="button"
        disabled={disabled}
        className="wb-mmo-btn wb-mmo-btn-primary"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}
        onClick={() => {
          const dist = Math.abs(needleRef.current - 50);
          const q = !atDestination
            ? 70
            : dist <= 12
              ? 96
              : Math.max(55, Math.round(95 - dist * 1.4));
          onDeliver(q);
        }}
      >
        <WbIcon name="check" size={12} color="#dcfce7" />
        {atDestination ? "バーコードスキャンして納品完了" : "荷物を現地へ納品する"}
      </button>
    </div>
  );
}
