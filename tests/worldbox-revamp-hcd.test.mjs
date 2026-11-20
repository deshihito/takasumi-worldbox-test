import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const rootDir = path.join(import.meta.dirname, "..");

function loadTsModule(relPath) {
  const fullPath = path.join(rootDir, relPath);
  const src = fs.readFileSync(fullPath, "utf8");
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  const dir = path.dirname(fullPath);
  const localRequire = (spec) => {
    if (spec.startsWith("./") || spec.startsWith("../")) {
      const resolved = path.resolve(dir, spec.endsWith(".ts") ? spec : `${spec}.ts`);
      return loadTsModule(path.relative(rootDir, resolved));
    }
    return createRequire(import.meta.url)(spec);
  };
  const fn = new vm.Script(outputText, { filename: fullPath }).runInThisContext;
  void fn;
  const wrapped = `(function(exports, require, module, __filename, __dirname) {\n${outputText}\n})`;
  const runner = vm.runInThisContext(wrapped, { filename: fullPath });
  runner(mod.exports, localRequire, mod, fullPath, dir);
  return mod.exports;
}

const econ = loadTsModule("src/lib/worldbox/revamp/economy-model.ts");
const flow = loadTsModule("src/lib/worldbox/revamp/flow-state.ts");
const personas = loadTsModule("src/lib/worldbox/revamp/personas.ts");

test("Revamp economy eliminates infinite shop->craft->vendor arbitrage across all recipes", () => {
  const report = econ.auditCraftArbitrageSafety();
  assert.ok(report.length >= 6);
  for (const row of report) {
    assert.equal(row.safeFromInfiniteLoop, true, `Arbitrage risk in ${row.itemId}`);
    assert.ok(row.vendorNetDelta < 0, `${row.itemId} vendorNetDelta should be negative`);
  }
});

test("Revamp 30-day cohort sink/faucet equilibrium stays within healthy corridor without deadlocks", () => {
  const sim = econ.runEconomySimulation(econ.DEFAULT_ECONOMY_TUNING, 30, 100);
  assert.equal(sim.days, 30);
  assert.equal(sim.points.length, 30);
  assert.equal(sim.totalDeadlocks, 0);
  assert.ok(
    sim.avgSinkFaucetRatio >= 0.88 && sim.avgSinkFaucetRatio <= 1.05,
    `Expected Sink/Faucet ratio in [0.88, 1.05], got ${sim.avgSinkFaucetRatio}`,
  );
  assert.ok(
    sim.supplyGrowthPct >= -5 && sim.supplyGrowthPct <= 25,
    `Expected bounded supply growth, got ${sim.supplyGrowthPct}%`,
  );
  assert.ok(sim.peakCpi <= 125, `Expected peak CPI <= 125, got ${sim.peakCpi}`);
});

test("Cross-screen state carrier preserves BOM shortage & bank cover across factory->market->finance->factory", () => {
  let s = flow.createInitialSessionState("standard");
  s = flow.navigateToScreen(s, "factory", { contextPatch: { selectedRecipeId: "auto_harvester" } });
  s = flow.navigateToScreen(s, "market", {
    pushReturn: true,
    reasonLabel: "不足制御基板調達",
    contextPatch: { marketItemId: "circuit_board", marketQty: 1 },
  });
  assert.equal(s.activeScreen, "market");
  assert.equal(s.returnStack.length, 1);

  const shortAttempt = flow.executeFlowAction(s, {
    kind: "market_buy",
    itemId: "circuit_board",
    qty: 1,
  });
  assert.ok(shortAttempt.context.shortfallWbc > 0);

  const upkeepReserve = Math.round(4600 * shortAttempt.tuning.machineUpkeepRate);
  const coverAmt = shortAttempt.context.shortfallWbc + upkeepReserve;
  s = flow.navigateToScreen(shortAttempt, "finance", {
    pushReturn: true,
    contextPatch: { shortfallWbc: coverAmt },
  });
  s = flow.executeFlowAction(s, { kind: "bank_cover", amount: coverAmt, autoReturn: true });
  assert.equal(s.activeScreen, "market");

  s = flow.executeFlowAction(s, { kind: "market_buy", itemId: "circuit_board", qty: 1 });
  assert.equal(s.activeScreen, "factory");

  s = flow.executeFlowAction(s, { kind: "factory_craft", itemId: "auto_harvester" });
  assert.equal(s.account.inventory.auto_harvester, 1);
  assert.equal(econ.verifyAccountInvariants(s.account).ok, true);
});

