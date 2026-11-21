"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EconomyOp } from "@/lib/worldbox/economy/economy-bridge";
import { onEconomyApplied } from "@/lib/worldbox/economy/economy-push";
import { ITEMS, itemById, recipeById, sellPrice } from "@/lib/worldbox/economy/items";
import type { StationKind } from "@/lib/worldbox/world/tiles";
import {
  dailyPriceFor,
  dailyStockForGenre,
  genreById,
  isShopExcluded,
  itemsForGenre,
  shopDayKeyOf,
  type ShopGenreId,
} from "@/lib/worldbox/economy/shops";
import type { LobbyStation } from "@/lib/worldbox/world/lobby";
import {
  ENHANCE_BASE_COST,
  ENHANCE_MATERIALS,
  ENHANCE_MAX_LEVEL,
  type PlayerProfile,
} from "@/lib/worldbox/player/profile";
import type { SaveSpace } from "@/lib/worldbox/core/save";
import { playWbSe, type WbSeName } from "@/lib/worldbox/media/sound";
import { ItemAnnotation, ItemIcon, ItemSlot, ItemSlotGrid } from "./ItemSlotGrid";

const ACTION_SE: Record<string, WbSeName> = {
  buy: "buy",
  sell: "sell",
  craft: "craft",
  eat: "harvest",
  enhance: "success",
};

type Tab = "bag" | "shop" | "sell" | "craft" | "bank";
type LoadState = "loading" | "ready" | "guest" | "unavailable";

const ERROR_LABEL: Record<string, string> = {
  not_enough_coins: "お金が足りません",
  not_enough_items: "アイテムが足りません",
  hunger_full: "もう満腹です",
  work_disabled: "労働は廃止されました",
  steal_disabled: "steal は廃止されました",
  unauthorized: "ログインが必要です",
  guest_not_allowed: "ゲストはお金の機能を使えません",
  discord_required: "お金の移動には Discord ログインが必要です",
  economy_unavailable: "いま経済ブリッジを使えません",
  economy_failed: "お金の移動を受け付けられませんでした",
  invalid_recipient: "相手のIDが不正です",
  self_transfer: "自分には送れません",
  invalid_amount: "金額が不正です",
  not_at_shop: "ショップの前にいません",
  wrong_shop: "この店では買えません",
  not_sold: "販売していません",
  not_at_workbench: "作業台の前にいません",
  not_at_bank: "銀行の前にいません",
};

const OP_KIND_LABEL: Record<EconomyOp["kind"], string> = {
  spend: "支払い",
  earn: "受取",
  transfer: "送金",
  steal: "steal",
  gamble: "カジノ",
};
const OP_STATUS_LABEL: Record<EconomyOp["status"], string> = {
  pending: "処理中",
  done: "完了",
  failed: "失敗",
};

const panel: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(600px, calc(100% - 20px))",
  maxHeight: "calc(100% - 20px)",
  overflowY: "auto",
  overscrollBehavior: "contain",
  touchAction: "pan-y",
  padding: 12,
  borderRadius: 12,
  zIndex: 6,
  textAlign: "left",
  border: "1px solid rgba(255,255,255,0.22)",
  background: "rgba(10,12,18,0.93)",
  color: "#f2f2f2",
  boxShadow: "0 12px 36px rgba(0,0,0,0.5)",
};
const btn: React.CSSProperties = {
  minHeight: 36,
  padding: "4px 12px",
  borderRadius: 10,
  cursor: "pointer",
  border: "1px solid rgba(255,255,255,0.25)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  touchAction: "manipulation",
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
};
const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  padding: "7px 0",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

