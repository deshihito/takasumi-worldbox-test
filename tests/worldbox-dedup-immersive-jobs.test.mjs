import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("WorldBox 2D Preservation, Counter Deduplication & Immersive Jobs", () => {
  it("keeps pure 2D Discord-avatar renderer without Three.js bundle bloat or 3D HUD clutter", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.equal(pkg.dependencies?.three, undefined, "three dependency should not be bundled");
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/app/games/worldbox/WorldBox3DScene.ts")),
      false,
      "WorldBox3DScene.ts should be removed",
    );
    const clientSrc = read("src/app/games/worldbox/WorldBoxClient.tsx");
    assert.ok(!clientSrc.includes("WorldBox3DScene"), "WorldBoxClient must not import 3D scene");
    assert.ok(!clientSrc.includes("glCanvasRef"), "WorldBoxClient must not mount WebGL canvas");
    assert.ok(clientSrc.includes("myIconUrl"), "2D renderer preserves Discord user avatar icon");
    assert.ok(clientSrc.includes("drawAvatar("), "2D renderer preserves sprite/avatar rendering");
  });

  it("removes redundant facility launchers from hamburger menuActions and METRO OS", () => {
    const clientSrc = read("src/app/games/worldbox/WorldBoxClient.tsx");
    const menuMatch = clientSrc.match(/const menuActions: MenuAction\[\] = \[([\s\S]*?)\];/);
    assert.ok(menuMatch, "menuActions array should exist");
    const menuBody = menuMatch[1];

    for (const removedId of [
      "view3d",
      "market",
      "finance",
      "jobs",
      "trade",
      "realestate",
      "governance",
      "engineering",
      "prison",
    ]) {
      assert.ok(
        !menuBody.includes(`id: "${removedId}"`),
        `menuActions must not contain removed/duplicate launcher id: "${removedId}"`,
      );
    }
    for (const keptId of ["warp", "map", "economy", "company", "metro", "mapview"]) {
      assert.ok(
        menuBody.includes(`id: "${keptId}"`),
        `menuActions should keep essential entry id: "${keptId}"`,
      );
    }

    const metroSrc = read("src/app/games/worldbox/WorldBoxMetroPanel.tsx");
    assert.match(metroSrc, /onSetWaypoint/);
    const appKeyMatch = metroSrc.match(/export type MetroAppKey =([\s\S]*?);/);
    assert.ok(appKeyMatch, "MetroAppKey union type should be exported");
    const appKeyBody = appKeyMatch[1];
    assert.match(appKeyBody, /"jobs_career"/);
    assert.match(appKeyBody, /"jobs_delivery"/);
    for (const forbidden of ['"engineering"', '"prison"', '"market"', '"finance"', '"economy"']) {
      assert.ok(
        !appKeyBody.includes(forbidden),
        `MetroAppKey must not duplicate physical facility launcher ${forbidden}`,
      );
    }
  });

  it("specializes Finance, Prison, and Job panels per physical counter", () => {
    const clientSrc = read("src/app/games/worldbox/WorldBoxClient.tsx");
    assert.match(clientSrc, /openFinanceCounter\("house_pool",\s*\["house_pool"\]/);
    assert.match(clientSrc, /openFinanceCounter\(\s*"fx_spot",\s*\["fx_spot",\s*"fx_margin"\]/);
    assert.match(clientSrc, /openFinanceCounter\(\s*"prediction",\s*\["prediction"\]/);
    assert.match(clientSrc, /openPrisonCounter\("crime"\)/);
    assert.match(clientSrc, /openPrisonCounter\("police"\)/);
    assert.match(clientSrc, /openJobCounter\("cafe"\)/);
    assert.match(clientSrc, /openJobCounter\("delivery"\)/);
    assert.match(clientSrc, /openJobCounter\("career"\)/);

    const finSrc = read("src/app/games/worldbox/WorldBoxFinancePanel.tsx");
    assert.match(finSrc, /lockedTabs\?:/);
    assert.match(finSrc, /initialTab\?:/);

    const prisonSrc = read("src/app/games/worldbox/WorldBoxPrisonPanel.tsx");
    assert.match(prisonSrc, /export type PrisonFocusMode/);

    const jobSrc = read("src/app/games/worldbox/WorldBoxJobPanel.tsx");
    assert.match(jobSrc, /export type JobFocusMode/);
    assert.match(jobSrc, /BaristaBrewConsole/);
    assert.match(jobSrc, /CareerInteractiveConsole/);
    assert.match(jobSrc, /DeliveryHandoverConsole/);
  });

  it("provides tactile interactive job minigames and server-side skill/quality payout scaling", async () => {
    const miniSrc = read("src/app/games/worldbox/WorldBoxJobMinigames.tsx");
    assert.match(miniSrc, /export function BaristaBrewConsole/);
    assert.match(miniSrc, /export function CareerInteractiveConsole/);
    assert.match(miniSrc, /export function DeliveryHandoverConsole/);
    assert.match(miniSrc, /requestAnimationFrame/);

    const jobsRouteSrc = read("src/app/api/worldbox/jobs/route.ts");
    assert.match(jobsRouteSrc, /qualityScore/);
    assert.match(jobsRouteSrc, /skillScore/);
    assert.match(jobsRouteSrc, /qualityBonusPct/);

    const jobsMod = await import("../src/lib/worldbox/social/jobs.ts");
    const s = jobsMod.computeSkillMultiplier(95);
    const a = jobsMod.computeSkillMultiplier(76);
    const b = jobsMod.computeSkillMultiplier(50);
    const c = jobsMod.computeSkillMultiplier(20);
    assert.equal(s.grade, "S");
    assert.equal(a.grade, "A");
    assert.equal(b.grade, "B");
    assert.equal(c.grade, "C");
    assert.ok(s.mult > a.mult && a.mult > b.mult && b.mult > c.mult);

    const profile = jobsMod.defaultJobProfile();
    const engCareer = jobsMod.CAREERS.find((c) => c.id === "engineer");
    assert.ok(engCareer, "engineer career should exist");
    const lowShift = jobsMod.computeShiftPayout(profile, engCareer, true, 30);
    const highShift = jobsMod.computeShiftPayout(profile, engCareer, true, 96);
    assert.ok(highShift.net > lowShift.net, "higher skillScore should earn higher shift payout");
    assert.equal(highShift.grade, "S");

    const lobbySpot = jobsMod.nearCafeSpot("lobby", 5, 7);
    assert.ok(lobbySpot && lobbySpot.space === "lobby", "nearCafeSpot should recognize Lobby Café");
    const interiorSpot = jobsMod.nearCafeSpot("interior:0,0:cafe_1", 5, 5);
    assert.ok(
      interiorSpot && interiorSpot.space === "interior:0,0:cafe_1",
      "nearCafeSpot should recognize World Settlement Café interiors",
    );
    assert.equal(
      jobsMod.nearCafeSpot("world", 0, 0),
      null,
      "nearCafeSpot should reject open world outside café",
    );
  });

  it("contains zero Unicode emojis across all new and updated WorldBox files", () => {
    const EMOJI_RE = /\p{Extended_Pictographic}/u;
    const files = [
      "src/app/games/worldbox/WorldBoxJobMinigames.tsx",
      "src/app/games/worldbox/WorldBoxJobPanel.tsx",
      "src/app/games/worldbox/WorldBoxFinancePanel.tsx",
      "src/app/games/worldbox/WorldBoxPrisonPanel.tsx",
      "src/app/games/worldbox/WorldBoxMetroPanel.tsx",
      "src/app/games/worldbox/WorldBoxClient.tsx",
      "src/lib/worldbox/social/jobs.ts",
      "src/app/api/worldbox/jobs/route.ts",
    ];
    for (const rel of files) {
      const content = read(rel);
      const match = content.match(EMOJI_RE);
      assert.equal(match, null, `Found forbidden Unicode emoji ${match?.[0] ?? ""} in ${rel}`);
    }
  });
});
