"use client";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { WbIcon } from "./WbIcon";
import type { PlayerProfile } from "@/lib/worldbox/player/profile";
import {
  VEHICLE_IDS,
  VEHICLE_SPECS,
  type VehicleItemId,
  type VehicleSpec,
} from "@/lib/worldbox/player/vehicles";

const overlayStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(680px, calc(100vw - 24px))",
  maxHeight: "min(88svh, 720px)",
  overflowY: "auto",
  borderRadius: 14,
  padding: "0 16px 16px",
  background: "rgba(13, 19, 28, 0.97)",
  border: "1px solid rgba(56, 189, 248, 0.35)",
  boxShadow: "0 20px 56px rgba(0,0,0,0.7)",
  color: "#f8fafc",
  zIndex: 28,
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
  marginBottom: 12,
  background: "rgba(13, 19, 28, 0.98)",
  borderBottom: "1px solid rgba(148,163,184,0.22)",
};

const ERROR_TEXT: Record<string, string> = {
  insufficient_funds: "残高が不足しています。",
  already_owned: "すでに所有している車両です。",
  not_at_dealer: "車両の購入はディーラー店舗またはロビー南東ディーラー前で操作できます。",
  not_owned: "未所有の車両です。",
  unauthorized: "ログインが必要です。",
  unknown_vehicle: "不明な車両モデルです。",
};

