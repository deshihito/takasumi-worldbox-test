export const BANK_LTV_RATIO = 0.5; // 担保評価額の50%まで融資可能
export const BANK_LIQUIDATION_RATIO = 0.85; // 債務が担保の85%を超えると危険水準
export const BANK_BASE_DEPOSIT_DAILY_RATE = 0.002; // 日利 0.2% (年率約73%のゲーム内バランス)
export const BANK_BASE_LOAN_DAILY_RATE = 0.005; // 日利 0.5%
export const BANK_TX_MIN = 100;
export const BANK_TX_MAX = 10_000_000;

export interface BankAccount {
  deposit: number;
  loanPrincipal: number;
  accruedInterest: number;
  lastAccruedAt: number;
}

export interface BankState {
  accounts: Record<string, BankAccount>;
  totalDeposits: number;
  totalLoans: number;
  reserveTreasury: number;
}

export function emptyBankState(): BankState {
  return {
    accounts: {},
    totalDeposits: 0,
    totalLoans: 0,
    reserveTreasury: 0,
  };
}

export function dynamicBankRates(state: BankState): {
  depositDailyRate: number;
  loanDailyRate: number;
  utilization: number;
} {
  const utilization =
    state.totalDeposits > 0 ? Math.min(1, state.totalLoans / state.totalDeposits) : 0.4;
  const depositDailyRate = Number((BANK_BASE_DEPOSIT_DAILY_RATE + utilization * 0.0025).toFixed(5));
  const loanDailyRate = Number((BANK_BASE_LOAN_DAILY_RATE + utilization * 0.004).toFixed(5));
  return { depositDailyRate, loanDailyRate, utilization };
}

export function accrueBankAccount(
  account: BankAccount,
  state: BankState,
  now: number,
): BankAccount {
  if (!account.lastAccruedAt || now <= account.lastAccruedAt) {
    return { ...account, lastAccruedAt: account.lastAccruedAt || now };
  }
  const elapsedMs = now - account.lastAccruedAt;
  const hours = Math.floor(elapsedMs / 3_600_000);
  if (hours <= 0) return account;

  const { depositDailyRate, loanDailyRate } = dynamicBankRates(state);
  const depositGain =
    account.deposit > 0 ? Math.floor((account.deposit * depositDailyRate * hours) / 24) : 0;
  const loanCost =
    account.loanPrincipal > 0 ? Math.ceil((account.loanPrincipal * loanDailyRate * hours) / 24) : 0;

  return {
    deposit: account.deposit + depositGain,
    loanPrincipal: account.loanPrincipal,
    accruedInterest: account.accruedInterest + loanCost,
    lastAccruedAt: account.lastAccruedAt + hours * 3_600_000,
  };
}

export function totalBankDebt(account: BankAccount): number {
  return account.loanPrincipal + account.accruedInterest;
}

export function computeCreditLimit(
  account: BankAccount,
  stockCollateralValue: number,
  fxCollateralValue: number,
  realEstateValue = 0,
): {
  totalCollateral: number;
  maxBorrowLimit: number;
  currentDebt: number;
  availableCredit: number;
  atRisk: boolean;
} {
  const totalCollateral =
    Math.max(0, account.deposit) +
    Math.max(0, stockCollateralValue) +
    Math.max(0, fxCollateralValue) +
    Math.max(0, realEstateValue);
  const maxBorrowLimit = Math.floor(totalCollateral * BANK_LTV_RATIO);
  const currentDebt = totalBankDebt(account);
  const availableCredit = Math.max(0, maxBorrowLimit - currentDebt);
  const atRisk =
    totalCollateral > 0 ? currentDebt > totalCollateral * BANK_LIQUIDATION_RATIO : currentDebt > 0;
  return {
    totalCollateral,
    maxBorrowLimit,
    currentDebt,
    availableCredit,
    atRisk,
  };
}

export function planBankDeposit(
  state: BankState,
  ownerKey: string,
  amountRaw: unknown,
  now: number,
): { ok: true; state: BankState; amount: number } | { ok: false; error: "invalid_amount" } {
  if (
    typeof amountRaw !== "number" ||
    !Number.isInteger(amountRaw) ||
    amountRaw < BANK_TX_MIN ||
    amountRaw > BANK_TX_MAX
  ) {
    return { ok: false, error: "invalid_amount" };
  }
  const prev = accrueBankAccount(
    state.accounts[ownerKey] ?? {
      deposit: 0,
      loanPrincipal: 0,
      accruedInterest: 0,
      lastAccruedAt: now,
    },
    state,
    now,
  );
  const nextAcc: BankAccount = { ...prev, deposit: prev.deposit + amountRaw };
  return {
    ok: true,
    amount: amountRaw,
    state: {
      ...state,
      accounts: { ...state.accounts, [ownerKey]: nextAcc },
      totalDeposits: state.totalDeposits + amountRaw,
    },
  };
}

