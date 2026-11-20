"use client";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { WbIcon } from "./WbIcon";
import type { PlayerProfile } from "@/lib/worldbox/player/profile";
import type { VehicleItemId, VehicleSpec } from "@/lib/worldbox/player/vehicles";
import type { DailyMissionDef, MmoNewsItem } from "@/lib/worldbox/social/mmo-events";
import type { MetroSnsPost } from "@/lib/worldbox/social/metro-sns";

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

interface MissionRow extends DailyMissionDef {
  progress: number;
  claimed: boolean;
}

interface CompanySummary {
  id: string;
  name: string;
  description: string;
  ticker: string | null;
  memberCount: number;
  salary: number;
  assets: number;
}

export type MetroAppKey =
  | "jobs_career"
  | "jobs_delivery"
  | "trade"
  | "realestate"
  | "governance"
  | "company";

export default function WorldBoxMetroPanel({
  onProfileChange,
  onStatusChange,
  onVehicleChange,
  onOpenPanel,
  onSetWaypoint,
  onClose,
}: {
  onProfileChange?: (profile: PlayerProfile) => void;
  onStatusChange?: () => void;
  onVehicleChange?: (v: VehicleItemId | null) => void;
  onOpenPanel: (panel: MetroAppKey) => void;
  onSetWaypoint?: (wp: { space: string; x: number; y: number; label: string }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"guide" | "sns" | "missions" | "garage" | "news">("guide");
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [news, setNews] = useState<MmoNewsItem[]>([]);
  const [posts, setPosts] = useState<MetroSnsPost[]>([]);
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [selfKey, setSelfKey] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postTag, setPostTag] = useState<MetroSnsPost["tag"]>("日常");

  const [ownedVehicles, setOwnedVehicles] = useState<VehicleItemId[]>([]);
  const [equippedVehicle, setEquippedVehicle] = useState<VehicleItemId | null>(null);
  const [vehicleSpecs, setVehicleSpecs] = useState<Record<string, VehicleSpec>>({});

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [mRes, sRes, vRes] = await Promise.all([
        fetch("/api/worldbox/mmo", { headers: { Accept: "application/json" } }),
        fetch("/api/worldbox/sns", { headers: { Accept: "application/json" } }),
        fetch("/api/worldbox/vehicles", { headers: { Accept: "application/json" } }),
      ]);
      if (mRes.ok) {
        const d = (await mRes.json()) as { missions?: MissionRow[]; news?: MmoNewsItem[] };
        setMissions(d.missions ?? []);
        setNews(d.news ?? []);
      }
      if (sRes.ok) {
        const s = (await sRes.json()) as {
          selfKey: string;
          posts: MetroSnsPost[];
          recruitingCompanies: CompanySummary[];
        };
        setSelfKey(s.selfKey ?? "");
        setPosts(s.posts ?? []);
        setCompanies(s.recruitingCompanies ?? []);
      }
      if (vRes.ok) {
        const v = (await vRes.json()) as {
          equippedVehicle: VehicleItemId | null;
          ownedVehicles: VehicleItemId[];
          specs: Record<string, VehicleSpec>;
        };
        setEquippedVehicle(v.equippedVehicle ?? null);
        setOwnedVehicles(v.ownedVehicles ?? []);
        setVehicleSpecs(v.specs ?? {});
      }
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const claim = async (missionId: string) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/worldbox/mmo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim_quest", missionId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        profile?: PlayerProfile;
        error?: string;
      };
      if (!res.ok) {
        setMsg(`受取失敗: ${json.error ?? res.status}`);
        return;
      }
      if (json.profile && onProfileChange) onProfileChange(json.profile);
      await reload();
      if (onStatusChange) onStatusChange();
      setMsg("デイリー任務報酬を受け取りました！");
    } finally {
      setBusy(false);
    }
  };

  const actSns = async (payload: Record<string, unknown>, okMsg?: string) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/worldbox/sns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; posts?: MetroSnsPost[] };
      if (!res.ok) {
        setMsg(`エラー: ${j.error ?? res.status}`);
        return;
      }
      if (j.posts) setPosts(j.posts);
      if (okMsg) setMsg(okMsg);
      if (onStatusChange) onStatusChange();
    } finally {
      setBusy(false);
    }
  };

  const equipVehicle = async (vehicleId: VehicleItemId | null) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/worldbox/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        equippedVehicle?: VehicleItemId | null;
      };
      if (!res.ok) {
        setMsg(`エラー: ${j.error ?? res.status}`);
        return;
      }
      const next = j.equippedVehicle ?? null;
      setEquippedVehicle(next);
      if (onVehicleChange) onVehicleChange(next);
      setMsg(
        next ? `${vehicleSpecs[next]?.name ?? next} に搭乗しました！` : "降車しました（徒歩移動）",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wb-panel" style={overlayStyle}>
      <div style={stickyHeaderStyle}>
        <div>
          <strong style={{ fontSize: 16, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <WbIcon name="phone" size={16} color="#38bdf8" /> TAKASUMI METRO OS
          </strong>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            都市アプリ・メトロSNS・乗り物ガレージ・法人求人・経済ニュース
          </div>
        </div>
        <button type="button" className="wb-mmo-btn" onClick={onClose}>
          閉じる
        </button>
      </div>

      <div className="wb-mmo-tabs">
        <button
          type="button"
          className={`wb-mmo-tab ${tab === "guide" ? "is-active" : ""}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          onClick={() => setTab("guide")}
        >
          <WbIcon name="hub" size={13} color={tab === "guide" ? "#38bdf8" : "#cbd5e1"} /> アプリハブ
        </button>
        <button
          type="button"
          className={`wb-mmo-tab ${tab === "sns" ? "is-active" : ""}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          onClick={() => setTab("sns")}
        >
          <WbIcon name="chat" size={13} color={tab === "sns" ? "#38bdf8" : "#cbd5e1"} /> SNS・求人 (
          {posts.length})
        </button>
        <button
          type="button"
          className={`wb-mmo-tab ${tab === "garage" ? "is-active" : ""}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          onClick={() => setTab("garage")}
        >
          <WbIcon name="car" size={13} color={tab === "garage" ? "#38bdf8" : "#cbd5e1"} /> ガレージ
          ({ownedVehicles.length})
        </button>
        <button
          type="button"
          className={`wb-mmo-tab ${tab === "missions" ? "is-active" : ""}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          onClick={() => setTab("missions")}
        >
          <WbIcon name="target" size={13} color={tab === "missions" ? "#38bdf8" : "#cbd5e1"} /> 任務
        </button>
        <button
          type="button"
          className={`wb-mmo-tab ${tab === "news" ? "is-active" : ""}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          onClick={() => setTab("news")}
        >
          <WbIcon name="news" size={13} color={tab === "news" ? "#38bdf8" : "#cbd5e1"} /> 速報
        </button>
      </div>

      {msg && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(16, 185, 129, 0.16)",
            border: "1px solid rgba(52, 211, 153, 0.4)",
            color: "#d1fae5",
            fontSize: 12,
          }}
        >
          {msg}
        </div>
      )}

      {tab === "guide" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 6, fontWeight: 700 }}>
              モバイル専用市民アプリ（遠隔手続き）
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
                gap: 8,
              }}
            >
              {(
                [
                  {
                    key: "jobs_career",
                    icon: "briefcase",
                    color: "#38bdf8",
                    title: "キャリア転職・実技シフト",
                    desc: "12職業の実技ワーク・資格取得",
                  },
                  {
                    key: "jobs_delivery",
                    icon: "truck",
                    color: "#22d3ee",
                    title: "メトロ配送ディスパッチ",
                    desc: "配達ルート受注・ナビ転送",
                  },
                  {
                    key: "trade",
                    icon: "handshake",
                    color: "#34d399",
                    title: "P2P直取引・市民契約",
                    desc: "個人間エスクロー取引・業務契約",
                  },
                  {
                    key: "realestate",
                    icon: "town",
                    color: "#4ade80",
                    title: "不動産・分譲マンション",
                    desc: "16×16土地権利書・自宅ルーム",
                  },
                  {
                    key: "governance",
                    icon: "gov",
                    color: "#fbbf24",
                    title: "市政庁・公開法廷",
                    desc: "市長選挙・税率政策・陪審裁判",
                  },
                  {
                    key: "company",
                    icon: "building",
                    color: "#818cf8",
                    title: "法人経営・社員採用",
                    desc: "会社設立・IPO上場・給与設定",
                  },
                ] as const
              ).map((card) => (
                <button
                  key={card.key}
                  type="button"
                  className="wb-mmo-card"
                  style={{ textAlign: "left", cursor: "pointer" }}
                  onClick={() => {
                    onClose();
                    onOpenPanel(card.key);
                  }}
                >
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <WbIcon name={card.icon} size={14} color={card.color} />
                    {card.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 3 }}>{card.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {onSetWaypoint && (
            <div>
              <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 6, fontWeight: 700 }}>
                現地施設ナビ案内（各窓口は現地で直接操作）
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
                  gap: 6,
                }}
              >
                {(
                  [
                    {
                      label: "南東 車両ディーラー",
                      space: "lobby",
                      x: 109,
                      y: 73,
                      icon: "car",
                      color: "#38bdf8",
                    },
                    {
                      label: "西グルメ カフェ実店舗",
                      space: "lobby",
                      x: 5,
                      y: 7,
                      icon: "cafe",
                      color: "#fb923c",
                    },
                    {
                      label: "北東 メトロ銀行・FX",
                      space: "lobby",
                      x: 40,
                      y: 10,
                      icon: "bank",
                      color: "#facc15",
                    },
                    {
                      label: "金融街 株式・未来予測",
                      space: "lobby",
                      x: 43,
                      y: 5,
                      icon: "chart",
                      color: "#34d399",
                    },
                    {
                      label: "蒸気鍛冶・機械設計ラボ",
                      space: "lobby",
                      x: 28,
                      y: 38,
                      icon: "anvil",
                      color: "#94a3b8",
                    },
                    {
                      label: "ギルド商店・板取引市場",
                      space: "lobby",
                      x: 14,
                      y: 34,
                      icon: "bag",
                      color: "#f472b6",
                    },
                  ] as const
                ).map((spot) => (
                  <button
                    key={spot.label}
                    type="button"
                    className="wb-mmo-card"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 6,
                      cursor: "pointer",
                      padding: "7px 10px",
                    }}
                    onClick={() => {
                      onSetWaypoint({ space: spot.space, x: spot.x, y: spot.y, label: spot.label });
                      onClose();
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      <WbIcon name={spot.icon} size={13} color={spot.color} />
                      {spot.label}
                    </span>
                    <WbIcon name="compass" size={12} color="#38bdf8" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "sns" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div className="wb-mmo-card" style={{ display: "grid", gap: 8 }}>
            <strong>メトロタイムラインに投稿 (いいね＆投げ銭可)</strong>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <select
                value={postTag}
                onChange={(e) => setPostTag(e.target.value as MetroSnsPost["tag"])}
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  background: "rgba(0,0,0,0.4)",
                  color: "#fff",
                  border: "1px solid rgba(148,163,184,0.3)",
                }}
              >
                <option value="日常">#日常</option>
                <option value="経済">#経済</option>
                <option value="求む">#求む</option>
                <option value="募集">#募集</option>
                <option value="事件">#事件</option>
              </select>
              <input
                value={postBody}
                onChange={(e) => setPostBody(e.target.value)}
                maxLength={140}
                placeholder="街のみんなへ近況・取引募集・情報共有..."
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 8,
                  background: "rgba(0,0,0,0.4)",
                  color: "#fff",
                  border: "1px solid rgba(148,163,184,0.3)",
                }}
              />
              <button
                type="button"
                disabled={busy || !postBody.trim()}
                className="wb-mmo-btn wb-mmo-btn-primary"
                onClick={() =>
                  void actSns(
                    { action: "post", tag: postTag, body: postBody },
                    "投稿しました！",
                  ).then(() => setPostBody(""))
                }
              >
                投稿
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {posts.map((p) => (
              <div key={p.id} className="wb-mmo-card" style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                  <span>
                    <b>{p.authorName}</b> <span style={{ color: "#38bdf8" }}>#{p.tag}</span>
                  </span>
                  <span style={{ opacity: 0.7 }}>チップ累計 ¥{p.tipsTotal.toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 13 }}>{p.body}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                  <button
                    type="button"
                    disabled={busy}
                    className="wb-mmo-btn"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                    onClick={() => void actSns({ action: "like", postId: p.id })}
                  >
                    <WbIcon name="heart" size={13} color="#fb7185" /> {p.likes.length}
                  </button>
                  {p.authorKey !== selfKey && (
                    <button
                      type="button"
                      disabled={busy}
                      className="wb-mmo-btn wb-mmo-btn-amber"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                      onClick={() =>
                        void actSns(
                          { action: "tip", postId: p.id, amount: 100 },
                          "¥100投げ銭しました！",
                        )
                      }
                    >
                      <WbIcon name="coins" size={13} color="#fde68a" /> ¥100投げ銭
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {companies.length > 0 && (
            <div className="wb-mmo-card" style={{ display: "grid", gap: 6 }}>
              <strong style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <WbIcon name="building" size={14} color="#818cf8" /> 法人メンバー募集中企業一覧
              </strong>
              {companies.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 12,
                    padding: "4px 0",
                    borderBottom: "1px solid rgba(148,163,184,0.14)",
                  }}
                >
                  <div>
                    <b>{c.name}</b> {c.ticker ? `[${c.ticker}]` : ""} ・ 社員{c.memberCount}名 ・
                    月給 ¥{c.salary.toLocaleString()}
                  </div>
                  <button
                    type="button"
                    className="wb-mmo-btn wb-mmo-btn-cyan"
                    onClick={() => {
                      onClose();
                      onOpenPanel("company");
                    }}
                  >
                    詳細
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "garage" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className="wb-mmo-stat-chip">
              <WbIcon name="car" size={12} color="#38bdf8" /> 最大速度 9.8
            </span>
            <span className="wb-mmo-stat-chip">
              <WbIcon name="road" size={12} color="#94a3b8" /> 舗装道路 +6%
            </span>
            <span className="wb-mmo-stat-chip">
              <WbIcon name="package" size={12} color="#fb923c" /> 配達報酬ボーナス
            </span>
            <span className="wb-mmo-stat-chip">
              <WbIcon name="siren" size={12} color="#f87171" /> サイレン懸賞+20%
            </span>
          </div>

          {ownedVehicles.length === 0 ? (
            <div
              className="wb-mmo-card"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span>
                所持車両なし — ロビー南東・各都市のディーラーで購入、または制作ラボで製作可能
              </span>
              {onSetWaypoint && (
                <button
                  type="button"
                  className="wb-mmo-btn wb-mmo-btn-cyan"
                  onClick={() => {
                    onSetWaypoint({
                      space: "lobby",
                      x: 109,
                      y: 73,
                      label: "南東モビリティ・車両ディーラー",
                    });
                    onClose();
                  }}
                >
                  ディーラーへ案内する
                </button>
              )}
            </div>
          ) : (
            ownedVehicles.map((vid) => {
              const sp = vehicleSpecs[vid];
              const isEq = equippedVehicle === vid;
              const speedPct = Math.min(100, Math.round(((sp?.speed ?? 7.5) / 10) * 100));
              return (
                <div
                  key={vid}
                  className="wb-mmo-card"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
                    >
                      <strong>{sp?.name ?? vid}</strong>
                      <span className="wb-mmo-stat-chip">配達 +{sp?.deliveryBonusPct ?? 0}%</span>
                      {sp?.hasSiren && (
                        <span
                          className="wb-mmo-stat-chip"
                          style={{ borderColor: "#f87171", color: "#fecaca" }}
                        >
                          <WbIcon name="siren" size={11} color="#f87171" /> 懸賞 +20%
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        height: 6,
                        borderRadius: 4,
                        background: "rgba(255,255,255,0.1)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${speedPct}%`,
                          height: "100%",
                          background: sp?.bodyColor ?? "#38bdf8",
                        }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    className={`wb-mmo-btn ${isEq ? "wb-mmo-btn-danger" : "wb-mmo-btn-primary"}`}
                    onClick={() => void equipVehicle(isEq ? null : vid)}
                  >
                    {isEq ? "降車する" : "乗車する"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "missions" && (
        <div style={{ display: "grid", gap: 8 }}>
          {missions.map((m) => {
            const done = m.progress >= m.target;
            return (
              <div
                key={m.id}
                className="wb-mmo-card"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 800 }}>
                    {m.title}{" "}
                    <span className="wb-mmo-num" style={{ fontSize: 11, color: "#38bdf8" }}>
                      ({Math.min(m.progress, m.target)}/{m.target})
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "#cbd5e1" }}>{m.desc}</div>
                  <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 2 }}>
                    報酬: ¥{m.rewardCoins.toLocaleString()}
                    {m.rewardItem ? ` + ボーナス素材×${m.rewardItem.count}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy || m.claimed || !done}
                  className={`wb-mmo-btn ${m.claimed ? "" : done ? "wb-mmo-btn-primary" : ""}`}
                  onClick={() => void claim(m.id)}
                >
                  {m.claimed ? "受取済" : done ? "受け取る" : "進行中"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === "news" && (
        <div style={{ display: "grid", gap: 6 }}>
          {news.map((n) => (
            <div key={n.id} className="wb-mmo-card" style={{ fontSize: 12 }}>
              <span
                style={{
                  fontWeight: 800,
                  marginRight: 8,
                  color:
                    n.kind === "prison" || n.kind === "crime"
                      ? "#f87171"
                      : n.kind === "machine"
                        ? "#22d3ee"
                        : "#fbbf24",
                }}
              >
                [{n.kind.toUpperCase()}]
              </span>
              {n.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
