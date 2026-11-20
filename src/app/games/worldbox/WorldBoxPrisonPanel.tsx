"use client";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { WbIcon } from "./WbIcon";
import type { PlayerProfile } from "@/lib/worldbox/player/profile";
import { itemById } from "@/lib/worldbox/economy/items";
import {
  isPrisonGuardSweepingVent,
  type CrimeDef,
  type NpcSuspect,
  type PrisonLaborDef,
  type PrisonRecord,
  type SpatialSpot,
} from "@/lib/worldbox/social/prison";

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
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  padding: "14px 0 10px",
  marginBottom: 10,
  background: "rgba(13, 19, 28, 0.98)",
  borderBottom: "1px solid rgba(148,163,184,0.22)",
};

interface PrisonApiGetResponse {
  self: PrisonRecord & { jailed: boolean; remainingMs: number; bailCost: number };
  inmates: {
    ownerKey: string;
    presenceId: string;
    name: string;
    inmateNumber: string;
    cellId: string;
    remainingMs: number;
    bailCost: number;
    charges: { label: string }[];
    careLogs: { fromName: string; message: string }[];
  }[];
  wanted: {
    ownerKey: string;
    presenceId: string;
    name: string;
    wantedLevel: number;
    bounty: number;
  }[];
  npcSuspects: NpcSuspect[];
  crimes: CrimeDef[];
  crimeSpots: Record<string, SpatialSpot[]>;
  prisonSpots: {
    work: SpatialSpot;
    desk: SpatialSpot;
    visit: SpatialSpot;
    escape: SpatialSpot;
  };
  actorPos: { space: string; x: number; y: number };
  laborTasks: PrisonLaborDef[];
  balance: number | null;
  isPolice: boolean;
  isLawyer: boolean;
}

