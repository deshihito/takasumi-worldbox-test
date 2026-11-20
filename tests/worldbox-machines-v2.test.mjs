import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const rootDir = path.join(import.meta.dirname, "..");
const libDir = path.join(rootDir, "src/lib");

function transpile(name, base = libDir) {
  const src = fs.readFileSync(path.join(base, name), "utf8");
  return ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function stripModuleSyntax(code) {
  const lines = code.split("\n");
  const out = [];
  let skippingImport = false;
  for (const line of lines) {
    if (skippingImport) {
      if (line.includes(";")) skippingImport = false;
      continue;
    }
    if (/^import\s/.test(line)) {
      if (!line.includes(";")) skippingImport = true;
      continue;
    }
    out.push(
      line
        .replace(/^export\s+(?=(const|let|var|function|class|async\s+function)\s)/, "")
        .replace(/^export\s*\{[^}]*\};?\s*$/, ""),
    );
  }
  return out.join("\n");
}

async function loadBundle(files, names) {
  const code =
    files.map((name) => stripModuleSyntax(transpile(name))).join("\n") +
    `\nexport { ${names.join(", ")} };\n`;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

const M2 = await loadBundle(
  ["worldbox/economy/items.ts", "worldbox/economy/machines.ts"],
  [
    "MACHINE_ITEM_IDS",
    "isMachineItem",
    "defaultProgram",
    "defaultCustomBlueprint",
    "parseCustomBlueprint",
    "encodeCustomBlueprint",
    "decodeCustomBlueprint",
    "customBlueprintCost",
    "parseMachineState",
    "evaluateExtendedMachine",
    "hasSecurityCoverage",
    "itemById",
  ],
);

test("machines v2: 全10種の近代マシン（conveyor_relay含む）がアイコン・仕様・routeModeともに定義されている", () => {
  assert.equal(M2.MACHINE_ITEM_IDS.length, 10);
  for (const id of M2.MACHINE_ITEM_IDS) {
    assert.equal(M2.isMachineItem(id), true, id);
    const item = M2.itemById(id);
    assert.ok(item && item.facility === true, `${id} missing facility flag`);
    assert.ok(
      fs.existsSync(path.join(rootDir, "public", item.icon.slice(1))),
      `missing icon for ${id}`,
    );
  }
  const sorter = M2.parseMachineState({
    ownerId: "p1",
    machineType: "logistics_sorter",
    program: M2.defaultProgram(),
    buffer: {},
    routeMode: "feed_cnc",
  });
  assert.equal(sorter?.routeMode, "feed_cnc");
});

test("machines v2: カスタム設計ブループリント(WB2.)とカスタムマシン制作コスト計算", () => {
  const bp = M2.parseCustomBlueprint({
    name: "量子採掘リグ",
    frame: "titanium",
    core: "quantum",
    module: "compute",
    chip: "overclock",
  });
  assert.equal(bp.name, "量子採掘リグ");
  const code = M2.encodeCustomBlueprint(bp);
  assert.ok(code.startsWith("WB2."));
  assert.deepEqual(M2.decodeCustomBlueprint(code), bp);
  const cost = M2.customBlueprintCost(bp);
  assert.ok(cost.microchip >= 2);
});

test("machines v2: CNC工作機・自動播種・自動採掘・発電ブースト・防犯カメラ網が稼働する", () => {
  const now = 1_700_000_000_000;
  // CNC factory consuming copper_ingot into copper_wire
  const cncState = M2.parseMachineState({
    ownerId: "p1",
    machineType: "cnc_factory",
    program: M2.defaultProgram(),
    inputs: { copper_ingot: 2 },
    targetRecipeId: "copper_wire",
    buffer: {},
    lastEvalAt: now - 70_000,
  });
  const cncRes = M2.evaluateExtendedMachine(cncState, {
    machineType: "cnc_factory",
    x: 10,
    y: 10,
    neighbors: new Map(),
    now,
    powered: true,
  });
  assert.equal(cncRes.evaluated, true);
  assert.equal(cncRes.state.buffer.copper_wire, 4);
  assert.equal(cncRes.state.inputs, undefined);

  // Auto planter plants seed onto adjacent farmland
  const planter = M2.parseMachineState({
    ownerId: "p1",
    machineType: "auto_planter",
    program: M2.defaultProgram(),
    inputs: { wheat_seed: 1 },
    buffer: {},
    lastEvalAt: now - 70_000,
  });
  const planterRes = M2.evaluateExtendedMachine(planter, {
    machineType: "auto_planter",
    x: 10,
    y: 10,
    neighbors: new Map([["11,10", { ownerId: "p1", farmland: true }]]),
    now,
  });
  assert.equal(planterRes.changed.get("11,10")?.crop?.cropId, "wheat");

  // Auto miner produces ores
  const miner = M2.parseMachineState({
    ownerId: "p1",
    machineType: "auto_miner",
    program: M2.defaultProgram(),
    buffer: {},
    lastEvalAt: now - 70_000,
  });
  const minerRes = M2.evaluateExtendedMachine(miner, {
    machineType: "auto_miner",
    x: 5,
    y: 5,
    neighbors: new Map(),
    now,
    powered: true,
  });
  assert.ok(minerRes.harvested >= 1);

  // Security camera 7x7 defense
  const overrides = {
    "12,12": { ownerId: "ownerA", block: { itemId: "security_camera", ownerId: "ownerA" } },
  };
  assert.equal(M2.hasSecurityCoverage(overrides, 15, 15).protected, true);
  assert.equal(M2.hasSecurityCoverage(overrides, 20, 20).protected, false);
});

test("engineering & machine panels wiring", () => {
  const eng = fs.readFileSync(
    path.join(rootDir, "src/app/api/worldbox/engineering/route.ts"),
    "utf8",
  );
  assert.match(eng, /assemble_custom/);
  const mp = fs.readFileSync(
    path.join(rootDir, "src/app/games/worldbox/WorldBoxMachinePanel.tsx"),
    "utf8",
  );
  assert.match(mp, /vending_buy/);
  const client = fs.readFileSync(
    path.join(rootDir, "src/app/games/worldbox/WorldBoxClient.tsx"),
    "utf8",
  );
  assert.match(client, /WorldBoxEngineeringPanel/);
});
