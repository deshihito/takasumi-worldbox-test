"use client";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { WbIcon } from "./WbIcon";
import { itemById, type ItemDef } from "@/lib/worldbox/economy/items";
import type { PlayerProfile } from "@/lib/worldbox/player/profile";
import {
  customBlueprintCost,
  defaultCustomBlueprint,
  type CustomChipId,
  type CustomCoreId,
  type CustomFrameId,
  type CustomMachineBlueprint,
  type CustomModuleId,
  type MachineSpec,
} from "@/lib/worldbox/economy/machines";

const overlayStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(660px, calc(100vw - 24px))",
  maxHeight: "min(86svh, 720px)",
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

interface EngRecipeView {
  id: string;
  inputs: Record<string, number>;
  output: string;
  outputCount: number;
  outputItem: ItemDef | null;
  isMachine: boolean;
}

interface EngGetResponse {
  profile: PlayerProfile;
  recipes: EngRecipeView[];
  machineSpecs: MachineSpec[];
  builderParts: {
    frames: {
      id: CustomFrameId;
      name: string;
      yieldMult: number;
      cost: Record<string, number>;
      desc: string;
    }[];
    cores: {
      id: CustomCoreId;
      name: string;
      speedMult: number;
      cost: Record<string, number>;
      desc: string;
    }[];
    modules: { id: CustomModuleId; name: string; cost: Record<string, number>; desc: string }[];
    chips: { id: CustomChipId; name: string; bonusDesc: string; cost: Record<string, number> }[];
  };
}

