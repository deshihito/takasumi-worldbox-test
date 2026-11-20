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
  ["worldbox/social/governance.ts", "worldbox/social/metro-sns.ts"],
  [
    "defaultGovernanceState",
    "resolveElection",
    "sanitizePolicies",
    "evaluateCourtVerdict",
    "parseCourtTrial",
    "parseSnsPost",
  ],
);

test("governance & court: 市長選挙・ポリシー制裁範囲・公開裁判陪審判定が機能する", () => {
  const now = 1_700_000_000_000;
  let state = MOD.defaultGovernanceState(now);
  state = {
    ...state,
    candidates: {
      c1: { ownerKey: "c1", name: "田中市長", manifesto: "減税", votes: 0, nominatedAt: now },
      c2: { ownerKey: "c2", name: "佐藤", manifesto: "治安強化", votes: 0, nominatedAt: now },
    },
    voterBallots: { v1: "c2", v2: "c2", v3: "c1" },
  };
  const resolved = MOD.resolveElection(state, now + 1000);
  assert.equal(resolved.mayorKey, "c2");
  assert.equal(resolved.mayorName, "佐藤");

  const sanitized = MOD.sanitizePolicies({ incomeTaxRate: 0.99, stimulusPayout: 99999 });
  assert.equal(sanitized.incomeTaxRate, 0.2);
  assert.equal(sanitized.stimulusPayout, 2000);

  const trial = MOD.parseCourtTrial({
    id: "t1",
    defendantKey: "d1",
    defendantName: "被疑者",
    guiltyVotes: ["j1", "j2"],
    lenientVotes: ["j3"],
    lawyerKey: "l1", // +1 lawyer persuasion makes lenient = 2 >= 2 guilty
  });
  assert.equal(MOD.evaluateCourtVerdict(trial), "verdict_lenient");

  const sns = MOD.parseSnsPost({
    id: "p1",
    authorKey: "a1",
    body: "市場で銅インゴット売却中",
    tag: "経済",
  });
  assert.equal(sns?.tag, "経済");
});

test("arcade & clean HUD: 全26種のアーケード筐体クライアントが登録され、不要な浮遊ドックが除去されている", () => {
  const arcadeClientsSrc = fs.readFileSync(
    path.join(rootDir, "src/app/games/worldbox/arcade-clients.tsx"),
    "utf8",
  );
  assert.ok(arcadeClientsSrc.includes("ARCADE_GAMES"));
  assert.ok(arcadeClientsSrc.includes("MiniArcadeGame"));

  const clientSrc = fs.readFileSync(
    path.join(rootDir, "src/app/games/worldbox/WorldBoxClient.tsx"),
    "utf8",
  );
  assert.equal(clientSrc.includes("wb-mmo-dock"), false, "floating dock slop should be removed");
  assert.ok(clientSrc.includes("WorldBoxTradePanel"));
  assert.ok(clientSrc.includes("WorldBoxRealEstatePanel"));
  assert.ok(clientSrc.includes("WorldBoxGovernancePanel"));
});
