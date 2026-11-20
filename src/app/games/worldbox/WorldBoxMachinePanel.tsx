"use client";

import { useCallback, useEffect, useState } from "react";
import { WbIcon } from "./WbIcon";
import type { PlayerProfile } from "@/lib/worldbox/player/profile";
import { itemById } from "@/lib/worldbox/economy/items";
import { ItemSlot, ItemSlotGrid } from "./ItemSlotGrid";
import {
  CNC_RECIPES,
  DEVICE_INTERVAL_CHOICES,
  DEVICE_PRESETS,
  machineSpecFor,
  type CustomMachineBlueprint,
  type DeviceProgram,
  type VendingSlot,
} from "@/lib/worldbox/economy/machines";

const panelStyle: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: 12,
  transform: "translateX(-50%)",
  width: "min(440px, calc(100% - 20px))",
  zIndex: 30,
  maxHeight: "min(84svh, 640px)",
  overflowY: "auto",
  overscrollBehavior: "contain",
  background: "rgba(13, 19, 28, 0.96)",
  border: "1px solid rgba(148, 163, 184, 0.3)",
  borderRadius: 14,
  padding: "12px 14px",
  color: "#f1f5f9",
  boxShadow: "0 12px 36px rgba(0,0,0,0.55)",
};
const btn: React.CSSProperties = {
  minHeight: 30,
  padding: "4px 10px",
  borderRadius: 8,
  cursor: "pointer",
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(255,255,255,0.1)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
};
const input: React.CSSProperties = {
  minHeight: 30,
  padding: "4px 8px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(0,0,0,0.35)",
  color: "#fff",
  fontSize: 12,
  boxSizing: "border-box",
};

interface MachineView {
  machineType: string;
  isOwner: boolean;
  program: DeviceProgram;
  code: string;
  blueprint?: CustomMachineBlueprint | null;
  blueprintCode?: string | null;
  targetRecipeId?: string | null;
  inputs?: Record<string, number>;
  buffer: Record<string, number>;
  buffered: number;
  vending?: VendingSlot[];
  vendingSales?: number;
  poweredByNearby?: boolean;
  routeMode?: "buffer" | "feed_cnc" | "feed_vending";
}