function VehicleSvgPreview({ spec }: { spec: VehicleSpec }) {
  if (spec.id === "electric_scooter") {
    return (
      <svg width="72" height="40" viewBox="0 0 72 40" aria-hidden="true">
        <rect x="14" y="27" width="38" height="4" rx="2" fill={spec.bodyColor} />
        <line
          x1="48"
          y1="27"
          x2="43"
          y2="8"
          stroke={spec.trimColor}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <line
          x1="38"
          y1="8"
          x2="48"
          y2="8"
          stroke={spec.bodyColor}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="18" cy="33" r="5" fill="#0f172a" stroke={spec.trimColor} strokeWidth="2" />
        <circle cx="52" cy="33" r="5" fill="#0f172a" stroke={spec.trimColor} strokeWidth="2" />
      </svg>
    );
  }
  if (spec.id === "delivery_moped") {
    return (
      <svg width="72" height="40" viewBox="0 0 72 40" aria-hidden="true">
        <rect
          x="8"
          y="13"
          width="16"
          height="12"
          rx="2"
          fill="#f8fafc"
          stroke={spec.bodyColor}
          strokeWidth="2"
        />
        <path d="M12 28 Q26 20 40 20 L52 16 L58 28 Z" fill={spec.bodyColor} />
        <line
          x1="47"
          y1="10"
          x2="54"
          y2="27"
          stroke={spec.trimColor}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <circle cx="19" cy="32" r="5.5" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
        <circle cx="54" cy="32" r="5.5" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2" />
      </svg>
    );
  }
  if (spec.id === "cargo_truck") {
    return (
      <svg width="72" height="40" viewBox="0 0 72 40" aria-hidden="true">
        <rect x="6" y="9" width="38" height="20" rx="2" fill={spec.bodyColor} />
        <path d="M45 14 H58 L65 21 V29 H45 Z" fill={spec.trimColor} />
        <rect x="48" y="16" width="11" height="6" rx="1" fill="#bae6fd" />
        <circle cx="17" cy="32" r="5.5" fill="#0f172a" stroke="#e2e8f0" strokeWidth="2" />
        <circle cx="55" cy="32" r="5.5" fill="#0f172a" stroke="#e2e8f0" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg width="72" height="40" viewBox="0 0 72 40" aria-hidden="true">
      <rect x="29" y="8" width="12" height="4" rx="1.5" fill="#ef4444" />
      <rect x="35" y="8" width="6" height="4" rx="1" fill="#38bdf8" />
      <path d="M8 22 L17 13 H47 L59 20 L65 23 V29 H8 Z" fill={spec.bodyColor} />
      <rect x="24" y="20" width="22" height="9" fill={spec.trimColor} />
      <rect x="21" y="15" width="12" height="5" rx="1" fill="#bae6fd" />
      <rect x="35" y="15" width="12" height="5" rx="1" fill="#bae6fd" />
      <circle cx="19" cy="32" r="5.5" fill="#0f172a" stroke="#e2e8f0" strokeWidth="2" />
      <circle cx="53" cy="32" r="5.5" fill="#0f172a" stroke="#e2e8f0" strokeWidth="2" />
    </svg>
  );
}

export default function WorldBoxDealerPanel({
  title,
  fallbackCoins,
  onProfileChange,
  onVehicleChange,
  onStatusChange,
  onClose,
}: {
  title?: string;
  fallbackCoins?: number;
  onProfileChange?: (profile: PlayerProfile) => void;
  onVehicleChange?: (v: VehicleItemId | null) => void;
  onStatusChange?: () => void;
  onClose: () => void;
}) {
  const [ownedVehicles, setOwnedVehicles] = useState<VehicleItemId[]>([]);
  const [equippedVehicle, setEquippedVehicle] = useState<VehicleItemId | null>(null);
  const [balance, setBalance] = useState<number | null>(fallbackCoins ?? null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/worldbox/vehicles", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      const d = await res.json();
      setOwnedVehicles(Array.isArray(d.ownedVehicles) ? d.ownedVehicles : []);
      setEquippedVehicle(d.equippedVehicle ?? null);
      if (typeof d.balance === "number") setBalance(d.balance);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleBuy = async (spec: VehicleSpec) => {
    if (busyId) return;
    setBusyId(spec.id);
    setMsg("");
    try {
      const res = await fetch("/api/worldbox/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "buy", vehicleId: spec.id }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg(ERROR_TEXT[d.error] ?? `購入エラー (${d.error ?? res.status})`);
        return;
      }
      if (Array.isArray(d.ownedVehicles)) setOwnedVehicles(d.ownedVehicles);
      setEquippedVehicle(d.equippedVehicle ?? spec.id);
      if (typeof d.balance === "number") setBalance(d.balance);
      if (d.profile) onProfileChange?.(d.profile);
      onVehicleChange?.(d.equippedVehicle ?? spec.id);
      onStatusChange?.();
      setMsg(`${spec.name} を購入してガレージに登録・乗車しました。`);
    } catch {
      setMsg("通信エラーにより購入できませんでした。");
    } finally {
      setBusyId(null);
    }
  };

  const handleEquip = async (vehicleId: VehicleItemId | null) => {
    if (busyId) return;
    setBusyId(vehicleId ?? "unequip");
    setMsg("");
    try {
      const res = await fetch("/api/worldbox/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg(ERROR_TEXT[d.error] ?? `切替エラー (${d.error ?? res.status})`);
        return;
      }
      setEquippedVehicle(d.equippedVehicle ?? null);
      onVehicleChange?.(d.equippedVehicle ?? null);
      setMsg(d.equippedVehicle ? "車両に乗り込みました。" : "車両をガレージに収納しました。");
    } catch {
      setMsg("切替に失敗しました。");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={overlayStyle} role="dialog" aria-label="乗り物ディーラー">
      <div style={stickyHeaderStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <WbIcon name="car" size={18} color="#38bdf8" />
          <div>
            <strong style={{ fontSize: 15 }}>{title ?? "モビリティ・乗り物ディーラー"}</strong>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              新車購入・配達ボーナス比較・即時乗車
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="wb-mmo-stat-chip"
            style={{ borderColor: "rgba(250,204,21,0.45)", color: "#fde047" }}
          >
            <WbIcon name="coins" size={12} color="#facc15" />{" "}
            {balance !== null ? `¥${balance.toLocaleString()}` : "残高読込中"}
          </span>
          <button
            type="button"
            className="wb-mmo-btn"
            style={{ background: "rgba(255,255,255,0.1)", color: "#f8fafc" }}
            onClick={onClose}
          >
            閉じる
          </button>
        </div>
      </div>

      {msg && (
        <div
          className="wb-mmo-card"
          style={{
            marginBottom: 10,
            borderColor: "rgba(56,189,248,0.45)",
            background: "rgba(14,116,144,0.22)",
            color: "#e0f2fe",
          }}
        >
          {msg}
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {VEHICLE_IDS.map((vid) => {
          const spec = VEHICLE_SPECS[vid];
          const owned = ownedVehicles.includes(vid);
          const equipped = equippedVehicle === vid;
          const speedPct = Math.min(100, Math.round((spec.speed / 10) * 100));
          const roadSpeed = Math.min(9.8, Number((spec.speed * 1.06).toFixed(2)));
          const affordable = balance === null || balance >= spec.price;

          return (
            <div
              key={vid}
              className="wb-mmo-card"
              style={{
                display: "grid",
                gridTemplateColumns: "82px 1fr auto",
                gap: 12,
                alignItems: "center",
                borderColor: equipped
                  ? "rgba(74, 222, 128, 0.55)"
                  : owned
                    ? "rgba(56, 189, 248, 0.4)"
                    : "rgba(148, 163, 184, 0.25)",
              }}
            >
              <div
                style={{
                  width: 82,
                  height: 54,
                  borderRadius: 10,
                  background: "rgba(15,23,42,0.75)",
                  border: "1px solid rgba(148,163,184,0.22)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <VehicleSvgPreview spec={spec} />
              </div>

              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 13.5 }}>{spec.name}</strong>
                  {equipped && (
                    <span
                      className="wb-mmo-stat-chip"
                      style={{ borderColor: "#4ade80", color: "#86efac" }}
                    >
                      乗車中
                    </span>
                  )}
                  {!equipped && owned && (
                    <span
                      className="wb-mmo-stat-chip"
                      style={{ borderColor: "#38bdf8", color: "#bae6fd" }}
                    >
                      所有済
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{spec.tagline}</span>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span className="wb-mmo-stat-chip">
                    <WbIcon name="bolt" size={11} color="#38bdf8" /> {spec.speed} / 舗装 {roadSpeed}{" "}
                    t/s
                  </span>
                  <span className="wb-mmo-stat-chip">
                    <WbIcon name="package" size={11} color="#fb923c" /> 配達 +
                    {spec.deliveryBonusPct}%
                  </span>
                  {spec.bountyBonusPct > 0 && (
                    <span
                      className="wb-mmo-stat-chip"
                      style={{ borderColor: "#f87171", color: "#fecaca" }}
                    >
                      <WbIcon name="siren" size={11} color="#f87171" /> 懸賞 +{spec.bountyBonusPct}%
                    </span>
                  )}
                </div>

                <div
                  style={{
                    height: 5,
                    borderRadius: 99,
                    background: "rgba(148,163,184,0.2)",
                    overflow: "hidden",
                    maxWidth: 220,
                  }}
                >
                  <div
                    style={{
                      width: `${speedPct}%`,
                      height: "100%",
                      background: spec.bodyColor,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
                <div style={{ fontWeight: 800, color: "#fde047", fontSize: 13.5 }}>
                  ¥{spec.price.toLocaleString()}
                </div>
                {owned ? (
                  equipped ? (
                    <button
                      type="button"
                      className="wb-mmo-btn"
                      disabled={busyId !== null}
                      style={{ background: "rgba(255,255,255,0.12)", color: "#e2e8f0" }}
                      onClick={() => void handleEquip(null)}
                    >
                      降りる
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="wb-mmo-btn wb-mmo-btn-cyan"
                      disabled={busyId !== null}
                      onClick={() => void handleEquip(vid)}
                    >
                      乗車する
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="wb-mmo-btn wb-mmo-btn-amber"
                    disabled={busyId !== null || !affordable}
                    style={!affordable ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                    onClick={() => void handleBuy(spec)}
                  >
                    {busyId === spec.id ? "購入中..." : affordable ? "購入して乗る" : "残高不足"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
