import { NextResponse } from "next/server";
import { getRequestSession, isSameOriginRequest, sessionOwnerKey } from "@/lib/auth";
import { withUserLock } from "@/lib/worldbox/core/user-lock";
import {
  cancelMarketOrder,
  computeCommodityMacroIndices,
  orderBookForItem,
  orderRemaining,
  placeMarketOrder,
  type CommoditiesMarketState,
} from "@/lib/worldbox/economy/commodities";
import {
  flushCompanyMarketClaims,
  flushPlayerMarketClaims,
  isMarketEnabled,
  loadCommoditiesMarket,
  storeCommoditiesMarket,
} from "@/lib/worldbox/economy/commodities-online";
import { isEconomyEnabled, readUserBalance } from "@/lib/worldbox/economy/economy-bridge-online";
import { ITEMS, itemById } from "@/lib/worldbox/economy/items";
import { chargeUserChunked, payoutUserChunked } from "@/lib/worldbox/economy/settlement";
import { addItem, countItem, removeItem } from "@/lib/worldbox/player/profile";
import { loadProfile, storeProfile } from "@/lib/worldbox/player/profile-online";
import { applyLedger, type Company } from "@/lib/worldbox/social/company";
import {
  appendCompanyHistory,
  loadAllCompanies,
  loadCompany,
  loadCompanyOf,
  storeCompany,
} from "@/lib/worldbox/social/company-online";
import {
  addCompanyInventory,
  applyCompanyMarketRevenue,
  planSellToBuyOrder,
  removeCompanyInventory,
} from "@/lib/worldbox/social/company-production";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function err(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

function buildSnapshot(
  state: CommoditiesMarketState,
  companies: readonly Company[],
  viewerKey: string,
  myCompany: Company | null,
  selectedItemId: string | null,
) {
  const macro = computeCommodityMacroIndices(state);
  const myCompanyActor = myCompany ? `company:${myCompany.id}` : null;
  const activeOrdersByItem: Record<
    string,
    { bids: number; asks: number; bestBid: number | null; bestAsk: number | null }
  > = {};
  for (const item of ITEMS) {
    const book = orderBookForItem(state, item.id, 1);
    const hasBids = state.orders.some(
      (o) => o.itemId === item.id && o.side === "buy" && orderRemaining(o) > 0,
    );
    const hasAsks = state.orders.some(
      (o) => o.itemId === item.id && o.side === "sell" && orderRemaining(o) > 0,
    );
    if (hasBids || hasAsks || state.stats[item.id]) {
      activeOrdersByItem[item.id] = {
        bids: hasBids ? (book.bids[0]?.qty ?? 0) : 0,
        asks: hasAsks ? (book.asks[0]?.qty ?? 0) : 0,
        bestBid: book.bestBid,
        bestAsk: book.bestAsk,
      };
    }
  }
  const focusId =
    selectedItemId && itemById(selectedItemId) ? selectedItemId : (ITEMS[0]?.id ?? "wheat");
  const focusBook = orderBookForItem(state, focusId, 10);
  const myOrders = state.orders
    .filter(
      (o) => o.actorKey === viewerKey || (myCompanyActor !== null && o.actorKey === myCompanyActor),
    )
    .map((o) => ({
      id: o.id,
      side: o.side,
      actorType: o.actorType,
      itemId: o.itemId,
      itemName: itemById(o.itemId)?.name ?? o.itemId,
      price: o.price,
      qty: o.qty,
      remaining: orderRemaining(o),
      createdAt: o.createdAt,
    }));

  const companyBuyOrders = companies.flatMap((c) =>
    c.buyOrders
      .filter((o) => o.targetQty > o.filledQty)
      .map((o) => ({
        companyId: c.id,
        companyName: c.name,
        orderId: o.id,
        itemId: o.itemId,
        itemName: itemById(o.itemId)?.name ?? o.itemId,
        unitPrice: o.unitPrice,
        remaining: o.targetQty - o.filledQty,
        createdAt: o.createdAt,
      })),
  );

  return {
    focusItemId: focusId,
    focusBook,
    focusStats: state.stats[focusId] ?? null,
    summaryByItem: activeOrdersByItem,
    stats: state.stats,
    recentTrades: state.trades.slice(0, 25).map((t) => ({
      ...t,
      itemName: itemById(t.itemId)?.name ?? t.itemId,
    })),
    myOrders,
    companyBuyOrders,
    macro,
    feeTreasury: state.feeTreasury,
  };
}

function hasPendingClaim(state: CommoditiesMarketState, actorKey: string): boolean {
  const claim = state.claims[actorKey];
  if (!claim) return false;
  if (claim.coins > 0) return true;
  return Object.values(claim.items).some((q) => q > 0);
}

export async function GET(request: Request) {
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (!isMarketEnabled() || !isEconomyEnabled()) return err("market_unavailable", 503);

  const url = new URL(request.url);
  const selectedItem = url.searchParams.get("itemId");
  const ownerKey = sessionOwnerKey(session);
  const isGuest = session.provider === "guest";

  let [state, myCompany, companies, balance, profile] = await Promise.all([
    loadCommoditiesMarket(),
    isGuest ? Promise.resolve(null) : loadCompanyOf(ownerKey),
    loadAllCompanies(),
    isGuest ? Promise.resolve(null) : readUserBalance(session.id),
    loadProfile(ownerKey),
  ]);

  const needsFlush =
    !isGuest &&
    (hasPendingClaim(state, ownerKey) ||
      (myCompany !== null && hasPendingClaim(state, `company:${myCompany.id}`)));

  if (needsFlush) {
    await withUserLock("market:global", async () => {
      state = await loadCommoditiesMarket();
      const flushedPlayer = await flushPlayerMarketClaims(state, ownerKey, session.id);
      state = flushedPlayer.state;
      if (myCompany) {
        const flushedCompany = await flushCompanyMarketClaims(state, myCompany.id, Date.now());
        state = flushedCompany.state;
      }
    });
    const [refreshedCompanies, refreshedBalance, refreshedProfile, refreshedCompany] =
      await Promise.all([
        loadAllCompanies(),
        readUserBalance(session.id),
        loadProfile(ownerKey),
        myCompany ? loadCompany(myCompany.id) : Promise.resolve(null),
      ]);
    companies = refreshedCompanies;
    balance = refreshedBalance;
    profile = refreshedProfile;
    myCompany = refreshedCompany;
  }

  const playerItems: Record<string, number> = {};
  for (const item of ITEMS) {
    const c = countItem(profile, item.id);
    if (c > 0) playerItems[item.id] = c;
  }

  return NextResponse.json(
    {
      guest: isGuest,
      serverNow: Date.now(),
      balance,
      playerItems,
      company: myCompany
        ? {
            id: myCompany.id,
            name: myCompany.name,
            assets: myCompany.assets,
            inventory: myCompany.inventory,
          }
        : null,
      ...buildSnapshot(state, companies, ownerKey, myCompany, selectedItem),
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return err("forbidden", 403);
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (session.provider === "guest") return err("guest_not_allowed", 403);
  if (!isMarketEnabled() || !isEconomyEnabled()) return err("market_unavailable", 503);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return err("invalid_request", 400);
  }

  const ownerKey = sessionOwnerKey(session);
  const discordId = session.id;
  const action = body.action;

  return withUserLock("market:global", async () => {
    const now = Date.now();
    let [state, myCompanyInitial] = await Promise.all([
      loadCommoditiesMarket(),
      loadCompanyOf(ownerKey),
    ]);

    const flushed = await flushPlayerMarketClaims(state, ownerKey, discordId);
    state = flushed.state;
    if (myCompanyInitial) {
      const fc = await flushCompanyMarketClaims(state, myCompanyInitial.id, now);
      state = fc.state;
    }

    if (action === "place_order") {
      const side = body.side;
      if (side !== "buy" && side !== "sell") return err("invalid_side", 400);
      const asCompany = body.asCompany === true;
      const itemId = body.itemId;
      const price = body.price;
      const qty = body.qty;
      const item = itemById(itemId);
      if (!item) return err("unknown_item", 400);
      if (typeof price !== "number" || !Number.isInteger(price) || price < 1 || price > 1_000_000) {
        return err("invalid_price", 400);
      }
      if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > 999) {
        return err("invalid_qty", 400);
      }

      if (asCompany) {
        if (!myCompanyInitial) return err("not_in_company", 409);
        const company = (await loadCompany(myCompanyInitial.id)) ?? myCompanyInitial;
        let workingCompany = company;
        const escrowCost = price * qty;

        if (side === "buy") {
          if (workingCompany.assets < escrowCost) return err("not_enough_assets", 409);
          const step = applyLedger(
            workingCompany,
            -escrowCost,
            `市場買注文確保（${item.name}×${qty}）`,
            discordId,
            now,
          );
          workingCompany = step.company;
          await appendCompanyHistory(workingCompany.id, [step.entry]);
        } else {
          const removed = removeCompanyInventory(workingCompany, item.id, qty);
          if (!removed) return err("not_enough_items", 409);
          workingCompany = removed;
        }

        const placed = placeMarketOrder(state, {
          side,
          actorType: "company",
          actorKey: `company:${workingCompany.id}`,
          discordId,
          companyId: workingCompany.id,
          itemId: item.id,
          price,
          qty,
          now,
        });
        if (!placed.ok) return err(placed.error, 409);

        const res = placed.result;
        if (res.immediateItemsReceived > 0) {
          workingCompany =
            addCompanyInventory(workingCompany, item.id, res.immediateItemsReceived) ??
            workingCompany;
        }
        const cashBack = res.immediateCoinsReceived + res.refundCoins;
        if (res.immediateCoinsReceived > 0) {
          const rev = applyCompanyMarketRevenue(
            workingCompany,
            res.immediateCoinsReceived,
            res.trades.reduce((s, t) => s + t.fee, 0),
            item.id,
            res.trades.reduce((s, t) => s + t.qty, 0),
            discordId,
            now,
          );
          workingCompany = rev.company;
          await appendCompanyHistory(workingCompany.id, [rev.entry]);
        }
        if (res.refundCoins > 0) {
          const ref = applyLedger(
            workingCompany,
            res.refundCoins,
            `市場買注文差額返金（${item.name}）`,
            discordId,
            now,
          );
          workingCompany = ref.company;
          await appendCompanyHistory(workingCompany.id, [ref.entry]);
        }

        if (!(await storeCompany(workingCompany)) || !(await storeCommoditiesMarket(res.state))) {
          return err("store_failed", 503);
        }

        const [companies, balance, profile] = await Promise.all([
          loadAllCompanies(),
          readUserBalance(discordId),
          loadProfile(ownerKey),
        ]);
        const playerItems: Record<string, number> = {};
        for (const it of ITEMS) {
          const c = countItem(profile, it.id);
          if (c > 0) playerItems[it.id] = c;
        }
        return NextResponse.json(
          {
            ok: true,
            tradesCount: res.trades.length,
            cashBack,
            balance,
            playerItems,
            company: {
              id: workingCompany.id,
              name: workingCompany.name,
              assets: workingCompany.assets,
              inventory: workingCompany.inventory,
            },
            ...buildSnapshot(res.state, companies, ownerKey, workingCompany, item.id),
          },
          { headers: NO_STORE },
        );
      }

      // プレイヤー個人としての発注
      let profile = await loadProfile(ownerKey);
      const escrowCost = price * qty;
      let knownBalance: number | undefined;

      if (side === "buy") {
        const charged = await chargeUserChunked(ownerKey, discordId, escrowCost, "market_buy", {
          refundReason: "market_refund",
        });
        if (charged.state === "insufficient_funds") return err("not_enough_coins", 409);
        if (charged.state === "unavailable") return err("economy_unavailable", 503);
        if (charged.state !== "done") return err("economy_failed", 409);
        knownBalance = charged.newBalance;
      } else {
        const removed = removeItem(profile, item.id, qty);
        if (!removed) return err("not_enough_items", 409);
        profile = removed;
        if (!(await storeProfile(ownerKey, profile))) return err("store_failed", 503);
      }

      const placed = placeMarketOrder(state, {
        side,
        actorType: "player",
        actorKey: ownerKey,
        discordId,
        itemId: item.id,
        price,
        qty,
        now,
      });
      if (!placed.ok) {
        if (side === "buy") {
          await payoutUserChunked(ownerKey, discordId, escrowCost, "market_refund");
        } else {
          await storeProfile(ownerKey, addItem(profile, item.id, qty));
        }
        return err(placed.error, 409);
      }

      const res = placed.result;
      if (res.immediateItemsReceived > 0) {
        profile = addItem(profile, item.id, res.immediateItemsReceived);
      }
      const totalImmediatePayout = res.immediateCoinsReceived + res.refundCoins;
      const [savedMarket, , payoutSale, payoutRefund, companies] = await Promise.all([
        storeCommoditiesMarket(res.state),
        res.immediateItemsReceived > 0 ? storeProfile(ownerKey, profile) : Promise.resolve(true),
        res.immediateCoinsReceived > 0
          ? payoutUserChunked(ownerKey, discordId, res.immediateCoinsReceived, "market_sale")
          : Promise.resolve(null),
        res.refundCoins > 0
          ? payoutUserChunked(ownerKey, discordId, res.refundCoins, "market_refund")
          : Promise.resolve(null),
        loadAllCompanies(),
      ]);
      if (!savedMarket) return err("store_failed", 503);

      const finalBalance =
        totalImmediatePayout > 0
          ? (payoutRefund?.newBalance ??
            payoutSale?.newBalance ??
            (await readUserBalance(discordId)))
          : knownBalance !== undefined
            ? knownBalance
            : await readUserBalance(discordId);

      const playerItems: Record<string, number> = {};
      for (const it of ITEMS) {
        const c = countItem(profile, it.id);
        if (c > 0) playerItems[it.id] = c;
      }
      return NextResponse.json(
        {
          ok: true,
          tradesCount: res.trades.length,
          balance: finalBalance,
          playerItems,
          company: myCompanyInitial
            ? {
                id: myCompanyInitial.id,
                name: myCompanyInitial.name,
                assets: myCompanyInitial.assets,
                inventory: myCompanyInitial.inventory,
              }
            : null,
          ...buildSnapshot(res.state, companies, ownerKey, myCompanyInitial, item.id),
        },
        { headers: NO_STORE },
      );
    }

    if (action === "cancel_order") {
      const orderId = body.orderId;
      const targetOrder = state.orders.find((o) => o.id === orderId);
      if (!targetOrder) return err("order_not_found", 404);
      const actorKey =
        targetOrder.actorType === "company" && myCompanyInitial
          ? `company:${myCompanyInitial.id}`
          : ownerKey;
      const canceled = cancelMarketOrder(state, orderId, actorKey);
      if (!canceled.ok) return err(canceled.error, canceled.error === "forbidden" ? 403 : 404);

      if (targetOrder.actorType === "company" && targetOrder.companyId) {
        let company = await loadCompany(targetOrder.companyId);
        if (company) {
          if (canceled.refundCoins > 0) {
            const step = applyLedger(
              company,
              canceled.refundCoins,
              "市場注文キャンセル返金",
              discordId,
              now,
            );
            company = step.company;
            await appendCompanyHistory(company.id, [step.entry]);
          }
          if (canceled.refundItems > 0) {
            company =
              addCompanyInventory(company, canceled.itemId, canceled.refundItems) ?? company;
          }
          await storeCompany(company);
        }
      } else {
        if (canceled.refundCoins > 0) {
          await payoutUserChunked(ownerKey, discordId, canceled.refundCoins, "market_refund");
        }
        if (canceled.refundItems > 0) {
          const profile = await loadProfile(ownerKey);
          await storeProfile(ownerKey, addItem(profile, canceled.itemId, canceled.refundItems));
        }
      }

      if (!(await storeCommoditiesMarket(canceled.state))) return err("store_failed", 503);
      const [companies, balance, profile, refreshedCompany] = await Promise.all([
        loadAllCompanies(),
        readUserBalance(discordId),
        loadProfile(ownerKey),
        myCompanyInitial ? loadCompany(myCompanyInitial.id) : Promise.resolve(null),
      ]);
      const playerItems: Record<string, number> = {};
      for (const it of ITEMS) {
        const c = countItem(profile, it.id);
        if (c > 0) playerItems[it.id] = c;
      }
      return NextResponse.json(
        {
          ok: true,
          balance,
          playerItems,
          company: refreshedCompany
            ? {
                id: refreshedCompany.id,
                name: refreshedCompany.name,
                assets: refreshedCompany.assets,
                inventory: refreshedCompany.inventory,
              }
            : null,
          ...buildSnapshot(canceled.state, companies, ownerKey, refreshedCompany, canceled.itemId),
        },
        { headers: NO_STORE },
      );
    }

    if (action === "sell_to_company") {
      const companyId = typeof body.companyId === "string" ? body.companyId : "";
      const orderId = body.orderId;
      const qty = body.qty;
      const targetCompany = await loadCompany(companyId);
      if (!targetCompany) return err("company_not_found", 404);
      const order = targetCompany.buyOrders.find((o) => o.id === orderId);
      if (!order) return err("order_not_found", 404);
      if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1) {
        return err("invalid_qty", 400);
      }

      const profile = await loadProfile(ownerKey);
      const removed = removeItem(profile, order.itemId, qty);
      if (!removed) return err("not_enough_items", 409);

      const planned = planSellToBuyOrder(targetCompany, orderId, qty);
      if ("error" in planned) return err(planned.error, 409);

      if (!(await storeProfile(ownerKey, removed))) return err("store_failed", 503);
      if (!(await storeCompany(planned.company))) {
        await storeProfile(ownerKey, profile);
        return err("store_failed", 503);
      }
      const paid = await payoutUserChunked(
        ownerKey,
        discordId,
        planned.payout,
        "company_material_sale",
      );
      if (paid.state !== "done" && paid.state !== "pending") {
        await storeProfile(ownerKey, profile);
        await storeCompany(targetCompany);
        return err("economy_failed", 409);
      }

      const [companies, balance, refreshedProfile, refreshedCompany] = await Promise.all([
        loadAllCompanies(),
        readUserBalance(discordId),
        loadProfile(ownerKey),
        myCompanyInitial ? loadCompany(myCompanyInitial.id) : Promise.resolve(null),
      ]);
      const playerItems: Record<string, number> = {};
      for (const it of ITEMS) {
        const c = countItem(refreshedProfile, it.id);
        if (c > 0) playerItems[it.id] = c;
      }
      return NextResponse.json(
        {
          ok: true,
          payout: planned.payout,
          balance,
          playerItems,
          company: refreshedCompany
            ? {
                id: refreshedCompany.id,
                name: refreshedCompany.name,
                assets: refreshedCompany.assets,
                inventory: refreshedCompany.inventory,
              }
            : null,
          ...buildSnapshot(state, companies, ownerKey, refreshedCompany, order.itemId),
        },
        { headers: NO_STORE },
      );
    }

    return err("invalid_action", 400);
  });
}