test("Prison interrupt, commercial lockdown guard, conflict 409 rollback, and zero-cash recovery", () => {
  // 1. Arrest interrupt & commerce block + release restoration
  let s = flow.createInitialSessionState("standard");
  s = flow.navigateToScreen(s, "market");
  s = flow.triggerArrestInterrupt(s, 180);
  assert.equal(s.activeScreen, "prison");
  assert.equal(s.context.interruptedScreen, "market");

  const blocked = flow.navigateToScreen(s, "factory");
  assert.equal(blocked.activeScreen, "prison");
  assert.equal(blocked.telemetry[0].status, "blocked");

  const released = flow.executeFlowAction(blocked, { kind: "prison_action", mode: "bail_bank" });
  assert.equal(released.account.jailed, false);
  assert.equal(released.activeScreen, "market");

  // 2. 409 conflict rollback
  const conflictState = { ...released, faultMode: "conflict_409" };
  const cashBefore = conflictState.account.cash;
  const rolledBack = flow.executeFlowAction(conflictState, {
    kind: "gig_delivery",
    hasVehicle: true,
  });
  assert.equal(rolledBack.account.cash, cashBefore);
  assert.equal(rolledBack.telemetry[0].status, "rolled_back");

  // 3. Zero-cash deadlock prevention
  let broke = flow.createInitialSessionState("low_cash_deadlock_test");
  broke = flow.executeFlowAction(broke, { kind: "gig_delivery", hasVehicle: false });
  assert.equal(broke.telemetry[0].status, "blocked");
  broke = flow.executeFlowAction(broke, { kind: "emergency_relief" });
  assert.ok(broke.account.cash >= 200);
  assert.ok(broke.account.stamina >= 30);
  broke = flow.executeFlowAction(broke, { kind: "gig_delivery", hasVehicle: false });
  assert.equal(broke.telemetry[0].status, "ok");
});

test("All HCD persona scenarios execute cleanly end-to-end and wireframe files contain zero emojis", () => {
  for (const p of personas.REVAMP_PERSONAS) {
    let s = flow.createInitialSessionState(p.preset);
    for (const step of p.steps) {
      s = step.execute(s);
      const inv = econ.verifyAccountInvariants(s.account);
      assert.equal(
        inv.ok,
        true,
        `Invariant violation in ${p.id} step ${step.stepNo}: ${inv.violations}`,
      );
    }
  }

  const emojiRe =
    /[\u{1F1E0}-\u{1FAFF}\u{2600}-\u{27BF}\u{231A}-\u{23FA}\u{2B50}\u{2B55}\u{FE0F}]/u;
  for (const rel of [
    "src/lib/worldbox/revamp/economy-model.ts",
    "src/lib/worldbox/revamp/flow-state.ts",
    "src/lib/worldbox/revamp/personas.ts",
    "src/app/ops/revamp/page.tsx",
    "src/app/ops/revamp/RevampWorkbenchClient.tsx",
    "src/app/ops/revamp/WireframeScreens.tsx",
    "src/app/ops/revamp/EconomySimPanel.tsx",
  ]) {
    const body = fs.readFileSync(path.join(rootDir, rel), "utf8");
    assert.doesNotMatch(body, emojiRe, `Emoji found in ${rel}`);
  }
});
