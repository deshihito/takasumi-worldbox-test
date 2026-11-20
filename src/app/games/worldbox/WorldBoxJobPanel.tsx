"use client";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { WbIcon, type WbIconName } from "./WbIcon";
import type { PlayerProfile } from "@/lib/worldbox/player/profile";
import type {
  ActiveDeliveryOrder,
  CareerDef,
  CareerId,
  CertificationDef,
  JobProfile,
  JobTaskPrompt,
  SpatialSpot,
} from "@/lib/worldbox/social/jobs";
import { itemById } from "@/lib/worldbox/economy/items";

const overlayStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(650px, calc(100vw - 24px))",
  maxHeight: "min(86svh, 710px)",
  overflowY: "auto",
  borderRadius: 14,
  padding: "0 16px 16px",
  background: "rgba(13, 19, 28, 0.96)",
  border: "1px solid rgba(148, 163, 184, 0.28)",
  boxShadow: "0 20px 50px rgba(0,0,0,0.65)",
  color: "#f1f5f9",
  zIndex: 25,
  fontSize: 13,
};

const stickyHeaderStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "14px 0 10px",
  marginBottom: 10,
  background: "rgba(13, 19, 28, 0.98)",
  borderBottom: "1px solid rgba(148,163,184,0.22)",
};

interface JobsApiGetResponse {
  jobProfile: JobProfile;
  careers: CareerDef[];
  certifications: CertificationDef[];
  balance: number | null;
  hunger: number;
  hasUnemploymentCard: boolean;
  cooldownLeftMs: number;
  jailed: boolean;
  actorPos: { space: string; x: number; y: number };
  spots: { cafe: SpatialSpot[]; patrol: SpatialSpot[] };
  cafeIngredients: string[];
  govPolicies?: { incomeTaxRate: number; stimulusPayout: number };
  equippedVehicle?: string | null;
}

function distLabel(
  pos: { space: string; x: number; y: number },
  target: { space: string; x: number; y: number },
): { sameSpace: boolean; dist: number; text: string } {
  if (pos.space !== target.space) {
    return {
      sameSpace: false,
      dist: 999,
      text: `${target.space === "world" ? "ワールド" : "ロビー"}へ移動が必要`,
    };
  }
  const d = Math.hypot(pos.x - target.x, pos.y - target.y);
  return { sameSpace: true, dist: d, text: `${d.toFixed(1)}m` };
}

