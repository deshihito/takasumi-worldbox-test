import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const rootDir = path.join(import.meta.dirname, "..");
const libDir = path.join(rootDir, "src/lib");

function transpile(relPath, base = libDir) {
  const src = fs.readFileSync(path.join(base, relPath), "utf8");
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
        .replace(/^export\s+(?=(const|let|var|function|class)\s)/, "")
        .replace(/^export\s+(?=async\s+function)/, "")
        .replace(/^export\s*\{[^}]*\};?\s*$/, ""),
    );
  }
  return out.join("\n");
}

function dataUrl(js) {
  return "data:text/javascript;base64," + Buffer.from(js).toString("base64");
}

async function compileTs(files, exportNames) {
  const combined =
    files.map((f) => stripModuleSyntax(transpile(f))).join("\n\n") +
    `\nexport { ${exportNames.join(", ")} };\n`;
  return import(dataUrl(combined));
}

const EMOJI_RE =
  /[\u{1F1E0}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{231A}-\u{23FA}]/u;

test("Minecraft-style Jigsaw + terrain-adaptive settlements have non-overlapping enterable buildings, doors, and biome themes", async () => {
  const mod = await compileTs(
    ["worldbox/world/mapgen.ts", "worldbox/world/settlements.ts"],
    [
      "MAP_SEED",
      "tileAt",
      "settlementsNear",
      "settlementRoadAt",
      "settlementSurfaceAt",
      "settlementBuildingDoorAt",
      "settlementSolidTilesInRect",
      "settlementInteriorSpace",
      "evaluateCitizenPose",
    ],
  );

  const stls = mod.settlementsNear(0, 0, 1200);
  const cities = stls.filter((s) => s.tier === "city");
  const towns = stls.filter((s) => s.tier === "town");
  assert.ok(cities.length >= 2, "expected larger regional cities with Jigsaw networks");
  assert.ok(towns.length >= 2, "expected regional towns");

  const validThemes = new Set([
    "sakura_metro",
    "coastal_harbor",
    "snow_alpine",
    "desert_oasis",
    "mining_ridge",
    "pastoral_valley",
  ]);
  for (const stl of stls.slice(0, 14)) {
    assert.ok(validThemes.has(stl.biomeTheme), `invalid biomeTheme ${stl.biomeTheme}`);
    if (stl.tier === "city") {
      assert.equal(stl.radius, 24);
      assert.ok(stl.buildings.length >= 6, `city ${stl.name} should have rich district blocks`);
      assert.ok(
        stl.buildings.some((b) => b.kind === "vehicle_dealer"),
        `city ${stl.name} should include a vehicle_dealer`,
      );
    }

    // Verify all building doorways are left walkable by settlementSolidTilesInRect
    const solids = mod.settlementSolidTilesInRect(
      stl,
      stl.cx - stl.radius - 6,
      stl.cy - stl.radius - 6,
      stl.cx + stl.radius + 6,
      stl.cy + stl.radius + 6,
    );
    const solidSet = new Set(solids.map((s) => `${s.x},${s.y}`));

    for (const b of stl.buildings) {
      assert.ok(
        !solidSet.has(`${b.doorX},${b.doorY}`),
        `doorway at (${b.doorX},${b.doorY}) must stay walkable to enter ${b.label}`,
      );
      const foundDoor = mod.settlementBuildingDoorAt(b.doorX, b.doorY);
      assert.ok(foundDoor, `settlementBuildingDoorAt failed at (${b.doorX},${b.doorY})`);
      const spaceId = mod.settlementInteriorSpace(stl, b);
      assert.match(spaceId, /^interior:-?\d+,-?\d+:[a-z0-9_]{1,20}$/);
    }
  }
});

test("Enterable procedural interiors provide valid 20x15 walkable layouts, stations, dealer bays, and staff NPCs", async () => {
  const mod = await compileTs(
    [
      "worldbox/world/mapgen.ts",
      "worldbox/economy/shops.ts",
      "worldbox/world/lobby.ts",
      "worldbox/world/settlements.ts",
      "worldbox/world/settlement-interiors.ts",
    ],
    [
      "settlementsNear",
      "settlementInteriorSpace",
      "parseInteriorSpace",
      "buildSettlementInterior",
      "INTERIOR_W",
      "INTERIOR_H",
      "stationNear",
    ],
  );

  const stls = mod.settlementsNear(0, 0, 1200);
  const city = stls.find((s) => s.tier === "city");
  assert.ok(city);

  for (const b of city.buildings) {
    const spaceId = mod.settlementInteriorSpace(city, b);
    assert.ok(mod.parseInteriorSpace(spaceId));
    const spec = mod.buildSettlementInterior(spaceId);
    assert.ok(spec, `missing interior spec for ${b.kind}`);
    assert.equal(spec.data.width, mod.INTERIOR_W);
    assert.equal(spec.data.height, mod.INTERIOR_H);
    assert.ok(
      !spec.data.blocked.has(`${Math.floor(spec.entryPoint.x)},${Math.floor(spec.entryPoint.y)}`),
    );
    assert.ok(!spec.data.blocked.has(`${spec.exitMat.x},${spec.exitMat.y}`));
    assert.ok(!spec.data.blocked.has(`${spec.exitMat.x + 1},${spec.exitMat.y}`));
    assert.ok(spec.staff.length >= 1, `expected staff NPC inside ${b.label}`);

    if (b.kind === "vehicle_dealer") {
      assert.equal(spec.dealerBays.length, 3);
      const nearCounter = mod.stationNear(spec.data.objects, 4, 3);
      assert.equal(nearCounter, "dealer");
    }
    if (b.kind === "bank_kiosk") {
      const hasStock = spec.data.objects.some((o) => o.station === "stock");
      assert.ok(hasStock, "bank_kiosk interior should expose stock_board station");
    }
  }
});

