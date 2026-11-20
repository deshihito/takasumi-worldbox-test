import { NextResponse } from "next/server";
import { getRequestSession, isSameOriginRequest, sessionOwnerKey } from "@/lib/auth";
import { withUserLock } from "@/lib/worldbox/core/user-lock";
import {
  accrueBankAccount,
  computeCreditLimit,
  dynamicBankRates,
  planBankBorrow,
  planBankDeposit,
  planBankRepay,
  planBankWithdraw,
} from "@/lib/worldbox/economy/bank";
import { isBankEnabled, loadBankState, storeBankState } from "@/lib/worldbox/economy/bank-online";
import { loadCommoditiesMarket } from "@/lib/worldbox/economy/commodities-online";
import { isEconomyEnabled, readUserBalance } from "@/lib/worldbox/economy/economy-bridge-online";
import { computePortfolioValue } from "@/lib/worldbox/economy/exchange";
import { loadExchangeState } from "@/lib/worldbox/economy/exchange-online";
import { fxSpotPortfolioValue } from "@/lib/worldbox/economy/fx";
import { loadFxState } from "@/lib/worldbox/economy/fx-online";
import { chargeUserChunked, payoutUserChunked } from "@/lib/worldbox/economy/settlement";
import { loadAllCompanies } from "@/lib/worldbox/social/company-online";
import { loadNationsState } from "@/lib/worldbox/social/nations-online";
import { computeRealEstateCollateral } from "@/lib/worldbox/world/realestate";
import { listAllApartments, listAllPropertyDeeds } from "@/lib/worldbox/world/realestate-online";
import { loadTileOverrides } from "@/lib/worldbox/world/tiles-online";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function err(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

async function computeUserCollaterals(ownerKey: string, now: number) {
  const [exchange, commodities, companies, fx, nations, deeds, apartments, overrides] =
    await Promise.all([
      loadExchangeState(),
      loadCommoditiesMarket(),
      loadAllCompanies(),
      loadFxState(),
      loadNationsState(),
      listAllPropertyDeeds(),
      listAllApartments(),
      loadTileOverrides(),
    ]);
  const companiesById = new Map(companies.map((c) => [c.id, c]));
  const stockValue = computePortfolioValue(exchange, ownerKey, commodities, companiesById, now);
  const fxValue = fxSpotPortfolioValue(
    fx,
    ownerKey,
    commodities,
    Object.keys(nations.nations).length,
    now,
  );
  const realEstateValue = computeRealEstateCollateral(ownerKey, deeds, apartments, overrides);
  return { stockValue, fxValue, realEstateValue };
}

export async function GET(request: Request) {
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (session.provider === "guest") {
    return NextResponse.json(
      { guest: true, account: null, credit: null, rates: null, balance: null },
      { headers: NO_STORE },
    );
  }
  if (!isBankEnabled() || !isEconomyEnabled()) return err("bank_unavailable", 503);

  const ownerKey = sessionOwnerKey(session);
  const now = Date.now();

  return withUserLock("bank:global", async () => {
    const bank = await loadBankState();
    const acc = accrueBankAccount(
      bank.accounts[ownerKey] ?? {
        deposit: 0,
        loanPrincipal: 0,
        accruedInterest: 0,
        lastAccruedAt: now,
      },
      bank,
      now,
    );
    const [collaterals, balance] = await Promise.all([
      computeUserCollaterals(ownerKey, now),
      readUserBalance(session.id),
    ]);
    const credit = computeCreditLimit(
      acc,
      collaterals.stockValue,
      collaterals.fxValue,
      collaterals.realEstateValue,
    );
    const rates = dynamicBankRates(bank);
    return NextResponse.json(
      {
        guest: false,
        serverNow: now,
        account: acc,
        credit,
        collaterals,
        rates,
        totals: { totalDeposits: bank.totalDeposits, totalLoans: bank.totalLoans },
        balance,
      },
      { headers: NO_STORE },
    );
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return err("forbidden", 403);
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (session.provider === "guest") return err("guest_not_allowed", 403);
  if (!isBankEnabled() || !isEconomyEnabled()) return err("bank_unavailable", 503);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return err("invalid_request", 400);
  }
  const ownerKey = sessionOwnerKey(session);
  const discordId = session.id;
  const action = body.action;

  return withUserLock("bank:global", async () => {
    const now = Date.now();
    const [bank, collaterals] = await Promise.all([
      loadBankState(),
      computeUserCollaterals(ownerKey, now),
    ]);

    if (action === "deposit") {
      const plan = planBankDeposit(bank, ownerKey, body.amount, now);
      if (!plan.ok) return err(plan.error, 400);
      const charged = await chargeUserChunked(ownerKey, discordId, plan.amount, "bank_deposit", {
        refundReason: "bank_withdraw",
      });
      if (charged.state === "insufficient_funds") return err("not_enough_coins", 409);
      if (charged.state === "unavailable") return err("economy_unavailable", 503);
      if (charged.state !== "done") return err("economy_failed", 409);
      if (!(await storeBankState(plan.state))) {
        await payoutUserChunked(ownerKey, discordId, plan.amount, "bank_withdraw");
        return err("store_failed", 503);
      }
      const acc = plan.state.accounts[ownerKey];
      return NextResponse.json(
        {
          ok: true,
          account: acc,
          credit: computeCreditLimit(
            acc,
            collaterals.stockValue,
            collaterals.fxValue,
            collaterals.realEstateValue,
          ),
          balance: await readUserBalance(discordId),
        },
        { headers: NO_STORE },
      );
    }

    if (action === "withdraw") {
      const plan = planBankWithdraw(
        bank,
        ownerKey,
        body.amount,
        collaterals.stockValue,
        collaterals.fxValue,
        now,
        collaterals.realEstateValue,
      );
      if (!plan.ok) return err(plan.error, 409);
      if (!(await storeBankState(plan.state))) return err("store_failed", 503);
      const paid = await payoutUserChunked(ownerKey, discordId, plan.amount, "bank_withdraw");
      if (paid.state !== "done" && paid.state !== "pending") {
        await storeBankState(bank);
        return err("economy_failed", 409);
      }
      const acc = plan.state.accounts[ownerKey];
      return NextResponse.json(
        {
          ok: true,
          account: acc,
          credit: computeCreditLimit(
            acc,
            collaterals.stockValue,
            collaterals.fxValue,
            collaterals.realEstateValue,
          ),
          balance: await readUserBalance(discordId),
        },
        { headers: NO_STORE },
      );
    }

    if (action === "borrow") {
      const plan = planBankBorrow(
        bank,
        ownerKey,
        body.amount,
        collaterals.stockValue,
        collaterals.fxValue,
        now,
        collaterals.realEstateValue,
      );
      if (!plan.ok) return err(plan.error, 409);
      if (!(await storeBankState(plan.state))) return err("store_failed", 503);
      const paid = await payoutUserChunked(ownerKey, discordId, plan.amount, "bank_loan");
      if (paid.state !== "done" && paid.state !== "pending") {
        await storeBankState(bank);
        return err("economy_failed", 409);
      }
      const acc = plan.state.accounts[ownerKey];
      return NextResponse.json(
        {
          ok: true,
          account: acc,
          credit: computeCreditLimit(
            acc,
            collaterals.stockValue,
            collaterals.fxValue,
            collaterals.realEstateValue,
          ),
          balance: await readUserBalance(discordId),
        },
        { headers: NO_STORE },
      );
    }

    if (action === "repay") {
      const plan = planBankRepay(bank, ownerKey, body.amount, now);
      if (!plan.ok) return err(plan.error, 409);
      const charged = await chargeUserChunked(ownerKey, discordId, plan.paid, "bank_repay", {
        refundReason: "bank_withdraw",
      });
      if (charged.state === "insufficient_funds") return err("not_enough_coins", 409);
      if (charged.state === "unavailable") return err("economy_unavailable", 503);
      if (charged.state !== "done") return err("economy_failed", 409);
      if (!(await storeBankState(plan.state))) {
        await payoutUserChunked(ownerKey, discordId, plan.paid, "bank_withdraw");
        return err("store_failed", 503);
      }
      const acc = plan.state.accounts[ownerKey];
      return NextResponse.json(
        {
          ok: true,
          paid: plan.paid,
          account: acc,
          credit: computeCreditLimit(
            acc,
            collaterals.stockValue,
            collaterals.fxValue,
            collaterals.realEstateValue,
          ),
          balance: await readUserBalance(discordId),
        },
        { headers: NO_STORE },
      );
    }

    return err("invalid_action", 400);
  });
}