export default function WorldBoxEngineeringPanel({
  onProfileChange,
  onClose,
}: {
  onProfileChange?: (profile: PlayerProfile) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<EngGetResponse | null>(null);
  const [tab, setTab] = useState<"parts" | "machines" | "custom" | "guide">("machines");
  const [bp, setBp] = useState<CustomMachineBlueprint>(defaultCustomBlueprint());
  const [lastCode, setLastCode] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/worldbox/engineering", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      const json = (await res.json()) as EngGetResponse;
      setData(json);
      if (json.profile && onProfileChange) onProfileChange(json.profile);
    } catch {
      /* noop */
    }
  }, [onProfileChange]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const postAction = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/worldbox/engineering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const errCode = String(json.error ?? "");
        if (errCode === "not_enough_items") {
          const miss = json.missing
            ? (itemById(json.missing)?.name ?? String(json.missing))
            : "素材";
          setMsg(`素材が不足しています（${miss}）`);
        } else {
          setMsg(`エラー: ${errCode || res.status}`);
        }
        return null;
      }
      if (json.profile && onProfileChange) {
        onProfileChange(json.profile as PlayerProfile);
      }
      await reload();
      return json;
    } finally {
      setBusy(false);
    }
  };

  const invCount = (id: string) => data?.profile.items[id] ?? 0;

  const customCost = customBlueprintCost(bp);
  const canAssembleCustom = Object.entries(customCost).every(([id, req]) => invCount(id) >= req);

  return (
    <div className="wb-panel" style={overlayStyle}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          background: "rgba(13, 19, 28, 0.98)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
          borderBottom: "1px solid rgba(148,163,184,0.2)",
          padding: "14px 0 10px",
        }}
      >
        <div>
          <strong style={{ fontSize: 16, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <WbIcon name="gear" size={16} color="#38bdf8" /> 機械制作・メトロエンジニアラボ
          </strong>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            電子部品の加工・10種の産業マシン・乗り物・特注マシン設計
          </div>
        </div>
        <button type="button" className="wb-mmo-btn" onClick={onClose}>
          閉じる
        </button>
      </div>

      <div className="wb-mmo-tabs">
        <button
          type="button"
          className={`wb-mmo-tab ${tab === "machines" ? "is-active" : ""}`}
          onClick={() => setTab("machines")}
        >
          産業マシン制作
        </button>
        <button
          type="button"
          className={`wb-mmo-tab ${tab === "parts" ? "is-active" : ""}`}
          onClick={() => setTab("parts")}
        >
          電子部品・特殊道具
        </button>
        <button
          type="button"
          className={`wb-mmo-tab ${tab === "custom" ? "is-active" : ""}`}
          onClick={() => setTab("custom")}
        >
          カスタム設計ビルダー
        </button>
        <button
          type="button"
          className={`wb-mmo-tab ${tab === "guide" ? "is-active" : ""}`}
          onClick={() => setTab("guide")}
        >
          自動化システム解説
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

      {(tab === "machines" || tab === "parts") && data && (
        <div style={{ display: "grid", gap: 8 }}>
          {data.recipes
            .filter((r) => (tab === "machines" ? r.isMachine : !r.isMachine))
            .map((rec) => {
              const hasAll = Object.entries(rec.inputs).every(([id, req]) => invCount(id) >= req);
              return (
                <div
                  key={rec.id}
                  className="wb-mmo-card"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {rec.outputItem?.icon && (
                      <img
                        src={rec.outputItem.icon}
                        alt=""
                        width={36}
                        height={36}
                        style={{ imageRendering: "pixelated" }}
                      />
                    )}
                    <div>
                      <div style={{ fontWeight: 800 }}>
                        {rec.outputItem?.name ?? rec.output} ×{rec.outputCount}{" "}
                        <span style={{ fontSize: 11, color: "#34d399" }}>
                          (所持: {invCount(rec.output)})
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "#cbd5e1" }}>{rec.outputItem?.desc}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                        {Object.entries(rec.inputs).map(([inId, req]) => {
                          const ok = invCount(inId) >= req;
                          return (
                            <span
                              key={inId}
                              style={{
                                fontSize: 11,
                                padding: "1px 6px",
                                borderRadius: 4,
                                background: ok ? "rgba(16,185,129,0.16)" : "rgba(239,68,68,0.16)",
                                color: ok ? "#6ee7b7" : "#fca5a5",
                              }}
                            >
                              {itemById(inId)?.name ?? inId} {invCount(inId)}/{req}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || !hasAll}
                    className={`wb-mmo-btn ${hasAll ? "wb-mmo-btn-cyan" : ""}`}
                    onClick={() => {
                      void postAction({ action: "craft_recipe", recipeId: rec.id, count: 1 }).then(
                        (r) => {
                          if (r) {
                            setMsg(
                              `「${rec.outputItem?.name ?? rec.output}」×${rec.outputCount} を製造しました！`,
                            );
                          }
                        },
                      );
                    }}
                  >
                    制作
                  </button>
                </div>
              );
            })}
        </div>
      )}

      {tab === "custom" && data && (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="wb-mmo-card" style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <WbIcon name="wrench" size={14} color="#38bdf8" />{" "}
              特注カスタムマシン設計図（ワールドに設置して稼働）
            </div>
            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              <span>マシン愛称</span>
              <input
                value={bp.name}
                maxLength={28}
                onChange={(e) => setBp({ ...bp, name: e.target.value })}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "rgba(0,0,0,0.4)",
                  color: "#fff",
                  border: "1px solid rgba(148,163,184,0.3)",
                }}
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                <span>1. 筐体フレーム</span>
                <select
                  value={bp.frame}
                  onChange={(e) => setBp({ ...bp, frame: e.target.value as CustomFrameId })}
                  style={{
                    padding: 6,
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.4)",
                    color: "#fff",
                    border: "1px solid rgba(148,163,184,0.3)",
                  }}
                >
                  {data.builderParts.frames.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.yieldMult}x)
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                <span>2. 動力コア</span>
                <select
                  value={bp.core}
                  onChange={(e) => setBp({ ...bp, core: e.target.value as CustomCoreId })}
                  style={{
                    padding: 6,
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.4)",
                    color: "#fff",
                    border: "1px solid rgba(148,163,184,0.3)",
                  }}
                >
                  {data.builderParts.cores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.speedMult}x速)
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                <span>3. 機能モジュール</span>
                <select
                  value={bp.module}
                  onChange={(e) => setBp({ ...bp, module: e.target.value as CustomModuleId })}
                  style={{
                    padding: 6,
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.4)",
                    color: "#fff",
                    border: "1px solid rgba(148,163,184,0.3)",
                  }}
                >
                  {data.builderParts.modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                <span>4. AIロジックチップ</span>
                <select
                  value={bp.chip}
                  onChange={(e) => setBp({ ...bp, chip: e.target.value as CustomChipId })}
                  style={{
                    padding: 6,
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.4)",
                    color: "#fff",
                    border: "1px solid rgba(148,163,184,0.3)",
                  }}
                >
                  {data.builderParts.chips.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 4 }}>
                必要組み立てパーツ合計:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(customCost).map(([id, req]) => {
                  const ok = invCount(id) >= req;
                  return (
                    <span
                      key={id}
                      style={{
                        fontSize: 11,
                        padding: "2px 7px",
                        borderRadius: 4,
                        background: ok ? "rgba(16,185,129,0.16)" : "rgba(239,68,68,0.16)",
                        color: ok ? "#6ee7b7" : "#fca5a5",
                      }}
                    >
                      {itemById(id)?.name ?? id} {invCount(id)}/{req}
                    </span>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              disabled={busy || !canAssembleCustom}
              className="wb-mmo-btn wb-mmo-btn-amber"
              onClick={() => {
                void postAction({ action: "assemble_custom", blueprint: bp }).then((r) => {
                  if (r) {
                    setLastCode(String(r.code ?? ""));
                    setMsg(
                      `特注マシン「${bp.name}」を組み上げました！インベントリから地面へ配置後、共有コードを適用してください。`,
                    );
                  }
                });
              }}
            >
              特注カスタムマシンを組み立てる
            </button>
            {lastCode && (
              <div
                style={{
                  fontSize: 11,
                  padding: 8,
                  borderRadius: 6,
                  background: "rgba(0,0,0,0.45)",
                  wordBreak: "break-all",
                  color: "#38bdf8",
                }}
              >
                <div>設計共有コード（設置したマシンに貼付）:</div>
                <code>{lastCode}</code>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "guide" && data && (
        <div style={{ display: "grid", gap: 8 }}>
          {data.machineSpecs.map((spec) => (
            <div key={spec.id} className="wb-mmo-card">
              <div style={{ fontWeight: 800, color: spec.accentColor }}>
                {spec.name}{" "}
                <span style={{ fontSize: 10.5, opacity: 0.75 }}>[{spec.roleLabel}]</span>
              </div>
              <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 2 }}>{spec.desc}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                作用半径:{" "}
                {spec.radius === 0
                  ? "単体稼働"
                  : `周囲 ${spec.radius * 2 + 1}×${spec.radius * 2 + 1} マス`}{" "}
                / 標準周期: {spec.defaultIntervalSec}秒
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
