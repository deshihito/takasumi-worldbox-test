"use client";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { WbIcon } from "./WbIcon";
import { itemById } from "@/lib/worldbox/economy/items";
import type { PlayerProfile } from "@/lib/worldbox/player/profile";
import type { CitizenContract, ContractCategory } from "@/lib/worldbox/social/contracts";
import type { DirectTradeOffer } from "@/lib/worldbox/social/trade";

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

const fieldStyle: CSSProperties = {
  padding: "6px 9px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(0,0,0,0.38)",
  color: "#fff",
  fontSize: 12,
};

interface OnlinePlayer {
  presenceId: string;
  name: string;
  space: string;
  x: number;
  y: number;
}

export default function WorldBoxTradePanel({
  initialTarget,
  profile,
  onProfileChange,
  onStatusChange,
  onClose,
}: {
  initialTarget?: { presenceId: string; name: string } | null;
  profile: PlayerProfile | null;
  onProfileChange?: (profile: PlayerProfile) => void;
  onStatusChange?: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"trade" | "send" | "contracts">("trade");
  const [selfKey, setSelfKey] = useState("");
  const [offers, setOffers] = useState<DirectTradeOffer[]>([]);
  const [players, setPlayers] = useState<OnlinePlayer[]>([]);
  const [contracts, setContracts] = useState<CitizenContract[]>([]);
  const [balance, setBalance] = useState<number | null>(null);

  // Forms
  const [targetPid, setTargetPid] = useState(initialTarget?.presenceId ?? "");
  const [offerCoins, setOfferCoins] = useState(500);
  const [requestCoins, setRequestCoins] = useState(0);
  const [offerItemId, setOfferItemId] = useState("");
  const [offerItemCount, setOfferItemCount] = useState(1);
  const [reqItemId, setReqItemId] = useState("");
  const [reqItemCount, setReqItemCount] = useState(1);
  const [note, setNote] = useState("");

  const [sendAmount, setSendAmount] = useState(500);

  const [cCat, setCCat] = useState<ContractCategory>("delivery");
  const [cTitle, setCTitle] = useState("");
  const [cItemId, setCItemId] = useState("copper_ingot");
  const [cItemCount, setCItemCount] = useState(5);
  const [cReward, setCReward] = useState(1500);

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [tRes, cRes] = await Promise.all([
        fetch("/api/worldbox/trade", { headers: { Accept: "application/json" } }),
        fetch("/api/worldbox/contracts", { headers: { Accept: "application/json" } }),
      ]);
      if (tRes.ok) {
        const td = (await tRes.json()) as {
          selfKey: string;
          offers: DirectTradeOffer[];
          onlinePlayers: OnlinePlayer[];
          balance: number | null;
        };
        setSelfKey(td.selfKey);
        setOffers(td.offers ?? []);
        setPlayers(td.onlinePlayers ?? []);
        setBalance(td.balance);
        if (!targetPid && td.onlinePlayers?.length > 0) {
          setTargetPid(td.onlinePlayers[0].presenceId);
        }
      }
      if (cRes.ok) {
        const cd = (await cRes.json()) as { contracts: CitizenContract[] };
        setContracts(cd.contracts ?? []);
      }
    } catch {
      /* noop */
    }
  }, [targetPid]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const inventoryItems = Object.entries(profile?.items ?? {}).filter(([, c]) => c > 0);

  const runTrade = async (payload: Record<string, unknown>, successMsg: string) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/worldbox/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        profile?: PlayerProfile;
      };
      if (!res.ok) {
        setMsg(`エラー: ${json.error ?? res.status}`);
        return;
      }
      if (json.profile && onProfileChange) onProfileChange(json.profile);
      await reload();
      if (onStatusChange) onStatusChange();
      setMsg(successMsg);
    } finally {
      setBusy(false);
    }
  };

  const runContract = async (payload: Record<string, unknown>, successMsg: string) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/worldbox/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        profile?: PlayerProfile;
      };
      if (!res.ok) {
        setMsg(`エラー: ${json.error ?? res.status}`);
        return;
      }
      if (json.profile && onProfileChange) onProfileChange(json.profile);
      await reload();
      if (onStatusChange) onStatusChange();
      setMsg(successMsg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wb-panel" style={overlayStyle} role="dialog" aria-label="P2P取引・契約ボード">
      <div style={stickyHeaderStyle}>
        <div>
          <strong style={{ fontSize: 16, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <WbIcon name="handshake" size={16} color="#38bdf8" /> P2P取引・市民契約ボード
          </strong>
          <div style={{ fontSize: 11, opacity: 0.75 }}>
            所持金: {balance !== null ? `¥${balance.toLocaleString()}` : "---"} ・ 接続中市民{" "}
            {players.length}人
          </div>
        </div>
        <button type="button" style={btn} onClick={onClose}>
          閉じる
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {(
          [
            [
              "trade",
              `直接取引 (${offers.filter((o) => o.status === "pending").length})`,
              "handshake",
            ],
            ["send", "MetroPay 送金", "bolt"],
            [
              "contracts",
              `契約ボード (${contracts.filter((c) => c.status === "open").length})`,
              "contract",
            ],
          ] as const
        ).map(([k, label, iconName]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            style={{
              ...btn,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: tab === k ? "rgba(56,189,248,0.24)" : "rgba(255,255,255,0.08)",
              borderColor: tab === k ? "#38bdf8" : "rgba(148,163,184,0.3)",
            }}
          >
            <WbIcon name={iconName} size={13} color={tab === k ? "#38bdf8" : "#cbd5e1"} />
            {label}
          </button>
        ))}
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

      {tab === "trade" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(148,163,184,0.2)",
              display: "grid",
              gap: 8,
            }}
          >
            <strong>新規P2Pオファーを作成</strong>
            <select
              value={targetPid}
              onChange={(e) => setTargetPid(e.target.value)}
              style={fieldStyle}
            >
              {players.length === 0 && <option value="">オンラインの市民がいません</option>}
              {players.map((p) => (
                <option key={p.presenceId} value={p.presenceId}>
                  {p.name} ({p.space})
                </option>
              ))}
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ display: "grid", gap: 3 }}>
                <span style={{ fontSize: 11, opacity: 0.75 }}>こちらが出す金額 (¥)</span>
                <input
                  type="number"
                  min={0}
                  value={offerCoins}
                  onChange={(e) => setOfferCoins(Math.max(0, Number(e.target.value)))}
                  style={fieldStyle}
                />
              </label>
              <label style={{ display: "grid", gap: 3 }}>
                <span style={{ fontSize: 11, opacity: 0.75 }}>相手に求める金額 (¥)</span>
                <input
                  type="number"
                  min={0}
                  value={requestCoins}
                  onChange={(e) => setRequestCoins(Math.max(0, Number(e.target.value)))}
                  style={fieldStyle}
                />
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
              <select
                value={offerItemId}
                onChange={(e) => setOfferItemId(e.target.value)}
                style={fieldStyle}
              >
                <option value="">渡すアイテムなし</option>
                {inventoryItems.map(([id, cnt]) => (
                  <option key={id} value={id}>
                    {itemById(id)?.name ?? id} (所持 {cnt})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={99}
                value={offerItemCount}
                onChange={(e) => setOfferItemCount(Math.max(1, Number(e.target.value)))}
                style={fieldStyle}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
              <input
                placeholder="要求アイテムID (任意 例: iron_ingot)"
                value={reqItemId}
                onChange={(e) => setReqItemId(e.target.value)}
                style={fieldStyle}
              />
              <input
                type="number"
                min={1}
                max={99}
                value={reqItemCount}
                onChange={(e) => setReqItemCount(Math.max(1, Number(e.target.value)))}
                style={fieldStyle}
              />
            </div>
            <input
              placeholder="メモ (任意)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={fieldStyle}
            />
            <button
              type="button"
              disabled={busy || !targetPid}
              style={{ ...btn, background: "#0284c7", borderColor: "#38bdf8" }}
              onClick={() =>
                runTrade(
                  {
                    action: "create_offer",
                    targetPresenceId: targetPid,
                    offerCoins,
                    requestCoins,
                    offerItems: offerItemId ? [{ itemId: offerItemId, count: offerItemCount }] : [],
                    requestItems: reqItemId
                      ? [{ itemId: reqItemId.trim(), count: reqItemCount }]
                      : [],
                    note,
                  },
                  "P2Pオファーを送信しました！",
                )
              }
            >
              エスクロー付きで取引提案を送信
            </button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <strong>受信・送信済みオファー</strong>
            {offers.length === 0 && (
              <span style={{ opacity: 0.7 }}>オファー履歴はありません。</span>
            )}
            {offers.map((o) => {
              const incoming = o.toKey === selfKey;
              return (
                <div
                  key={o.id}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(148,163,184,0.22)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <WbIcon
                        name={incoming ? "inbox" : "send"}
                        size={13}
                        color={incoming ? "#38bdf8" : "#94a3b8"}
                      />
                      {incoming ? `${o.fromName} からの提案` : `${o.toName} へ送信`} [{o.status}]
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.85 }}>
                      提供: ¥{o.offerCoins.toLocaleString()}{" "}
                      {o.offerItems
                        .map((i) => `${itemById(i.itemId)?.name ?? i.itemId}×${i.count}`)
                        .join(", ")}
                      {" ｜ "}
                      要求: ¥{o.requestCoins.toLocaleString()}{" "}
                      {o.requestItems
                        .map((i) => `${itemById(i.itemId)?.name ?? i.itemId}×${i.count}`)
                        .join(", ")}
                    </div>
                  </div>
                  {o.status === "pending" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      {incoming ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            style={{ ...btn, background: "#15803d" }}
                            onClick={() =>
                              runTrade(
                                { action: "accept_offer", offerId: o.id },
                                "取引が成立しました！",
                              )
                            }
                          >
                            承認
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            style={{ ...btn, background: "#991b1b" }}
                            onClick={() =>
                              runTrade({ action: "decline_offer", offerId: o.id }, "辞退しました")
                            }
                          >
                            辞退
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          style={btn}
                          onClick={() =>
                            runTrade(
                              { action: "cancel_offer", offerId: o.id },
                              "取消＆返金しました",
                            )
                          }
                        >
                          取消
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "send" && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(148,163,184,0.2)",
            display: "grid",
            gap: 10,
          }}
        >
          <strong style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <WbIcon name="bolt" size={14} color="#facc15" /> MetroPay 即時P2P送金
          </strong>
          <select
            value={targetPid}
            onChange={(e) => setTargetPid(e.target.value)}
            style={fieldStyle}
          >
            {players.length === 0 && <option value="">オンライン市民がいません</option>}
            {players.map((p) => (
              <option key={p.presenceId} value={p.presenceId}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={10}
            value={sendAmount}
            onChange={(e) => setSendAmount(Math.max(10, Number(e.target.value)))}
            style={fieldStyle}
          />
          <button
            type="button"
            disabled={busy || !targetPid}
            style={{ ...btn, background: "#16a34a" }}
            onClick={() =>
              runTrade(
                { action: "send_coins", targetPresenceId: targetPid, amount: sendAmount },
                `¥${sendAmount.toLocaleString()} を送金しました！`,
              )
            }
          >
            送金する
          </button>
        </div>
      )}

      {tab === "contracts" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(148,163,184,0.2)",
              display: "grid",
              gap: 8,
            }}
          >
            <strong>新規コントラクトを発注 (報酬エスクロー)</strong>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
              <select
                value={cCat}
                onChange={(e) => setCCat(e.target.value as ContractCategory)}
                style={fieldStyle}
              >
                <option value="delivery">資材調達・納品</option>
                <option value="craft_machine">機械製造</option>
                <option value="legal_bail">法務・弁護依頼</option>
                <option value="bounty">治安・指名手配</option>
              </select>
              <input
                placeholder="依頼タイトル (例: 銅インゴット10本急募)"
                value={cTitle}
                onChange={(e) => setCTitle(e.target.value)}
                style={fieldStyle}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
              <input
                placeholder="納品アイテムID (任意)"
                value={cItemId}
                onChange={(e) => setCItemId(e.target.value)}
                style={fieldStyle}
              />
              <input
                type="number"
                min={0}
                max={99}
                value={cItemCount}
                onChange={(e) => setCItemCount(Math.max(0, Number(e.target.value)))}
                style={fieldStyle}
              />
              <input
                type="number"
                min={100}
                value={cReward}
                onChange={(e) => setCReward(Math.max(100, Number(e.target.value)))}
                style={fieldStyle}
              />
            </div>
            <button
              type="button"
              disabled={busy || !cTitle.trim()}
              style={{ ...btn, background: "#0284c7" }}
              onClick={() =>
                runContract(
                  {
                    action: "create",
                    category: cCat,
                    title: cTitle,
                    itemId: cItemCount > 0 ? cItemId.trim() : null,
                    itemCount: cItemCount,
                    rewardCoins: cReward,
                  },
                  "契約を掲示板に公開しました！",
                )
              }
            >
              報酬 ¥{cReward.toLocaleString()} を預託して募集開始
            </button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {contracts.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(148,163,184,0.22)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {c.title}{" "}
                    <span style={{ color: "#38bdf8" }}>¥{c.rewardCoins.toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.78 }}>
                    発注: {c.posterName} ・ 状態: {c.status}
                    {c.itemId
                      ? ` ・ 納品: ${itemById(c.itemId)?.name ?? c.itemId} ×${c.itemCount}`
                      : ""}
                    {c.assigneeName ? ` ・ 担当: ${c.assigneeName}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {c.status === "open" && c.posterKey === selfKey && (
                    <button
                      type="button"
                      disabled={busy}
                      style={btn}
                      onClick={() =>
                        runContract({ action: "cancel", contractId: c.id }, "取り消しました")
                      }
                    >
                      取下
                    </button>
                  )}
                  {c.status === "open" && c.posterKey !== selfKey && (
                    <button
                      type="button"
                      disabled={busy}
                      style={btn}
                      onClick={() =>
                        runContract({ action: "claim", contractId: c.id }, "受注しました！")
                      }
                    >
                      受注
                    </button>
                  )}
                  {(c.status === "open" || (c.status === "claimed" && c.assigneeKey === selfKey)) &&
                    c.posterKey !== selfKey && (
                      <button
                        type="button"
                        disabled={busy}
                        style={{ ...btn, background: "#15803d" }}
                        onClick={() =>
                          runContract(
                            { action: "complete", contractId: c.id },
                            "契約を達成し報酬を受け取りました！",
                          )
                        }
                      >
                        納品・完了
                      </button>
                    )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
