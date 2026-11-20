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

const MOD = await loadBundle(
  [
    "worldbox/player/vehicles.ts",
    "worldbox/economy/items.ts",
    "worldbox/social/jobs.ts",
    "worldbox/social/prison.ts",
  ],
  [
    "VEHICLE_IDS",
    "VEHICLE_SPECS",
    "effectiveVehicleMoveSpeed",
    "CAFE_SPOTS",
    "nearCafeSpot",
    "generateCafeTicket",
    "generateDeliveryOrder",
    "isNearSpatialTarget",
    "CRIME_TARGET_SPOTS",
    "nearAnyCrimeSpot",
    "isPrisonGuardSweepingVent",
    "generateSecuritySequence",
  ],
);

test("vehicles: 全4種の車両速度はサーバー上限 MAX_MOVE_SPEED=10 未満に収まる", () => {
  assert.equal(MOD.VEHICLE_IDS.length, 4);
  for (const id of MOD.VEHICLE_IDS) {
    const walkSp = MOD.effectiveVehicleMoveSpeed(id, false, false);
    const roadSp = MOD.effectiveVehicleMoveSpeed(id, true, false);
    const swimSp = MOD.effectiveVehicleMoveSpeed(id, true, true);
    assert.ok(walkSp && walkSp > 4.4 && walkSp < 10);
    assert.ok(roadSp && roadSp >= walkSp && roadSp <= 9.8);
    assert.equal(swimSp, null);
  }
});

test("spatial jobs & crime: カフェ実店舗・配達座標・強盗座標・看守ステルス巡回が判定される", () => {
  // Cafe spot proximity check
  assert.ok(MOD.nearCafeSpot("lobby", 5, 7));
  assert.equal(MOD.nearCafeSpot("world", 5, 7), null);
  assert.equal(MOD.nearCafeSpot("lobby", 90, 90), null);

  // Delivery spatial check
  const del = MOD.generateDeliveryOrder(1_700_000_000_000);
  assert.equal(
    MOD.isNearSpatialTarget(
      del.targetSpace,
      del.targetX,
      del.targetY,
      del.targetSpace,
      del.targetX,
      del.targetY,
    ),
    true,
  );
  assert.equal(
    MOD.isNearSpatialTarget("lobby", 0, 0, del.targetSpace, del.targetX, del.targetY),
    false,
  );

  // Crime spatial spot checks
  assert.ok(MOD.nearAnyCrimeSpot("vault_heist", "lobby", 40, 10));
  assert.equal(MOD.nearAnyCrimeSpot("vault_heist", "world", 0, 0), null);

  // Guard 16s stealth cycle
  assert.equal(MOD.isPrisonGuardSweepingVent(16_000), true);
  assert.equal(MOD.isPrisonGuardSweepingVent(16_000 + 8_000), false);

  // Deterministic dial sequence check
  const c1 = MOD.generateSecuritySequence("vault_heist", 123456, 4);
  const c2 = MOD.generateSecuritySequence("vault_heist", 123456, 4);
  assert.deepEqual(c1.targetSequence, c2.targetSequence);
  assert.equal(c1.targetSequence.length, 4);
});
