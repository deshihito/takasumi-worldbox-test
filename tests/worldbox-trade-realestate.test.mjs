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
    "worldbox/core/rng.ts",
    "worldbox/world/mapgen.ts",
    "worldbox/economy/items.ts",
    "worldbox/player/profile.ts",
    "worldbox/economy/bank.ts",
    "worldbox/world/lobby.ts",
    "worldbox/world/realestate.ts",
    "worldbox/social/trade.ts",
    "worldbox/social/contracts.ts",
  ],
  [
    "parseProfile",
    "countItem",
    "executeTradeProfiles",
    "parseTradeOffer",
    "canFulfillItemContract",
    "parseContract",
    "chunkKeyFromWorld",
    "computeChunkValuation",
    "computeRealEstateCollateral",
    "parseApartmentSpace",
    "buildApartment",
    "computeCreditLimit",
    "emptyBankState",
  ],
);

test("trade & contracts: P2P直取引のアトミック交換と契約報酬・アイテムチェックが正しく動作する", () => {
  const now = 1_700_000_000_000;
  const sender = MOD.parseProfile({ items: { copper_ingot: 5 } });
  const receiver = MOD.parseProfile({ items: { iron_ingot: 2 } });
  const offer = MOD.parseTradeOffer({
    id: "tr_1",
    fromKey: "discord:1",
    fromName: "Alice",
    toKey: "discord:2",
    toName: "Bob",
    offerCoins: 500,
    offerItems: [{ itemId: "copper_ingot", count: 3 }],
    requestCoins: 0,
    requestItems: [{ itemId: "iron_ingot", count: 2 }],
    status: "pending",
    createdAt: now,
    expiresAt: now + 60_000,
  });
  assert.ok(offer);
  const res = MOD.executeTradeProfiles(sender, receiver, offer);
  assert.equal(res.ok, true);
  assert.equal(MOD.countItem(res.senderProfile, "copper_ingot"), 2);
  assert.equal(MOD.countItem(res.senderProfile, "iron_ingot"), 2);
  assert.equal(MOD.countItem(res.receiverProfile, "copper_ingot"), 3);
  assert.equal(MOD.countItem(res.receiverProfile, "iron_ingot"), 0);

  const ctr = MOD.parseContract({
    id: "ctr_1",
    category: "delivery",
    posterKey: "discord:1",
    title: "鉄塊納入",
    itemId: "iron_ingot",
    itemCount: 2,
    rewardCoins: 2400,
    status: "open",
  });
  assert.ok(ctr);
  const failCheck = MOD.canFulfillItemContract(ctr, sender);
  assert.equal(failCheck.ok, false);
  const okCheck = MOD.canFulfillItemContract(ctr, res.senderProfile);
  assert.equal(okCheck.ok, true);
});

test("realestate & bank: チャンク権利書・マンション生成・担保与信連動が機能する", () => {
  const ch = MOD.chunkKeyFromWorld(35, -18);
  assert.equal(ch.key, "1,-1");
  const baseVal = MOD.computeChunkValuation(ch.cx, ch.cy, {}, "residential");
  const commVal = MOD.computeChunkValuation(
    ch.cx,
    ch.cy,
    { [`${ch.cx * 16},${ch.cy * 16}`]: { block: { itemId: "smart_vending", ownerId: "o1" } } },
    "commercial",
  );
  assert.ok(commVal > baseVal);

  assert.equal(MOD.parseApartmentSpace("apartment:stu_123"), "stu_123");
  assert.equal(MOD.parseApartmentSpace("lobby"), null);
  const aptMap = MOD.buildApartment("penthouse");
  assert.equal(aptMap.width, 24);
  assert.equal(aptMap.height, 18);

  const deeds = [
    { chunkKey: ch.key, cx: ch.cx, cy: ch.cy, zone: "commercial", ownerKey: "discord:1" },
  ];
  const reVal = MOD.computeRealEstateCollateral("discord:1", deeds, [], {});
  assert.ok(reVal >= 8000);
  const acc = { deposit: 0, loanPrincipal: 0, accruedInterest: 0, lastAccruedAt: 0 };
  const c0 = MOD.computeCreditLimit(acc, 0, 0, 0);
  const c1 = MOD.computeCreditLimit(acc, 0, 0, reVal);
  assert.equal(c0.maxBorrowLimit, 0);
  assert.ok(c1.maxBorrowLimit > 0);
});