export function planBankWithdraw(
  state: BankState,
  ownerKey: string,
  amountRaw: unknown,
  stockCollateralValue: number,
  fxCollateralValue: number,
  now: number,
  realEstateValue = 0,
):
  | { ok: true; state: BankState; amount: number }
  | { ok: false; error: "invalid_amount" | "insufficient_deposit" | "locked_as_collateral" } {
  if (
    typeof amountRaw !== "number" ||
    !Number.isInteger(amountRaw) ||
    amountRaw < BANK_TX_MIN ||
    amountRaw > BANK_TX_MAX
  ) {
    return { ok: false, error: "invalid_amount" };
  }
  const prev = accrueBankAccount(
    state.accounts[ownerKey] ?? {
      deposit: 0,
      loanPrincipal: 0,
      accruedInterest: 0,
      lastAccruedAt: now,
    },
    state,
    now,
  );
  if (prev.deposit < amountRaw) return { ok: false, error: "insufficient_deposit" };

  const afterDeposit = prev.deposit - amountRaw;
  const creditAfter = computeCreditLimit(
    { ...prev, deposit: afterDeposit },
    stockCollateralValue,
    fxCollateralValue,
    realEstateValue,
  );
  if (creditAfter.currentDebt > creditAfter.maxBorrowLimit) {
    return { ok: false, error: "locked_as_collateral" };
  }

  const nextAcc: BankAccount = { ...prev, deposit: afterDeposit };
  return {
    ok: true,
    amount: amountRaw,
    state: {
      ...state,
      accounts: { ...state.accounts, [ownerKey]: nextAcc },
      totalDeposits: Math.max(0, state.totalDeposits - amountRaw),
    },
  };
}

export function planBankBorrow(
  state: BankState,
  ownerKey: string,
  amountRaw: unknown,
  stockCollateralValue: number,
  fxCollateralValue: number,
  now: number,
  realEstateValue = 0,
):
  | { ok: true; state: BankState; amount: number }
  | { ok: false; error: "invalid_amount" | "exceeds_credit_limit" } {
  if (
    typeof amountRaw !== "number" ||
    !Number.isInteger(amountRaw) ||
    amountRaw < BANK_TX_MIN ||
    amountRaw > BANK_TX_MAX
  ) {
    return { ok: false, error: "invalid_amount" };
  }
  const prev = accrueBankAccount(
    state.accounts[ownerKey] ?? {
      deposit: 0,
      loanPrincipal: 0,
      accruedInterest: 0,
      lastAccruedAt: now,
    },
    state,
    now,
  );
  const credit = computeCreditLimit(prev, stockCollateralValue, fxCollateralValue, realEstateValue);
  if (amountRaw > credit.availableCredit) {
    return { ok: false, error: "exceeds_credit_limit" };
  }

  const nextAcc: BankAccount = { ...prev, loanPrincipal: prev.loanPrincipal + amountRaw };
  return {
    ok: true,
    amount: amountRaw,
    state: {
      ...state,
      accounts: { ...state.accounts, [ownerKey]: nextAcc },
      totalLoans: state.totalLoans + amountRaw,
    },
  };
}

export function planBankRepay(
  state: BankState,
  ownerKey: string,
  amountRaw: unknown,
  now: number,
):
  | { ok: true; state: BankState; paid: number; paidInterest: number; paidPrincipal: number }
  | { ok: false; error: "invalid_amount" | "no_debt" } {
  if (
    typeof amountRaw !== "number" ||
    !Number.isInteger(amountRaw) ||
    amountRaw < 1 ||
    amountRaw > BANK_TX_MAX
  ) {
    return { ok: false, error: "invalid_amount" };
  }
  const prev = accrueBankAccount(
    state.accounts[ownerKey] ?? {
      deposit: 0,
      loanPrincipal: 0,
      accruedInterest: 0,
      lastAccruedAt: now,
    },
    state,
    now,
  );
  const debt = totalBankDebt(prev);
  if (debt <= 0) return { ok: false, error: "no_debt" };
  const paid = Math.min(amountRaw, debt);
  const paidInterest = Math.min(paid, prev.accruedInterest);
  const paidPrincipal = paid - paidInterest;

  const nextAcc: BankAccount = {
    ...prev,
    accruedInterest: prev.accruedInterest - paidInterest,
    loanPrincipal: prev.loanPrincipal - paidPrincipal,
  };
  return {
    ok: true,
    paid,
    paidInterest,
    paidPrincipal,
    state: {
      ...state,
      accounts: { ...state.accounts, [ownerKey]: nextAcc },
      totalLoans: Math.max(0, state.totalLoans - paidPrincipal),
      reserveTreasury: state.reserveTreasury + paidInterest,
    },
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  let raw = v;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function asInt(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;
}

export function parseBankState(raw: unknown): BankState {
  const data = asRecord(raw);
  if (!data) return emptyBankState();
  const accounts: Record<string, BankAccount> = {};
  const accRaw = asRecord(data.accounts);
  if (accRaw) {
    for (const [ownerKey, entry] of Object.entries(accRaw)) {
      const a = asRecord(entry);
      if (!a) continue;
      accounts[ownerKey] = {
        deposit: Math.max(0, asInt(a.deposit)),
        loanPrincipal: Math.max(0, asInt(a.loanPrincipal)),
        accruedInterest: Math.max(0, asInt(a.accruedInterest)),
        lastAccruedAt: Math.max(0, asInt(a.lastAccruedAt)),
      };
    }
  }
  return {
    accounts,
    totalDeposits: Math.max(0, asInt(data.totalDeposits)),
    totalLoans: Math.max(0, asInt(data.totalLoans)),
    reserveTreasury: Math.max(0, asInt(data.reserveTreasury)),
  };
}