export default function WorldBoxJobPanel({
  onProfileChange,
  onStatusChange,
  onSetWaypoint,
  onClose,
}: {
  onProfileChange?: (profile: PlayerProfile) => void;
  onStatusChange?: () => void;
  onSetWaypoint?: (wp: { space: string; x: number; y: number; label: string }) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<JobsApiGetResponse | null>(null);
  const [tab, setTab] = useState<"field" | "shift" | "careers" | "certs" | "support">("field");
  const [categoryFilter, setCategoryFilter] = useState<string>("すべて");
  const [task, setTask] = useState<JobTaskPrompt | null>(null);
  const [cafeTray, setCafeTray] = useState<string[]>([]);
  const [headline, setHeadline] = useState("");
  const [msg, setMsg] = useState("");
  const [suggestedWp, setSuggestedWp] = useState<{
    space: string;
    x: number;
    y: number;
    label: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/worldbox/jobs", { headers: { Accept: "application/json" } });
      if (!res.ok) {
        setMsg("ジョブ情報を読み込めませんでした");
        return;
      }
      const d = (await res.json()) as JobsApiGetResponse;
      setData(d);
      setTask(d.jobProfile.activeTask);
    } catch {
      setMsg("通信エラーが発生しました");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const guideTo = (wp: { space: string; x: number; y: number; label: string }) => {
    if (onSetWaypoint) {
      onSetWaypoint(wp);
      setMsg(`[案内] マップ上にコンパス案内をセットしました: ${wp.label}`);
    }
  };

  const callAction = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg("");
    setSuggestedWp(null);
    try {
      const res = await fetch("/api/worldbox/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const errCode = String(json.error ?? "");
        const map: Record<string, string> = {
          cooldown: "次のシフトまで少し待機してください",
          too_tired: "空腹です！コンビニや飲食でエネルギーを回復してください",
          in_prison: "収監中は刑務所の『懲役作業』のみ行えます",
          level_too_low: "キャリアLvが不足しています",
          certification_required: "必要な資格ライセンスを取得してください",
          insufficient_funds: "残高が不足しています",
          already_owned: "すでに取得済みの資格です",
          not_at_cafe: "カフェ運営にはロビー内の実店舗グルメカウンター前へ移動してください",
          too_far_from_destination:
            "まだ配達先へ到着していません！案内矢印の場所へ移動してください",
          too_far_from_patrol: "指定の巡回チェックポイントへ移動してください",
          not_police: "警察巡回には警察職または警備資格が必要です",
          not_eligible: "対象条件を満たしていません（残高15,000円以下または雇用保険証が必要）",
        };
        if (errCode === "not_at_cafe" && json.nearestSpot) {
          const sp = json.nearestSpot as SpatialSpot;
          setSuggestedWp(sp);
        } else if (errCode === "too_far_from_destination" && json.target) {
          const t = json.target as ActiveDeliveryOrder;
          setSuggestedWp({
            space: t.targetSpace,
            x: t.targetX,
            y: t.targetY,
            label: t.targetLabel,
          });
        } else if (errCode === "too_far_from_patrol" && json.target) {
          const t = json.target as SpatialSpot;
          setSuggestedWp({ space: t.space, x: t.x, y: t.y, label: t.label });
        }
        setMsg(map[errCode] ?? `エラー: ${errCode || res.status}`);
        return null;
      }
      if (json.profile && onProfileChange) {
        onProfileChange(json.profile as PlayerProfile);
      }
      await reload();
      if (onStatusChange) onStatusChange();
      return json;
    } finally {
      setBusy(false);
    }
  };

  const handleStartTask = async () => {
    const res = await callAction({ action: "start_task" });
    if (res?.task) {
      setTask(res.task as JobTaskPrompt);
      setMsg("業務タスクを発行しました。正しい判断で報酬1.4倍！");
    }
  };

  const handleSubmitShift = async (choiceIndex?: number) => {
    const res = await callAction({
      action: "submit_shift",
      ...(typeof choiceIndex === "number" ? { choiceIndex } : {}),
    });
    if (!res) return;
    setTask(null);
    const payout = res.payout as { net?: number; tax?: number; bonusPct?: number } | undefined;
    const drops = (res.drops as string[] | undefined) ?? [];
    const dropLabel =
      drops.length > 0
        ? ` / 支給品: ${drops.map((id) => itemById(id)?.name ?? id).join(", ")}`
        : "";
    const tag =
      res.taskCorrect === true
        ? "【大成功 1.4x】"
        : res.taskCorrect === false
          ? "【ミス減額】"
          : "【シフト完了】";
    const promo = res.leveledUp ? " [昇格]" : "";
    const warn = res.wantedNotice ? " [警告: 手配Lv+1]" : "";
    setMsg(
      `${tag} 手取 +¥${(payout?.net ?? 0).toLocaleString()}（市税 ¥${(payout?.tax ?? 0).toLocaleString()}）${dropLabel}${promo}${warn}`,
    );
  };

  const jobProfile = data?.jobProfile;
  const activeCareer =
    data?.careers.find((c) => c.id === jobProfile?.currentCareer) ?? data?.careers[0];
  const categories = ["すべて", "街の商業", "産業・技術", "公共・治安", "金融・情報"];

  // Nearest lobby cafe spot
  const nearestCafe =
    data?.spots.cafe.reduce((best, s) => {
      const bd = distLabel(data.actorPos, best).dist;
      const sd = distLabel(data.actorPos, s).dist;
      return sd < bd ? s : best;
    }, data.spots.cafe[0]) ?? null;

  const atCafeNow = data && nearestCafe ? distLabel(data.actorPos, nearestCafe).dist <= 4.5 : false;

  const activeDelivery = jobProfile?.activeDelivery ?? null;
  const deliveryDist =
    data && activeDelivery
      ? distLabel(data.actorPos, {
          space: activeDelivery.targetSpace,
          x: activeDelivery.targetX,
          y: activeDelivery.targetY,
        })
      : null;

  const activePatrol = jobProfile?.activePatrol ?? null;
  const patrolDist =
    data && activePatrol
      ? distLabel(data.actorPos, {
          space: activePatrol.space,
          x: activePatrol.x,
          y: activePatrol.y,
        })
      : null;

  return (
    <div className="wb-panel" style={overlayStyle}>
      <div style={stickyHeaderStyle}>
        <div>
          <strong style={{ fontSize: 16, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <WbIcon name="briefcase" size={16} color="#38bdf8" /> メトロ仕事・現地ワークセンター
          </strong>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            カフェ実店舗運営・物理配達ルート・警察巡回・12職業キャリア
          </div>
        </div>
        <button type="button" className="wb-mmo-btn" onClick={onClose}>
          閉じる
        </button>
      </div>

      {data && jobProfile && activeCareer && (
        <div
          className="wb-mmo-card"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>現職・ランク</div>
            <div style={{ fontWeight: 800, color: "#34d399" }}>
              {activeCareer.badge} {activeCareer.name}
            </div>
            <div className="wb-mmo-num" style={{ fontSize: 11, color: "#cbd5e1" }}>
              Lv.{jobProfile.level}（XP {jobProfile.xp}）
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>所持残高 / 体力</div>
            <div className="wb-mmo-num" style={{ fontWeight: 800, color: "#fbbf24" }}>
              {data.balance !== null ? `¥${data.balance.toLocaleString()}` : "¥---"}
            </div>
            <div className="wb-mmo-num" style={{ fontSize: 11, color: "#cbd5e1" }}>
              満腹度 {Math.round(data.hunger)}/100
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>メトロ信用・現行所得税</div>
            <div
              className="wb-mmo-num"
              style={{
                fontWeight: 800,
                color: jobProfile.creditScore >= 650 ? "#38bdf8" : "#f87171",
              }}
            >
              信用 {jobProfile.creditScore}/900
            </div>
            <div className="wb-mmo-num" style={{ fontSize: 11, color: "#94a3b8" }}>
              市民税率 {Math.round((data.govPolicies?.incomeTaxRate ?? 0.1) * 100)}%
            </div>
          </div>
        </div>
      )}

      {data?.jailed && (
        <div
          style={{
            padding: "8px 10px",
            marginBottom: 10,
            borderRadius: 8,
            background: "rgba(185,28,28,0.28)",
            border: "1px solid rgba(248,113,113,0.45)",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <WbIcon name="alert" size={14} color="#fca5a5" /> 収監中のため通常仕事は停止されています。
        </div>
      )}

      <div className="wb-mmo-tabs">
        <button
          type="button"
          className={`wb-mmo-tab ${tab === "field" ? "is-active" : ""}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          onClick={() => setTab("field")}
        >
          <WbIcon name="pin" size={12} color={tab === "field" ? "#38bdf8" : "#cbd5e1"} />{" "}
          現地実地ワーク
        </button>
        <button
          type="button"
          className={`wb-mmo-tab ${tab === "shift" ? "is-active" : ""}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          onClick={() => setTab("shift")}
        >
          <WbIcon name="briefcase" size={12} color={tab === "shift" ? "#38bdf8" : "#cbd5e1"} />{" "}
          業務シフト
        </button>
        <button
          type="button"
          className={`wb-mmo-tab ${tab === "careers" ? "is-active" : ""}`}
          onClick={() => setTab("careers")}
        >
          転職 ({data?.careers.length ?? 0})
        </button>
        <button
          type="button"
          className={`wb-mmo-tab ${tab === "certs" ? "is-active" : ""}`}
          onClick={() => setTab("certs")}
        >
          資格 ({jobProfile?.certifications.length ?? 0}/{data?.certifications.length ?? 5})
        </button>
        <button
          type="button"
          className={`wb-mmo-tab ${tab === "support" ? "is-active" : ""}`}
          onClick={() => setTab("support")}
        >
          保険・統計
        </button>
      </div>

      {msg && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(6, 182, 212, 0.14)",
            border: "1px solid rgba(34, 211, 238, 0.35)",
            color: "#cffafe",
            fontSize: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span>{msg}</span>
          {suggestedWp && onSetWaypoint && (
            <button
              type="button"
              className="wb-mmo-btn wb-mmo-btn-cyan"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              onClick={() => guideTo(suggestedWp)}
            >
              <WbIcon name="compass" size={12} color="#cffafe" /> 現場をマップ案内
            </button>
          )}
        </div>
      )}

      {tab === "field" && data && jobProfile && (
        <div style={{ display: "grid", gap: 10 }}>
          {/* 1. Physical Cafe Barista Operations */}
          <div className="wb-mmo-card" style={{ display: "grid", gap: 8 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              <div>
                <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 5 }}>
                  <WbIcon name="cafe" size={14} color="#fbbf24" />{" "}
                  現地カフェカウンター営業（実店舗限定）
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  ロビー内のグルメ店舗（{nearestCafe?.label ?? "西グルメ"} ・ 現在{" "}
                  {nearestCafe ? distLabel(data.actorPos, nearestCafe).text : "---"}）で直接接客！
                </div>
              </div>
              {nearestCafe && !atCafeNow && onSetWaypoint && (
                <button
                  type="button"
                  className="wb-mmo-btn wb-mmo-btn-cyan"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                  onClick={() => guideTo(nearestCafe)}
                >
                  <WbIcon name="compass" size={12} color="#cffafe" /> 最寄りカフェ案内
                </button>
              )}
            </div>

            {jobProfile.activeCafe ? (
              <div
                style={{
                  padding: 10,
                  borderRadius: 8,
                  background: "rgba(15,23,42,0.7)",
                  border: "1px solid rgba(251,191,36,0.35)",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong
                    style={{
                      color: "#fbbf24",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <WbIcon name="receipt" size={13} color="#fbbf24" />{" "}
                    {jobProfile.activeCafe.ticket.customerName}「
                    {jobProfile.activeCafe.ticket.drinkName}」
                  </strong>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>
                    連続提供 {jobProfile.activeCafe.servedCount}杯目
                  </span>
                </div>
                <div style={{ fontSize: 12 }}>
                  レシピ構成: <b>{jobProfile.activeCafe.ticket.ingredients.join(" + ")}</b>
                </div>
                <div style={{ fontSize: 11.5, color: "#38bdf8" }}>
                  トレイ選択中:{" "}
                  {cafeTray.length > 0 ? cafeTray.join(" → ") : "（下から素材を順番通りに選択）"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {data.cafeIngredients.map((ing) => (
                    <button
                      key={ing}
                      type="button"
                      disabled={busy || !atCafeNow}
                      className="wb-mmo-btn"
                      onClick={() => setCafeTray((prev) => [...prev.slice(-4), ing])}
                    >
                      + {ing}
                    </button>
                  ))}
                  <button type="button" className="wb-mmo-btn" onClick={() => setCafeTray([])}>
                    クリア
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busy || !atCafeNow || cafeTray.length === 0}
                  className="wb-mmo-btn wb-mmo-btn-primary"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                  }}
                  onClick={() =>
                    void callAction({ action: "serve_cafe_order", ingredients: cafeTray }).then(
                      (r) => {
                        if (!r) return;
                        setCafeTray([]);
                        setMsg(
                          r.exactMatch
                            ? `[提供完了] パーフェクト提供！ 手取 +¥${Number(r.net).toLocaleString()}（次のお客様が来店中）`
                            : `[提供完了] レシピ違いで減額… +¥${Number(r.net).toLocaleString()}`,
                        );
                      },
                    )
                  }
                >
                  <WbIcon name={atCafeNow ? "cafe" : "alert"} size={13} />
                  {atCafeNow ? "カウンターで提供して精算" : "カフェカウンター前で提供できます"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy || data.jailed || !atCafeNow}
                className="wb-mmo-btn wb-mmo-btn-amber"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                }}
                onClick={() => void callAction({ action: "start_cafe" })}
              >
                <WbIcon name="bell" size={13} color="#fef3c7" />
                {atCafeNow
                  ? "カフェカウンターに立って注文を受ける"
                  : "まずロビー内カフェへ移動してください"}
              </button>
            )}
          </div>

          {/* 2. Physical Coordinate Delivery Route */}
          <div className="wb-mmo-card" style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 5 }}>
              <WbIcon name="truck" size={14} color="#38bdf8" />{" "}
              メトロ実地配達ミッション（目的地へ移動・車両ボーナス対応）
            </div>
            {activeDelivery ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12 }}>
                  ルート: <b>{activeDelivery.title}</b>
                </div>
                <div style={{ fontSize: 11.5, color: "#cbd5e1" }}>
                  報酬見込 ¥{activeDelivery.rewardCoins.toLocaleString()}+ ・ 目的地まで{" "}
                  <b
                    style={{
                      color: deliveryDist && deliveryDist.dist <= 4.8 ? "#4ade80" : "#fbbf24",
                    }}
                  >
                    {deliveryDist?.text}
                  </b>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {onSetWaypoint && (
                    <button
                      type="button"
                      className="wb-mmo-btn wb-mmo-btn-cyan"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                      onClick={() =>
                        guideTo({
                          space: activeDelivery.targetSpace,
                          x: activeDelivery.targetX,
                          y: activeDelivery.targetY,
                          label: activeDelivery.targetLabel,
                        })
                      }
                    >
                      <WbIcon name="compass" size={12} color="#cffafe" /> 目的地コンパスを表示
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || data.jailed}
                    className="wb-mmo-btn wb-mmo-btn-primary"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                    onClick={() =>
                      void callAction({ action: "complete_delivery" }).then((r) => {
                        if (r) {
                          setMsg(
                            `[配達完了] +¥${Number(r.net).toLocaleString()}${
                              Number(r.vehicleBonusPct ?? 0) > 0
                                ? `（車両補正 +${r.vehicleBonusPct}%）`
                                : ""
                            }`,
                          );
                        }
                      })
                    }
                  >
                    <WbIcon name="check" size={12} color="#dcfce7" /> 荷物を現地へ納品する
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="wb-mmo-btn"
                    onClick={() => void callAction({ action: "cancel_active_mission" })}
                  >
                    破棄
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy || data.jailed}
                className="wb-mmo-btn wb-mmo-btn-cyan"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                }}
                onClick={() =>
                  void callAction({ action: "start_delivery" }).then((r) => {
                    const d = r?.delivery as ActiveDeliveryOrder | undefined;
                    if (d && onSetWaypoint) {
                      guideTo({
                        space: d.targetSpace,
                        x: d.targetX,
                        y: d.targetY,
                        label: d.targetLabel,
                      });
                    }
                  })
                }
              >
                <WbIcon name="package" size={13} color="#cffafe" /> 配送ルートを受注して出発する
              </button>
            )}
          </div>

          {/* 3. Police Beat Patrol */}
          {(jobProfile.currentCareer === "police" ||
            jobProfile.certifications.includes("security_officer")) && (
            <div className="wb-mmo-card" style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 5 }}>
                <WbIcon name="police" size={14} color="#38bdf8" />{" "}
                治安維持パトロール（指定地点を巡回）
              </div>
              {activePatrol ? (
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12 }}>
                    目標地点: <b>{activePatrol.spotLabel}</b> （現在 {patrolDist?.text}）
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {onSetWaypoint && (
                      <button
                        type="button"
                        className="wb-mmo-btn wb-mmo-btn-cyan"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                        onClick={() =>
                          guideTo({
                            space: activePatrol.space,
                            x: activePatrol.x,
                            y: activePatrol.y,
                            label: activePatrol.spotLabel,
                          })
                        }
                      >
                        <WbIcon name="compass" size={12} color="#cffafe" /> 巡回先案内
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      className="wb-mmo-btn wb-mmo-btn-primary"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                      onClick={() =>
                        void callAction({ action: "complete_patrol" }).then((r) => {
                          if (r) setMsg(`[巡回点検完了] +¥${Number(r.net).toLocaleString()}`);
                        })
                      }
                    >
                      <WbIcon name="check" size={12} color="#dcfce7" /> 異常なし・巡回報告
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className="wb-mmo-btn wb-mmo-btn-cyan"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                  }}
                  onClick={() =>
                    void callAction({ action: "start_patrol" }).then((r) => {
                      const p = r?.patrol as SpatialSpot | undefined;
                      if (p && onSetWaypoint) guideTo(p);
                    })
                  }
                >
                  <WbIcon name="police" size={13} color="#cffafe" /> パトロール地点を受令する
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "shift" && activeCareer && jobProfile && (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="wb-mmo-card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <WbIcon name={activeCareer.badge as WbIconName} size={15} color="#38bdf8" />
                  {activeCareer.name}
                </div>
                <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 2 }}>
                  {activeCareer.desc}
                </div>
                <div style={{ fontSize: 11, color: "#34d399", marginTop: 4 }}>
                  特典: {activeCareer.perkLabel}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#fbbf24" }}>
                  基本給 ¥{activeCareer.basePay.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  消費満腹 -{activeCareer.hungerCost}
                </div>
              </div>
            </div>

            {task ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 8,
                  background: "rgba(15, 23, 42, 0.75)",
                  border: "1px solid rgba(56, 189, 248, 0.35)",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: "#38bdf8",
                    marginBottom: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <WbIcon name="contract" size={14} color="#38bdf8" />{" "}
                  集中タスクチャレンジ（正答で報酬 1.4 倍！）
                </div>
                <div style={{ marginBottom: 8 }}>{task.prompt}</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {task.choices.map((choice, idx) => (
                    <button
                      key={choice}
                      type="button"
                      disabled={busy || data?.jailed}
                      className="wb-mmo-btn"
                      style={{ textAlign: "left" }}
                      onClick={() => void handleSubmitShift(idx)}
                    >
                      {idx + 1}. {choice}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  disabled={busy || data?.jailed}
                  className="wb-mmo-btn wb-mmo-btn-cyan"
                  onClick={() => void handleStartTask()}
                >
                  集中タスクを受注する（1.4倍報酬）
                </button>
                <button
                  type="button"
                  disabled={busy || data?.jailed}
                  className="wb-mmo-btn wb-mmo-btn-primary"
                  onClick={() => void handleSubmitShift()}
                >
                  通常シフトを実行する
                </button>
              </div>
            )}
          </div>

          {jobProfile.currentCareer === "journalist" && (
            <div className="wb-mmo-card">
              <div
                style={{
                  fontWeight: 700,
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <WbIcon name="news" size={14} color="#fbbf24" /> 記者特権：メトロ号外ニュース発行
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  maxLength={80}
                  placeholder="街のみんなへ速報ヘッドラインを発信..."
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(148,163,184,0.3)",
                    background: "rgba(0,0,0,0.35)",
                    color: "#fff",
                  }}
                />
                <button
                  type="button"
                  disabled={busy || !headline.trim()}
                  className="wb-mmo-btn wb-mmo-btn-amber"
                  onClick={() => {
                    void callAction({ action: "publish_news", headline }).then((r) => {
                      if (r) {
                        setHeadline("");
                        setMsg("メトロ全土のティッカーに号外ニュースを配信しました！");
                      }
                    });
                  }}
                >
                  配信
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "careers" && data && jobProfile && (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`wb-mmo-tab ${categoryFilter === cat ? "is-active" : ""}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {data.careers
              .filter((c) => categoryFilter === "すべて" || c.category === categoryFilter)
              .map((career) => {
                const isCurrent = career.id === jobProfile.currentCareer;
                const lockedLevel = jobProfile.level < career.minLevelReq;
                const lockedCert =
                  career.certRequired && !jobProfile.certifications.includes(career.certRequired);
                return (
                  <div
                    key={career.id}
                    className="wb-mmo-card"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div
                        style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 5 }}
                      >
                        <WbIcon name={career.badge as WbIconName} size={14} color="#38bdf8" />
                        {career.name}{" "}
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>({career.category})</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "#cbd5e1", marginTop: 2 }}>
                        {career.desc}
                      </div>
                      <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 3 }}>
                        基本給 ¥{career.basePay.toLocaleString()} / 必要Lv.{career.minLevelReq}
                        {career.certRequired ? ` / 要資格` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy || isCurrent || lockedLevel || Boolean(lockedCert)}
                      className={`wb-mmo-btn ${isCurrent ? "wb-mmo-btn-primary" : "wb-mmo-btn-cyan"}`}
                      onClick={() =>
                        void callAction({ action: "switch_career", careerId: career.id })
                      }
                    >
                      {isCurrent
                        ? "在職中"
                        : lockedLevel
                          ? `要Lv.${career.minLevelReq}`
                          : lockedCert
                            ? "要資格"
                            : "転職する"}
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {tab === "certs" && data && jobProfile && (
        <div style={{ display: "grid", gap: 8 }}>
          {data.certifications.map((cert) => {
            const owned = jobProfile.certifications.includes(cert.id);
            return (
              <div
                key={cert.id}
                className="wb-mmo-card"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 800 }}>{cert.name}</div>
                  <div style={{ fontSize: 11.5, color: "#cbd5e1" }}>{cert.desc}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    受験条件: Lv.{cert.minLevel} 以上 / 検定料 ¥{cert.cost.toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy || owned || jobProfile.level < cert.minLevel}
                  className={`wb-mmo-btn ${owned ? "wb-mmo-btn-primary" : "wb-mmo-btn-amber"}`}
                  onClick={() => void callAction({ action: "buy_certification", certId: cert.id })}
                >
                  {owned ? "取得済み" : `受験する ¥${cert.cost.toLocaleString()}`}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === "support" && data && jobProfile && (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="wb-mmo-card">
            <div
              style={{
                fontWeight: 800,
                marginBottom: 4,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <WbIcon name="card" size={14} color="#34d399" /> 雇用保険・セーフティネット給付
            </div>
            <div style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 8 }}>
              残高
              15,000円以下、または「雇用保険証」を所持している市民は10分ごとに支援給付金を受給できます（市政給付係数適用）。
            </div>
            <button
              type="button"
              disabled={busy}
              className="wb-mmo-btn wb-mmo-btn-primary"
              onClick={() => {
                void callAction({ action: "claim_unemployment" }).then((r) => {
                  if (r)
                    setMsg(
                      `雇用保険給付金 +¥${Number(r.amount ?? 0).toLocaleString()} を受給しました！`,
                    );
                });
              }}
            >
              雇用保険を申請する ({data.hasUnemploymentCard ? "保険証ボーナス1.5x" : "通常"})
            </button>
          </div>
          <div className="wb-mmo-card">
            <div
              style={{
                fontWeight: 800,
                marginBottom: 4,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <WbIcon name="bar_chart" size={14} color="#38bdf8" /> キャリア統計
            </div>
            <div style={{ fontSize: 12, color: "#cbd5e1", display: "grid", gap: 3 }}>
              <div>完了シフト総数: {jobProfile.shiftsCompleted} 回</div>
              <div>連続出勤日数: {jobProfile.streakDays} 日</div>
              <div>累計給与収入: ¥{jobProfile.totalEarned.toLocaleString()}</div>
              <div>累計納付所得税: ¥{jobProfile.totalTaxPaid.toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