test("Core/Presence/Relay/Station-Online support interior spaces and Lobby exposes SE Vehicle Dealership", async () => {
  const presSrc = fs.readFileSync(path.join(libDir, "worldbox/player/presence.ts"), "utf8");
  const saveSrc = fs.readFileSync(path.join(libDir, "worldbox/core/save.ts"), "utf8");
  const stationSrc = fs.readFileSync(path.join(libDir, "worldbox/world/station-online.ts"), "utf8");
  const lobbySrc = fs.readFileSync(path.join(libDir, "worldbox/world/lobby.ts"), "utf8");
  const pinsSrc = fs.readFileSync(path.join(libDir, "worldbox/world/map-pins.ts"), "utf8");

  assert.match(presSrc, /PRESENCE_INTERIOR_SPACE_RE/);
  assert.match(saveSrc, /SAVE_INTERIOR_SPACE_RE/);
  assert.match(stationSrc, /buildSettlementInterior/);
  assert.match(lobbySrc, /"dealer"/);
  assert.match(pinsSrc, /lobby:dealer_se/);

  const relayMod = await import("../src/realtime/relay-core.js");
  const s = "interior:-1,2:vehicle_0";
  assert.equal(relayMod.sanitizeSpace(s), s);
  assert.deepEqual(relayMod.boundsForSpace(s), { minX: 0, maxX: 20, minY: 0, maxY: 15 });
});

test("Vehicle Dealership pricing, buy endpoint, Pin Deletion UX, and zero Unicode emojis across codebase", async () => {
  const vehMod = await compileTs(
    ["worldbox/player/vehicles.ts"],
    ["VEHICLE_IDS", "VEHICLE_SPECS", "effectiveVehicleMoveSpeed"],
  );
  for (const id of vehMod.VEHICLE_IDS) {
    const sp = vehMod.VEHICLE_SPECS[id];
    assert.ok(Number.isInteger(sp.price) && sp.price >= 1000, `missing price on ${id}`);
    assert.ok(sp.tagline && sp.tagline.length > 0, `missing tagline on ${id}`);
    assert.ok(vehMod.effectiveVehicleMoveSpeed(id, true, false) <= 9.8);
  }

  const routeSrc = fs.readFileSync(
    path.join(rootDir, "src/app/api/worldbox/vehicles/route.ts"),
    "utf8",
  );
  assert.match(routeSrc, /action === "buy"/);
  assert.match(routeSrc, /spendMmoCoins/);
  assert.match(routeSrc, /not_at_dealer/);

  const mapModalSrc = fs.readFileSync(
    path.join(rootDir, "src/app/games/worldbox/WorldBoxMapModal.tsx"),
    "utf8",
  );
  assert.match(mapModalSrc, /ピン削除/);
  assert.match(mapModalSrc, /onContextMenu=\{handleCanvasContextMenu\}/);
  assert.match(mapModalSrc, /このピンを削除/);
  assert.match(mapModalSrc, /すべて削除/);

  const clientSrc = fs.readFileSync(
    path.join(rootDir, "src/app/games/worldbox/WorldBoxClient.tsx"),
    "utf8",
  );
  assert.match(clientSrc, /WorldBoxDealerPanel/);
  assert.match(clientSrc, /npcDialog/);
  assert.match(clientSrc, /doorPrompt/);
  assert.match(clientSrc, /ピン削除/);

  const dealerSrc = fs.readFileSync(
    path.join(rootDir, "src/app/games/worldbox/WorldBoxDealerPanel.tsx"),
    "utf8",
  );
  const stlSrc = fs.readFileSync(path.join(libDir, "worldbox/world/settlements.ts"), "utf8");
  const intrSrc = fs.readFileSync(
    path.join(libDir, "worldbox/world/settlement-interiors.ts"),
    "utf8",
  );
  const vehSrc = fs.readFileSync(path.join(libDir, "worldbox/player/vehicles.ts"), "utf8");

  for (const [name, src] of [
    ["WorldBoxDealerPanel.tsx", dealerSrc],
    ["WorldBoxMapModal.tsx", mapModalSrc],
    ["WorldBoxClient.tsx", clientSrc],
    ["settlements.ts", stlSrc],
    ["settlement-interiors.ts", intrSrc],
    ["vehicles.ts", vehSrc],
  ]) {
    assert.equal(EMOJI_RE.test(src), false, `Found prohibited Unicode emoji in ${name}`);
  }
});
