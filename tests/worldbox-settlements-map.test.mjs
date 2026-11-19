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

test("living world settlements spawn on dry walkable land with citizens, buildings, and roads", async () => {
  const mod = await loadBundle(
    ["worldbox/world/mapgen.ts", "worldbox/world/settlements.ts"],
    [
      "MAP_SEED",
      "T_GRASS",
      "T_DIRT",
      "T_SAND",
      "T_SNOW",
      "tileAt",
      "isSolidMapTile",
      "SETTLEMENT_CELL",
      "settlementAtCell",
      "settlementsNear",
      "settlementRoadAt",
      "nearestSettlement",
      "evaluateCitizenPose",
    ],
  );

  assert.equal(mod.SETTLEMENT_CELL, 160);
  const drySet = new Set([mod.T_GRASS, mod.T_DIRT, mod.T_SAND, mod.T_SNOW]);
  const stls = mod.settlementsNear(0, 0, 800);
  assert.ok(stls.length >= 6, `expected >= 6 settlements near spawn region, got ${stls.length}`);

  const tiers = new Set(stls.map((s) => s.tier));
  assert.ok(tiers.size >= 2, "expected multiple settlement tiers (city/town/village)");

  for (const stl of stls) {
    const centerTile = mod.tileAt(stl.cx, stl.cy, mod.MAP_SEED);
    assert.ok(
      drySet.has(centerTile) && !mod.isSolidMapTile(centerTile),
      `settlement ${stl.name} placed on non-dry tile ${centerTile} at (${stl.cx}, ${stl.cy})`,
    );
    assert.ok(stl.buildings.length >= 2, `settlement ${stl.name} missing buildings`);
    assert.ok(stl.lamps.length >= 2, `settlement ${stl.name} missing streetlamps`);
    assert.ok(stl.citizens.length >= 2, `settlement ${stl.name} missing autonomous citizens`);
    assert.equal(mod.settlementRoadAt(stl, stl.cx, stl.cy), "plaza");
    assert.equal(mod.settlementRoadAt(stl, stl.cx + 3, stl.cy), "road");

    const found = mod.nearestSettlement(stl.cx + 2, stl.cy - 2, 26);
    assert.equal(found?.id, stl.id);
  }

  // Verify 60fps autonomous day/night schedule behavior
  const sampleStl = stls.find((s) =>
    s.citizens.some((c) => c.role === "guard" || c.role === "resident"),
  );
  assert.ok(sampleStl);
  const resident =
    sampleStl.citizens.find((c) => c.role !== "guard" && c.role !== "barista") ??
    sampleStl.citizens[0];
  const dayPose1 = mod.evaluateCitizenPose(sampleStl, resident, 0.5, 1000);
  const dayPose2 = mod.evaluateCitizenPose(sampleStl, resident, 0.5, 3500);
  assert.equal(dayPose1.sleeping, false);
  assert.notEqual(
    `${dayPose1.x.toFixed(3)},${dayPose1.y.toFixed(3)}`,
    `${dayPose2.x.toFixed(3)},${dayPose2.y.toFixed(3)}`,
    "citizen should move smoothly across frames during daytime",
  );

  const regularCit = sampleStl.citizens.find((c) => c.role !== "guard" && c.role !== "barista");
  if (regularCit) {
    const nightPose = mod.evaluateCitizenPose(sampleStl, regularCit, 0.05, 5000);
    assert.equal(nightPose.sleeping, true, "ordinary citizen should rest late at night");
  }
  const guardCit = sampleStl.citizens.find((c) => c.role === "guard" || c.role === "barista");
  if (guardCit) {
    const nightGuard = mod.evaluateCitizenPose(sampleStl, guardCit, 0.05, 5000);
    assert.equal(nightGuard.sleeping, false, "guard/barista should remain active at night");
  }
});

test("map-pins module validates persisted pins and provides lobby/prison POIs", async () => {
  const mod = await loadBundle(
    ["worldbox/world/map-pins.ts"],
    ["PIN_ICONS", "SPACE_POIS", "poisForSpace", "parseMapPins"],
  );

  assert.ok(mod.PIN_ICONS.length >= 6);
  const lobbyPois = mod.poisForSpace("lobby");
  assert.ok(lobbyPois.length >= 8, "lobby should expose rich indoor POIs");
  const prisonPois = mod.poisForSpace("prison");
  assert.ok(prisonPois.some((p) => p.id === "prison:escape"));
  assert.ok(prisonPois.some((p) => p.id === "prison:work"));

  const parsed = mod.parseMapPins(
    JSON.stringify([
      {
        id: "p1",
        label: " マイ拠点テスト ",
        icon: "🏠",
        color: "#4ade80",
        space: "lobby",
        x: 28.44,
        y: 24.16,
      },
      { invalid: true },
      { id: "p2", x: "nan" },
    ]),
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].label, "マイ拠点テスト");
  assert.equal(parsed[0].x, 28.4);
  assert.equal(parsed[0].y, 24.2);
});

test("Phase 3 UI overhaul: Lobby/Multi-space maps, tracking, non-overlapping HUD, and reduced prose slop", () => {
  const client = fs.readFileSync(
    path.join(rootDir, "src/app/games/worldbox/WorldBoxClient.tsx"),
    "utf8",
  );
  const modal = fs.readFileSync(
    path.join(rootDir, "src/app/games/worldbox/WorldBoxMapModal.tsx"),
    "utf8",
  );
  const css = fs.readFileSync(path.join(rootDir, "src/app/globals.css"), "utf8");
  const prisonPanel = fs.readFileSync(
    path.join(rootDir, "src/app/games/worldbox/WorldBoxPrisonPanel.tsx"),
    "utf8",
  );
  const metroPanel = fs.readFileSync(
    path.join(rootDir, "src/app/games/worldbox/WorldBoxMetroPanel.tsx"),
    "utf8",
  );

  // Universal minimap & map shortcut across Lobby / Prison / World
  assert.doesNotMatch(
    client,
    /showMap && spaceUi === "world" && \(\s*<(?:div|canvas)[\s\S]{0,120}minimapRef/,
  );
  assert.match(client, /\{showMap && \(\s*<div/);
  assert.match(client, /paintIndoorMapCanvas\(/);
  assert.match(client, /k === "m"/);
  assert.match(client, /<WorldBoxMapModal/);
  assert.match(client, /kind:\s*"player"/);
  assert.match(client, />\s*追跡\s*</);
  assert.match(client, /settlementRoadAt\(/);
  assert.match(client, /evaluateCitizenPose\(/);
  assert.match(modal, /paintIndoorMapCanvas/);
  assert.match(modal, /settlementsNear/);

  // HUD non-overlap fixes & smooth modal animation
  assert.doesNotMatch(css, /\.wb-mmo-waypoint\s*\{[^}]*bottom:\s*14px/);
  assert.match(css, /\.wb-mmo-waypoint\s*\{[^}]*top:/);
  assert.match(css, /\.wb-mmo-ticker\s*\{[^}]*top:/);
  assert.match(css, /@keyframes wb-panel-in/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);

  // Visual step / stat replacements for prose slop
  assert.match(prisonPanel, /wb-mmo-step-grid/);
  assert.match(metroPanel, /wb-mmo-stat-chip/);
});
