import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const libDir = path.join(ROOT, "src/lib");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function transpile(name, base = libDir) {
  const src = fs.readFileSync(path.join(base, name), "utf8");
  return ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function dataUrl(js) {
  return "data:text/javascript;base64," + Buffer.from(js).toString("base64");
}

// Simulated DB stub that counts sequential round-trip waves (concurrent Promise.all calls share 1 wave)
const instrumentedBotApiUrl = dataUrl(`
const store = new Map();
const users = new Map();
const history = [];
const pool = { pool: 50000, treasury: 50000, total_recycled: 0, total_house_paid: 0 };
let waves = 0;
let activeInWave = 0;
let deletes = 0;

function trackWave(fn) {
  if (activeInWave === 0) waves += 1;
  activeInWave += 1;
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      Promise.resolve()
        .then(fn)
        .then(
          (val) => {
            activeInWave -= 1;
            resolve(val);
          },
          (err) => {
            activeInWave -= 1;
            reject(err);
          },
        );
    }, 5);
  });
}

globalThis.__perfDb = {
  store,
  users,
  history,
  pool,
  resetMetrics() { waves = 0; deletes = 0; },
  getWaves() { return waves; },
  getDeletes() { return deletes; },
};

export function isBotApiConfigured() { return true; }
export class BotApiError extends Error {
  constructor(status, code) { super("api " + status); this.status = status; this.code = code; }
}
export function kvGet(ns, key) {
  return trackWave(() => {
    const v = store.get(ns + " " + key);
    return v === undefined ? null : v;
  });
}
export function kvSet(ns, key, value) {
  return trackWave(() => { store.set(ns + " " + key, value); });
}
export function kvDelete(ns, key) {
  return trackWave(() => { deletes += 1; store.delete(ns + " " + key); });
}
export function kvList(ns) {
  return trackWave(() => {
    const m = new Map();
    for (const [k, v] of store) if (k.startsWith(ns + " ")) m.set(k.slice(ns.length + 1), v);
    return m;
  });
}
export function tableSelect(table, columns, filters) {
  return trackWave(() => {
    if (table === "economy_pool_state") return [{ pool: pool.pool, treasury: pool.treasury }];
    const id = filters.find((f) => f.column === "user_id")?.value;
    if (!users.has(id)) return [];
    return [{ balance: users.get(id) }];
  });
}
export function tableInsert(table, values) {
  return trackWave(() => {
    if (table === "users") { users.set(values.user_id, values.balance); return; }
    if (table === "transaction_history") { history.push(values); return; }
  });
}
export function tableUpdate(table, values, filters) {
  return trackWave(() => {
    const id = filters.find((f) => f.column === "user_id")?.value;
    const bal = filters.find((f) => f.column === "balance")?.value;
    if (!users.has(id)) return [];
    if (bal !== undefined && users.get(id) !== bal) return [];
    users.set(id, values.balance);
    return [{ user_id: id, balance: values.balance }];
  });
}
export function rpc(name, params) {
  return trackWave(() => {
    if (name === "transfer_coins") {
      const s = users.get(params.p_sender_id) ?? 0;
      if (s < params.p_amount) throw new BotApiError(400, "P0001");
      users.set(params.p_sender_id, s - params.p_amount);
      users.set(params.p_receiver_id, (users.get(params.p_receiver_id) ?? params.p_new_user_balance) + params.p_amount);
      return users.get(params.p_sender_id);
    }
    if (name === "economy_pool_pay_house") {
      const paid = Math.min(pool.pool, params.p_amount);
      pool.pool -= paid;
      return [{ paid, pool_part: paid, treasury_part: 0 }];
    }
    return [];
  });
}
`);

const ecoUrl = dataUrl(transpile("worldbox/economy/economy-bridge.ts"));
const eco = await import(ecoUrl);
const bridgeUrl = dataUrl(
  transpile("worldbox/economy/economy-bridge-online.ts")
    .replaceAll('"../../bot-api"', JSON.stringify(instrumentedBotApiUrl))
    .replaceAll('"./economy-bridge"', JSON.stringify(ecoUrl)),
);
const bridge = await import(bridgeUrl);

describe("WorldBox DB & Transaction Latency Optimizations", () => {
  it("completes freshId spend in <= 3 sequential DB round-trip waves and returns newBalance", async () => {
    const uid = "711111111111111111";
    globalThis.__perfDb.users.set(uid, 5000);
    globalThis.__perfDb.resetMetrics();

    const op = eco.buildEconomyOp(
      { kind: "spend", userKey: `discord:${uid}`, discordId: uid, amount: 600, reason: "shop_buy" },
      crypto.randomUUID(),
      Date.now(),
    );
    const res = await bridge.submitEconomyOp(op, { freshId: true });
    assert.equal(res.state, "done");
    assert.equal(res.newBalance, 4400);
    assert.equal(globalThis.__perfDb.users.get(uid), 4400);
    assert.ok(
      globalThis.__perfDb.getWaves() <= 3,
      `Expected <= 3 sequential DB waves for freshId spend, got ${globalThis.__perfDb.getWaves()}`,
    );
  });

  it("completes idempotent spend in <= 5 sequential DB round-trip waves", async () => {
    const uid = "722222222222222222";
    globalThis.__perfDb.users.set(uid, 5000);
    globalThis.__perfDb.resetMetrics();

    const op = eco.buildEconomyOp(
      { kind: "spend", userKey: `discord:${uid}`, discordId: uid, amount: 400, reason: "shop_buy" },
      "idem-spend-wave-check-1",
      Date.now(),
    );
    const res = await bridge.submitEconomyOp(op);
    assert.equal(res.state, "done");
    assert.equal(res.newBalance, 4600);
    assert.ok(
      globalThis.__perfDb.getWaves() <= 5,
      `Expected <= 5 sequential DB waves for idempotent spend, got ${globalThis.__perfDb.getWaves()}`,
    );
  });

  it("does not fire redundant kvDelete storm on already-cleaned terminal ops during sweepEconomyOps", async () => {
    globalThis.__perfDb.store.clear();
    const now = Date.now();
    for (let i = 0; i < 400; i++) {
      globalThis.__perfDb.store.set(`worldbox_economy done-op-${i}`, {
        id: `done-op-${i}`,
        kind: "spend",
        userKey: "discord:733333333333333333",
        discordId: "733333333333333333",
        amount: 10,
        reason: "shop_buy",
        status: "done",
        createdAt: now - 10_000 - i,
        appliedAt: now - 5_000 - i,
      });
    }
    // Only 2 actual ledger entries exist in worldbox_economy_applied
    globalThis.__perfDb.store.set("worldbox_economy_applied done-op-0", {
      status: "applied",
      appliedAmount: 10,
      at: now,
    });
    globalThis.__perfDb.store.set("worldbox_economy_applied done-op-1", {
      status: "applied",
      appliedAmount: 10,
      at: now,
    });

    globalThis.__perfDb.resetMetrics();
    await bridge.sweepEconomyOps();
    assert.equal(
      globalThis.__perfDb.getDeletes(),
      2,
      "sweepEconomyOps should only delete ledger rows that actually exist instead of all 400 terminal ops",
    );

    // Second sweep should perform 0 deletes
    globalThis.__perfDb.resetMetrics();
    await bridge.sweepEconomyOps();
    assert.equal(globalThis.__perfDb.getDeletes(), 0);
  });

  it("avoids global write locks on read-only market/bank GET polling and scopes client panel refreshes", () => {
    const marketRoute = read("src/app/api/worldbox/market/route.ts");
    assert.match(marketRoute, /function hasPendingClaim/);
    assert.match(marketRoute, /if \(needsFlush\)/);

    const bankRoute = read("src/app/api/worldbox/bank/route.ts");
    const bankGet = bankRoute.slice(
      bankRoute.indexOf("export async function GET"),
      bankRoute.indexOf("export async function POST"),
    );
    assert.ok(
      !bankGet.includes('withUserLock("bank:global"'),
      "read-only bank GET must not serialize behind bank:global write lock",
    );

    const econPanel = read("src/app/games/worldbox/WorldBoxEconomyPanel.tsx");
    assert.match(econPanel, /if \(typeof data\.balance === "number"\) setBalance\(data\.balance\)/);

    const finPanel = read("src/app/games/worldbox/WorldBoxFinancePanel.tsx");
    assert.match(finPanel, /const needsFx =/);
    assert.match(finPanel, /const needsPool =/);
  });
});
