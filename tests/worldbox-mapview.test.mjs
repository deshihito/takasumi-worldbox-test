import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.join(import.meta.dirname, "..");
const client = fs.readFileSync(
  path.join(rootDir, "src/app/games/worldbox/WorldBoxClient.tsx"),
  "utf8",
);
const mapModal = fs.readFileSync(
  path.join(rootDir, "src/app/games/worldbox/WorldBoxMapModal.tsx"),
  "utf8",
);

test("マップ表示モードの状態とモーダル（WorldBoxMapModal）がある", () => {
  assert.match(client, /mapView/);
  assert.match(client, /<WorldBoxMapModal/);
  assert.match(mapModal, /CANVAS_SIZE = 512/);
  assert.match(mapModal, /256 \| 512 \| 1024/);
  assert.match(mapModal, /tileAt\(/);
});

test("ミニマップもプレイヤー中心の周辺図（全体図ではない）", () => {
  assert.match(client, /MINIMAP_TILES = 128/);
  assert.match(client, /paintLocalTerrain\(miniTerrainCanvas/);
  assert.ok(!client.includes("sampleMinimapTiles"), "全体マップの間引きが残っている");
  assert.ok(!client.includes("全体マップ"), "全体マップ表記が残っている");
});

test("大きなマップにもマーカーを描く（首都・生活圏・他プレイヤー・自分・ピン）", () => {
  assert.match(mapModal, /nations/);
  assert.match(mapModal, /settlementsNear/);
  assert.match(mapModal, /visiblePlayers/);
  assert.ok(!client.includes("buildingsRef"), "建物マーカーが残っている");
});

test("左上の ≡ メニューおよび M キー・ミニマップクリックから開ける", () => {
  assert.match(client, /id: "mapview"/);
  assert.match(client, /label: mapView \? "マップを閉じる" : "マップを見る"/);
  assert.ok(!client.includes("黄色い丸 = あなた"), "マップの凡例（説明文）が残っている");
});
