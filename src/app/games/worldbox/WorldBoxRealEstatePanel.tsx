"use client";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { WbIcon } from "./WbIcon";
import type {
  ApartmentOwnership,
  ApartmentTierId,
  ApartmentUnitDef,
  PropertyDeed,
  ZoneType,
} from "@/lib/worldbox/world/realestate";

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
  zIndex: 26,
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

const btn: CSSProperties = {
  minHeight: 32,
  padding: "5px 11px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(255,255,255,0.1)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

interface RealEstateApiResponse {
  selfKey: string;
  actorPos: { space: string; x: number; y: number };
  currentChunk: {
    cx: number;
    cy: number;
    key: string;
    valuation: number;
    deed: PropertyDeed | null;
  };
  myDeeds: (PropertyDeed & { valuation: number })[];
  allDeeds: (PropertyDeed & { valuation: number })[];
  myApartments: ApartmentOwnership[];
  apartmentTiers: ApartmentUnitDef[];
  balance: number | null;
}

export default function WorldBoxRealEstatePanel({
  onForceMove,
  onStatusChange,
  onClose,
}: {
  onForceMove?: (move: { space: string; x: number; y: number }) => void;
  onStatusChange?: () => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<RealEstateApiResponse | null>(null);
  const [tab, setTab] = useState<"deeds" | "apartments">("deeds");
  const [zone, setZone] = useState<ZoneType>("residential");
  const [deedName, setDeedName] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/worldbox/realestate", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      setData((await res.json()) as RealEstateApiResponse);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const callAction = async (payload: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/worldbox/realestate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        forceMove?: { space: string; x: number; y: number };
      };
      if (!res.ok) {
        const map: Record<string, string> = {
          must_be_in_world: "オープンワールドに出て登記したいチャンク上に立ってください",
          already_claimed: "このチャンクはすでに他オーナーが登記済みです",
          insufficient_funds: "残高が不足しています",
          no_rent_ready: "家賃収入の回収は1時間経過後から可能です",
        };
        setMsg(map[json.error ?? ""] ?? `エラー: ${json.error ?? res.status}`);
        return;
      }
      if (json.forceMove && onForceMove) onForceMove(json.forceMove);
      await reload();
      if (onStatusChange) onStatusChange();
      setMsg(okMsg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="wb-panel"
      style={overlayStyle}
      role="dialog"
      aria-label="メトロ不動産・都市開発局"
    >
      <div style={stickyHeaderStyle}>
        <div>
          <strong style={{ fontSize: 16, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <WbIcon name="town" size={16} color="#38bdf8" /> メトロ不動産・分譲マンション局
          </strong>
          <div style={{ fontSize: 11, opacity: 0.78 }}>
            銀行与信担保に自動連動 ・ 保有区画 {data?.myDeeds.length ?? 0} / 物件{" "}
            {data?.myApartments.length ?? 0}
          </div>
        </div>
        <button type="button" style={btn} onClick={onClose}>
          閉じる
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setTab("deeds")}
          style={{
            ...btn,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            borderColor: tab === "deeds" ? "#38bdf8" : "rgba(148,163,184,0.3)",
          }}
        >
          <WbIcon name="pin" size={13} color="#4ade80" /> 16×16 土地権利書
        </button>
        <button
          type="button"
          onClick={() => setTab("apartments")}
          style={{
            ...btn,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            borderColor: tab === "apartments" ? "#38bdf8" : "rgba(148,163,184,0.3)",
          }}
        >
          <WbIcon name="building" size={13} color="#38bdf8" /> 分譲マンション・オフィス
        </button>
      </div>

      {msg && (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(56,189,248,0.16)",
            border: "1px solid rgba(56,189,248,0.35)",
          }}
        >
          {msg}
        </div>
      )}

      {data && tab === "deeds" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(148,163,184,0.22)",
              display: "grid",
              gap: 8,
            }}
          >
            <strong>
              現在チャンク ({data.currentChunk.key}) 評価額: ¥
              {data.currentChunk.valuation.toLocaleString()}
            </strong>
            {data.currentChunk.deed ? (
              <div style={{ fontSize: 12 }}>
                所有者: <b>{data.currentChunk.deed.ownerName}</b> ・ 用途:{" "}
                {data.currentChunk.deed.zone} ・ 賃料 ¥
                {data.currentChunk.deed.rentPerHour.toLocaleString()}/h
                {data.currentChunk.deed.ownerKey !== data.selfKey &&
                  !data.currentChunk.deed.tenantKey && (
                    <button
                      type="button"
                      disabled={busy}
                      style={{ ...btn, marginLeft: 8, background: "#0284c7" }}
                      onClick={() =>
                        callAction(
                          { action: "lease_chunk", chunkKey: data.currentChunk.key },
                          "賃借契約を締結しました！",
                        )
                      }
                    >
                      賃借する (¥{data.currentChunk.deed.rentPerHour})
                    </button>
                  )}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={zone}
                  onChange={(e) => setZone(e.target.value as ZoneType)}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.4)",
                    color: "#fff",
                    border: "1px solid rgba(148,163,184,0.3)",
                  }}
                >
                  <option value="residential">住宅区画 (1.0x)</option>
                  <option value="industrial">工業区画 (1.2x)</option>
                  <option value="commercial">商業特区 (1.3x)</option>
                </select>
                <input
                  placeholder="地区名 (任意)"
                  value={deedName}
                  onChange={(e) => setDeedName(e.target.value)}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.4)",
                    color: "#fff",
                    border: "1px solid rgba(148,163,184,0.3)",
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  style={{ ...btn, background: "#16a34a" }}
                  onClick={() =>
                    callAction(
                      { action: "claim_chunk", zone, name: deedName },
                      "チャンク権利書を取得しました！銀行担保にも加算されます。",
                    )
                  }
                >
                  土地権利書を取得 (¥{data.currentChunk.valuation.toLocaleString()})
                </button>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <strong>登記済み不動産一覧 ({data.allDeeds.length})</strong>
            {data.allDeeds.map((d) => (
              <div
                key={d.chunkKey}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(148,163,184,0.18)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <b>{d.name}</b> ({d.chunkKey}) ・ [{d.zone}] ・ 所有: {d.ownerName}
                  {d.tenantName && ` ・ 賃借中: ${d.tenantName}`}
                </div>
                <span style={{ color: "#4ade80", fontWeight: 700 }}>
                  ¥{d.valuation.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && tab === "apartments" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <strong>購入可能な分譲物件 (入室可能・作業台/ATM/株ボード完備)</strong>
            {data.apartmentTiers.map((tier) => (
              <div
                key={tier.id}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(148,163,184,0.22)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{tier.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.78 }}>{tier.desc}</div>
                  <div style={{ fontSize: 11, color: "#4ade80" }}>
                    家賃不労所得: ¥{tier.hourlyPassiveRent.toLocaleString()}/h
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  style={{ ...btn, background: "#0284c7" }}
                  onClick={() =>
                    callAction(
                      { action: "buy_apartment", tier: tier.id as ApartmentTierId },
                      `「${tier.name}」を購入しました！`,
                    )
                  }
                >
                  購入 ¥{tier.price.toLocaleString()}
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <strong>所有している物件 ({data.myApartments.length})</strong>
            {data.myApartments.map((apt) => (
              <div
                key={apt.unitId}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  background: "rgba(56,189,248,0.08)",
                  border: "1px solid rgba(56,189,248,0.28)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  <b>ユニット #{apt.unitId}</b> ({apt.tier})
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    disabled={busy}
                    style={{
                      ...btn,
                      background: "#16a34a",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                    onClick={() =>
                      callAction(
                        { action: "enter_apartment", unitId: apt.unitId },
                        "専用物件へ移動しました",
                      )
                    }
                  >
                    <WbIcon name="door" size={13} color="#dcfce7" /> 入室する
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    style={btn}
                    onClick={() =>
                      callAction(
                        { action: "collect_rent", unitId: apt.unitId },
                        "家賃収入を回収しました！",
                      )
                    }
                  >
                    家賃回収
                  </button>
                </div>
              </div>
            ))}
            {data.actorPos.space.startsWith("apartment:") && (
              <button
                type="button"
                disabled={busy}
                style={{ ...btn, background: "#334155" }}
                onClick={() => callAction({ action: "exit_apartment" }, "ロビーへ戻りました")}
              >
                ロビーへ戻る
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