function hueForItem(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

function mixColorFor(set: Record<string, number>): { liquid: string; smoke: string } {
  const entries = Object.entries(set);
  if (entries.length === 0) {
    return { liquid: "rgba(120,130,150,0.5)", smoke: "rgba(160,165,175,0.35)" };
  }
  let x = 0;
  let y = 0;
  for (const [id, n] of entries) {
    const rad = (hueForItem(id) * Math.PI) / 180;
    x += Math.cos(rad) * n;
    y += Math.sin(rad) * n;
  }
  const hue = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
  return {
    liquid: `hsla(${hue}, 65%, 50%, 0.85)`,
    smoke: `hsla(${hue}, 45%, 65%, 0.45)`,
  };
}

export default function WorldBoxEconomyPanel({
  space,
  station,
  genre,
  worldStationKinds,
  onClose,
}: {
  space: SaveSpace;
  station: LobbyStation | null;
  genre: ShopGenreId | null;
  worldStationKinds?: string;
  onClose: () => void;
}) {
  const inLobby = space === "lobby";
  const shopGenre: ShopGenreId | null = station === "smith" ? "smith" : genre;
  const atShop = inLobby && (station === "shop" || station === "smith");
  const atSellShop = inLobby && station === "sell";
  const atLobbySmith = space !== "world" && station === "smith";
  const worldKinds = new Set((worldStationKinds ?? "").split(",").filter(Boolean));
  const canWork = (kind: StationKind) => atLobbySmith || worldKinds.has(kind);
  const atWorkbench = atLobbySmith || worldKinds.size > 0;
  const atBank = inLobby && station === "bank";
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [tab, setTab] = useState<Tab>("bag");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [ops, setOps] = useState<EconomyOp[]>([]);
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [bankData, setBankData] = useState<{
    account: { deposit: number; loanPrincipal: number; accruedInterest: number };
    credit: {
      totalCollateral: number;
      maxBorrow: number;
      availableBorrow: number;
      debt: number;
      ltv: number;
    };
    rates: { depositApr: number; borrowApr: number; utilization: number };
    totals: { totalDeposits: number; totalLoans: number };
  } | null>(null);
  const [bankAmtStr, setBankAmtStr] = useState("5000");
  const [bagSel, setBagSel] = useState<string | null>(null);
  const [shopSel, setShopSel] = useState<string | null>(null);
  const [sellSel, setSellSel] = useState<string | null>(null);
  const [enhanceSel, setEnhanceSel] = useState<string | null>(null);
  const [enhanceFlashId, setEnhanceFlashId] = useState<string | null>(null);
  const [enhanceFlashOn, setEnhanceFlashOn] = useState(false);
  const enhanceFlashTimersRef = useRef<number[]>([]);
  const [craftSet, setCraftSet] = useState<Record<string, number>>({});
  const [craftBusy, setCraftBusy] = useState(false);
  const [craftPhase, setCraftPhase] = useState(0);
  const [craftHint, setCraftHint] = useState<"exact" | "near" | "far" | null>(null);
  const [craftResult, setCraftResult] = useState<string | null>(null);
  const [craftResultKey, setCraftResultKey] = useState(0);
  const [discSel, setDiscSel] = useState<string | null>(null);
  const craftTimerRef = useRef<number | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    if (atSellShop) setTab("sell");
  }, [atSellShop]);

  const refreshBank = useCallback(async () => {
    try {
      const res = await fetch("/api/worldbox/bank", { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const data = (await res.json()) as {
        guest?: boolean;
        account?: { deposit: number; loanPrincipal: number; accruedInterest: number };
        credit?: {
          totalCollateral: number;
          maxBorrow: number;
          availableBorrow: number;
          debt: number;
          ltv: number;
        };
        rates?: { depositApr: number; borrowApr: number; utilization: number };
        totals?: { totalDeposits: number; totalLoans: number };
      };
      if (aliveRef.current && data.account && data.credit && data.rates && data.totals) {
        setBankData({
          account: data.account,
          credit: data.credit,
          rates: data.rates,
          totals: data.totals,
        });
      }
    } catch {
      /* 銀行が読めなくても送金や他機能は使える */
    }
  }, []);

  const refreshBridge = useCallback(async () => {
    try {
      const res = await fetch("/api/worldbox/economy", { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const data = (await res.json()) as { balance: number; ops: EconomyOp[] };
      if (aliveRef.current) {
        setBalance(data.balance);
        setOps(Array.isArray(data.ops) ? data.ops : []);
      }
    } catch {
      /* ブリッジが読めなくても他の機能は使える */
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/worldbox/profile", { headers: { Accept: "application/json" } });
      if (res.status === 401) {
        if (aliveRef.current) setLoadState("guest");
        return;
      }
      if (!res.ok) {
        if (aliveRef.current) setLoadState("unavailable");
        return;
      }
      const data = (await res.json()) as { profile: PlayerProfile };
      if (aliveRef.current) {
        setProfile(data.profile);
        setLoadState("ready");
      }
    } catch {
      if (aliveRef.current) setLoadState("unavailable");
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refreshProfile();
    void refreshBridge();
    void refreshBank();
    const off = onEconomyApplied(() => {
      void refreshProfile();
      void refreshBridge();
      void refreshBank();
    });
    return () => {
      aliveRef.current = false;
      off();
      if (craftTimerRef.current !== null) window.clearInterval(craftTimerRef.current);
      craftTimerRef.current = null;
      for (const t of enhanceFlashTimersRef.current) window.clearTimeout(t);
      enhanceFlashTimersRef.current = [];
    };
  }, [refreshProfile, refreshBridge, refreshBank]);

  const act = async (
    payload: Record<string, unknown>,
    describe: (data: Record<string, unknown>) => string,
  ) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/worldbox/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
        profile?: PlayerProfile;
        balance?: number;
        error?: string;
      };
      if (!res.ok || !data.profile) {
        setMsg(ERROR_LABEL[data.error ?? ""] ?? "できませんでした");
        return;
      }
      setProfile(data.profile);
      if (typeof data.balance === "number") setBalance(data.balance);
      setMsg(describe(data));
      const se = ACTION_SE[String(payload.action ?? "")];
      if (se) playWbSe(se);
      if (typeof data.balance !== "number") void refreshBridge();
    } catch {
      setMsg("できませんでした");
    } finally {
      setBusy(false);
    }
  };

  const triggerEnhanceFlash = (itemId: string) => {
    for (const t of enhanceFlashTimersRef.current) window.clearTimeout(t);
    enhanceFlashTimersRef.current = [];
    setEnhanceFlashId(itemId);
    setEnhanceFlashOn(true);
    enhanceFlashTimersRef.current.push(
      window.setTimeout(() => {
        if (aliveRef.current) setEnhanceFlashOn(false);
      }, 30),
      window.setTimeout(() => {
        if (aliveRef.current) setEnhanceFlashId(null);
      }, 700),
    );
  };

  const sendTransfer = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/worldbox/economy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action: "transfer",
          toDiscordId: transferTo.trim(),
          amount: Number(transferAmount),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        balance?: number;
        op?: EconomyOp;
      };
      if (!res.ok) {
        setMsg(ERROR_LABEL[data.error ?? ""] ?? "送金を受け付けられませんでした");
        return;
      }
      if (typeof data.balance === "number") setBalance(data.balance);
      if (data.op) {
        const nextOp = data.op;
        setOps((prev) => [nextOp, ...prev.filter((o) => o.id !== nextOp.id)].slice(0, 20));
      }
      setTransferTo("");
      setTransferAmount("");
      setMsg("送金を受け付けました");
      playWbSe("coin");
      if (typeof data.balance !== "number") void refreshBridge();
    } catch {
      setMsg("送金を受け付けられませんでした");
    } finally {
      setBusy(false);
    }
  };

  const bankAction = async (action: "deposit" | "withdraw" | "borrow" | "repay", label: string) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/worldbox/bank", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action, amount: Math.trunc(Number(bankAmtStr) || 0) }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        balance?: number;
        account?: { deposit: number; loanPrincipal: number; accruedInterest: number };
        credit?: {
          totalCollateral: number;
          maxBorrow: number;
          availableBorrow: number;
          debt: number;
          ltv: number;
        };
      };
      if (!res.ok) {
        setMsg(
          ERROR_LABEL[data.error ?? ""] ?? `銀行処理に失敗しました (${data.error ?? res.status})`,
        );
        return;
      }
      if (typeof data.balance === "number") setBalance(data.balance);
      if (data.account && data.credit) {
        const nextAcc = data.account;
        const nextCredit = data.credit;
        setBankData((prev) => (prev ? { ...prev, account: nextAcc, credit: nextCredit } : prev));
      }
      setMsg(`${label}が完了しました`);
      playWbSe("coin");
      void refreshBank();
    } catch {
      setMsg("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const addToCraft = (itemId: string) => {
    if (craftBusy || !profile) return;
    setCraftResult(null);
    setCraftSet((prev) => {
      const cur = prev[itemId] ?? 0;
      if (cur >= 6) return prev;
      if (!(itemId in prev) && Object.keys(prev).length >= 4) return prev;
      if (cur + 1 > (profile.items[itemId] ?? 0)) return prev;
      return { ...prev, [itemId]: cur + 1 };
    });
  };
  const removeFromCraft = (itemId: string) => {
    if (craftBusy) return;
    setCraftSet((prev) => {
      const cur = prev[itemId] ?? 0;
      if (cur <= 0) return prev;
      const next = { ...prev };
      if (cur === 1) delete next[itemId];
      else next[itemId] = cur - 1;
      return next;
    });
  };
  const finishCraft = (pending: {
    profile: PlayerProfile;
    craftedId: string;
    rareId: string | null;
  }) => {
    setProfile(pending.profile);
    setCraftSet({});
    setCraftPhase(0);
    setCraftBusy(false);
    setBusy(false);
    setCraftResult(pending.craftedId);
    setCraftResultKey((k) => k + 1);
    const name = itemById(pending.craftedId)?.name ?? "アイテム";
    const rareName = pending.rareId ? itemById(pending.rareId)?.name : null;
    setMsg(rareName ? `${name}ができた（${rareName}も）` : `${name}ができた`);
    playWbSe("success");
    void refreshBridge();
  };
  const runCraft = async () => {
    const inputs = { ...craftSet };
    if (Object.keys(inputs).length === 0 || craftBusy) return;
    setCraftBusy(true);
    setBusy(true);
    setMsg("");
    setCraftResult(null);
    setCraftHint(null);
    setCraftPhase(0);
    playWbSe("craft");
    try {
      const res = await fetch("/api/worldbox/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "craft", inputs }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
        profile?: PlayerProfile;
        error?: string;
      };
      if (!res.ok || !data.profile) {
        setMsg(ERROR_LABEL[data.error ?? ""] ?? "できませんでした");
        setCraftBusy(false);
        setBusy(false);
        return;
      }
      setCraftHint(
        data.hint === "exact" || data.hint === "near" || data.hint === "far" ? data.hint : null,
      );
      const pending = {
        profile: data.profile,
        craftedId: typeof data.craftedId === "string" ? data.craftedId : "mystery_lump",
        rareId: typeof data.rareId === "string" ? data.rareId : null,
      };
      const startedAt = Date.now();
      craftTimerRef.current = window.setInterval(() => {
        const p = Math.min(1, (Date.now() - startedAt) / 2400);
        setCraftPhase(p);
        if (p >= 1) {
          if (craftTimerRef.current !== null) window.clearInterval(craftTimerRef.current);
          craftTimerRef.current = null;
          if (aliveRef.current) finishCraft(pending);
        }
      }, 80);
    } catch {
      setMsg("できませんでした");
      setCraftBusy(false);
      setBusy(false);
    }
  };

  const closeBtn = (
    <button type="button" style={btn} onClick={onClose}>
      閉じる
    </button>
  );
  const panelHead = (text: string) => (
    <div style={panel} className="wb-panel" data-wb-se="self">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span>{text}</span>
        <span style={{ flex: 1 }} />
        {closeBtn}
      </div>
    </div>
  );
  if (loadState === "loading") return panelHead("読み込み中…");
  if (loadState === "guest") {
    return panelHead("経済機能（かばん・ショップ・製造）を使うにはログインが必要です。");
  }
  if (loadState === "unavailable" || !profile) {
    return panelHead("いまは経済機能を使えません。");
  }

  const owned = ITEMS.filter((item) => (profile.items[item.id] ?? 0) > 0);
  const shopDayKey = shopDayKeyOf(Date.now());
  const shopItems = shopGenre
    ? dailyStockForGenre(shopGenre, shopDayKey)
    : ITEMS.filter((item) => !isShopExcluded(item));
  const priceOf = (item: (typeof ITEMS)[number]): number =>
    shopGenre ? dailyPriceFor(item, shopDayKey) : item.price;
  const bagSelItem = owned.find((item) => item.id === bagSel) ?? null;
  const shopSelItem = shopItems.find((item) => item.id === shopSel) ?? null;
  const sellSelItem = owned.find((item) => item.id === sellSel) ?? null;
  const enhanceTools = ITEMS.filter((item) => (profile.items[item.id] ?? 0) > 0 && item.tool);
  const enhanceSelItem = enhanceTools.find((item) => item.id === enhanceSel) ?? null;
  const discovered = (profile.discoveredRecipes ?? [])
    .map((id) => recipeById(id))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const discRecipe = discovered.find((r) => r.id === discSel) ?? null;
  const tabAllowed = (t: Tab): boolean =>
    t === "shop"
      ? atShop && shopItems.length > 0
      : t === "sell"
        ? atSellShop
        : t === "craft"
          ? atWorkbench
          : t === "bank"
            ? atBank
            : true;
  const activeTab: Tab = tabAllowed(tab) ? tab : "bag";
  const tabBtn = (t: Tab, label: string) => (
    <button
      type="button"
      style={{
        ...btn,
        ...(activeTab === t
          ? { background: "rgba(255,210,62,0.18)", borderColor: "rgba(255,210,62,0.55)" }
          : {}),
      }}
      onClick={() => setTab(t)}
      aria-pressed={activeTab === t}
    >
      {label}
    </button>
  );

  return (
    <div style={panel} className="wb-panel" data-wb-se="self">
      {/* ヘッダー（残高・タブ・閉じる）はスクロールに追随させず常時表示する。
          空腹度・HP はステージ左上の常時バーが正で、このパネルには出さない
          （ショップ利用中に要らない表示としてユーザー指示で撤去）。 */}
      <div
        style={{
          position: "sticky",
          top: -12,
          zIndex: 3,
          margin: "-12px -12px 0",
          padding: "12px 12px 8px",
          background: "rgba(10,12,18,0.98)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <strong>経済</strong>
          <span>
            残高 <strong>{balance === null ? "—" : balance}</strong> 円
          </span>
          <span style={{ flex: 1 }} />
          {closeBtn}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {tabBtn("bag", "かばん")}
          {atShop &&
            shopItems.length > 0 &&
            tabBtn("shop", shopGenre ? (genreById(shopGenre)?.name ?? "ショップ") : "ショップ")}
          {atSellShop && tabBtn("sell", "売却")}
          {atWorkbench && tabBtn("craft", "製造")}
          {atBank && tabBtn("bank", "銀行")}
        </div>
      </div>
      {activeTab === "bag" && (
        <div style={{ marginTop: 6 }}>
          {owned.length === 0 && <p className="muted">かばんは空です</p>}
          <ItemSlotGrid>
            {owned.map((item) => (
              <ItemSlot
                key={item.id}
                itemId={item.id}
                count={profile.items[item.id]}
                selected={bagSel === item.id}
                onClick={() => setBagSel(item.id)}
              />
            ))}
          </ItemSlotGrid>
          {bagSelItem && (
            <ItemAnnotation itemId={bagSelItem.id}>
              {bagSelItem.hunger || bagSelItem.buff ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  {bagSelItem.hunger ? (
                    <span className="muted">空腹+{bagSelItem.hunger}</span>
                  ) : null}
                </div>
              ) : null}
              {(bagSelItem.hunger || bagSelItem.buff) && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <button
                    type="button"
                    style={btn}
                    disabled={busy}
                    onClick={() =>
                      void act(
                        { action: "eat", itemId: bagSelItem.id },
                        () => `${bagSelItem.name}を使った`,
                      )
                    }
                  >
                    食べる
                  </button>
                </div>
              )}
            </ItemAnnotation>
          )}
        </div>
      )}

      {activeTab === "shop" && atShop && (
        <div style={{ marginTop: 6 }}>
          <ItemSlotGrid>
            {shopItems.map((item) => (
              <ItemSlot
                key={item.id}
                itemId={item.id}
                badge={`${priceOf(item)}`}
                selected={shopSel === item.id}
                onClick={() => setShopSel(item.id)}
              />
            ))}
          </ItemSlotGrid>
          {shopSelItem && (
            <ItemAnnotation itemId={shopSelItem.id}>
              {shopSelItem.hunger ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  <span className="muted">空腹度 +{shopSelItem.hunger}</span>
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <button
                  type="button"
                  style={btn}
                  disabled={busy}
                  onClick={() =>
                    void act(
                      { action: "buy", itemId: shopSelItem.id },
                      () => `${shopSelItem.name}を買った`,
                    )
                  }
                >
                  買う（{priceOf(shopSelItem)} 円）
                </button>
              </div>
            </ItemAnnotation>
          )}
        </div>
      )}

      {activeTab === "sell" && atSellShop && (
        <div style={{ marginTop: 6 }}>
          {owned.length === 0 && <p className="muted">売れるものがありません</p>}
          <ItemSlotGrid>
            {owned.map((item) => (
              <ItemSlot
                key={item.id}
                itemId={item.id}
                count={profile.items[item.id]}
                badge={`${sellPrice(item)}`}
                selected={sellSel === item.id}
                onClick={() => setSellSel(item.id)}
              />
            ))}
          </ItemSlotGrid>
          {sellSelItem && (
            <ItemAnnotation itemId={sellSelItem.id}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <button
                  type="button"
                  style={btn}
                  disabled={busy}
                  onClick={() =>
                    void act(
                      { action: "sell", itemId: sellSelItem.id },
                      () =>
                        `${sellSelItem.name}を売った（代金 ${sellPrice(sellSelItem)} 円は処理中）`,
                    )
                  }
                >
                  売る（{sellPrice(sellSelItem)}）
                </button>
              </div>
            </ItemAnnotation>
          )}
        </div>
      )}

      {activeTab === "craft" &&
        (() => {
          const setEntries = Object.entries(craftSet);
          const totalSet = setEntries.reduce((a, [, n]) => a + n, 0);
          const mixed = mixColorFor(craftSet);
          const smokeColor = craftBusy
            ? craftHint === "exact"
              ? "rgba(255,210,62,0.8)"
              : craftHint === "near"
                ? "rgba(255,150,80,0.65)"
                : craftHint === "far"
                  ? "rgba(125,125,130,0.6)"
                  : mixed.smoke
            : mixed.smoke;
          return (
            <div style={{ marginTop: 6 }}>
              <style>{`@keyframes wbCraftPop { 0% { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.4); } 60% { opacity: 1; transform: translateX(-50%) translateY(-4px) scale(1.15); } 100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } } @keyframes wbCraftShake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }`}</style>
              {/* 台: 煙/液体の表現エリア + 素材スロット4枠 + 成果物の出現 */}
              <div
                style={{
                  position: "relative",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 12,
                  padding: "10px 10px 12px",
                  background: "rgba(255,255,255,0.03)",
                  overflow: "hidden",
                }}
              >
                <div aria-hidden style={{ position: "relative", height: 64 }}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      style={{
                        position: "absolute",
                        left: `${38 + i * 12}%`,
                        bottom: 6,
                        width: 26 + i * 6,
                        height: 26 + i * 6,
                        borderRadius: "50%",
                        background: smokeColor,
                        filter: "blur(6px)",
                        opacity: craftBusy ? 0.55 + craftPhase * 0.45 : totalSet > 0 ? 0.6 : 0.3,
                        transform: `translateY(${craftBusy ? -craftPhase * 22 - i * 4 : -i * 3}px) scale(${1 + (craftBusy ? craftPhase * 0.7 : 0) + i * 0.15})`,
                        transition: "background 0.4s, transform 0.3s, opacity 0.3s",
                      }}
                    />
                  ))}
                  <span
                    style={{
                      position: "absolute",
                      left: "50%",
                      bottom: 0,
                      transform: "translateX(-50%)",
                      width: 150,
                      height: 16,
                      borderRadius: "50%",
                      background: mixed.liquid,
                      transition: "background 0.4s",
                    }}
                  />
                  {craftResult && (
                    <span
                      key={craftResultKey}
                      style={{
                        position: "absolute",
                        left: "50%",
                        bottom: 10,
                        transform: "translateX(-50%)",
                        animation: "wbCraftPop 0.45s ease-out",
                      }}
                    >
                      <ItemIcon id={craftResult} size={34} />
                    </span>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "center",
                    marginTop: 8,
                    ...(craftBusy ? { animation: "wbCraftShake 0.3s infinite" } : {}),
                  }}
                >
                  {[0, 1, 2, 3].map((i) => {
                    const entry = setEntries[i];
                    if (!entry) {
                      return (
                        <span
                          key={i}
                          aria-hidden
                          style={{
                            width: 48,
                            height: 48,
                            minWidth: 48,
                            minHeight: 48,
                            borderRadius: 10,
                            border: "1px dashed rgba(255,255,255,0.3)",
                            background: "rgba(255,255,255,0.03)",
                            display: "block",
                            boxSizing: "border-box",
                          }}
                        />
                      );
                    }
                    const [id, n] = entry;
                    return (
                      <ItemSlot
                        key={id}
                        itemId={id}
                        count={n}
                        disabled={craftBusy}
                        onClick={() => removeFromCraft(id)}
                      />
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
                  <button
                    type="button"
                    style={btn}
                    disabled={busy || totalSet === 0}
                    onClick={() => void runCraft()}
                  >
                    製造を開始
                  </button>
                </div>
                {craftBusy && (
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      background: "rgba(255,255,255,0.12)",
                      marginTop: 10,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.round(craftPhase * 100)}%`,
                        height: "100%",
                        background: smokeColor,
                        transition: "width 0.08s linear",
                      }}
                    />
                  </div>
                )}
              </div>
              {/* かばんから素材をセットする（表示個数は所持数 − セット済み数） */}
              <div style={{ marginTop: 10 }}>
                {owned.length === 0 && <p className="muted">かばんは空です</p>}
                <ItemSlotGrid>
                  {owned.map((item) => {
                    const remain = (profile.items[item.id] ?? 0) - (craftSet[item.id] ?? 0);
                    if (remain <= 0) return null;
                    return (
                      <ItemSlot
                        key={item.id}
                        itemId={item.id}
                        count={remain}
                        disabled={craftBusy}
                        onClick={() => addToCraft(item.id)}
                      />
                    );
                  })}
                </ItemSlotGrid>
              </div>
            </div>
          );
        })()}

      {activeTab === "craft" && discovered.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <strong style={{ fontSize: 13 }}>発見した組み合わせ</strong>
          <div style={{ marginTop: 6 }}>
            <ItemSlotGrid>
              {discovered.map((recipe) => (
                <ItemSlot
                  key={recipe.id}
                  itemId={recipe.output}
                  count={recipe.outputCount > 1 ? recipe.outputCount : undefined}
                  selected={discSel === recipe.id}
                  onClick={() => setDiscSel(recipe.id)}
                />
              ))}
            </ItemSlotGrid>
            {discRecipe && (
              <ItemAnnotation itemId={discRecipe.output}>
                <div style={{ marginTop: 6 }}>
                  <span className="muted">
                    {Object.entries(discRecipe.inputs)
                      .map(([id, n]) => `${itemById(id)?.name ?? id}×${n}`)
                      .join(" + ")}
                  </span>
                </div>
              </ItemAnnotation>
            )}
          </div>
        </div>
      )}

      {activeTab === "craft" && canWork("enhance") && (
        <div
          style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.14)", paddingTop: 8 }}
        >
          <strong style={{ fontSize: 13 }}>道具の改良</strong>
          <div style={{ marginTop: 6 }}>
            <ItemSlotGrid>
              {enhanceTools.map((item) => {
                const level = profile.enhance[item.id] ?? 0;
                const flashing = enhanceFlashId === item.id;
                return (
                  <span
                    key={item.id}
                    style={{
                      display: "inline-flex",
                      borderRadius: 10,
                      background:
                        flashing && enhanceFlashOn ? "rgba(255,210,62,0.35)" : "transparent",
                      transition: "background 0.6s ease-out",
                    }}
                  >
                    <ItemSlot
                      itemId={item.id}
                      count={profile.items[item.id]}
                      badge={level > 0 ? `+${level}` : undefined}
                      selected={enhanceSel === item.id}
                      onClick={() => setEnhanceSel(item.id)}
                    />
                  </span>
                );
              })}
            </ItemSlotGrid>
            {enhanceSelItem &&
              (() => {
                const level = profile.enhance[enhanceSelItem.id] ?? 0;
                const material = enhanceSelItem.tier
                  ? ENHANCE_MATERIALS[enhanceSelItem.tier]
                  : undefined;
                const flashing = enhanceFlashId === enhanceSelItem.id;
                return (
                  <div
                    style={{
                      borderRadius: 10,
                      background:
                        flashing && enhanceFlashOn ? "rgba(255,210,62,0.35)" : "transparent",
                      transition: "background 0.6s ease-out",
                    }}
                  >
                    <ItemAnnotation itemId={enhanceSelItem.id}>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          marginTop: 6,
                          alignItems: "center",
                        }}
                      >
                        <span>{"+".repeat(level) || "未改良"}</span>
                        {level >= ENHANCE_MAX_LEVEL ? (
                          <span className="muted">最大</span>
                        ) : material ? (
                          <span className="muted">
                            {itemById(material.itemId)?.name}×{material.count}（所持{" "}
                            {profile.items[material.itemId] ?? 0}）・
                            {ENHANCE_BASE_COST * (level + 1)} 円
                          </span>
                        ) : null}
                      </div>
                      {level < ENHANCE_MAX_LEVEL && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                          <button
                            type="button"
                            style={btn}
                            disabled={busy}
                            onClick={() =>
                              void act({ action: "enhance", itemId: enhanceSelItem.id }, () => {
                                triggerEnhanceFlash(enhanceSelItem.id);
                                return `${enhanceSelItem.name}を改良した`;
                              })
                            }
                          >
                            改良する
                          </button>
                        </div>
                      )}
                    </ItemAnnotation>
                  </div>
                );
              })()}
          </div>
        </div>
      )}

      {activeTab === "bank" && (
        <div style={{ marginTop: 6 }}>
          {bankData && (
            <div
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.04)",
                marginBottom: 10,
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                銀行口座（預金金利 {(bankData.rates.depositApr * 100).toFixed(1)}% ／ 借入金利{" "}
                {(bankData.rates.borrowApr * 100).toFixed(1)}%）
              </div>
              <div>
                普通預金: <strong>{bankData.account.deposit.toLocaleString()} 円</strong> ／
                借入残高:{" "}
                <strong>
                  {(
                    bankData.account.loanPrincipal + bankData.account.accruedInterest
                  ).toLocaleString()}{" "}
                  円
                </strong>
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                総担保評価（預金＋株式＋外貨）: {bankData.credit.totalCollateral.toLocaleString()}{" "}
                円 ／ 追加借入枠（LTV 50%）:{" "}
                <strong>{bankData.credit.availableBorrow.toLocaleString()} 円</strong>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                <input
                  type="number"
                  min={1}
                  placeholder="金額"
                  value={bankAmtStr}
                  onChange={(e) => setBankAmtStr(e.target.value)}
                  style={{
                    width: 120,
                    minHeight: 36,
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.25)",
                    background: "rgba(255,255,255,0.06)",
                    color: "inherit",
                  }}
                />
                <button
                  type="button"
                  style={btn}
                  disabled={busy}
                  onClick={() => void bankAction("deposit", "預け入れ")}
                >
                  預ける
                </button>
                <button
                  type="button"
                  style={btn}
                  disabled={busy}
                  onClick={() => void bankAction("withdraw", "引き出し")}
                >
                  引き出す
                </button>
                <button
                  type="button"
                  style={btn}
                  disabled={busy}
                  onClick={() => void bankAction("borrow", "担保融資の借入")}
                >
                  借りる
                </button>
                <button
                  type="button"
                  style={btn}
                  disabled={busy}
                  onClick={() => void bankAction("repay", "返済")}
                >
                  返済
                </button>
              </div>
            </div>
          )}
          <div style={row}>
            <strong>送金</strong>
            <input
              type="text"
              inputMode="numeric"
              placeholder="相手の Discord ID"
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              style={{
                flex: "1 1 160px",
                minHeight: 36,
                padding: "4px 8px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.06)",
                color: "inherit",
              }}
            />
            <input
              type="number"
              min={1}
              placeholder="金額"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              style={{
                width: 110,
                minHeight: 36,
                padding: "4px 8px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.06)",
                color: "inherit",
              }}
            />
            <button type="button" style={btn} disabled={busy} onClick={() => void sendTransfer()}>
              送金する
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <strong>履歴</strong>
            <button type="button" style={btn} disabled={busy} onClick={() => void refreshBridge()}>
              更新
            </button>
          </div>
          {ops.length === 0 && <p className="muted">まだお金の移動はありません。</p>}
          {ops.map((op) => (
            <div key={op.id} style={row}>
              <strong>{OP_KIND_LABEL[op.kind]}</strong>
              <span className="muted">{op.reason}</span>
              <span style={{ flex: 1 }} />
              <span>{op.appliedAmount ?? op.amount} 円</span>
              <span className="muted">{OP_STATUS_LABEL[op.status]}</span>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <p role="status" style={{ margin: "10px 0 0" }}>
          {msg}
        </p>
      )}
    </div>
  );
}