export default function WorldBoxMachinePanel({
  x,
  y,
  profile,
  onProfileChange,
  onClose,
}: {
  x: number;
  y: number;
  profile?: PlayerProfile | null;
  onProfileChange: (profile: PlayerProfile) => void;
  onClose: () => void;
}) {
  const [machine, setMachine] = useState<MachineView | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [depositItem, setDepositItem] = useState("copper_ingot");
  const [depositQty, setDepositQty] = useState(2);
  const [vendItem, setVendItem] = useState("bread");
  const [vendPrice, setVendPrice] = useState(500);
  const [vendQty, setVendQty] = useState(1);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/worldbox/machines?x=${x}&y=${y}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setMsg(d.error === "too_far" ? "もう少し近くに寄ってください" : "読み込めませんでした");
        return;
      }
      const d = (await res.json()) as { machine: MachineView };
      setMachine(d.machine);
    } catch {
      setMsg("読み込みに失敗しました");
    }
  }, [x, y]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profile) return;
    const invEntries = Object.entries(profile.items).filter(([, c]) => c > 0);
    if (invEntries.length > 0 && !(profile.items[depositItem] > 0)) {
      setDepositItem(invEntries[0][0]);
    }
    if (invEntries.length > 0 && !(profile.items[vendItem] > 0)) {
      const firstId = invEntries[0][0];
      setVendItem(firstId);
      setVendPrice(itemById(firstId)?.price ?? 500);
    }
  }, [profile, depositItem, vendItem]);

  const post = async (body: Record<string, unknown>, note?: string) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/worldbox/machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y, ...body }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        machine?: MachineView;
        profile?: PlayerProfile;
        error?: string;
      };
      if (!res.ok) {
        const m: Record<string, string> = {
          too_far: "機械の近くで操作してください",
          bad_code: "コードの形式が正しくありません",
          empty: "現在空です",
          out_of_stock: "在庫切れです",
          insufficient_funds: "残高が不足しています",
          not_enough_items: "手持ちアイテム数が足りません",
          slots_full: "販売スロットは最大6枠までです",
        };
        setMsg(m[d.error ?? ""] ?? "操作に失敗しました");
        return;
      }
      if (d.machine) setMachine(d.machine);
      if (d.profile) onProfileChange(d.profile);
      if (note) setMsg(note);
    } finally {
      setBusy(false);
    }
  };

  const spec = machine ? machineSpecFor(machine.machineType) : null;
  const isOwner = machine?.isOwner ?? true;
  const invList = profile
    ? Object.entries(profile.items)
        .filter(([, cnt]) => cnt > 0)
        .map(([id, cnt]) => ({ id, cnt, def: itemById(id) }))
        .filter((r) => r.def !== null)
    : [];

  return (
    <div className="wb-panel" style={panelStyle}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          background: "rgba(13, 19, 28, 0.98)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          borderBottom: "1px solid rgba(148,163,184,0.2)",
          paddingBottom: 8,
        }}
      >
        <div>
          <strong style={{ fontSize: 15, color: spec?.accentColor ?? "#fff" }}>
            {spec?.name ?? "産業マシン"}
          </strong>
          <div
            style={{
              fontSize: 11,
              color: "#94a3b8",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span>
              座標 ({x}, {y})
            </span>
            {machine?.poweredByNearby && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  color: "#facc15",
                }}
              >
                / <WbIcon name="bolt" size={12} color="#facc15" /> 発電グリッド2x稼働中
              </span>
            )}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" style={btn} onClick={onClose}>
          閉じる
        </button>
      </div>

      {machine ? (
        <div style={{ display: "grid", gap: 10 }}>
          {/* Smart Vending Machine Public + Owner UI */}
          {machine.machineType === "smart_vending" && (
            <div className="wb-mmo-card" style={{ display: "grid", gap: 8 }}>
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <strong style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <WbIcon name="shop" size={14} color="#38bdf8" /> 24時間スマート自販機ストア
                </strong>
                {isOwner && typeof machine.vendingSales === "number" && (
                  <span style={{ fontSize: 11, color: "#fbbf24" }}>
                    累計売上 ¥{machine.vendingSales.toLocaleString()}
                  </span>
                )}
              </div>
              {!machine.vending || machine.vending.length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>現在商品は陳列されていません。</div>
              ) : (
                machine.vending.map((slot) => {
                  const def = itemById(slot.itemId);
                  return (
                    <div
                      key={slot.itemId}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        padding: "5px 8px",
                        borderRadius: 6,
                        background: "rgba(255,255,255,0.05)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {def?.icon && (
                          <img
                            src={def.icon}
                            alt=""
                            width={24}
                            height={24}
                            style={{ imageRendering: "pixelated" }}
                          />
                        )}
                        <div>
                          <div style={{ fontWeight: 700 }}>{def?.name ?? slot.itemId}</div>
                          <div style={{ fontSize: 11, color: "#fbbf24" }}>
                            ¥{slot.price.toLocaleString()} / 在庫 {slot.stock}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          type="button"
                          disabled={busy}
                          style={{ ...btn, background: "#059669", borderColor: "#34d399" }}
                          onClick={() =>
                            void post(
                              { action: "vending_buy", itemId: slot.itemId, count: 1 },
                              "購入しました",
                            )
                          }
                        >
                          買う
                        </button>
                        {isOwner && (
                          <button
                            type="button"
                            disabled={busy}
                            style={btn}
                            onClick={() =>
                              void post(
                                { action: "vending_remove", itemId: slot.itemId },
                                "回収しました",
                              )
                            }
                          >
                            撤去
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              {isOwner && invList.length > 0 && (
                <div
                  style={{
                    borderTop: "1px solid rgba(148,163,184,0.2)",
                    paddingTop: 8,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>手持ちから補充出品する</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <select
                      value={vendItem}
                      onChange={(e) => {
                        setVendItem(e.target.value);
                        setVendPrice(itemById(e.target.value)?.price ?? 500);
                      }}
                      style={{ ...input, flex: 1 }}
                    >
                      {invList.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.def?.name} ({r.cnt})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={vendQty}
                      onChange={(e) => setVendQty(Math.max(1, Number(e.target.value) || 1))}
                      style={{ ...input, width: 58 }}
                      title="数量"
                    />
                    <input
                      type="number"
                      min={10}
                      max={1000000}
                      value={vendPrice}
                      onChange={(e) => setVendPrice(Math.max(10, Number(e.target.value) || 10))}
                      style={{ ...input, width: 88 }}
                      title="単価(円)"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      style={{ ...btn, background: "#0891b2", borderColor: "#22d3ee" }}
                      onClick={() =>
                        void post(
                          {
                            action: "vending_stock",
                            itemId: vendItem,
                            count: vendQty,
                            price: vendPrice,
                          },
                          "自販機に補充しました",
                        )
                      }
                    >
                      補充
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isOwner && machine.machineType !== "smart_vending" && (
            <>
              {/* Power & Interval Controls */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={busy}
                  style={{
                    ...btn,
                    background: machine.program.enabled ? "#059669" : "rgba(255,255,255,0.1)",
                    borderColor: machine.program.enabled ? "#34d399" : "rgba(255,255,255,0.3)",
                  }}
                  onClick={() =>
                    void post({
                      action: "set_program",
                      program: { ...machine.program, enabled: !machine.program.enabled },
                    })
                  }
                >
                  {machine.program.enabled ? "稼働 ON" : "稼働 OFF"}
                </button>
                {DEVICE_INTERVAL_CHOICES.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    disabled={busy}
                    style={{
                      ...btn,
                      background:
                        machine.program.intervalSec === sec ? "#0284c7" : "rgba(255,255,255,0.08)",
                    }}
                    onClick={() =>
                      void post({
                        action: "set_program",
                        program: { ...machine.program, intervalSec: sec },
                      })
                    }
                  >
                    {sec}秒
                  </button>
                ))}
              </div>

              {/* Harvester presets */}
              {machine.machineType === "auto_harvester" && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {DEVICE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={busy}
                      style={btn}
                      onClick={() =>
                        void post({ action: "set_program", program: p.program }, `${p.name}に設定`)
                      }
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}

              {/* CNC Factory / Custom CNC target recipe selector */}
              {(machine.machineType === "cnc_factory" ||
                (machine.machineType === "custom_machine" &&
                  machine.blueprint?.module === "cnc")) && (
                <div className="wb-mmo-card" style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <WbIcon name="factory" size={13} color="#38bdf8" /> 自動製造レシピ選択
                  </div>
                  <select
                    value={
                      machine.targetRecipeId ?? machine.blueprint?.targetRecipeId ?? "copper_wire"
                    }
                    onChange={(e) =>
                      void post(
                        { action: "set_recipe", recipeId: e.target.value },
                        "製造レシピを変更",
                      )
                    }
                    style={input}
                  >
                    {CNC_RECIPES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {itemById(r.output)?.name ?? r.output} (素材:{" "}
                        {Object.entries(r.inputs)
                          .map(([k, n]) => `${itemById(k)?.name ?? k}×${n}`)
                          .join(", ")}
                        )
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Logistics Sorter Pipeline Route Selector */}
              {machine.machineType === "logistics_sorter" && (
                <div className="wb-mmo-card" style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <WbIcon name="swap" size={13} color="#818cf8" />{" "}
                    自動配送ルート設定（ベルトコンベア中継機で長距離接続可）
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(
                      [
                        { id: "buffer", label: "倉庫集約", icon: "package" },
                        { id: "feed_cnc", label: "CNC加工機へ自動供給", icon: "gear" },
                        { id: "feed_vending", label: "自販機へ自動補充", icon: "shop" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={busy}
                        style={{
                          ...btn,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          background:
                            (machine.routeMode ?? "buffer") === opt.id
                              ? "#4f46e5"
                              : "rgba(255,255,255,0.08)",
                          borderColor:
                            (machine.routeMode ?? "buffer") === opt.id
                              ? "#818cf8"
                              : "rgba(148,163,184,0.3)",
                        }}
                        onClick={() =>
                          void post(
                            { action: "set_route_mode", routeMode: opt.id },
                            `ルートを「${opt.label}」に設定`,
                          )
                        }
                      >
                        <WbIcon name={opt.icon} size={12} color="#e2e8f0" /> {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {machine.machineType === "conveyor_relay" && (
                <div
                  className="wb-mmo-card"
                  style={{
                    fontSize: 12,
                    color: "#99f6e4",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <WbIcon name="link" size={13} color="#5eead4" />{" "}
                  自動ベルトコンベア中継機：周囲5×5の生産機と物流ソーターの配管を多段接続します。
                </div>
              )}

              {/* Custom Machine Blueprint Details */}
              {machine.machineType === "custom_machine" && machine.blueprint && (
                <div className="wb-mmo-card" style={{ fontSize: 12 }}>
                  <div
                    style={{
                      fontWeight: 800,
                      color: "#fb923c",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <WbIcon name="gear" size={13} color="#fb923c" /> {machine.blueprint.name}
                  </div>
                  <div style={{ color: "#cbd5e1", marginTop: 2 }}>
                    筐体:{machine.blueprint.frame} / コア:{machine.blueprint.core} / 機能:
                    {machine.blueprint.module} / AI:{machine.blueprint.chip}
                  </div>
                </div>
              )}

              {/* Input Hopper for Planter / CNC */}
              {(machine.machineType === "auto_planter" ||
                machine.machineType === "cnc_factory" ||
                (machine.machineType === "custom_machine" &&
                  machine.blueprint?.module === "cnc")) && (
                <div className="wb-mmo-card" style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <WbIcon name="hopper" size={13} color="#22d3ee" />{" "}
                    投入ホッパー（種または加工素材を投入）
                  </div>
                  {machine.inputs && Object.keys(machine.inputs).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {Object.entries(machine.inputs).map(([id, cnt]) => (
                        <button
                          key={id}
                          type="button"
                          disabled={busy}
                          style={{ ...btn, fontSize: 11 }}
                          onClick={() =>
                            void post(
                              { action: "withdraw_input", itemId: id },
                              "素材を取り出しました",
                            )
                          }
                        >
                          {itemById(id)?.name ?? id} ×{cnt}（取出）
                        </button>
                      ))}
                    </div>
                  )}
                  {invList.length > 0 && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <select
                        value={depositItem}
                        onChange={(e) => setDepositItem(e.target.value)}
                        style={{ ...input, flex: 1 }}
                      >
                        {invList.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.def?.name} ({r.cnt})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={depositQty}
                        onChange={(e) => setDepositQty(Math.max(1, Number(e.target.value) || 1))}
                        style={{ ...input, width: 58 }}
                      />
                      <button
                        type="button"
                        disabled={busy}
                        style={{ ...btn, background: "#0891b2", borderColor: "#22d3ee" }}
                        onClick={() =>
                          void post(
                            { action: "deposit_input", itemId: depositItem, count: depositQty },
                            "ホッパーへ投入しました",
                          )
                        }
                      >
                        投入
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Output Buffer Grid */}
              <div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "#94a3b8",
                    marginBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <WbIcon name="package" size={13} color="#94a3b8" /> 生産・回収済みバッファ（合計{" "}
                  {machine.buffered} 個）
                </div>
                <ItemSlotGrid>
                  {Object.entries(machine.buffer).map(([itemId, count]) => (
                    <ItemSlot key={itemId} itemId={itemId} count={count} />
                  ))}
                </ItemSlotGrid>
                <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    disabled={busy || machine.buffered <= 0}
                    style={{
                      ...btn,
                      background: machine.buffered > 0 ? "#059669" : undefined,
                      borderColor: machine.buffered > 0 ? "#34d399" : undefined,
                    }}
                    onClick={() => void post({ action: "collect" }, "バッファをすべて回収しました")}
                  >
                    すべて回収 ({machine.buffered})
                  </button>
                  <button type="button" disabled={busy} style={btn} onClick={() => void load()}>
                    再評価・更新
                  </button>
                </div>
              </div>

              {/* WB1 / WB2 Share code bar */}
              <div style={{ borderTop: "1px solid rgba(148,163,184,0.2)", paddingTop: 8 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    placeholder="共有コード（WB1. / WB2.）を貼付"
                    style={{ ...input, flex: 1 }}
                  />
                  <button
                    type="button"
                    disabled={busy || !codeInput.trim()}
                    style={btn}
                    onClick={() =>
                      void post(
                        { action: "apply_code", code: codeInput.trim() },
                        "共有コードを適用しました",
                      )
                    }
                  >
                    読込
                  </button>
                </div>
                <div
                  style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, wordBreak: "break-all" }}
                >
                  プログラム: <code>{machine.code}</code>
                  {machine.blueprintCode && (
                    <>
                      <br />
                      カスタム設計: <code>{machine.blueprintCode}</code>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, opacity: 0.7 }}>{msg || "読み込み中..."}</div>
      )}

      {msg && machine && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 10px",
            borderRadius: 6,
            background: "rgba(34, 211, 238, 0.14)",
            fontSize: 12,
            color: "#cffafe",
          }}
        >
          {msg}
        </div>
      )}
    </div>
  );
}