function fmtSec(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}分${String(rem).padStart(2, "0")}秒`;
}

export type PrisonFocusMode = "full" | "crime" | "work" | "bail" | "visit" | "escape" | "police";

export default function WorldBoxPrisonPanel({
  focusMode = "full",
  currentSpace,
  profile,
  onForceMove,
  onProfileChange,
  onStatusChange,
  onSetWaypoint,
  onClose,
}: {
  focusMode?: PrisonFocusMode;
  currentSpace: string;
  profile: PlayerProfile | null;
  onForceMove?: (move: { space: string; x: number; y: number }) => void;
  onProfileChange?: (profile: PlayerProfile) => void;
  onStatusChange?: () => void;
  onSetWaypoint?: (wp: { space: string; x: number; y: number; label: string }) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<PrisonApiGetResponse | null>(null);
  const [tab, setTab] = useState<"status" | "crime" | "police" | "inmates">(
    focusMode === "crime"
      ? "crime"
      : focusMode === "police"
        ? "police"
        : focusMode === "visit"
          ? "inmates"
          : "status",
  );
  const [nowMs, setNowMs] = useState(Date.now());
  const [careTarget, setCareTarget] = useState("");
  const [careItemId, setCareItemId] = useState("bread");
  const [careMsg, setCareMsg] = useState("");
  const [msg, setMsg] = useState("");
  const [suggestedWp, setSuggestedWp] = useState<{
    space: string;
    x: number;
    y: number;
    label: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // Interactive challenge state (vault dial / ATM PIN / duct lockpick)
  const [activeChallenge, setActiveChallenge] = useState<{
    kind: string;
    seed: number;
    targetSequence: number[];
    hintLabel: string;
    revealUntil: number;
    entered: number[];
  } | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/worldbox/prison", { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const d = (await res.json()) as PrisonApiGetResponse;
      setData(d);
      if (d.inmates.length > 0 && !careTarget) {
        setCareTarget(d.inmates[0].ownerKey);
      }
    } catch {
      /* noop */
    }
  }, [careTarget]);

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => setNowMs(Date.now()), 120);
    return () => window.clearInterval(timer);
  }, [reload]);

  const guideTo = (wp: { space: string; x: number; y: number; label: string }) => {
    if (onSetWaypoint) {
      onSetWaypoint(wp);
      setMsg(`[案内] マップへコンパス案内をセットしました: ${wp.label}`);
    }
  };

  const postAction = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg("");
    setSuggestedWp(null);
    try {
      const res = await fetch("/api/worldbox/prison", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const errCode = String(json.error ?? "");
        const errMap: Record<string, string> = {
          cooldown: "行動のクールタイム中です",
          still_jailed: "刑期が残っているため出所できません",
          insufficient_funds: "所持金が不足しています",
          not_enough_items: "差し入れ対象のアイテムを所持していません",
          in_prison: "収監中は実行できません",
          target_offline: "対象プレイヤーがオフラインです",
          not_wanted: "対象は現在指名手配中ではありません",
          sentence_not_finished: "まだ釈放時刻に達していません",
          not_at_work_station:
            "懲役作業するには東棟ワークプレス工場（35, 9）まで移動してください！",
          not_at_bail_desk: "保釈金手続きは面会室の保釈デスク（25, 26）前で申請してください",
          not_at_visit_counter: "差し入れは面会カウンター（18, 26）で行えます",
          not_at_vent: "脱獄するには南西のメンテナンス換気口（4, 27）へ潜入してください！",
          not_at_crime_spot:
            "犯罪を実行するには対象の現場（銀行金庫・ATM・桟橋等）へ移動してください！",
          target_too_far: "容疑者が遠すぎます！現場近くへ追跡して確保してください",
        };
        if (json.spot) {
          setSuggestedWp(json.spot as SpatialSpot);
        } else if (Array.isArray(json.spots) && json.spots.length > 0) {
          setSuggestedWp(json.spots[0] as SpatialSpot);
        } else if (json.targetPos) {
          const tp = json.targetPos as { space: string; x: number; y: number; name?: string };
          setSuggestedWp({ space: tp.space, x: tp.x, y: tp.y, label: `容疑者 ${tp.name ?? ""}` });
        }
        setMsg(errMap[errCode] ?? `エラー: ${errCode || res.status}`);
        return null;
      }
      if (json.profile && onProfileChange) {
        onProfileChange(json.profile as PlayerProfile);
      }
      if (json.forceMove && onForceMove) {
        onForceMove(json.forceMove as { space: string; x: number; y: number });
      }
      await reload();
      if (onStatusChange) onStatusChange();
      return json;
    } finally {
      setBusy(false);
    }
  };

  const startSecurityChallenge = async (kind: string) => {
    const r = await postAction({ action: "get_challenge", kind });
    if (!r || !r.challenge) return;
    const ch = r.challenge as { targetSequence: number[]; hintLabel: string };
    setActiveChallenge({
      kind,
      seed: Number(r.seed),
      targetSequence: ch.targetSequence,
      hintLabel: ch.hintLabel,
      revealUntil: Date.now() + 2600,
      entered: [],
    });
  };

  // Press gauge oscillation 0..100 for realistic industrial labor quality
  const gaugePct = Math.round(((Math.sin(nowMs / 320) + 1) / 2) * 100);
  const timingQuality =
    gaugePct >= 38 && gaugePct <= 62 ? 1.35 : gaugePct >= 22 && gaugePct <= 78 ? 1.0 : 0.8;

  // Guard sweep 16s cycle indicator
  const guardPhase = (nowMs % 16_000) / 16_000;
  const guardSweeping = isPrisonGuardSweepingVent(nowMs);

  const self = data?.self;
  const remainingLiveMs = self?.jailed ? Math.max(0, self.releaseAt - nowMs) : 0;
  const inventoryFoodAndTools = profile
    ? Object.entries(profile.items)
        .filter(([, cnt]) => cnt > 0)
        .map(([id, cnt]) => ({ id, cnt, def: itemById(id) }))
        .filter((x) => x.def !== null)
    : [];

  const distTo = (sp?: SpatialSpot) => {
    if (!data || !sp) return null;
    if (data.actorPos.space !== sp.space) return null;
    return Math.hypot(data.actorPos.x - sp.x, data.actorPos.y - sp.y);
  };

  const workDist = distTo(data?.prisonSpots.work);
  const deskDist = distTo(data?.prisonSpots.desk);
  const ventDist = distTo(data?.prisonSpots.escape);

  return (
    <div className="wb-panel" style={overlayStyle}>
      <div style={stickyHeaderStyle}>
        <div>
          <strong style={{ fontSize: 16, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <WbIcon name="scale" size={16} color="#facc15" />{" "}
            {focusMode === "crime"
              ? "金庫潜入・現地強盗オペレーション"
              : focusMode === "work"
                ? "刑務所・懲役ワークプレス工場"
                : focusMode === "bail"
                  ? "刑務所・保釈および司法窓口"
                  : focusMode === "visit"
                    ? "刑務所・面会差し入れカウンター"
                    : focusMode === "escape"
                      ? "南西換気ダクト・ステルス脱獄端末"
                      : focusMode === "police"
                        ? "メトロ治安局・懸賞手配ディスパッチ"
                        : "メトロ治安局・タカスミ中央刑務所"}
          </strong>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            {focusMode === "crime"
              ? "実地セキュリティ突破・報酬確保・逃走リスク管理"
              : focusMode === "police"
                ? "指名手配犯・NPC容疑者の現地追跡と逮捕"
                : "現地強盗セキュリティ突破・看守潜入脱獄・懲役ワークプレス・警察追跡逮捕"}
          </div>
        </div>
        <button type="button" className="wb-mmo-btn" onClick={onClose}>
          閉じる
        </button>
      </div>

      {self && (
        <div
          className="wb-mmo-card"
          style={{
            marginBottom: 10,
            borderColor: self.jailed
              ? "rgba(248,113,113,0.55)"
              : self.wantedLevel > 0
                ? "rgba(251,191,36,0.5)"
                : "rgba(52,211,153,0.35)",
          }}
        >
          <div
            style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}
          >
            <div>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <WbIcon
                  name={self.jailed ? "lock" : self.wantedLevel > 0 ? "siren" : "shield"}
                  size={15}
                  color={self.jailed ? "#fca5a5" : self.wantedLevel > 0 ? "#facc15" : "#4ade80"}
                />
                {self.jailed
                  ? `収監中 — 囚人番号 ${self.inmateNumber}（房 ${self.cellId}）`
                  : self.wantedLevel > 0
                    ? `指名手配中 Lv${self.wantedLevel}（懸賞金 ¥${self.bounty.toLocaleString()}）`
                    : "無罪・クリーンな市民"}
              </div>
              <div className="wb-mmo-num" style={{ fontSize: 12, color: "#cbd5e1", marginTop: 2 }}>
                {self.jailed ? (
                  <>
                    残刑期: <b style={{ color: "#f87171" }}>{fmtSec(remainingLiveMs)}</b> / 保釈金 ¥
                    {self.bailCost.toLocaleString()}
                  </>
                ) : (
                  <>
                    所持残高{" "}
                    {data?.balance !== null ? `¥${data?.balance.toLocaleString()}` : "¥---"} /
                    累計逮捕 {self.arrestsCount}件
                  </>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {self.jailed && remainingLiveMs === 0 && (
                <button
                  type="button"
                  disabled={busy}
                  className="wb-mmo-btn wb-mmo-btn-primary"
                  onClick={() => void postAction({ action: "claim_release" })}
                >
                  出所手続き
                </button>
              )}
              {!self.jailed && currentSpace !== "prison" && focusMode === "full" && (
                <button
                  type="button"
                  disabled={busy}
                  className="wb-mmo-btn"
                  onClick={() => void postAction({ action: "visit_prison" })}
                >
                  刑務所を視察・面会する
                </button>
              )}
              {!self.jailed && currentSpace === "prison" && (
                <button
                  type="button"
                  disabled={busy}
                  className="wb-mmo-btn wb-mmo-btn-cyan"
                  onClick={() => void postAction({ action: "leave_prison" })}
                >
                  刑務所からロビーへ出る
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {focusMode === "full" && (
        <div className="wb-mmo-tabs">
          <button
            type="button"
            className={`wb-mmo-tab ${tab === "status" ? "is-active" : ""}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            onClick={() => setTab("status")}
          >
            <WbIcon name={self?.jailed ? "chain" : "scale"} size={12} color="#cbd5e1" />
            {self?.jailed ? "獄内生活・脱獄" : "収監状況"}
          </button>
          <button
            type="button"
            className={`wb-mmo-tab is-warn ${tab === "crime" ? "is-active" : ""}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            onClick={() => setTab("crime")}
          >
            <WbIcon name="bomb" size={12} color="#fca5a5" /> 現地強盗・犯行
          </button>
          <button
            type="button"
            className={`wb-mmo-tab ${tab === "police" ? "is-active" : ""}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            onClick={() => setTab("police")}
          >
            <WbIcon name="police" size={12} color="#38bdf8" /> 治安局 (
            {(data?.wanted.length ?? 0) + (data?.npcSuspects.length ?? 0)})
          </button>
          <button
            type="button"
            className={`wb-mmo-tab ${tab === "inmates" ? "is-active" : ""}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            onClick={() => setTab("inmates")}
          >
            <WbIcon name="handshake" size={12} color="#cbd5e1" /> 面会 ({data?.inmates.length ?? 0})
          </button>
        </div>
      )}

      {msg && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(245, 158, 11, 0.15)",
            border: "1px solid rgba(251, 191, 36, 0.4)",
            color: "#fef3c7",
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

      {/* Interactive Security / Lockpick Minigame Modal Strip */}
      {activeChallenge && (
        <div
          className="wb-mmo-card"
          style={{
            marginBottom: 10,
            borderColor: "#38bdf8",
            background: "rgba(15,23,42,0.92)",
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong
              style={{
                color: "#38bdf8",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <WbIcon name="keyhole" size={14} color="#38bdf8" /> {activeChallenge.hintLabel}
            </strong>
            <button type="button" className="wb-mmo-btn" onClick={() => setActiveChallenge(null)}>
              中止
            </button>
          </div>
          {nowMs < activeChallenge.revealUntil ? (
            <div style={{ fontSize: 16, fontWeight: 900, color: "#fbbf24" }}>
              暗記せよ！解除ピン順: [ {activeChallenge.targetSequence.join(" - ")} ]
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#cbd5e1" }}>
              入力済み: [ {activeChallenge.entered.join(" - ") || "未入力"} ] （全
              {activeChallenge.targetSequence.length}桁）
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[1, 2, 3, 4].map((num) => (
              <button
                key={num}
                type="button"
                className="wb-mmo-btn wb-mmo-btn-cyan"
                style={{ minWidth: 44 }}
                onClick={() =>
                  setActiveChallenge((c) =>
                    c && c.entered.length < c.targetSequence.length
                      ? { ...c, entered: [...c.entered, num] }
                      : c,
                  )
                }
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              className="wb-mmo-btn"
              onClick={() => setActiveChallenge((c) => (c ? { ...c, entered: [] } : c))}
            >
              消去
            </button>
            {activeChallenge.entered.length === activeChallenge.targetSequence.length && (
              <button
                type="button"
                disabled={busy}
                className="wb-mmo-btn wb-mmo-btn-danger"
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                onClick={() => {
                  const ch = activeChallenge;
                  setActiveChallenge(null);
                  if (ch.kind === "jailbreak") {
                    void postAction({
                      action: "jailbreak",
                      challengeSeed: ch.seed,
                      pinSequence: ch.entered,
                    }).then((r) => {
                      if (!r) return;
                      setMsg(
                        r.escaped
                          ? "[脱獄成功] ピッキング＆潜入成功！郊外へ脱獄逃亡しました！"
                          : r.caughtByGuard
                            ? `[発覚] 看守の巡回ライトに発見され独房へ戻されました（+${r.penaltySec}秒）`
                            : `ピンの解除に失敗し見回りに捕まりました（+${r.penaltySec}秒）`,
                      );
                    });
                  } else {
                    void postAction({
                      action: "commit_crime",
                      crimeId: ch.kind,
                      challengeSeed: ch.seed,
                      pinSequence: ch.entered,
                    }).then((r) => {
                      if (!r) return;
                      setMsg(
                        r.success
                          ? `[突破成功] 金庫・認証突破！ +¥${Number(r.reward ?? 0).toLocaleString()} 奪取！`
                          : "[警報] 警報作動！現行犯で刑務所へ護送されました！",
                      );
                    });
                  }
                }}
              >
                <WbIcon
                  name={activeChallenge.kind === "jailbreak" ? "vent" : "bolt"}
                  size={13}
                  color="#fecaca"
                />
                {activeChallenge.kind === "jailbreak" ? "ピン解除して脱獄！" : "認証突破・実行！"}
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "status" && data && self && (
        <div style={{ display: "grid", gap: 10 }}>
          {self.jailed ? (
            <>
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
                      <WbIcon name="anvil" size={14} color="#4ade80" /> 東棟懲役ワークプレス工場
                      (35, 9)
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      工場のプレス機前でのみ労役可能（現在:{" "}
                      {workDist !== null ? `${workDist.toFixed(1)}m` : "屋外"}）
                    </div>
                  </div>
                  {onSetWaypoint && (workDist === null || workDist > 3.2) && (
                    <button
                      type="button"
                      className="wb-mmo-btn wb-mmo-btn-cyan"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                      onClick={() => guideTo(data.prisonSpots.work)}
                    >
                      <WbIcon name="compass" size={12} color="#cffafe" /> 工場へ案内
                    </button>
                  )}
                </div>

                {/* Live timing gauge */}
                <div
                  style={{ padding: "6px 8px", borderRadius: 8, background: "rgba(15,23,42,0.7)" }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "#cbd5e1",
                      marginBottom: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <WbIcon name="bolt" size={12} color="#facc15" />{" "}
                    プレス打刻タイミングゲージ（緑帯で押すと報酬・減刑 1.35x）
                  </div>
                  <div
                    style={{
                      position: "relative",
                      height: 12,
                      borderRadius: 6,
                      background: "#1e293b",
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
                        background: "rgba(34,197,94,0.45)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: `${gaugePct}%`,
                        width: 6,
                        top: 0,
                        bottom: 0,
                        background: "#facc15",
                        transform: "translateX(-50%)",
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  {data.laborTasks.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 8px",
                        borderRadius: 6,
                        background: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                          {t.desc}（減刑 -{t.reduceSec}秒 / +¥{t.wage}）
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        className="wb-mmo-btn wb-mmo-btn-primary"
                        onClick={() => {
                          void postAction({
                            action: "prison_labor",
                            taskId: t.id,
                            timingQuality,
                          }).then((r) => {
                            if (r) {
                              setMsg(
                                r.released
                                  ? "刑期を全うして出所しました！"
                                  : `作業完了 (${timingQuality > 1 ? "PERFECT 1.35x" : "通常"})！ +¥${Number(r.wage ?? 0)} / 刑期 -${Number(r.reducedSec ?? 0)}秒`,
                              );
                            }
                          });
                        }}
                      >
                        プレス打刻・作業
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                  gap: 8,
                }}
              >
                <div className="wb-mmo-card" style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 5 }}>
                    <WbIcon name="card" size={14} color="#fbbf24" /> 保釈デスク手続き (25, 26)
                  </div>
                  <div style={{ fontSize: 11.5, color: "#cbd5e1" }}>
                    面会室の申請デスク前で保釈金を納付できます（現在{" "}
                    {deskDist !== null ? `${deskDist.toFixed(1)}m` : "---"}）。
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {onSetWaypoint && (
                      <button
                        type="button"
                        className="wb-mmo-btn"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                        onClick={() => guideTo(data.prisonSpots.desk)}
                      >
                        <WbIcon name="compass" size={12} color="#38bdf8" /> デスク案内
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      className="wb-mmo-btn wb-mmo-btn-amber"
                      onClick={() => {
                        void postAction({ action: "pay_bail" }).then((r) => {
                          if (r) setMsg("保釈金を受理しました！自由の身へ釈放されます。");
                        });
                      }}
                    >
                      保釈金を払う (¥{self.bailCost.toLocaleString()})
                    </button>
                  </div>
                </div>

                <div className="wb-mmo-card" style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 5 }}>
                    <WbIcon name="vent" size={14} color="#f87171" /> 南西ダクトステルス脱獄 (4, 27)
                  </div>
                  <div
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      background: guardSweeping ? "rgba(220,38,38,0.28)" : "rgba(22,163,74,0.28)",
                      color: guardSweeping ? "#fca5a5" : "#86efac",
                    }}
                  >
                    <WbIcon name={guardSweeping ? "siren" : "check"} size={12} />
                    {guardSweeping
                      ? `看守が換気口付近を巡回中！（あと ${Math.ceil((0.3 - guardPhase) * 16)}秒待機）`
                      : `看守は別区画へ移動（潜入チャンスあと ${Math.ceil((1 - guardPhase) * 16)}秒）`}
                  </div>
                  <div style={{ fontSize: 11, color: "#cbd5e1" }}>
                    換気口まで {ventDist !== null ? `${ventDist.toFixed(1)}m` : "---"} ・
                    ピッキング錠解除＋監視回避で高確率脱獄！
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {onSetWaypoint && (
                      <button
                        type="button"
                        className="wb-mmo-btn"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                        onClick={() => guideTo(data.prisonSpots.escape)}
                      >
                        <WbIcon name="compass" size={12} color="#38bdf8" /> 換気口ルート案内
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      className="wb-mmo-btn wb-mmo-btn-danger"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                      onClick={() => void startSecurityChallenge("jailbreak")}
                    >
                      <WbIcon name="unlock" size={12} color="#fecaca" /> ダクト解錠に挑戦
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="wb-mmo-step-grid">
              <button
                type="button"
                className="wb-mmo-card"
                style={{ textAlign: "left", cursor: "pointer" }}
                onClick={() => setTab("crime")}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: "#fca5a5",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <WbIcon name="bomb" size={13} color="#fca5a5" /> STEP 1 現地犯行
                </div>
                <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <span className="wb-mmo-stat-chip">
                    <WbIcon name="bank" size={11} color="#facc15" /> 金庫/ATM
                  </span>
                  <span className="wb-mmo-stat-chip">
                    <WbIcon name="keyhole" size={11} color="#38bdf8" /> PIN解除
                  </span>
                </div>
              </button>
              <button
                type="button"
                className="wb-mmo-card"
                style={{ textAlign: "left", cursor: "pointer" }}
                onClick={() => setTab("police")}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: "#38bdf8",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <WbIcon name="police" size={13} color="#38bdf8" /> STEP 2 追跡・逮捕
                </div>
                <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <span className="wb-mmo-stat-chip">距離 &lt;= 6.5m</span>
                  <span className="wb-mmo-stat-chip">
                    <WbIcon name="coins" size={11} color="#fbbf24" /> 賞金確保
                  </span>
                </div>
              </button>
              <button
                type="button"
                className="wb-mmo-card"
                style={{ textAlign: "left", cursor: "pointer" }}
                onClick={() => setTab("inmates")}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: "#4ade80",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <WbIcon name="anvil" size={13} color="#4ade80" /> STEP 3 懲役・脱獄
                </div>
                <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <span className="wb-mmo-stat-chip">
                    <WbIcon name="factory" size={11} color="#4ade80" /> (35,9)工場
                  </span>
                  <span className="wb-mmo-stat-chip">
                    <WbIcon name="vent" size={11} color="#f87171" /> (4,27)ダクト
                  </span>
                </div>
              </button>
            </div>
          )}

          {self.careLogs.length > 0 && (
            <div className="wb-mmo-card">
              <div
                style={{
                  fontWeight: 700,
                  marginBottom: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <WbIcon name="package" size={13} color="#38bdf8" /> 差し入れ受取履歴
              </div>
              {self.careLogs.map((c, idx) => (
                <div key={idx} style={{ fontSize: 11.5, color: "#cbd5e1" }}>
                  ・{c.fromName} より: {c.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "crime" && data && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className="wb-mmo-stat-chip" style={{ borderColor: "#f87171", color: "#fecaca" }}>
              <WbIcon name="pin" size={11} color="#f87171" /> 現場接近必須 (&lt;= 4.5m)
            </span>
            <span className="wb-mmo-stat-chip" style={{ borderColor: "#fbbf24", color: "#fef08a" }}>
              <WbIcon name="keyhole" size={11} color="#fbbf24" /> 金庫/ATM: 認証シーケンス挑戦
            </span>
          </div>
          {data.crimes.map((crime) => {
            const spots = data.crimeSpots?.[crime.id] ?? [];
            const closest = spots[0];
            const dist = closest ? distLabelLocal(data.actorPos, closest) : null;
            const requiresPin = crime.id === "vault_heist" || crime.id === "atm_hack";
            return (
              <div
                key={crime.id}
                className="wb-mmo-card"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, color: "#fecaca" }}>{crime.name}</div>
                  <div style={{ fontSize: 11.5, color: "#cbd5e1" }}>{crime.desc}</div>
                  <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 2 }}>
                    現場例: {closest?.label ?? "ロビー指定地点"} {dist ? `(${dist})` : ""} / 報酬 ¥
                    {crime.minReward.toLocaleString()}〜¥{crime.maxReward.toLocaleString()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {closest && onSetWaypoint && (
                    <button
                      type="button"
                      className="wb-mmo-btn wb-mmo-btn-cyan"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                      onClick={() => guideTo(closest)}
                    >
                      <WbIcon name="compass" size={12} color="#cffafe" /> 現場案内
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || Boolean(self?.jailed)}
                    className="wb-mmo-btn wb-mmo-btn-danger"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                    onClick={() => {
                      if (requiresPin) {
                        void startSecurityChallenge(crime.id);
                        return;
                      }
                      void postAction({ action: "commit_crime", crimeId: crime.id }).then((r) => {
                        if (!r) return;
                        setMsg(
                          r.success
                            ? `犯行成功(${String(r.spot ?? "")})！ +¥${Number(r.reward ?? 0).toLocaleString()} 奪取！`
                            : "現場で取り押さえられ刑務所へ送致されました！",
                        );
                      });
                    }}
                  >
                    {requiresPin ? (
                      <>
                        <WbIcon name="keyhole" size={12} color="#fecaca" /> ダイヤル解除
                      </>
                    ) : (
                      "決行"
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "police" && data && (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="wb-mmo-card">
            <div
              style={{
                fontWeight: 800,
                marginBottom: 6,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <WbIcon name="siren" size={14} color="#f87171" /> 指名手配プレイヤー{" "}
              {data.isPolice ? "（警察職ボーナス適用中）" : ""}
            </div>
            {data.wanted.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                現在指名手配中のオンラインプレイヤーはいません。
              </div>
            ) : (
              data.wanted.map((w) => (
                <div
                  key={w.ownerKey}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 0",
                    borderBottom: "1px solid rgba(148,163,184,0.12)",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <strong>{w.name}</strong>
                      <span style={{ display: "inline-flex", gap: 1, color: "#f87171" }}>
                        {Array.from({ length: Math.min(5, w.wantedLevel) }).map((_, idx) => (
                          <WbIcon key={idx} name="star" size={11} color="#f87171" />
                        ))}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#fbbf24" }}>
                      懸賞金 ¥{w.bounty.toLocaleString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || Boolean(self?.jailed)}
                    className="wb-mmo-btn wb-mmo-btn-cyan"
                    onClick={() => {
                      void postAction({
                        action: "arrest_player",
                        targetPresenceId: w.presenceId,
                      }).then((r) => {
                        if (r) {
                          setMsg(
                            `${String(r.arrestedName ?? "手配犯")}を逮捕！懸賞金 +¥${Number(r.reward ?? 0).toLocaleString()}`,
                          );
                        }
                      });
                    }}
                  >
                    現場で確保する
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="wb-mmo-card">
            <div
              style={{
                fontWeight: 800,
                marginBottom: 6,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <WbIcon name="scroll" size={14} color="#38bdf8" />{" "}
              メトロ警察・時限手配容疑者（NPC追捕依頼）
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {data.npcSuspects.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                      {s.name}
                      <span style={{ display: "inline-flex", gap: 1, color: "#f87171" }}>
                        {Array.from({ length: Math.min(5, s.wantedLevel) }).map((_, idx) => (
                          <WbIcon key={idx} name="star" size={11} color="#f87171" />
                        ))}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      {s.crime} / 目撃地点: {s.district}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || Boolean(self?.jailed)}
                    className="wb-mmo-btn wb-mmo-btn-primary"
                    onClick={() => {
                      void postAction({ action: "arrest_npc", suspectId: s.id }).then((r) => {
                        if (r)
                          setMsg(
                            `${s.name} を確保！懸賞金 +¥${Number(r.reward ?? 0).toLocaleString()}`,
                          );
                      });
                    }}
                  >
                    追跡逮捕 (¥{s.bounty.toLocaleString()})
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "inmates" && data && (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="wb-mmo-card">
            <div
              style={{
                fontWeight: 800,
                marginBottom: 6,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <WbIcon name="gov" size={14} color="#cbd5e1" /> 現在の収監者一覧 (
              {data.inmates.length}名)
            </div>
            {data.inmates.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                現在収監されている囚人はいません。
              </div>
            ) : (
              data.inmates.map((i) => (
                <div
                  key={i.ownerKey}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 0",
                    borderBottom: "1px solid rgba(148,163,184,0.12)",
                  }}
                >
                  <div>
                    <strong>{i.name}</strong>{" "}
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>
                      ({i.inmateNumber} / {i.cellId})
                    </span>
                    <div style={{ fontSize: 11, color: "#cbd5e1" }}>
                      残り {fmtSec(i.remainingMs)} / 保釈金 ¥{i.bailCost.toLocaleString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    className="wb-mmo-btn wb-mmo-btn-amber"
                    onClick={() => {
                      void postAction({ action: "pay_bail", targetOwnerKey: i.ownerKey }).then(
                        (r) => {
                          if (r) setMsg(`${i.name} の保釈金を肩代わりし釈放しました！`);
                        },
                      );
                    }}
                  >
                    保釈金を肩代わり
                  </button>
                </div>
              ))
            )}
          </div>

          {data.inmates.length > 0 && inventoryFoodAndTools.length > 0 && (
            <div className="wb-mmo-card">
              <div
                style={{
                  fontWeight: 800,
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <WbIcon name="gift" size={14} color="#38bdf8" /> 面会・アイテム差し入れ（密輸も可）
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <select
                  value={careTarget}
                  onChange={(e) => setCareTarget(e.target.value)}
                  style={{
                    padding: 6,
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.4)",
                    color: "#fff",
                    border: "1px solid rgba(148,163,184,0.3)",
                  }}
                >
                  {data.inmates.map((i) => (
                    <option key={i.ownerKey} value={i.ownerKey}>
                      {i.name} ({i.inmateNumber})
                    </option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 6 }}>
                  <select
                    value={careItemId}
                    onChange={(e) => setCareItemId(e.target.value)}
                    style={{
                      flex: 1,
                      padding: 6,
                      borderRadius: 8,
                      background: "rgba(0,0,0,0.4)",
                      color: "#fff",
                      border: "1px solid rgba(148,163,184,0.3)",
                    }}
                  >
                    {inventoryFoodAndTools.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.def?.name} (所持: {x.cnt})
                      </option>
                    ))}
                  </select>
                  <input
                    value={careMsg}
                    onChange={(e) => setCareMsg(e.target.value)}
                    maxLength={40}
                    placeholder="メッセージ"
                    style={{
                      flex: 1,
                      padding: 6,
                      borderRadius: 8,
                      background: "rgba(0,0,0,0.4)",
                      color: "#fff",
                      border: "1px solid rgba(148,163,184,0.3)",
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy || !careTarget}
                    className="wb-mmo-btn wb-mmo-btn-cyan"
                    onClick={() => {
                      void postAction({
                        action: "care_package",
                        targetOwnerKey: careTarget,
                        itemId: careItemId,
                        message: careMsg,
                      }).then((r) => {
                        if (r) {
                          setCareMsg("");
                          setMsg("差し入れを届けました！");
                        }
                      });
                    }}
                  >
                    差し入れる
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function distLabelLocal(pos: { space: string; x: number; y: number }, target: SpatialSpot): string {
  if (pos.space !== target.space) return "ロビー";
  return `${Math.hypot(pos.x - target.x, pos.y - target.y).toFixed(1)}m`;
}
