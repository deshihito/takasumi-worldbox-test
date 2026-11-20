"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CHUNK_SIZE,
  MAP_SEED,
  T_DIRT,
  T_GRASS,
  T_ROCK,
  T_SAND,
  T_SNOW,
  T_SNOW_TREE,
  T_TREE,
  T_WATER,
  generateChunk,
  mapTileAt,
  rectBounds,
  tileAt,
  tileIvsAt,
  worldBounds,
  type TopDownMap,
} from "@/lib/worldbox/world/mapgen";
import { pickRandomSpawn } from "@/lib/worldbox/world/spawn";
import {
  DASH_SPEED,
  PLAYER_RADIUS,
  SWIM_DASH_SPEED,
  SWIM_SPEED,
  WALK_SPEED,
  circleHitsSolid,
  findFreeNear,
  isWaterAt,
  stepMove,
} from "@/lib/worldbox/player/move";
import { isNightPhase, nightAmount, phaseAtTime } from "@/lib/worldbox/world/daynight";
import {
  advanceWalkPhase,
  attackSwingAngle,
  damp,
  moveLean,
  stepBeatIndex,
  walkBob,
  walkSquashY,
} from "@/lib/worldbox/media/anim";
import {
  WHIFF_ALPHA_SCALE,
  burstPaletteFor,
  createFxSystem,
  createShake,
  fxLifeRatio,
  phaseKind,
  popProgress,
  popScale,
  shakeOffsetAt,
  slashAlpha,
  spawnAmbient,
  spawnBurst,
  startShake,
  stepFx,
  swingProgress,
  weatherAmbientKind,
  weatherBlendAt,
  type FxBurstKind,
  type FxShake,
  type FxSystem,
} from "@/lib/worldbox/media/fx";
import type { SkillFxEffect } from "@/lib/worldbox/media/fx";
import { skillFxProgress, skillFxStage, spawnSkillFx } from "@/lib/worldbox/media/fx";
import {
  activeSkillFor,
  masteryRankOf,
  roleById,
  skillCooldownLeft,
  SKILLS,
  SCOUT_STAMINA_MULT,
} from "@/lib/worldbox/player/roles";
import { clockOffsetEstimate, type PresenceEntry } from "@/lib/worldbox/player/presence";
import { createPollGuard, type PollGuard } from "@/lib/poll-guard";
import { isWsHealthy, presencePollDue } from "@/lib/worldbox/core/realtime-poll";
import { notifyEconomyApplied } from "@/lib/worldbox/economy/economy-push";
import {
  notifyGuildBoardChanged,
  notifyGuildRequestsChanged,
} from "@/lib/worldbox/social/guild-board-push";
import { notifyGuildShopChanged } from "@/lib/worldbox/economy/guild-shop-push";
import { GUILD_PLOT_ANCHORS } from "@/lib/worldbox/economy/guild-shop";
import {
  STAMINA_MAX,
  canDash,
  createStamina,
  createTapTracker,
  isStickDash,
  registerKeyTap,
  rescueStamina,
  staminaGaugeVisible,
  stepStamina,
  type StaminaState,
  type StaminaUse,
  type TapTracker,
} from "@/lib/worldbox/player/stamina";
import {
  createRemoteTrack,
  stepRemoteTrack,
  updateRemoteTrack,
  type RemoteTrack,
} from "@/lib/worldbox/core/remote";
import type { NationView, NationsResponse } from "@/lib/worldbox/social/nations";
import {
  L_PLAZA,
  L_SAND,
  L_VOID,
  LOBBY_ENTRY,
  LOBBY_FLOOR_FALLBACK,
  LOBBY_FLOOR_SPRITE,
  LOBBY_H,
  LOBBY_STAIRS_DOWN,
  LOBBY_STAIRS_UP,
  LOBBY_DOWN_LANDING,
  LOBBY_UP_LANDING,
  LOBBY_W,
  LOBBY_WARP_PAD,
  buildLobby,
  lobbyDistrictAt,
  lobbyTileAt,
  stationArcadeNear,
  stationGenreNear,
  stationNear,
  RACETRACK,
  type LobbyData,
  type LobbyObject,
  type LobbyStation,
} from "@/lib/worldbox/world/lobby";
import {
  COAT_COLORS,
  RACE_DURATION_MS,
  generateRaceCore,
  horseTrackPose,
  scheduleAt,
  type RaceCore,
} from "@/lib/worldbox/activity/racing";
import {
  LOBBY2_H,
  LOBBY2_W,
  LOBBY3_H,
  LOBBY3_W,
  buildLobby2,
  buildLobby3,
  floorWarpAt,
  lobby2TileAt,
  lobby3TileAt,
  type LobbyFloorSpace,
} from "@/lib/worldbox/world/lobby-floors";
import { genreById, type ShopGenreId } from "@/lib/worldbox/economy/shops";
import {
  TENT_MAX_TIER,
  TENT_TIERS,
  buildTent,
  tentEntryFor,
  tentExitFor,
  tentTileAt,
} from "@/lib/worldbox/world/tent";
import {
  buildCaveLayer,
  buildDungeonFloor,
  buildRuins,
  lightRadiusTiles,
  makeInstanceSpace,
  parseInstanceSpace,
  placedLightRadiusTiles,
  type CaveLayer,
  type DungeonFloorData,
  type RuinsMap,
} from "@/lib/worldbox/world/instances";
import { EVENT_DUNGEON_ENTRANCE } from "@/lib/worldbox/core/events";
import { SEASON_NAMES, seasonDaysLeft, seasonOf } from "@/lib/worldbox/world/seasons";
import {
  biomeAt,
  structureById,
  structuresForChunk,
  type PlacedStructure,
} from "@/lib/worldbox/world/maplogic";
import { nearestEntrances, type CompassTarget } from "@/lib/worldbox/activity/compass";
import {
  objectRespawned,
  objectsForChunk,
  specialObjectById,
  surfaceObjectAt,
  surfaceSolidTilesInRect,
} from "@/lib/worldbox/world/objects";
import { fishingSpotAt } from "@/lib/worldbox/activity/fishing";
import { parseBoardPosts, type BoardPost } from "@/lib/worldbox/social/board";
import { parseSave, serializeSave, type SaveSpace } from "@/lib/worldbox/core/save";
import { chooseInitialSave } from "@/lib/worldbox/core/save-source";
import {
  actionForTile,
  blockHpFraction,
  cropStage,
  floorSpeedMultiplier,
  isFloorItem,
  isFlowerPotItem,
  isGateItem,
  isOverrideActive,
  isSeatItem,
  isShelfItem,
  isSignItem,
  isWellItem,
  parseTileOverride,
  placedBlockSolid,
  placedStationKinds,
  terrainHpFraction,
  tileKey,
  tileView,
  type TileActionKind,
  type TileOverridesMap,
} from "@/lib/worldbox/world/tiles";
import { CROPS, ITEMS, itemById } from "@/lib/worldbox/economy/items";
import {
  HUNGER_MAX,
  countItem,
  toolDurabilityFraction,
  type AdventureRoleId,
  type ItemSlot,
  type PlayerProfile,
  type SlotRef,
} from "@/lib/worldbox/player/profile";
import { isStallItem } from "@/lib/worldbox/economy/stalls";
import {
  containerCapacity,
  isContainerItem,
  type ContainerSlotRef,
} from "@/lib/worldbox/economy/containers";
import { isMachineItem, machineSpecFor } from "@/lib/worldbox/economy/machines";
import {
  DUNGEON_TILE_SRC,
  FARM_SPRITE_SRC,
  LOBBY_SPRITE_SRC,
  loadDungeonTiles,
  loadFarmSprites,
  loadLobbySprites,
  loadTextures,
} from "@/lib/worldbox/world/textures";
import {
  preloadImages,
  transitionAlpha,
  transitionDone,
  transitionSwapDue,
  SPRITE_PRELOAD_TIMEOUT_MS,
  TRANSITION_OVERLAY_RGB,
  type TransitionKind,
} from "@/lib/worldbox/world/transition";
import { isStickTouch, stickBase, stickVector } from "@/lib/worldbox/player/stick";
import { wbHudMetrics, wbLayoutMode } from "@/lib/worldbox/world/layout";
import {
  AFFORDANCE_RING_RGB,
  DENIED_RING_RGB,
  deniedFeedback,
  isWithinAffordanceRange,
  nudgeBobPx,
  nudgeRingAlpha,
  stickKnobRadius,
} from "@/lib/worldbox/player/affordance";
import {
  bgmSceneFor,
  footstepMaterialFor,
  loadWbSoundSettings,
  playPianoNotes,
  playWbSe,
  playWbStep,
  saveWbSoundSettings,
  seForFxBurst,
  setWbBgmScene,
  stopWbBgm,
  unlockWbAudio,
  type WbSoundSettings,
} from "@/lib/worldbox/media/sound";
import { useGamesNav } from "../GamesShell";
import WorldBoxCasinoPanel from "./WorldBoxCasinoPanel";
import WorldBoxRacingPanel from "./WorldBoxRacingPanel";
import WorldBoxStockPanel from "./WorldBoxStockPanel";
import WorldBoxPianoPanel from "./WorldBoxPianoPanel";
import WorldBoxArcadePanel from "./WorldBoxArcadePanel";
import { getWebGame } from "@/lib/games-catalog";
import WorldBoxMachinePanel from "./WorldBoxMachinePanel";
import WorldBoxEconomyPanel from "./WorldBoxEconomyPanel";
import WorldBoxCompanyPanel from "./WorldBoxCompanyPanel";
import WorldBoxMarketPanel from "./WorldBoxMarketPanel";
import WorldBoxFinancePanel from "./WorldBoxFinancePanel";
import WorldBoxGuildBoardPanel from "./WorldBoxGuildBoardPanel";
import WorldBoxGuildShopPanel from "./WorldBoxGuildShopPanel";
import WorldBoxJobPanel from "./WorldBoxJobPanel";
import WorldBoxPrisonPanel from "./WorldBoxPrisonPanel";
import WorldBoxEngineeringPanel from "./WorldBoxEngineeringPanel";
import WorldBoxMetroPanel from "./WorldBoxMetroPanel";
import WorldBoxTradePanel from "./WorldBoxTradePanel";
import WorldBoxRealEstatePanel from "./WorldBoxRealEstatePanel";
import WorldBoxGovernancePanel from "./WorldBoxGovernancePanel";
import {
  APARTMENT_EXIT,
  apartmentTileAt,
  buildApartment,
  parseApartmentSpace,
} from "@/lib/worldbox/world/realestate";
import {
  effectiveVehicleMoveSpeed,
  vehicleSpecFor,
  type VehicleItemId,
} from "@/lib/worldbox/player/vehicles";
import { isPrisonGuardSweepingVent } from "@/lib/worldbox/social/prison";
import {
  PRISON_H,
  PRISON_VISITOR_ENTRY,
  PRISON_W,
  buildPrison,
  prisonDistrictAt,
  prisonTileAt,
} from "@/lib/worldbox/world/prison-map";
import { ItemSlot as ItemSlotView, ItemSlotGrid } from "./ItemSlotGrid";
import { WbIcon, drawCanvasPinGlyph } from "./WbIcon";
import WorldBoxMapModal, { paintIndoorMapCanvas, type MapSnapshot } from "./WorldBoxMapModal";
import {
  evaluateCitizenPose,
  nearestSettlement,
  settlementRoadAt,
  settlementsNear,
} from "@/lib/worldbox/world/settlements";
import {
  loadLocalMapPins,
  saveLocalMapPins,
  type MapPin,
  type TrackedTarget,
} from "@/lib/worldbox/world/map-pins";

const SAVE_KEY = "taka-worldbox-save-v6";
const TILE = 44;
const AVATAR_TILES = 1.3;

const TILE_TEXTURE: Record<number, string> = {
  [T_WATER]: "water",
  [T_SAND]: "sand",
};
const TILE_DUNGEON: Record<number, string> = {
  [T_GRASS]: "grass",
  [T_DIRT]: "dirt",
  [T_TREE]: "tree",
  [T_ROCK]: "rock",
  [T_SNOW]: "snow",
  [T_SNOW_TREE]: "snowTree",
};
const TILE_FALLBACK: Record<number, string> = {
  [T_GRASS]: "#57a639",
  [T_WATER]: "#3a7cb4",
  [T_SAND]: "#ddd29a",
  [T_TREE]: "#57a639",
  [T_ROCK]: "#8d8d93",
  [T_DIRT]: "#8a5a2b",
  [T_SNOW]: "#eef3f6",
  [T_SNOW_TREE]: "#eef3f6",
};
const MINIMAP_COLOR: Record<number, string> = {
  [T_GRASS]: "#57a639",
  [T_WATER]: "#3a7cb4",
  [T_SAND]: "#ddd29a",
  [T_TREE]: "#2f6121",
  [T_ROCK]: "#8d8d93",
  [T_DIRT]: "#8a5a2b",
  [T_SNOW]: "#f4f8fa",
  [T_SNOW_TREE]: "#9fc4bb",
};
const MINIMAP_PX = 256;
const MINIMAP_TILES = 128;
const MINIMAP_SCALE = MINIMAP_PX / MINIMAP_TILES;
const COMPASS_CAVE_COLOR = "#e8933a";
const COMPASS_DUNGEON_COLOR = "#b07fe8";

function drawCompassOnMinimap(
  mctx: CanvasRenderingContext2D,
  target: { x: number; y: number } | null,
  color: string,
  ox: number,
  oy: number,
  px: number,
  py: number,
): void {
  if (!target) return;
  const mx = (target.x - ox) * MINIMAP_SCALE;
  const my = (target.y - oy) * MINIMAP_SCALE;
  if (mx >= 4 && my >= 4 && mx <= MINIMAP_PX - 4 && my <= MINIMAP_PX - 4) {
    mctx.fillStyle = color;
    mctx.strokeStyle = "rgba(255,255,255,0.9)";
    mctx.lineWidth = 1.5;
    mctx.beginPath();
    mctx.arc(mx, my, 3.4, 0, Math.PI * 2);
    mctx.fill();
    mctx.stroke();
    return;
  }
  const dx = target.x - px;
  const dy = target.y - py;
  const m = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
  const ex = MINIMAP_PX / 2 + (dx / m) * (MINIMAP_PX / 2 - 11);
  const ey = MINIMAP_PX / 2 + (dy / m) * (MINIMAP_PX / 2 - 11);
  mctx.save();
  mctx.translate(ex, ey);
  mctx.rotate(Math.atan2(dy, dx));
  mctx.fillStyle = color;
  mctx.strokeStyle = "rgba(0,0,0,0.65)";
  mctx.lineWidth = 1;
  mctx.beginPath();
  mctx.moveTo(6, 0);
  mctx.lineTo(-4, -4);
  mctx.lineTo(-4, 4);
  mctx.closePath();
  mctx.fill();
  mctx.stroke();
  mctx.restore();
}

function updateCompassHud(
  arrowEl: HTMLSpanElement | null,
  distEl: HTMLSpanElement | null,
  target: CompassTarget | null,
  px: number,
  py: number,
): void {
  if (arrowEl) {
    if (!target) {
      arrowEl.style.opacity = "0.25";
    } else {
      arrowEl.style.opacity = "1";
      const deg = (Math.atan2(target.y - py, target.x - px) * 180) / Math.PI;
      arrowEl.style.transform = `rotate(${deg.toFixed(1)}deg)`;
    }
  }
  if (distEl) {
    distEl.textContent = target
      ? String(Math.round(Math.hypot(target.x - px, target.y - py)))
      : "—";
  }
}

type PlayerState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: 1 | -1;
  phase: number;
};

type OtherRender = {
  track: RemoteTrack;
  phase: number;
};

type CompanySignView = {
  companyId: string;
  name: string;
  description: string;
  memberCount: number;
  isMember: boolean;
  isOwner: boolean;
  products: {
    id: string;
    name: string;
    description: string;
    price: number;
    creatorName: string;
  }[];
};

const MOVE_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);

function texReady(img: HTMLImageElement | undefined): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0;
}

const BLOCK_CRACK_LINES: readonly (readonly (readonly [number, number])[])[] = [
  [
    [0.16, 0.08],
    [0.34, 0.3],
    [0.29, 0.5],
    [0.47, 0.68],
  ],
  [
    [0.86, 0.18],
    [0.66, 0.38],
    [0.73, 0.56],
    [0.56, 0.8],
  ],
  [
    [0.18, 0.86],
    [0.42, 0.7],
    [0.6, 0.88],
    [0.82, 0.74],
  ],
];

function drawBlockCracks(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  tx: number,
  ty: number,
  hpFrac: number,
) {
  const dmg = 1 - hpFrac;
  if (dmg <= 0) return;
  const stage = dmg < 0.34 ? 1 : dmg < 0.67 ? 2 : 3;
  const jitter = ((Math.abs(Math.sin(tx * 127.1 + ty * 311.7) * 43758.5453) % 1) - 0.5) * 0.07;
  ctx.save();
  ctx.strokeStyle = `rgba(14,10,8,${0.34 + 0.18 * stage})`;
  ctx.lineWidth = 1.3;
  ctx.lineJoin = "round";
  for (let i = 0; i < stage; i++) {
    const line = BLOCK_CRACK_LINES[i];
    ctx.beginPath();
    for (let j = 0; j < line.length; j++) {
      const px = bx + (line[j][0] + jitter) * TILE;
      const py = by + (line[j][1] + jitter) * TILE;
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

const NATION_ERROR_LABEL: Record<string, string> = {
  already_in_nation: "既に国に所属しています",
  nation_exists: "そのサーバーの国は既にあります",
  no_free_tile: "首都を置ける空き地がありません",
  not_owner: "建国はサーバーのオーナーのみです",
  not_member: "そのサーバーのメンバーではありません",
  guilds_scope_required: "サーバー情報の取得に再ログインが必要です",
  guilds_unavailable: "サーバー情報を取得できませんでした",
  nation_not_found: "国が見つかりません",
  nation_private: "非公開の国です",
  not_in_nation: "国に所属していません",
  king_must_transfer_or_disband: "国民がいる間、王は離脱できません",
  not_at_guild_board: "ギルドボードの前で操作してください",
  unauthorized: "ログインが必要です",
  forbidden: "その権限がありません",
};

const TILE_ERROR_LABEL: Record<string, string> = {
  tool_required: "道具が必要",
  tile_blocked: "そこではできない",
  not_owner: "他人のもの",
  not_ready: "まだ育っていない",
  no_crop: "作物がない",
  unknown_seed: "種が不正",
  unknown_block: "ブロックが不正",
  no_block: "ブロックがない",
  on_capital: "首都には置けない",
  not_enough_items: "足りない",
  world_frozen: "いまは変更できない（凍結中）",
  too_far: "遠すぎる",
  depleted: "もう無い",
  needs_pickaxe: "ツルハシが必要",
  needs_golden_key: "金の鍵が必要",
  pickaxe_tier: "ツルハシが弱い",
  not_at_onsen: "温泉が遠い",
  unauthorized: "ログインが必要",
  tiles_unavailable: "いま使えない",
  not_empty: "中身が入っている",
  no_container: "収納がない",
  containers_unavailable: "いま使えない",
};

function ItemIcon({ id, size = 22 }: { id: string; size?: number }) {
  const def = itemById(id);
  if (!def?.icon) return null;
  return (
    <img
      src={def.icon}
      alt=""
      width={size}
      height={size}
      draggable={false}
      style={{ imageRendering: "pixelated", flexShrink: 0, display: "block", margin: "0 auto" }}
    />
  );
}

function SlotContent({ slot, durFrac }: { slot: ItemSlot; durFrac?: number | null }) {
  if (!slot) return null;
  const def = itemById(slot.id);
  return (
    <>
      {def?.icon ? (
        <img
          src={def.icon}
          alt=""
          width={26}
          height={26}
          draggable={false}
          style={{ imageRendering: "pixelated", display: "block" }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            border: "1px dashed rgba(255,255,255,0.45)",
            display: "block",
          }}
        />
      )}
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: 2,
          bottom: 1,
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1,
          color: "#fff",
          textShadow: "0 1px 2px rgba(0,0,0,0.9)",
          pointerEvents: "none",
        }}
      >
        {slot.count}
      </span>
      {durFrac !== null && durFrac !== undefined && durFrac < 1 && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 3,
            right: 3,
            bottom: 2,
            height: 3,
            borderRadius: 2,
            background: "rgba(0,0,0,0.65)",
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              display: "block",
              height: "100%",
              width: `${Math.round(Math.max(0, Math.min(1, durFrac)) * 100)}%`,
              background: durFrac > 0.5 ? "#7ed957" : durFrac > 0.25 ? "#f2c53c" : "#e2483a",
            }}
          />
        </span>
      )}
    </>
  );
}

const EMPTY_NATIONS: NationsResponse = {
  nations: [],
  me: null,
  playerNations: {},
  loggedIn: false,
  myGuilds: [],
  guildsScopeRequired: false,
};

const FLAT_LOBBY_SPRITES = new Set(["warp_pad", "stairs", "tapestry"]);

const SURFACE_VEIN_COLORS: Record<string, string> = {
  copper_vein: "#c47b4a",
  coal_vein: "#3a3a42",
  rare_vein: "#e8c85a",
  crystal_cluster: "#9fe8ff",
};

function drawSurfaceObject(
  ctx: CanvasRenderingContext2D,
  objectId: string,
  sx: number,
  sy: number,
  tile: number,
  spent: boolean,
  now: number,
) {
  const u = tile / 44;
  ctx.save();
  if (spent) ctx.globalAlpha = 0.45;
  const cx = sx + tile / 2;
  const ground = sy + tile * 0.82;
  switch (objectId) {
    case "berry_bush":
    case "herb_patch":
    case "mushroom_patch":
    case "flower_meadow": {
      if (objectId === "flower_meadow") {
        const cols = ["#e87aa8", "#ffd23e", "#ffffff", "#b48ce8"];
        for (let i = 0; i < 7; i++) {
          const fx = sx + tile * (0.18 + (0.64 * ((i * 37) % 10)) / 10);
          const fy = sy + tile * (0.3 + (0.5 * ((i * 53) % 10)) / 10);
          ctx.fillStyle = "#3e7d2c";
          ctx.fillRect(fx - 1, fy, 2, tile * 0.14);
          ctx.fillStyle = cols[i % cols.length];
          ctx.beginPath();
          ctx.arc(fx, fy - 2, 3 * u, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      if (objectId === "mushroom_patch") {
        ctx.fillStyle = "#e8dcc4";
        ctx.fillRect(cx - 7 * u, ground - 9 * u, 4 * u, 9 * u);
        ctx.fillRect(cx + 3 * u, ground - 7 * u, 4 * u, 7 * u);
        ctx.fillStyle = "#b0483e";
        ctx.beginPath();
        ctx.arc(cx - 5 * u, ground - 9 * u, 6 * u, Math.PI, 0);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 5 * u, ground - 7 * u, 5 * u, Math.PI, 0);
        ctx.fill();
        break;
      }
      ctx.fillStyle = objectId === "berry_bush" ? "#2f6121" : "#3e7d2c";
      ctx.beginPath();
      ctx.arc(cx - 8 * u, ground - 6 * u, 8 * u, 0, Math.PI * 2);
      ctx.arc(cx + 8 * u, ground - 6 * u, 8 * u, 0, Math.PI * 2);
      ctx.arc(cx, ground - 12 * u, 9 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = objectId === "berry_bush" ? "#e5484d" : "#a8c256";
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(cx + (i - 2) * 6 * u, ground - (6 + (i % 3) * 4) * u, 2.2 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "beehive": {
      ctx.fillStyle = "#d9a441";
      ctx.beginPath();
      ctx.ellipse(cx, ground - 12 * u, 9 * u, 11 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#a87c2a";
      ctx.lineWidth = 2;
      for (const dy of [-16, -10, -4]) {
        ctx.beginPath();
        ctx.moveTo(cx - 8 * u, ground + dy * u);
        ctx.lineTo(cx + 8 * u, ground + dy * u);
        ctx.stroke();
      }
      ctx.fillStyle = "#5d3a17";
      ctx.beginPath();
      ctx.arc(cx, ground - 6 * u, 2.6 * u, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "bird_nest": {
      ctx.strokeStyle = "#8a5a2b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, ground - 6 * u, 11 * u, 5 * u, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#6b4423";
      ctx.beginPath();
      ctx.ellipse(cx, ground - 5 * u, 8 * u, 3.6 * u, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#e8eef2";
      ctx.beginPath();
      ctx.ellipse(cx - 3 * u, ground - 7 * u, 3 * u, 2.4 * u, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 3.4 * u, ground - 7 * u, 3 * u, 2.4 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "sulfur_vent": {
      ctx.fillStyle = "#8d8d93";
      ctx.beginPath();
      ctx.moveTo(cx - 11 * u, ground);
      ctx.lineTo(cx - 4 * u, ground - 9 * u);
      ctx.lineTo(cx + 4 * u, ground - 9 * u);
      ctx.lineTo(cx + 11 * u, ground);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffd23e";
      ctx.beginPath();
      ctx.ellipse(cx, ground - 8 * u, 4 * u, 2 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(240,240,230,0.5)";
      const rise = (now / 900 + cx) % 1;
      ctx.beginPath();
      ctx.arc(cx, ground - (12 + rise * 10) * u, (2 + rise * 3) * u, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "copper_vein":
    case "coal_vein":
    case "rare_vein":
    case "crystal_cluster": {
      ctx.fillStyle = "#55565f";
      ctx.beginPath();
      ctx.moveTo(sx + tile * 0.14, ground);
      ctx.lineTo(sx + tile * 0.3, sy + tile * 0.3);
      ctx.lineTo(sx + tile * 0.58, sy + tile * 0.18);
      ctx.lineTo(sx + tile * 0.86, ground);
      ctx.closePath();
      ctx.fill();
      const mineral = SURFACE_VEIN_COLORS[objectId] ?? "#c9c9cf";
      if (objectId === "crystal_cluster") {
        ctx.fillStyle = mineral;
        for (const [dx, h] of [
          [0.34, 0.34],
          [0.5, 0.46],
          [0.64, 0.3],
        ] as const) {
          ctx.beginPath();
          ctx.moveTo(sx + tile * (dx - 0.06), ground - tile * 0.08);
          ctx.lineTo(sx + tile * dx, ground - tile * h);
          ctx.lineTo(sx + tile * (dx + 0.06), ground - tile * 0.08);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.fillStyle = mineral;
        for (const [dx, dy, r] of [
          [0.36, 0.52, 0.07],
          [0.56, 0.4, 0.06],
          [0.66, 0.6, 0.05],
        ] as const) {
          ctx.beginPath();
          ctx.arc(sx + tile * dx, sy + tile * dy, tile * r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "ruins_chest":
    case "cave_chest":
    case "dungeon_chest": {
      const body = spent ? "#5d4020" : objectId === "dungeon_chest" ? "#5e4632" : "#8a5a2b";
      ctx.fillStyle = body;
      ctx.fillRect(sx + tile * 0.2, sy + tile * 0.34, tile * 0.6, tile * 0.44);
      ctx.fillStyle = spent ? "#4a3319" : objectId === "dungeon_chest" ? "#4c3826" : "#77501f";
      ctx.fillRect(sx + tile * 0.2, sy + tile * 0.34, tile * 0.6, tile * 0.14);
      ctx.fillStyle = objectId === "dungeon_chest" ? "#6b6f7a" : "#e8c85a";
      ctx.fillRect(sx + tile * 0.46, sy + tile * 0.34, tile * 0.08, tile * 0.44);
      break;
    }
    case "hot_spring": {
      ctx.fillStyle = "#7cc0e8";
      ctx.beginPath();
      ctx.ellipse(cx, ground - 4 * u, 15 * u, 7 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#a8d4f0";
      ctx.beginPath();
      ctx.ellipse(cx, ground - 4 * u, 10 * u, 4.4 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8d8d93";
      ctx.beginPath();
      ctx.arc(sx + tile * 0.1, ground - 2 * u, 4 * u, 0, Math.PI * 2);
      ctx.arc(sx + tile * 0.9, ground - 2 * u, 4 * u, 0, Math.PI * 2);
      ctx.fill();
      if (!spent) {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        const rise = (now / 1100 + cx) % 1;
        ctx.beginPath();
        ctx.arc(cx - 5 * u, ground - (10 + rise * 9) * u, 2.4 * u, 0, Math.PI * 2);
        ctx.arc(cx + 6 * u, ground - (8 + ((rise + 0.5) % 1) * 9) * u, 2 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "ancient_pillar": {
      ctx.fillStyle = "#9aa0a6";
      ctx.fillRect(cx - 5 * u, ground - 26 * u, 10 * u, 26 * u);
      ctx.fillStyle = "#7d838a";
      ctx.fillRect(cx - 7 * u, ground - 29 * u, 14 * u, 4 * u);
      ctx.fillRect(cx - 7 * u, ground - 3 * u, 14 * u, 3 * u);
      ctx.strokeStyle = "#6b7076";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 5 * u, ground - 18 * u);
      ctx.lineTo(cx + 1 * u, ground - 13 * u);
      ctx.lineTo(cx - 2 * u, ground - 8 * u);
      ctx.stroke();
      break;
    }
    case "fallen_log":
    case "driftwood": {
      ctx.fillStyle = objectId === "fallen_log" ? "#8a5a2b" : "#b59a72";
      ctx.beginPath();
      ctx.ellipse(cx, ground - 5 * u, 16 * u, 5.5 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = objectId === "fallen_log" ? "#c89b62" : "#cdb894";
      ctx.beginPath();
      ctx.ellipse(sx + tile * 0.16, ground - 5 * u, 3.4 * u, 5 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = objectId === "fallen_log" ? "#8a5a2b" : "#a8906a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(sx + tile * 0.16, ground - 5 * u, 1.8 * u, 3 * u, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (objectId === "fallen_log") {
        ctx.fillStyle = "#3e7d2c";
        ctx.beginPath();
        ctx.arc(cx + 9 * u, ground - 10 * u, 3.4 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

const STATION_LABEL: Record<LobbyStation, string> = {
  board: "掲示板",
  guild: "ギルドボード",
  shop: "ショップ",
  bank: "銀行",
  casino: "カジノ",
  arena: "アリーナ",
  smith: "製造・R&D拠点",
  fountain: "噴水",
  rest: "休憩",
  arcade: "アーケード",
  race: "競馬場",
  piano: "ピアノ",
  sell: "売却専用ショップ",
  telescope: "展望台",
  stock: "取引所",
  prison_work: "懲役作業ファクトリー",
  prison_desk: "刑務所 保釈・司法窓口",
  prison_escape: "地下換気ダクト",
  prison_visit: "面会・差し入れ窓口",
};

export default function WorldBoxClient() {
  const { prefix, embedded, identity, retryIdentity } = useGamesNav();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const compassCaveArrowRef = useRef<HTMLSpanElement | null>(null);
  const compassCaveDistRef = useRef<HTMLSpanElement | null>(null);
  const compassDungeonArrowRef = useRef<HTMLSpanElement | null>(null);
  const compassDungeonDistRef = useRef<HTMLSpanElement | null>(null);
  const chatGuardRef = useRef<PollGuard>(createPollGuard());
  const partyGuardRef = useRef<PollGuard>(createPollGuard());
  const boardGuardRef = useRef<PollGuard>(createPollGuard());
  const nationsGuardRef = useRef<PollGuard>(createPollGuard());
  const guildShopGuardRef = useRef<PollGuard>(createPollGuard());
  const guildShopPlotsRef = useRef<{ idx: number; guildName: string }[]>([]);
  const invGuardRef = useRef<PollGuard>(createPollGuard());
  const vitalsGuardRef = useRef<PollGuard>(createPollGuard());
  const instanceGuardRef = useRef<PollGuard>(createPollGuard());
  const rtOpenRef = useRef(false);
  const rtLastMsgRef = useRef(0);
  const wsHealthyNow = () => isWsHealthy(rtOpenRef.current, rtLastMsgRef.current, Date.now());
  const nationsRefreshRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const guildShopRefreshRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const boardRefreshRef = useRef<() => Promise<void>>(async () => {});
  const chatReloadRef = useRef<(() => void) | null>(null);
  const invRefreshRef = useRef<() => Promise<void>>(async () => {});
  const [statusText, setStatusText] = useState("読み込み中…");
  const [othersCount, setOthersCount] = useState(0);
  const [showMap, setShowMap] = useState(true);
  const [viewport, setViewport] = useState({ w: 1280, h: 800 });
  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  const layoutMode = wbLayoutMode(viewport.w, viewport.h);
  const hud = wbHudMetrics(layoutMode);
  const showMapRef = useRef(true);
  showMapRef.current = showMap;
  const nationsRef = useRef<NationsResponse>(EMPTY_NATIONS);
  const playerPosRef = useRef({ x: 0.5, y: 0.5 });
  const [nationsUi, setNationsUi] = useState<NationsResponse>(EMPTY_NATIONS);
  const [showEconomy, setShowEconomy] = useState(false);
  const [showCompany, setShowCompany] = useState(false);
  const [mapView, setMapView] = useState(false);
  const [porterUi, setPorterUi] = useState<{ x: number; y: number } | null>(null);
  const porterRef = useRef<{ x: number; y: number } | null>(null);
  porterRef.current = porterUi;
  useEffect(() => {
    if (!mapView) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/worldbox/warp", { headers: { Accept: "application/json" } });
        if (!res.ok) return;
        const data = (await res.json()) as { porter?: { x: number; y: number } | null };
        if (alive) setPorterUi(data.porter ?? null);
      } catch {
        /* 読めなくてもマップは見られる */
      }
    };
    void load();
    const timer = window.setInterval(load, 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [mapView]);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  useEffect(() => {
    setCanFullscreen(
      typeof HTMLElement !== "undefined" && "requestFullscreen" in HTMLElement.prototype,
    );
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void stageRef.current?.requestFullscreen().catch(() => {});
    }
  };
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [nationMsg, setNationMsg] = useState("");
  const blockedRef = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = {
        x: Math.floor(playerPosRef.current.x),
        y: Math.floor(playerPosRef.current.y),
      };
      setCoords((prev) => (prev.x === next.x && prev.y === next.y ? prev : next));
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const [gate, setGate] = useState<"checking" | "ok" | "denied">("checking");
  const [gateTry, setGateTry] = useState(0);
  const [guestBusy, setGuestBusy] = useState(false);
  const [booted, setBooted] = useState(false);
  const gateOk = gate === "ok" && booted;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/worldbox/gate", { headers: { Accept: "application/json" } });
        const data = res.ok ? ((await res.json()) as { allowed?: boolean }) : { allowed: false };
        if (!cancelled) setGate(data.allowed ? "ok" : "denied");
      } catch {
        if (!cancelled) setGate("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gateTry]);
  useEffect(() => {
    if (gate !== "ok" || booted) return;
    let cancelled = false;
    void preloadImages(
      [
        ...Object.values(LOBBY_SPRITE_SRC),
        ...Object.values(FARM_SPRITE_SRC),
        ...Object.values(DUNGEON_TILE_SRC),
      ],
      { timeoutMs: SPRITE_PRELOAD_TIMEOUT_MS },
    ).then(() => {
      if (!cancelled) setBooted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [gate, booted]);
  const identityId = identity?.id;
  useEffect(() => {
    if (identityId) setGateTry((t) => t + 1);
  }, [identityId]);
  useEffect(() => {
    if (embedded && identityId) setGate("ok");
  }, [embedded, identityId]);
  useEffect(() => {
    if (!embedded || gate !== "denied") return;
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      if (count > 24) {
        window.clearInterval(timer);
        return;
      }
      setGateTry((t) => t + 1);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [embedded, gate]);
  const [spaceUi, setSpaceUi] = useState<SaveSpace>("world");
  const spaceUiRef = useRef<SaveSpace>("world");
  spaceUiRef.current = spaceUi;
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [prisonOpen, setPrisonOpen] = useState(false);
  const [engineeringOpen, setEngineeringOpen] = useState(false);
  const [metroOpen, setMetroOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeTarget, setTradeTarget] = useState<{ presenceId: string; name: string } | null>(null);
  const [realEstateOpen, setRealEstateOpen] = useState(false);
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [equippedVehicle, setEquippedVehicle] = useState<VehicleItemId | null>(null);
  const equippedVehicleRef = useRef<VehicleItemId | null>(null);
  equippedVehicleRef.current = equippedVehicle;
  const [mapPins, setMapPins] = useState<MapPin[]>([]);
  const mapPinsRef = useRef<MapPin[]>([]);
  mapPinsRef.current = mapPins;
  useEffect(() => {
    setMapPins(loadLocalMapPins());
  }, []);
  const [trackedTarget, setTrackedTarget] = useState<TrackedTarget | null>(null);
  const trackedTargetRef = useRef<TrackedTarget | null>(null);
  trackedTargetRef.current = trackedTarget;
  const trackedDistElRef = useRef<HTMLSpanElement | null>(null);
  const worldFloatTextsRef = useRef<
    { x: number; y: number; space: string; text: string; color: string; startedAt: number }[]
  >([]);
  const pushFloatText = (x: number, y: number, text: string, color = "#facc15") => {
    worldFloatTextsRef.current.push({
      x,
      y,
      space: spaceUiRef.current,
      text,
      color,
      startedAt: performance.now(),
    });
  };
  const addMapPin = (pin: Omit<MapPin, "id" | "createdAt">) => {
    const entry: MapPin = {
      ...pin,
      id: `pin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
    };
    setMapPins((prev) => {
      const next = [entry, ...prev].slice(0, 40);
      saveLocalMapPins(next);
      return next;
    });
    setTrackedTarget({
      kind: "pin",
      space: entry.space,
      x: entry.x,
      y: entry.y,
      label: `${entry.icon} ${entry.label}`,
      color: entry.color,
      pinId: entry.id,
    });
    pushFloatText(entry.x, entry.y - 0.5, `${entry.icon} ${entry.label}`, entry.color);
  };
  const deleteMapPin = (id: string) => {
    setMapPins((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveLocalMapPins(next);
      return next;
    });
    setTrackedTarget((cur) => (cur?.kind === "pin" && cur.pinId === id ? null : cur));
  };
  const setWaypoint = (wp: { space: string; x: number; y: number; label: string } | null) => {
    if (!wp) {
      setTrackedTarget(null);
      return;
    }
    setTrackedTarget({
      kind: "job",
      space: wp.space,
      x: wp.x,
      y: wp.y,
      label: wp.label,
      color: "#38bdf8",
    });
    pushFloatText(
      playerPosRef.current.x,
      playerPosRef.current.y - 0.8,
      `案内: ${wp.label}`,
      "#38bdf8",
    );
  };
  const getMapSnapshotRef = useRef<() => MapSnapshot>(() => ({
    space: "world",
    playerX: 0,
    playerY: 0,
    indoor: null,
    nations: [],
    porter: null,
    players: [],
  }));
  const forceMoveRef = useRef<((mv: { space: string; x: number; y: number }) => void) | null>(null);
  const refreshMmoRef = useRef<(() => Promise<void>) | null>(null);
  type MmoSummaryState = {
    news: { id: string; at: number; kind: string; text: string }[];
    prison: {
      jailed: boolean;
      wantedLevel: number;
      bounty: number;
      releaseAt: number;
      remainingMs: number;
      cellId: string;
      inmateNumber: string;
    };
    career: { currentCareer: string; level: number; creditScore: number };
  };
  const [mmoSummary, setMmoSummary] = useState<MmoSummaryState | null>(null);
  const mmoSummaryRef = useRef<MmoSummaryState | null>(null);
  mmoSummaryRef.current = mmoSummary;
  const [mmoFeedIndex, setMmoFeedIndex] = useState(0);
  useEffect(() => {
    if (gate !== "ok") return;
    let disposed = false;
    const load = async () => {
      try {
        const res = await fetch("/api/worldbox/mmo", { headers: { Accept: "application/json" } });
        if (!res.ok || disposed) return;
        const d = (await res.json()) as MmoSummaryState;
        if (disposed) return;
        setMmoSummary(d);
      } catch {
        /* noop */
      }
    };
    void fetch("/api/worldbox/vehicles", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { equippedVehicle?: VehicleItemId | null } | null) => {
        if (!disposed && v) setEquippedVehicle(v.equippedVehicle ?? null);
      })
      .catch(() => {});
    refreshMmoRef.current = load;
    void load();
    const poll = window.setInterval(() => void load(), 9000);
    const rot = window.setInterval(() => setMmoFeedIndex((i) => i + 1), 6500);
    return () => {
      disposed = true;
      refreshMmoRef.current = null;
      window.clearInterval(poll);
      window.clearInterval(rot);
    };
  }, [gate]);
  const activeNews =
    mmoSummary && mmoSummary.news.length > 0
      ? mmoSummary.news[mmoFeedIndex % mmoSummary.news.length]
      : null;
  const mmoFeedText = activeNews?.text ?? "";
  const mmoFeedKind = activeNews?.kind ?? "economy";
  const [collectionSel, setCollectionSel] = useState<string | null>(null);
  const [stationUi, setStationUi] = useState<LobbyStation | null>(null);
  const [worldStationKinds, setWorldStationKinds] = useState("");
  const [stationGenre, setStationGenre] = useState<ShopGenreId | null>(null);
  const [stationArcade, setStationArcade] = useState<string | null>(null);
  const [arcadeOpen, setArcadeOpen] = useState(false);
  const arcadeOpenRef = useRef(false);
  useEffect(() => {
    arcadeOpenRef.current = arcadeOpen;
  }, [arcadeOpen]);
  const [telescopeOpen, setTelescopeOpen] = useState(false);
  const telescopeOpenRef = useRef(false);
  useEffect(() => {
    telescopeOpenRef.current = telescopeOpen;
  }, [telescopeOpen]);
  const telescopeCenterRef = useRef(0);
  const [pianoOpen, setPianoOpen] = useState(false);
  useEffect(() => {
    if (stationUi !== "piano") setPianoOpen(false);
  }, [stationUi]);
  const pianoSendRef = useRef<((notes: number[]) => void) | null>(null);
  const pianoPendingRef = useRef<number[]>([]);
  const pianoFlushTimerRef = useRef<number | undefined>(undefined);
  const playPianoNote = (semi: number) => {
    playPianoNotes([semi]);
    pianoPendingRef.current.push(semi);
    if (pianoFlushTimerRef.current !== undefined) return;
    pianoFlushTimerRef.current = window.setTimeout(() => {
      pianoFlushTimerRef.current = undefined;
      const notes = pianoPendingRef.current.splice(0, 8);
      if (notes.length > 0) pianoSendRef.current?.(notes);
    }, 30);
  };
  useEffect(() => {
    setTelescopeOpen(false);
  }, [spaceUi]);
  const warpActionRef = useRef<(target: SaveSpace) => void>(() => {});
  const instanceWarpRef = useRef<(target: string, entry: { x: number; y: number }) => void>(
    () => {},
  );
  const [eventsUi, setEventsUi] = useState<
    { id: string; name: string; kind: string; daysLeft: number }[]
  >([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/worldbox/events", {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          events?: { id: string; name: string; kind: string; daysLeft: number }[];
        };
        if (alive) setEventsUi(data.events ?? []);
      } catch {
        /* noop */
      }
    };
    void load();
    const timer = window.setInterval(load, 60000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  const enterEventDungeon = () => {
    const r = buildRuins(MAP_SEED, EVENT_DUNGEON_ENTRANCE.x, EVENT_DUNGEON_ENTRANCE.y);
    instanceWarpRef.current(
      makeInstanceSpace("ruins", EVENT_DUNGEON_ENTRANCE.x, EVENT_DUNGEON_ENTRANCE.y, 0),
      { x: r.portal.x + 0.5, y: r.portal.y + 0.5 },
    );
  };
  const teleportActionRef = useRef<(x: number, y: number) => void>(() => {});
  const travelToNation = async () => {
    setNationMsg("");
    try {
      const res = await fetch("/api/worldbox/nations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "travel" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        x?: number;
        y?: number;
      };
      if (!res.ok || typeof data.x !== "number" || typeof data.y !== "number") {
        setNationMsg(NATION_ERROR_LABEL[data.error ?? ""] ?? "失敗しました");
        return;
      }
      teleportActionRef.current(data.x, data.y);
    } catch {
      setNationMsg("失敗しました");
    }
  };
  const teleportToPorter = async () => {
    try {
      const res = await fetch("/api/worldbox/warp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "teleport" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        x?: number;
        y?: number;
      };
      if (res.ok && typeof data.x === "number" && typeof data.y === "number") {
        setMapView(false);
        teleportActionRef.current(data.x, data.y);
        return;
      }
      setTileMsg(
        data.error === "no_porter"
          ? "ポーターなし"
          : data.error === "not_in_union"
            ? "ユニオン未所属"
            : "テレポートできない",
      );
    } catch {
      setTileMsg("テレポートできない");
    }
  };
  const respawnActionRef = useRef<(point: { x: number; y: number }) => void>(() => {});
  const [casinoOpen, setCasinoOpen] = useState(false);
  const [racingOpen, setRacingOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [plazaMsg, setPlazaMsg] = useState("");
  const staminaBoostRef = useRef(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [guildBoardOpen, setGuildBoardOpen] = useState(false);
  const [inviteGuildId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("union");
  });
  useEffect(() => {
    if (inviteGuildId) setGuildBoardOpen(true);
  }, [inviteGuildId]);
  const [guildShopOpen, setGuildShopOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const sendReport = async () => {
    const text = reportText.trim();
    if (!text) return;
    try {
      const res = await fetch("/api/worldbox/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "report",
          text,
          x: Math.floor(playerPosRef.current.x),
          y: Math.floor(playerPosRef.current.y),
        }),
      });
      setTileMsg(res.ok ? "通報した" : "通報できない");
      if (res.ok) {
        setReportText("");
        setReportOpen(false);
      }
    } catch {
      /* noop */
    }
  };
  const [boardPosts, setBoardPosts] = useState<BoardPost[]>([]);
  const [boardLoggedIn, setBoardLoggedIn] = useState(false);
  const [boardText, setBoardText] = useState("");
  const [boardMsg, setBoardMsg] = useState("");
  const [soundSettings, setSoundSettings] = useState<WbSoundSettings>({ bgm: true, se: true });
  useEffect(() => {
    setSoundSettings(loadWbSoundSettings());
    const unlock = () => unlockWbAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      stopWbBgm();
    };
  }, []);
  useEffect(() => {
    const applyScene = () => {
      setWbBgmScene(
        bgmSceneFor({
          space: spaceUi,
          night: nightAmount(phaseAtTime(Date.now() / 1000)),
          casinoOpen,
        }),
      );
    };
    applyScene();
    const timer = setInterval(applyScene, 1000);
    return () => clearInterval(timer);
  }, [spaceUi, casinoOpen]);
  const toggleSound = (key: "bgm" | "se") => {
    const next = { ...soundSettings, [key]: !soundSettings[key] };
    setSoundSettings(next);
    saveWbSoundSettings(next);
    if (key === "se" && next.se) playWbSe("click");
  };
  const refreshBoard = async () => {
    const ticket = boardGuardRef.current.begin();
    if (ticket === null) return;
    try {
      const res = await fetch("/api/worldbox/board", { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const data = (await res.json()) as { posts?: BoardPost[]; loggedIn?: boolean };
      if (!boardGuardRef.current.isCurrent(ticket)) return;
      setBoardPosts(data.posts ?? []);
      setBoardLoggedIn(!!data.loggedIn);
    } catch {
      /* 掲示板が読めなくても歩き続けられる */
    } finally {
      boardGuardRef.current.end(ticket);
    }
  };
  const postBoard = async () => {
    const text = boardText.trim();
    if (!text) return;
    setBoardMsg("");
    try {
      const res = await fetch("/api/worldbox/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json().catch(() => ({}))) as { posts?: BoardPost[]; error?: string };
      if (!res.ok) {
        setBoardMsg(
          data.error === "unauthorized"
            ? "投稿はログイン後"
            : data.error === "too_fast"
              ? "少し待ってから投稿してください"
              : "投稿できませんでした",
        );
        return;
      }
      setBoardText("");
      if (data.posts) setBoardPosts(data.posts);
    } catch {
      setBoardMsg("投稿できませんでした");
    }
  };
  useEffect(() => {
    if (!boardOpen) return;
    void refreshBoard();
    const timer = window.setInterval(() => {
      if (!wsHealthyNow()) void refreshBoard();
    }, 10000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardOpen]);

  useEffect(() => {
    if (stationUi !== "board") setBoardOpen(false);
    if (stationUi !== "casino") setCasinoOpen(false);
    if (stationUi !== "guild") setGuildBoardOpen(false);
    if (stationUi !== "arcade") setArcadeOpen(false);
    if (stationUi !== "stock") setStockOpen(false);
    setPlazaMsg("");
  }, [stationUi]);

  const plazaAction = async (action: "fountain" | "rest") => {
    try {
      const res = await fetch("/api/worldbox/plaza", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        item?: string | null;
        retryAfterSec?: number;
        profile?: PlayerProfile;
      };
      if (!res.ok) {
        setPlazaMsg(
          data.error === "insufficient_balance"
            ? "お金が足りません"
            : data.error === "rest_cooldown"
              ? `まだ休めません（あと ${data.retryAfterSec ?? "?"} 秒）`
              : data.error === "unauthorized"
                ? "ログインが必要です"
                : "受け付けられませんでした",
        );
        return;
      }
      if (data.profile) setInvProfile(data.profile);
      staminaBoostRef.current = true;
      playWbSe(action === "fountain" ? "coin" : "success");
      if (action === "fountain") {
        const itemName = data.item ? (itemById(data.item)?.name ?? data.item) : null;
        setPlazaMsg(
          itemName ? `スタミナが回復した。${itemName} を手に入れた` : "スタミナが回復した",
        );
      } else {
        setPlazaMsg("スタミナが回復した");
      }
    } catch {
      setPlazaMsg("受け付けられませんでした");
    }
  };

  const applyNationsData = (data: NationsResponse) => {
    nationsRef.current = data;
    setNationsUi(data);
  };
  const refreshNations = async (force = false) => {
    const ticket = nationsGuardRef.current.begin(force ? { force: true } : undefined);
    if (ticket === null) return;
    try {
      const res = await fetch("/api/worldbox/nations", { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const data = (await res.json()) as NationsResponse;
      if (!nationsGuardRef.current.isCurrent(ticket)) return;
      applyNationsData(data);
    } catch {
      /* 国家が読めなくても歩き続けられる */
    } finally {
      nationsGuardRef.current.end(ticket);
    }
  };
  nationsRefreshRef.current = refreshNations;
  boardRefreshRef.current = refreshBoard;
  const refreshGuildShopPlots = async (force = false) => {
    const ticket = guildShopGuardRef.current.begin(force ? { force: true } : undefined);
    if (ticket === null) return;
    try {
      const res = await fetch("/api/worldbox/guild-shop", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        plots?: ({ idx: number; guildName: string } | null)[];
      };
      if (!guildShopGuardRef.current.isCurrent(ticket)) return;
      guildShopPlotsRef.current = (data.plots ?? [])
        .filter((p): p is { idx: number; guildName: string } => p !== null)
        .map((p) => ({ idx: p.idx, guildName: p.guildName }));
    } catch {
      /* 読めなくても歩き続けられる */
    } finally {
      guildShopGuardRef.current.end(ticket);
    }
  };
  guildShopRefreshRef.current = refreshGuildShopPlots;
  const nationAction = async (body: Record<string, unknown>) => {
    setNationMsg("");
    try {
      const res = await fetch("/api/worldbox/nations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setNationMsg(NATION_ERROR_LABEL[data.error ?? ""] ?? "失敗しました");
        return;
      }
      await refreshNations(true);
    } catch {
      setNationMsg("失敗しました");
    }
  };
  const [invProfile, setInvProfile] = useState<PlayerProfile | null>(null);
  const [gaugeNow, setGaugeNow] = useState(() => Date.now());
  const gaugeSkill =
    invProfile && invProfile.role !== "free"
      ? invProfile.role === "teleporter"
        ? SKILLS.porter
        : activeSkillFor(invProfile)
      : null;
  useEffect(() => {
    if (!gaugeSkill) return;
    const timer = window.setInterval(() => setGaugeNow(Date.now()), 200);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gaugeSkill?.id, invProfile?.role]);
  const [, setCtTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setCtTick((v) => v + 1), 500);
    return () => window.clearInterval(timer);
  }, []);
  const invRef = useRef<PlayerProfile | null>(null);
  invRef.current = invProfile;
  const hasCompass = !!invProfile && countItem(invProfile, "explorer_compass") > 0;
  const [selSlot, setSelSlot] = useState(0);
  const selSlotRef = useRef(0);
  selSlotRef.current = selSlot;
  const [storageOpen, setStorageOpen] = useState(false);
  const [heldSlot, setHeldSlot] = useState<SlotRef | null>(null);
  const lastSlotTapRef = useRef<{ zone: SlotRef["zone"]; index: number; at: number } | null>(null);
  const lastHotbarTapRef = useRef<{ index: number; at: number } | null>(null);
  const [containerPanel, setContainerPanel] = useState<{
    x: number;
    y: number;
    itemId: string;
    space: "world" | "tent" | "lobby" | "lobby2" | "lobby3";
  } | null>(null);
  const [machinePanel, setMachinePanel] = useState<{ x: number; y: number } | null>(null);
  const sitTileRef = useRef<{ x: number; y: number } | null>(null);
  const [containerSlots, setContainerSlots] = useState<ItemSlot[] | null>(null);
  const [heldPanelSlot, setHeldPanelSlot] = useState<ContainerSlotRef | null>(null);
  const [seedPicker, setSeedPicker] = useState<{ x: number; y: number } | null>(null);
  const [signEdit, setSignEdit] = useState<{ x: number; y: number; text: string } | null>(null);
  const [stallPanel, setStallPanel] = useState<{
    x: number;
    y: number;
    selItemId: string | null;
    mine: boolean;
  } | null>(null);
  const [stallInfo, setStallInfo] = useState<
    { itemId: string; name: string; price: number; count: number; mine: boolean } | null | undefined
  >(undefined);
  const [stallPriceText, setStallPriceText] = useState("100");
  const [stallCountText, setStallCountText] = useState("1");
  const [companyAnchor, setCompanyAnchor] = useState<string | null>(null);
  const companyHqsRef = useRef<{ id: string; name: string; x: number; y: number }[]>([]);
  const [signShop, setSignShop] = useState<{ x: number; y: number; sign: CompanySignView } | null>(
    null,
  );
  const [signShopBusy, setSignShopBusy] = useState(false);
  const [signShopMsg, setSignShopMsg] = useState("");
  const [signRevealed, setSignRevealed] = useState<{ name: string; content: string } | null>(null);
  const [signReg, setSignReg] = useState<{ companyId: string; name: string } | null | undefined>(
    undefined,
  );
  const [signViewerCompanyId, setSignViewerCompanyId] = useState<string | null>(null);
  const [tileMsg, setTileMsg] = useState("");
  const [tabTaken, setTabTaken] = useState(false);
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      setShowEconomy(false);
      setJobOpen(false);
      setPrisonOpen(false);
      setEngineeringOpen(false);
      setMetroOpen(false);
      setTradeOpen(false);
      setRealEstateOpen(false);
      setGovernanceOpen(false);
      setMapView(false);
      setCasinoOpen(false);
      setRacingOpen(false);
      setStockOpen(false);
      setMarketOpen(false);
      setFinanceOpen(false);
      setBoardOpen(false);
      setGuildBoardOpen(false);
      setStorageOpen(false);
      setHeldSlot(null);
      setSeedPicker(null);
      setContainerPanel(null);
      setHeldPanelSlot(null);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/worldbox/company?hqs=${encodeURIComponent(spaceUi)}`, {
          headers: { Accept: "application/json" },
        });
        const json = (await res.json().catch(() => ({}))) as {
          hqs?: { id: string; name: string; x: number; y: number }[];
        };
        if (alive) companyHqsRef.current = Array.isArray(json.hqs) ? json.hqs : [];
      } catch {
        if (alive) companyHqsRef.current = [];
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [spaceUi]);
  const buySignProduct = async (productId: string) => {
    if (!signShop || signShopBusy) return;
    setSignShopBusy(true);
    setSignShopMsg("");
    try {
      const res = await fetch("/api/worldbox/company", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "product_buy", productId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        content?: string;
        name?: string;
      };
      if (!res.ok) {
        setSignShopMsg(
          json.error === "not_enough_coins"
            ? "お金が足りません"
            : json.error === "guest_not_allowed"
              ? "ゲストは購入できません"
              : "購入できませんでした",
        );
        return;
      }
      if (typeof json.content === "string") {
        setSignRevealed({ name: String(json.name ?? "商品"), content: json.content });
      }
      setSignShop((cur) =>
        cur
          ? {
              ...cur,
              sign: { ...cur.sign, products: cur.sign.products.filter((p) => p.id !== productId) },
            }
          : cur,
      );
    } catch {
      setSignShopMsg("通信に失敗しました");
    } finally {
      setSignShopBusy(false);
    }
  };
  const postSignRegistration = async (action: "sign_register" | "sign_unregister") => {
    if (!signEdit) return;
    try {
      const res = await fetch("/api/worldbox/company", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action, x: signEdit.x, y: signEdit.y }),
      });
      if (!res.ok) {
        setTileMsg("看板の店舗登録ができませんでした");
        return;
      }
      if (action === "sign_register") {
        setTileMsg("看板を会社の店舗・受付として登録しました");
        const view = await fetch(`/api/worldbox/company/sign?x=${signEdit.x}&y=${signEdit.y}`, {
          headers: { Accept: "application/json" },
        });
        const data = (await view.json().catch(() => ({}))) as { sign?: CompanySignView | null };
        setSignReg(data.sign ? { companyId: data.sign.companyId, name: data.sign.name } : null);
      } else {
        setSignReg(null);
        setTileMsg("看板の店舗登録を解除しました");
      }
    } catch {
      setTileMsg("通信に失敗しました");
    }
  };
  const tilesRef = useRef<TileOverridesMap>({});
  const tilesVersionRef = useRef(0);
  const fxEventsRef = useRef<
    {
      kind: FxBurstKind | "whiff";
      x: number;
      y: number;
      sizeTiles?: number;
      color?: string;
      colors?: string[];
    }[]
  >([]);
  const denyFxRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const seenAffordanceRef = useRef(new Map<string, number>());
  const [denyStamp, setDenyStamp] = useState(0);
  const skillFxRef = useRef<{ effect: SkillFxEffect; stage: number }[]>([]);
  const lastTapRef = useRef<{ x: number; y: number; at: number } | null>(null);

  const denyAtTile = (x: number, y: number) => {
    denyFxRef.current = { x, y, at: performance.now() };
    playWbSe("error");
    setDenyStamp((n) => n + 1);
  };

  const castSkillAt = async (t: { x: number; y: number }): Promise<boolean | "denied"> => {
    const profile = invRef.current;
    if (!profile || profile.role !== "teleporter") return false;
    const pos = playerPosRef.current;
    const space = spaceUi;
    const skill = SKILLS.porter;
    if (skillCooldownLeft(profile, skill.id, Date.now()) > 0) return false;
    try {
      const res = await fetch("/api/worldbox/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "skill",
          skill: skill.id,
          tx: t.x + 0.5,
          ty: t.y + 0.5,
          space,
          px: pos.x,
          py: pos.y,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        profile?: PlayerProfile;
        fx?: SkillFxEffect["kind"];
        cx?: number;
        cy?: number;
        error?: string;
      };
      if (res.ok && data.profile) {
        setInvProfile(data.profile);
        skillFxRef.current.push({
          effect: {
            kind: data.fx ?? skill.fx,
            x: data.cx ?? t.x + 0.5,
            y: data.cy ?? t.y + 0.5,
            fromX: pos.x,
            fromY: pos.y,
            startedAt: performance.now(),
            seed: Math.floor(Math.random() * 1e9),
          },
          stage: -1,
        });
        playWbSe("warp");
        return true;
      }
      if (data.error === "cooldown") {
        void refreshInv();
        return true;
      }
      return "denied";
    } catch {
      return false;
    }
  };
  const castSkillRef = useRef(castSkillAt);
  castSkillRef.current = castSkillAt;
  const selfIdRef = useRef<string | null>(null);
  const syncBlockBlocked = () => {
    const now = Date.now();
    const next = new Set<string>();
    for (const [key, ov] of Object.entries(tilesRef.current)) {
      if (!ov.block || !isOverrideActive(ov, now)) continue;
      if (placedBlockSolid(ov.block.itemId)) next.add(key);
      else if (isGateItem(ov.block.itemId) && ov.gateOpen !== true) next.add(key);
    }
    const center = tilesCenterRef.current ?? {
      x: Math.floor(playerPosRef.current.x),
      y: Math.floor(playerPosRef.current.y),
    };
    for (const key of surfaceSolidTilesInRect(
      MAP_SEED,
      center.x - 64,
      center.y - 64,
      center.x + 64,
      center.y + 64,
    )) {
      next.add(key);
    }
    blockedRef.current = next;
  };

  const refreshInv = async () => {
    const ticket = invGuardRef.current.begin();
    if (ticket === null) return;
    try {
      const res = await fetch("/api/worldbox/profile", { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const data = (await res.json()) as { profile?: PlayerProfile };
      if (data.profile && invGuardRef.current.isCurrent(ticket)) setInvProfile(data.profile);
    } catch {
      /* 読めなくても歩き続けられる */
    } finally {
      invGuardRef.current.end(ticket);
    }
  };
  invRefreshRef.current = refreshInv;
  const applyVitalsResult = (data: {
    profile?: PlayerProfile;
    teleport?: { space: string; x: number; y: number };
  }) => {
    if (data.profile) setInvProfile(data.profile);
    if (data.teleport) {
      const t = data.teleport;
      if (t.space && parseInstanceSpace(t.space)) {
        instanceWarpRef.current(t.space, { x: t.x, y: t.y });
      } else {
        respawnActionRef.current({ x: t.x, y: t.y });
      }
      playWbSe("warp");
    }
  };
  const postVitals = async (body: Record<string, unknown>, force = false) => {
    const ticket = vitalsGuardRef.current.begin(force ? { force: true } : undefined);
    if (ticket === null) return;
    try {
      const res = await fetch("/api/worldbox/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        profile?: PlayerProfile;
        teleport?: { space: string; x: number; y: number };
      };
      if (res.ok && vitalsGuardRef.current.isCurrent(ticket)) applyVitalsResult(data);
    } catch {
      /* バイタルが届かなくても歩き続けられる（次回同期で精算される） */
    } finally {
      vitalsGuardRef.current.end(ticket);
    }
  };
  const ruinsStateRef = useRef<{
    chests: Record<string, boolean>;
    traps: Record<string, boolean>;
    doors: Record<string, boolean>;
  }>({ chests: {}, traps: {}, doors: {} });
  const refreshRuinsState = async (space: string) => {
    const ticket = instanceGuardRef.current.begin({ force: true });
    if (ticket === null) return;
    try {
      const res = await fetch(`/api/worldbox/instances?space=${encodeURIComponent(space)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        chests?: Record<string, boolean>;
        traps?: Record<string, boolean>;
        doors?: Record<string, boolean>;
      };
      if (!instanceGuardRef.current.isCurrent(ticket)) return;
      ruinsStateRef.current = {
        chests: data.chests ?? {},
        traps: data.traps ?? {},
        doors: data.doors ?? {},
      };
    } catch {
      /* 読めなくても歩き続けられる */
    } finally {
      instanceGuardRef.current.end(ticket);
    }
  };
  const refreshRuinsStateRef = useRef(refreshRuinsState);
  refreshRuinsStateRef.current = refreshRuinsState;
  const instanceTeleportRef = useRef<((x: number, y: number) => void) | null>(null);
  const caveStateRef = useRef<{ veins: Record<string, number>; chest: number }>({
    veins: {},
    chest: 0,
  });
  const refreshCaveState = async (space: string) => {
    const ticket = instanceGuardRef.current.begin({ force: true });
    if (ticket === null) return;
    try {
      const res = await fetch(`/api/worldbox/instances?space=${encodeURIComponent(space)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { veins?: Record<string, number>; chest?: number };
      if (!instanceGuardRef.current.isCurrent(ticket)) return;
      caveStateRef.current = { veins: data.veins ?? {}, chest: data.chest ?? 0 };
    } catch {
      /* 読めなくても歩き続けられる */
    } finally {
      instanceGuardRef.current.end(ticket);
    }
  };
  const refreshCaveStateRef = useRef(refreshCaveState);
  refreshCaveStateRef.current = refreshCaveState;
  const dungeonStateRef = useRef<{
    opened: Record<string, boolean>;
    size: number;
  }>({ opened: {}, size: 1 });
  const refreshDungeonState = async (space: string) => {
    const ticket = instanceGuardRef.current.begin({ force: true });
    if (ticket === null) return;
    try {
      const res = await fetch(`/api/worldbox/instances?space=${encodeURIComponent(space)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        chests?: Record<string, number>;
        size?: number;
      };
      if (!instanceGuardRef.current.isCurrent(ticket)) return;
      dungeonStateRef.current = {
        opened: Object.fromEntries(Object.keys(data.chests ?? {}).map((k) => [k, true])),
        size: data.size ?? 1,
      };
    } catch {
      /* 読めなくても歩き続けられる */
    } finally {
      instanceGuardRef.current.end(ticket);
    }
  };
  const refreshDungeonStateRef = useRef(refreshDungeonState);
  refreshDungeonStateRef.current = refreshDungeonState;
  type PartyViewClient = {
    id: string;
    entrance: { x: number; y: number };
    members: { name: string; role: AdventureRoleId; rank: number }[];
  };
  const [partyUi, setPartyUi] = useState<{
    party: PartyViewClient | null;
    partyKey: string;
    isLeader: boolean;
    invite: { partyId: string; leaderName: string } | null;
  }>({ party: null, partyKey: "", isLeader: false, invite: null });
  const partyRef = useRef(partyUi);
  partyRef.current = partyUi;
  const myPartyKeyRef = useRef("");
  const [nearDungeonEntrance, setNearDungeonEntrance] = useState(false);
  const [playerCard, setPlayerCard] = useState<{
    id: string;
    name: string;
    role: AdventureRoleId;
    rank: number;
  } | null>(null);
  const playerCardTimerRef = useRef<number | null>(null);
  const showPlayerCard = (card: {
    id: string;
    name: string;
    role: AdventureRoleId;
    rank: number;
  }) => {
    setPlayerCard(card);
    if (playerCardTimerRef.current) window.clearTimeout(playerCardTimerRef.current);
    playerCardTimerRef.current = window.setTimeout(() => setPlayerCard(null), 6000);
  };
  const showPlayerCardRef = useRef(showPlayerCard);
  showPlayerCardRef.current = showPlayerCard;
  const [chatChannel, setChatChannel] = useState<"proximity" | "global" | "union">("proximity");
  const [chatMsgs, setChatMsgs] = useState<
    { name: string; text: string; at: number; source?: string }[]
  >([]);
  const [chatText, setChatText] = useState("");
  const chatChannelRef = useRef(chatChannel);
  chatChannelRef.current = chatChannel;
  useEffect(() => {
    let disposed = false;
    const load = async (force = false) => {
      if (!force && wsHealthyNow()) return;
      const ticket = chatGuardRef.current.begin();
      if (ticket === null) return;
      try {
        const res = await fetch(
          `/api/worldbox/chat?channel=${chatChannelRef.current}&space=${encodeURIComponent(spaceUi)}`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok || disposed) return;
        const data = (await res.json()) as {
          messages?: { name: string; text: string; at: number; source?: string }[];
        };
        if (!disposed && chatGuardRef.current.isCurrent(ticket)) setChatMsgs(data.messages ?? []);
      } catch {
        /* noop */
      } finally {
        chatGuardRef.current.end(ticket);
      }
    };
    chatReloadRef.current = () => {
      void load(true);
    };
    void load(true);
    const timer = window.setInterval(() => {
      void load();
    }, 3000);
    return () => {
      disposed = true;
      chatReloadRef.current = null;
      window.clearInterval(timer);
    };
  }, [spaceUi, chatChannel]);
  const fishingRef = useRef<{ x: number; y: number; biteAt: number } | null>(null);
  const darkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fishCaughtRef = useRef(new Map<string, number>());
  const postCatch = async (x: number, y: number) => {
    try {
      const res = await fetch("/api/worldbox/fishing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        gained?: Record<string, number>;
        profile?: PlayerProfile;
        error?: string;
      };
      if (res.ok) {
        fishCaughtRef.current.set(`${x},${y}`, Date.now());
        if (data.profile) setInvProfile(data.profile);
        const names = Object.entries(data.gained ?? {})
          .map(([id, n]) => `${itemById(id)?.name ?? id}×${n}`)
          .join(" ");
        setTileMsg(names ? `釣れた: ${names}` : "何も釣れなかった");
      } else {
        setTileMsg(
          data.error === "tool_required"
            ? "釣り竿が要る"
            : data.error === "not_respawned"
              ? "魚がいない"
              : "釣れない",
        );
      }
    } catch {
      /* noop */
    }
  };
  const postCatchRef = useRef(postCatch);
  postCatchRef.current = postCatch;
  const surfaceObjStateRef = useRef(new Map<string, number>());
  const postSurfaceObject = async (x: number, y: number, objectId: string) => {
    try {
      const res = await fetch("/api/worldbox/objects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        gained?: Record<string, number>;
        trapped?: boolean;
        profile?: PlayerProfile;
        error?: string;
        broke?: string;
      };
      if (res.ok) {
        surfaceObjStateRef.current.set(`${x},${y}`, Date.now());
        if (data.profile) setInvProfile(data.profile);
        const def = specialObjectById(objectId);
        const fxKind =
          def?.interaction === "mine"
            ? "mine"
            : def?.interaction === "rest"
              ? "splash"
              : def?.tool === "axe"
                ? "chop"
                : "harvest";
        fxEventsRef.current.push({
          kind: fxKind,
          x,
          y,
          colors: burstPaletteFor(objectId) ?? undefined,
        });
        const names = Object.entries(data.gained ?? {})
          .map(([id, n]) => `${itemById(id)?.name ?? id}×${n}`)
          .join(" ");
        const baseMsg = names ? `${def?.name ?? "採取"}: ${names}` : "何も無かった";
        setTileMsg(
          data.broke ? `${baseMsg}（${itemById(data.broke)?.name ?? "道具"}が壊れた）` : baseMsg,
        );
        if (data.broke) playWbSe("debris");
        void refreshSurfaceStatesRef.current();
      } else {
        setTileMsg(TILE_ERROR_LABEL[data.error ?? ""] ?? "できない");
        if (data.error === "depleted") void refreshSurfaceStatesRef.current();
      }
    } catch {
      /* noop */
    }
  };
  const postSurfaceObjectRef = useRef(postSurfaceObject);
  postSurfaceObjectRef.current = postSurfaceObject;
  const refreshSurfaceStates = async () => {
    const c = tilesCenterRef.current ?? {
      x: Math.floor(playerPosRef.current.x),
      y: Math.floor(playerPosRef.current.y),
    };
    const q = `x0=${c.x - 64}&y0=${c.y - 64}&x1=${c.x + 64}&y1=${c.y + 64}`;
    try {
      const [objRes, fishRes] = await Promise.all([
        fetch(`/api/worldbox/objects?${q}`, { headers: { Accept: "application/json" } }),
        fetch(`/api/worldbox/fishing?${q}`, { headers: { Accept: "application/json" } }),
      ]);
      if (objRes.ok) {
        const data = (await objRes.json()) as { states?: Record<string, number> };
        for (const [k, v] of Object.entries(data.states ?? {})) {
          if (v > (surfaceObjStateRef.current.get(k) ?? 0)) surfaceObjStateRef.current.set(k, v);
        }
      }
      if (fishRes.ok) {
        const data = (await fishRes.json()) as { caught?: Record<string, number> };
        for (const [k, v] of Object.entries(data.caught ?? {})) {
          if (v > (fishCaughtRef.current.get(k) ?? 0)) fishCaughtRef.current.set(k, v);
        }
      }
    } catch {
      /* 読めなくても歩き続けられる */
    }
  };
  const refreshSurfaceStatesRef = useRef(refreshSurfaceStates);
  refreshSurfaceStatesRef.current = refreshSurfaceStates;
  const sendChat = async () => {
    const text = chatText.trim();
    if (!text) return;
    setChatText("");
    try {
      const res = await fetch("/api/worldbox/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: chatChannel, text, space: spaceUi }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          message?: { name: string; text: string; at: number; source?: string };
        };
        if (data.message) setChatMsgs((prev) => [data.message!, ...prev].slice(0, 50));
      } else if (res.status === 429) {
        setTileMsg("少し待って");
      } else if (res.status === 409) {
        setTileMsg("ユニオン未所属");
      }
    } catch {
      /* noop */
    }
  };
  const refreshParty = async (force = false) => {
    const ticket = partyGuardRef.current.begin(force ? { force: true } : undefined);
    if (ticket === null) return;
    try {
      const dungeonSpace = parseInstanceSpace(spaceUi)?.kind === "dungeon" ? spaceUi : null;
      const res = await fetch(
        dungeonSpace
          ? `/api/worldbox/party?space=${encodeURIComponent(dungeonSpace)}`
          : "/api/worldbox/party",
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        party?: PartyViewClient | null;
        partyKey?: string;
        isLeader?: boolean;
        invite?: { partyId: string; leaderName: string } | null;
        dungeon?: { size: number } | null;
      };
      if (!partyGuardRef.current.isCurrent(ticket)) return;
      if (data.dungeon) {
        dungeonStateRef.current = {
          ...dungeonStateRef.current,
          size: data.dungeon.size,
        };
      }
      myPartyKeyRef.current = data.partyKey ?? "";
      setPartyUi({
        party: data.party ?? null,
        partyKey: data.partyKey ?? "",
        isLeader: data.isLeader ?? false,
        invite: data.invite ?? null,
      });
    } catch {
      /* noop */
    } finally {
      partyGuardRef.current.end(ticket);
    }
  };
  const refreshPartyRef = useRef(refreshParty);
  refreshPartyRef.current = refreshParty;
  useEffect(() => {
    void refreshParty();
    const timer = window.setInterval(() => {
      if (!wsHealthyNow()) void refreshPartyRef.current();
    }, 4000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void refreshSurfaceStates();
    const timer = window.setInterval(() => {
      if (!wsHealthyNow()) void refreshSurfaceStatesRef.current();
    }, 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const postParty = async (
    action: string,
    extra: Record<string, unknown> = {},
  ): Promise<{ ok: boolean; space?: string; error?: string }> => {
    try {
      const res = await fetch("/api/worldbox/party", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          px: playerPosRef.current.x,
          py: playerPosRef.current.y,
          ...extra,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { space?: string; error?: string };
      void refreshParty(true);
      return { ok: res.ok, space: data.space, error: data.error };
    } catch {
      return { ok: false, error: "network" };
    }
  };
  const postPartyRef = useRef(postParty);
  postPartyRef.current = postParty;
  const enterDungeonRef = useRef<((ex: number, ey: number) => void) | null>(null);
  const postInstance = async (
    action: "mine" | "open_chest" | "onsen" | "open_door" | "trap" | "leave",
    extra?: {
      veinKey?: string;
      chestIdx?: number;
      doorIdx?: number;
      trapIdx?: number;
      fxX?: number;
      fxY?: number;
      fxObjectId?: string;
    },
  ) => {
    const space = spaceUi;
    const kindNow = parseInstanceSpace(space)?.kind;
    if (kindNow !== "cave" && kindNow !== "ruins" && kindNow !== "dungeon") return;
    try {
      const res = await fetch("/api/worldbox/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          space,
          px: playerPosRef.current.x,
          py: playerPosRef.current.y,
          ...extra,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        gained?: Record<string, number>;
        trapped?: boolean;
        profile?: PlayerProfile;
        teleport?: { x: number; y: number } | null;
        kind?: string;
        broke?: string;
      };
      if (!res.ok) {
        if (data.error && TILE_ERROR_LABEL[data.error]) setTileMsg(TILE_ERROR_LABEL[data.error]);
        if (kindNow === "cave") void refreshCaveState(space);
        else if (kindNow === "dungeon") void refreshDungeonState(space);
        else void refreshRuinsState(space);
        return;
      }
      if (data.profile) setInvProfile(data.profile);
      if (data.broke) {
        setTileMsg(`${itemById(data.broke)?.name ?? "道具"}が壊れた`);
        playWbSe("debris");
      }
      if (data.teleport) {
        instanceTeleportRef.current?.(data.teleport.x, data.teleport.y);
        playWbSe("warp");
      } else if (
        extra?.fxX !== undefined &&
        extra?.fxY !== undefined &&
        (action === "mine" || action === "open_chest" || action === "open_door")
      ) {
        fxEventsRef.current.push({
          kind: action === "mine" ? "mine" : action === "open_chest" ? "harvest" : "place",
          x: extra.fxX,
          y: extra.fxY,
          colors:
            burstPaletteFor(extra.fxObjectId ?? (action === "open_chest" ? "chest" : undefined)) ??
            undefined,
        });
        playWbSe("success");
      } else if (action === "onsen") {
        fxEventsRef.current.push({
          kind: "splash",
          x: playerPosRef.current.x,
          y: playerPosRef.current.y,
        });
        playWbSe("success");
      } else {
        fxEventsRef.current.push({
          kind: "poof",
          x: playerPosRef.current.x,
          y: playerPosRef.current.y,
        });
        playWbSe("success");
      }
      if (kindNow === "cave") void refreshCaveState(space);
      else if (kindNow === "dungeon") void refreshDungeonState(space);
      else void refreshRuinsState(space);
    } catch {
      /* 失敗しても歩き続けられる */
    }
  };
  const postInstanceRef = useRef(postInstance);
  postInstanceRef.current = postInstance;
  useEffect(() => {
    const timer = window.setInterval(
      () =>
        void postVitals({
          action: "sync",
          px: playerPosRef.current.x,
          py: playerPosRef.current.y,
          space: spaceUiRef.current,
        }),
      15000,
    );
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tilesCenterRef = useRef<{ x: number; y: number } | null>(null);
  const tilesInFlightRef = useRef(false);
  const tilesQueuedRef = useRef(false);
  const refreshTiles = async () => {
    if (tilesInFlightRef.current) {
      tilesQueuedRef.current = true;
      return;
    }
    tilesInFlightRef.current = true;
    const tilesGen = tilesVersionRef.current;
    try {
      const px = Math.floor(playerPosRef.current.x);
      const py = Math.floor(playerPosRef.current.y);
      const x0 = px - 64;
      const y0 = py - 64;
      const res = await fetch(
        `/api/worldbox/tiles?x0=${x0}&y0=${y0}&x1=${x0 + 127}&y1=${y0 + 127}`,
        { headers: { Accept: "application/json" } },
      );
      if (res.ok && tilesGen !== tilesVersionRef.current) {
        tilesQueuedRef.current = true;
      } else if (res.ok) {
        const data = (await res.json()) as { overrides?: TileOverridesMap; selfId?: string | null };
        if (data.selfId !== undefined) selfIdRef.current = data.selfId;
        const next: TileOverridesMap = { ...tilesRef.current };
        for (const key of Object.keys(next)) {
          const m = /^(-?\d+),(-?\d+)$/.exec(key);
          if (!m) continue;
          const x = Number(m[1]);
          const y = Number(m[2]);
          if (x >= x0 && x <= x0 + 127 && y >= y0 && y <= y0 + 127) delete next[key];
        }
        Object.assign(next, data.overrides ?? {});
        tilesRef.current = next;
        tilesVersionRef.current += 1;
        tilesCenterRef.current = { x: px, y: py };
        syncBlockBlocked();
        void refreshSurfaceStatesRef.current();
      }
    } catch {
      /* 読めなくても歩き続けられる */
    } finally {
      tilesInFlightRef.current = false;
    }
    if (tilesQueuedRef.current) {
      tilesQueuedRef.current = false;
      void refreshTiles();
    }
  };
  const refreshTilesRef = useRef(refreshTiles);
  refreshTilesRef.current = refreshTiles;
  const postTileAction = async (
    action: TileActionKind,
    x: number,
    y: number,
    seedId?: string,
    itemId?: string,
    text?: string,
  ) => {
    setTileMsg("");
    const prevBlockId =
      action === "mine_block" ? tilesRef.current[tileKey(x, y)]?.block?.itemId : undefined;
    try {
      const res = await fetch("/api/worldbox/tiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          x,
          y,
          ...(seedId ? { seedId } : {}),
          ...(itemId ? { itemId } : {}),
          ...(text !== undefined ? { text } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        key?: string;
        override?: TileOverridesMap[string] | null;
        profile?: PlayerProfile;
        broke?: string;
      };
      if (!res.ok) {
        setTileMsg(TILE_ERROR_LABEL[data.error ?? ""] ?? "できませんでした");
        fxEventsRef.current.push({ kind: "whiff", x, y });
        return;
      }
      const fxKind: Record<TileActionKind, FxBurstKind> = {
        chop: "chop",
        mine: "mine",
        till: "till",
        plant: "plant",
        harvest: "harvest",
        place_block: "place",
        mine_block: "debris",
        plant_flower: "plant",
        remove_flower: "harvest",
        toggle_gate: "place",
        set_sign: "place",
        set_display: "place",
        clear_display: "harvest",
        draw_water: "splash",
      };
      const fxForAction = action === "mine_block" && data.override?.block ? "mine" : fxKind[action];
      fxEventsRef.current.push({
        kind: fxForAction,
        x,
        y,
        colors: action === "mine_block" ? (burstPaletteFor(prevBlockId) ?? undefined) : undefined,
      });
      if (data.key) {
        const next = { ...tilesRef.current };
        if (data.override) next[data.key] = data.override;
        else delete next[data.key];
        tilesRef.current = next;
        tilesVersionRef.current += 1;
        syncBlockBlocked();
      }
      if (data.profile) setInvProfile(data.profile);
      if (data.broke) {
        setTileMsg(`${itemById(data.broke)?.name ?? "道具"}が壊れた`);
        playWbSe("debris");
      } else if (action === "till" || action === "plant") {
        setTileMsg(`豊穣度 ${tileIvsAt(x, y).fertility}`);
      } else if (action === "mine") {
        setTileMsg(`純度 ${tileIvsAt(x, y).purity}`);
      }
    } catch {
      setTileMsg("できませんでした");
      fxEventsRef.current.push({ kind: "whiff", x, y });
    }
  };
  const postTileActionRef = useRef(postTileAction);
  postTileActionRef.current = postTileAction;
  const postStallAction = async (
    action: "list_item" | "unlist" | "buy",
    x: number,
    y: number,
    extra?: { itemId?: string; price?: number; count?: number },
  ) => {
    try {
      const res = await fetch("/api/worldbox/stalls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, x, y, ...(extra ?? {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        stall?: {
          itemId: string;
          name: string;
          price: number;
          count: number;
          mine: boolean;
        } | null;
        profile?: PlayerProfile;
      };
      if (!res.ok) {
        setTileMsg(TILE_ERROR_LABEL[data.error ?? ""] ?? "できませんでした");
        return;
      }
      setStallInfo(data.stall ?? null);
      if (data.profile) setInvProfile(data.profile);
    } catch {
      setTileMsg("できませんでした");
    }
  };
  const expandTent = async () => {
    try {
      const res = await fetch("/api/worldbox/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "expand_tent" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        profile?: PlayerProfile;
        error?: string;
      };
      if (res.ok && data.profile) {
        setInvProfile(data.profile);
        setTileMsg("テントが広くなった");
      } else {
        setTileMsg(data.error === "insufficient_balance" ? "お金が足りない" : "拡張できない");
      }
    } catch {
      /* noop */
    }
  };
  const moveItem = async (from: SlotRef, to: SlotRef) => {
    try {
      const res = await fetch("/api/worldbox/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", from, to }),
      });
      const data = (await res.json().catch(() => ({}))) as { profile?: PlayerProfile };
      if (res.ok && data.profile) setInvProfile(data.profile);
    } catch {
      /* noop */
    }
  };
  const eatFromInventory = async (itemId: string) => {
    try {
      const res = await fetch("/api/worldbox/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "eat", itemId }),
      });
      const data = (await res.json().catch(() => ({}))) as { profile?: PlayerProfile };
      if (res.ok && data.profile) {
        setInvProfile(data.profile);
        playWbSe("note", { pitch: 0.5 });
      }
    } catch {
      /* noop */
    }
  };

  const tapSlot = (zone: SlotRef["zone"], index: number) => {
    if (!invProfile) return;
    const slot = zone === "hotbar" ? invProfile.hotbar[index] : invProfile.storage[index];
    const tapAt = performance.now();
    const lastTap = lastSlotTapRef.current;
    lastSlotTapRef.current = { zone, index, at: tapAt };
    if (
      slot &&
      lastTap &&
      lastTap.zone === zone &&
      lastTap.index === index &&
      tapAt - lastTap.at < 350
    ) {
      const def = itemById(slot.id);
      if (def && (def.hunger || def.buff)) {
        lastSlotTapRef.current = null;
        setHeldSlot(null);
        void eatFromInventory(def.id);
        return;
      }
    }
    if (!heldSlot) {
      if (slot) setHeldSlot({ zone, index });
      return;
    }
    if (heldSlot.zone === zone && heldSlot.index === index) {
      setHeldSlot(null);
      return;
    }
    const from = heldSlot;
    setHeldSlot(null);
    void moveItem(from, { zone, index });
  };

  const tapHotbar = (index: number) => {
    setSelSlot(index);
    if (!invProfile) return;
    const tapAt = performance.now();
    const lastTap = lastHotbarTapRef.current;
    lastHotbarTapRef.current = { index, at: tapAt };
    const slot = invProfile.hotbar[index];
    if (slot && lastTap && lastTap.index === index && tapAt - lastTap.at < 350) {
      const def = itemById(slot.id);
      if (def && (def.hunger || def.buff)) {
        lastHotbarTapRef.current = null;
        void eatFromInventory(def.id);
      }
    }
  };

  const openContainer = async (
    x: number,
    y: number,
    itemId: string,
    space: "world" | "tent" | "lobby" | "lobby2" | "lobby3" = "world",
  ) => {
    setStorageOpen(false);
    setHeldSlot(null);
    setHeldPanelSlot(null);
    setContainerSlots(null);
    setContainerPanel({ x, y, itemId, space });
    try {
      const res = await fetch(
        `/api/worldbox/containers?x=${x}&y=${y}${space !== "world" ? `&space=${space}` : ""}`,
        {
          headers: { Accept: "application/json" },
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        container?: { slots?: ItemSlot[] };
        error?: string;
      };
      if (!res.ok) {
        setContainerPanel(null);
        setTileMsg(TILE_ERROR_LABEL[data.error ?? ""] ?? "開けない");
        return;
      }
      setContainerSlots(data.container?.slots ?? null);
    } catch {
      setContainerPanel(null);
      setTileMsg("開けない");
    }
  };
  const openContainerRef = useRef(openContainer);
  openContainerRef.current = openContainer;
  const moveContainerItem = async (from: ContainerSlotRef, to: ContainerSlotRef) => {
    if (!containerPanel) return;
    try {
      const res = await fetch("/api/worldbox/containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move",
          x: containerPanel.x,
          y: containerPanel.y,
          from,
          to,
          ...(containerPanel.space !== "world" ? { space: containerPanel.space } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        profile?: PlayerProfile;
        container?: { slots?: ItemSlot[] };
        error?: string;
      };
      if (!res.ok) {
        setTileMsg(TILE_ERROR_LABEL[data.error ?? ""] ?? "動かせない");
        return;
      }
      if (data.profile) setInvProfile(data.profile);
      if (data.container) setContainerSlots(data.container.slots ?? null);
    } catch {
      /* noop */
    }
  };
  const tapPanelSlot = (ref: ContainerSlotRef) => {
    const slot =
      ref.side === "container"
        ? (containerSlots?.[ref.index] ?? null)
        : ref.side === "profile_hotbar"
          ? (invProfile?.hotbar[ref.index] ?? null)
          : (invProfile?.storage[ref.index] ?? null);
    if (!heldPanelSlot) {
      if (slot) setHeldPanelSlot(ref);
      return;
    }
    if (heldPanelSlot.side === ref.side && heldPanelSlot.index === ref.index) {
      setHeldPanelSlot(null);
      return;
    }
    const from = heldPanelSlot;
    setHeldPanelSlot(null);
    void moveContainerItem(from, ref);
  };

  useEffect(() => {
    void refreshNations();
    void refreshGuildShopPlots();
    void refreshInv();
    void refreshTiles();
    const timer = window.setInterval(() => {
      if (wsHealthyNow()) {
        void refreshInv();
        return;
      }
      void refreshNations();
      void refreshGuildShopPlots();
      void refreshInv();
      void refreshTiles();
    }, 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const c = tilesCenterRef.current;
      if (!c) return;
      const dx = Math.abs(Math.floor(playerPosRef.current.x) - c.x);
      const dy = Math.abs(Math.floor(playerPosRef.current.y) - c.y);
      if (Math.max(dx, dy) >= 48) void refreshTilesRef.current();
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const lobby = buildLobby();
    let tentTierSeen = -1;
    let tentData = buildTent(0);
    const tentNow = () => {
      const tier = invRef.current?.tentTier ?? 0;
      if (tier !== tentTierSeen) {
        tentTierSeen = tier;
        tentData = buildTent(tier);
      }
      return tentData;
    };
    let caveCacheKey = "";
    let caveCache: CaveLayer | null = null;
    const caveLayerNow = (): CaveLayer | null => {
      const inst = parseInstanceSpace(space);
      if (inst?.kind !== "cave") return null;
      if (caveCacheKey !== space) {
        caveCacheKey = space;
        caveCache = buildCaveLayer(MAP_SEED, inst.entranceX, inst.entranceY, inst.layer);
      }
      return caveCache;
    };
    let ruinsCacheKey = "";
    let ruinsCache: RuinsMap | null = null;
    const ruinsNow = (): RuinsMap | null => {
      const inst = parseInstanceSpace(space);
      if (inst?.kind !== "ruins") return null;
      if (ruinsCacheKey !== space) {
        ruinsCacheKey = space;
        ruinsCache = buildRuins(MAP_SEED, inst.entranceX, inst.entranceY);
      }
      return ruinsCache;
    };
    let dungeonCacheKey = "";
    let dungeonCache: DungeonFloorData | null = null;
    const dungeonNow = (): DungeonFloorData | null => {
      const inst = parseInstanceSpace(space);
      if (inst?.kind !== "dungeon") return null;
      if (dungeonCacheKey !== space) {
        dungeonCacheKey = space;
        dungeonCache = buildDungeonFloor(MAP_SEED, inst.entranceX, inst.entranceY, inst.layer);
      }
      return dungeonCache;
    };
    const indoorData = (): LobbyData =>
      caveLayerNow()?.data ??
      ruinsNow()?.data ??
      dungeonNow()?.data ??
      (parseApartmentSpace(space)
        ? buildApartment()
        : space === "tent"
          ? tentNow()
          : space === "prison"
            ? buildPrison()
            : space === "lobby2"
              ? buildLobby2()
              : space === "lobby3"
                ? buildLobby3()
                : lobby);
    const textures = loadTextures();
    const dungeon = loadDungeonTiles();
    const lobbySprites = loadLobbySprites();
    const farmSprites = loadFarmSprites();
    const itemIcons: Record<string, HTMLImageElement> = {};
    for (const item of ITEMS) {
      if (!item.icon) continue;
      const img = new Image();
      img.src = item.icon;
      itemIcons[item.id] = img;
    }
    const avatar = new Image();
    avatar.src = "/img/nomal.png";
    const iconCache = new Map<string, HTMLImageElement>();
    const iconFor = (url: string | null | undefined): HTMLImageElement | null => {
      if (!url) return null;
      let img = iconCache.get(url);
      if (!img) {
        img = new Image();
        img.crossOrigin = "anonymous";
        img.src = url;
        iconCache.set(url, img);
      }
      return img;
    };
    let myIconUrl: string | null = null;
    void fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const url = (data as { user?: { avatarUrl?: unknown } } | null)?.user?.avatarUrl;
        if (typeof url === "string" && url) myIconUrl = url;
      })
      .catch(() => {
        /* noop */
      });

    const chunkCache = new Map<string, Uint8Array>();
    const baseTileAt = (x: number, y: number): number => {
      const cx = Math.floor(x / CHUNK_SIZE);
      const cy = Math.floor(y / CHUNK_SIZE);
      const key = `${cx},${cy}`;
      let tiles = chunkCache.get(key);
      if (tiles) {
        chunkCache.delete(key);
        chunkCache.set(key, tiles);
      } else {
        tiles = generateChunk(cx, cy, MAP_SEED).tiles;
        chunkCache.set(key, tiles);
        if (chunkCache.size > 96) {
          const oldest = chunkCache.keys().next().value;
          if (oldest !== undefined) chunkCache.delete(oldest);
        }
      }
      return tiles[(y - cy * CHUNK_SIZE) * CHUNK_SIZE + (x - cx * CHUNK_SIZE)];
    };
    const effTileAt = (x: number, y: number): number => {
      const ov = tilesRef.current[tileKey(x, y)];
      if (ov && ov.tile !== undefined && isOverrideActive(ov, Date.now())) return ov.tile;
      return baseTileAt(x, y);
    };
    const terrainMap: TopDownMap = { seed: MAP_SEED, tileAt: (x, y) => tileAt(x, y, MAP_SEED) };
    const worldMap: TopDownMap = { seed: MAP_SEED, tileAt: effTileAt };

    const spawn = pickRandomSpawn(Math.random);
    const player: PlayerState = { x: spawn.x, y: spawn.y, vx: 0, vy: 0, face: 1, phase: 0 };
    const cam = { x: player.x, y: player.y };
    let telescopeCam: { x: number; y: number } | null = null;
    let telescopeDrag: { pointerId: number; lastX: number; lastY: number } | null = null;
    let telescopeCenterSeen = 0;
    let raceAnimCache: { postMs: number; core: RaceCore } | null = null;
    let space: SaveSpace = "world";
    let worldReturn: { x: number; y: number } | null = null;
    let transitionStart = -1;
    let transitionKind: TransitionKind = "warp";
    let transitionSwapped = true;
    let transitionPending: (() => void) | null = null;
    const beginTransition = (apply: () => void) => {
      if (
        transitionStart >= 0 &&
        transitionKind === "warp" &&
        !transitionDone(performance.now() - transitionStart, "warp")
      ) {
        if (!transitionSwapped) {
          transitionPending = apply;
          return;
        }
        apply();
        return;
      }
      transitionKind = "warp";
      transitionSwapped = false;
      transitionPending = apply;
      transitionStart = performance.now();
    };
    const activeMap = (): TopDownMap => (space === "world" ? worldMap : indoorData().moveMap);
    const activeBounds = () => {
      const inst = parseInstanceSpace(space);
      if (inst?.kind === "cave") return rectBounds(64, 64);
      if (inst?.kind === "ruins") return rectBounds(48, 48);
      if (inst?.kind === "dungeon") return rectBounds(52, 52);
      if (parseApartmentSpace(space)) return rectBounds(24, 18);
      return space === "lobby"
        ? rectBounds(LOBBY_W, LOBBY_H)
        : space === "lobby2"
          ? rectBounds(LOBBY2_W, LOBBY2_H)
          : space === "lobby3"
            ? rectBounds(LOBBY3_W, LOBBY3_H)
            : space === "tent"
              ? rectBounds(tentNow().width, tentNow().height)
              : space === "prison"
                ? rectBounds(PRISON_W, PRISON_H)
                : worldBounds();
    };
    const activeBlocked = (): ReadonlySet<string> | undefined => {
      if (space === "world") return blockedRef.current;
      const ruins = ruinsNow();
      if (ruins) {
        const opened = ruinsStateRef.current.doors;
        if (ruins.doors.some((d) => opened[String(d.idx)])) {
          const set = new Set(indoorData().blocked);
          for (const d of ruins.doors) if (opened[String(d.idx)]) set.delete(`${d.x},${d.y}`);
          return set;
        }
      }
      return indoorData().blocked;
    };
    const keys = new Set<string>();
    const joy = { active: false, pointerId: -1, dx: 0, dy: 0 };
    const others = new Map<string, OtherRender>();
    const pianoSteps = new Map<string, number>();
    let lastFountainFxAt = 0;
    let slideVel = { x: 0, y: 0 };
    let stamina: StaminaState = createStamina();
    let tapTracker: TapTracker = createTapTracker();
    let dashKey: string | null = null;
    let lastLand = { x: spawn.x, y: spawn.y };
    let wasSwimming = false;
    let playerSwimming = false;
    const splashes: { x: number; y: number; at: number }[] = [];
    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fxSys: FxSystem = createFxSystem((Date.now() % 2147483646) + 1);
    if (reducedMotion) fxSys.intensity = 0.35;
    let shake: FxShake = createShake();
    let swing = { startedAt: 0, itemId: null as string | null, face: 1 as 1 | -1, whiff: false };
    const pops = new Map<string, number>();
    let lastBeat = 0;
    let lastDashFxAt = 0;
    let lastSwimFxAt = 0;
    let lastDriveFxAt = 0;
    let lastAmbientAt = 0;
    let lastPhaseKind = "";
    const popScaleFor = (key: string, nowMs: number): number => {
      const started = pops.get(key);
      if (started === undefined) return 1;
      const pr = popProgress(started, nowMs);
      if (pr >= 1) {
        pops.delete(key);
        return 1;
      }
      return popScale(pr);
    };
    let loggedIn = false;
    let disposed = false;
    const tabSession = {
      tab:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `tab-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`,
      tabAt: Date.now(),
    };
    let tabSuperseded = false;
    const markTabSuperseded = () => {
      if (tabSuperseded) return;
      tabSuperseded = true;
      setTabTaken(true);
    };
    let lastSaved = { x: player.x, y: player.y, at: 0 };
    let lastMinimapAt = 0;
    let compassCache: {
      ax: number;
      ay: number;
      cave: CompassTarget | null;
      dungeon: CompassTarget | null;
    } | null = null;

    const currentSave = () => serializeSave({ space, x: player.x, y: player.y, worldReturn });
    const saveLocal = () => {
      try {
        localStorage.setItem(SAVE_KEY, currentSave());
      } catch {
        /* noop */
      }
    };
    let lastOnlineSaveAt = 0;
    let onlineSaveTimer: number | null = null;
    const sendOnlineSave = (keepalive = false) => {
      lastOnlineSaveAt = performance.now();
      fetch("/api/worldbox/save", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ save: currentSave() }),
        keepalive,
      }).catch(() => {
        /* 保存できなくても遊び続けられる */
      });
    };
    const saveOnline = (keepalive = false) => {
      if (!loggedIn) return;
      if (tabSuperseded) return;
      if (keepalive) {
        if (onlineSaveTimer !== null) {
          window.clearTimeout(onlineSaveTimer);
          onlineSaveTimer = null;
        }
        sendOnlineSave(true);
        return;
      }
      const wait = 3000 - (performance.now() - lastOnlineSaveAt);
      if (wait <= 0) {
        sendOnlineSave();
      } else if (onlineSaveTimer === null) {
        onlineSaveTimer = window.setTimeout(() => {
          onlineSaveTimer = null;
          if (loggedIn) sendOnlineSave();
        }, wait);
      }
    };
    const saveNow = (keepalive = false) => {
      saveLocal();
      saveOnline(keepalive);
      lastSaved = { x: player.x, y: player.y, at: performance.now() };
    };

    (async () => {
      let local: ReturnType<typeof parseSave> = null;
      try {
        local = parseSave(localStorage.getItem(SAVE_KEY));
      } catch {
        /* noop */
      }
      let online: ReturnType<typeof parseSave> = null;
      try {
        const res = await fetch("/api/worldbox/save", { headers: { Accept: "application/json" } });
        if (res.ok) {
          loggedIn = true;
          const body = (await res.json()) as { save?: string | null };
          online = parseSave(body.save ?? null);
        }
      } catch {
        /* オフラインではローカルのみ */
      }
      if (disposed) return;
      const choice = chooseInitialSave(online, local, loggedIn);
      if (choice.state) {
        space = choice.state.space;
        worldReturn = choice.state.worldReturn;
        const free = findFreeNear(activeMap(), choice.state.x, choice.state.y, activeBlocked(), {
          swim: space === "world",
        });
        player.x = free.x;
        player.y = free.y;
        cam.x = free.x;
        cam.y = free.y;
        setSpaceUi(space);
        void refreshTilesRef.current();
      }
      if (choice.pushLocalToOnline) saveNow();
      else lastSaved = { x: player.x, y: player.y, at: performance.now() };
      setStatusText(
        space === "lobby"
          ? "中央広場"
          : space === "lobby2"
            ? "ラウンジ"
            : space === "lobby3"
              ? "展望デッキ"
              : space === "prison"
                ? "タカスミ中央刑務所"
                : parseApartmentSpace(space)
                  ? "専用メトロマンション"
                  : space === "tent"
                    ? "テント"
                    : "郊外",
      );
    })();

    let clockOffsetMs = 0;
    const presenceNow = () => Date.now() + clockOffsetMs;
    const missedPolls = new Map<string, number>();
    const wsSeenAt = new Map<string, number>();
    const isOtherPartyInDungeon = (entry: PresenceEntry) =>
      parseInstanceSpace(space)?.kind === "dungeon" &&
      !!entry.party &&
      !!myPartyKeyRef.current &&
      entry.party !== myPartyKeyRef.current;
    const applyPresenceEntry = (entry: PresenceEntry, now: number) => {
      const cur = others.get(entry.id);
      if (!cur) {
        others.set(entry.id, { track: createRemoteTrack(entry, now, activeBounds()), phase: 0 });
      } else {
        cur.track = updateRemoteTrack(cur.track, entry, now, activeBounds());
      }
    };
    const absorbClockSample = (serverNow: number, before: number, after: number) => {
      const sample = clockOffsetEstimate(serverNow, before, after);
      clockOffsetMs = clockOffsetMs === 0 ? sample : clockOffsetMs + (sample - clockOffsetMs) * 0.3;
    };
    let rtSocket: WebSocket | null = null;
    let rtToken: string | null = null;
    let rtTokenAt = 0;
    let rtRetryAt = 0;
    let rtBackoffMs = 1000;
    let rtReconnectTimer: number | undefined;
    let lastWsMsgAt = 0;
    let rtAggOn = false;
    let lastPresencePollAt = 0;
    let rtEverConnected = false;
    const sendWsHeartbeat = () => {
      if (tabSuperseded) return;
      if (!rtSocket || rtSocket.readyState !== WebSocket.OPEN) return;
      try {
        rtSocket.send(
          JSON.stringify({
            t: "hb",
            x: player.x,
            y: player.y,
            vx: player.vx,
            vy: player.vy,
            face: player.face,
            space,
            party: myPartyKeyRef.current || undefined,
            role: invRef.current?.role ?? "free",
            rank: invRef.current ? masteryRankOf(invRef.current, invRef.current.role) : 1,
            sit: sitTileRef.current ? true : undefined,
          }),
        );
      } catch {
        /* noop */
      }
    };
    const connectRealtime = async () => {
      if (disposed || !loggedIn || rtSocket || tabSuperseded) return;
      try {
        if (!rtToken || Date.now() - rtTokenAt > 8 * 60 * 1000) {
          const res = await fetch("/api/worldbox/realtime-token", {
            method: "POST",
            headers: { Accept: "application/json" },
          });
          if (!res.ok) throw new Error("token");
          const body = (await res.json()) as { token?: string };
          if (!body.token) throw new Error("token");
          rtToken = body.token;
          rtTokenAt = Date.now();
        }
        if (disposed) return;
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(
          `${proto}//${location.host}/api/worldbox/realtime?t=${encodeURIComponent(rtToken)}&tab=${encodeURIComponent(tabSession.tab)}&tabAt=${tabSession.tabAt}`,
        );
        rtSocket = ws;
        pianoSendRef.current = (notes: number[]) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          try {
            ws.send(JSON.stringify({ t: "note", notes }));
          } catch {
            /* noop */
          }
        };
        ws.onopen = () => {
          rtBackoffMs = 1000;
          lastWsMsgAt = Date.now();
          rtOpenRef.current = true;
          rtLastMsgRef.current = lastWsMsgAt;
          const reconnected = rtEverConnected;
          if (rtEverConnected && transitionStart < 0) {
            transitionKind = "reconnect";
            transitionSwapped = true;
            transitionPending = null;
            transitionStart = performance.now();
          }
          rtEverConnected = true;
          sendWsHeartbeat();
          if (reconnected) {
            void pollOthers();
            void refreshTilesRef.current();
            void refreshPartyRef.current(true);
            void nationsRefreshRef.current(true);
            void boardRefreshRef.current();
            chatReloadRef.current?.();
          }
        };
        ws.onmessage = (ev) => {
          const arrivedAt = Date.now();
          lastWsMsgAt = arrivedAt;
          rtLastMsgRef.current = arrivedAt;
          let msg: {
            t?: string;
            now?: number;
            p?: PresenceEntry;
            players?: PresenceEntry[];
            id?: string;
            x?: number;
            y?: number;
            kind?: string;
            changes?: { key: string; value: unknown }[];
            value?: unknown;
            notes?: number[];
            channel?: string;
            space?: string;
            guildId?: string;
            agg?: number;
            on?: boolean;
          };
          try {
            msg = JSON.parse(String(ev.data));
          } catch {
            return;
          }
          if (typeof msg.now === "number") absorbClockSample(msg.now, arrivedAt, arrivedAt);
          const now = presenceNow();
          if (msg.t === "hello" && msg.agg === 1) {
            rtAggOn = true;
          } else if (msg.t === "agg") {
            rtAggOn = msg.on === true;
          } else if (msg.t === "note" && Array.isArray(msg.notes)) {
            if (space === "lobby") playPianoNotes(msg.notes);
          } else if (
            msg.t === "jump" &&
            typeof msg.x === "number" &&
            typeof msg.y === "number" &&
            typeof msg.space === "string"
          ) {
            snapBackToServer(msg.x, msg.y, msg.space);
          } else if (msg.t === "snap") {
            for (const entry of msg.players ?? []) {
              if (isOtherPartyInDungeon(entry)) continue;
              missedPolls.delete(entry.id);
              wsSeenAt.set(entry.id, Date.now());
              applyPresenceEntry(entry, now);
            }
            setOthersCount(others.size);
          } else if (msg.t === "up" && msg.p) {
            if (isOtherPartyInDungeon(msg.p)) return;
            missedPolls.delete(msg.p.id);
            wsSeenAt.set(msg.p.id, Date.now());
            applyPresenceEntry(msg.p, now);
            setOthersCount(others.size);
          } else if (msg.t === "bye" && msg.id) {
            others.delete(msg.id);
            missedPolls.delete(msg.id);
            setOthersCount(others.size);
          } else if (msg.t === "kv" && msg.kind === "tiles" && Array.isArray(msg.changes)) {
            const nextTiles: TileOverridesMap = { ...tilesRef.current };
            for (const c of msg.changes) {
              if (!c || typeof c.key !== "string") continue;
              const parsed = c.value == null ? null : parseTileOverride(c.value);
              if (parsed) nextTiles[c.key] = parsed;
              else delete nextTiles[c.key];
            }
            tilesRef.current = nextTiles;
            tilesVersionRef.current += 1;
            syncBlockBlocked();
          } else if (msg.t === "kv" && msg.kind === "objects" && Array.isArray(msg.changes)) {
            for (const c of msg.changes) {
              if (!c || typeof c.key !== "string") continue;
              const n = c.value == null ? NaN : Number(c.value);
              if (Number.isFinite(n) && n > 0) surfaceObjStateRef.current.set(c.key, n);
              else surfaceObjStateRef.current.delete(c.key);
            }
          } else if (msg.t === "kv" && msg.kind === "fishing" && Array.isArray(msg.changes)) {
            for (const c of msg.changes) {
              if (!c || typeof c.key !== "string") continue;
              const n = c.value == null ? NaN : Number(c.value);
              if (Number.isFinite(n) && n > 0) fishCaughtRef.current.set(c.key, n);
              else fishCaughtRef.current.delete(c.key);
            }
          } else if (msg.t === "kv" && msg.kind === "board") {
            const ticket = boardGuardRef.current.begin({ force: true });
            if (ticket !== null) {
              setBoardPosts(parseBoardPosts(msg.value ?? null));
              setBoardLoggedIn(true);
              boardGuardRef.current.end(ticket);
            }
          } else if (msg.t === "sync" && msg.kind === "nations") {
            void nationsRefreshRef.current(true);
          } else if (msg.t === "sync" && msg.kind === "party") {
            void refreshPartyRef.current(true);
          } else if (msg.t === "sync" && msg.kind === "instances") {
            const instNow = parseInstanceSpace(space);
            if (instNow?.kind === "cave") void refreshCaveStateRef.current(space);
            else if (instNow?.kind === "dungeon") void refreshDungeonStateRef.current(space);
            else if (instNow?.kind === "ruins") void refreshRuinsStateRef.current(space);
          } else if (msg.t === "sync" && msg.kind === "economy") {
            void invRefreshRef.current();
            notifyEconomyApplied();
          } else if (msg.t === "sync" && msg.kind === "requests") {
            notifyGuildRequestsChanged();
          } else if (msg.t === "sync" && msg.kind === "guildShop") {
            void guildShopRefreshRef.current(true);
            notifyGuildShopChanged();
          } else if (msg.t === "sync" && msg.kind === "chat") {
            if (msg.channel === "union") {
              const myGuild = nationsRef.current.me?.nationId ?? null;
              if (!msg.guildId || !myGuild || msg.guildId === myGuild) notifyGuildBoardChanged();
            }
            if (msg.channel === chatChannelRef.current) {
              if (msg.channel === "union") {
                const myGuild = nationsRef.current.me?.nationId ?? null;
                if (!msg.guildId || !myGuild || msg.guildId === myGuild) chatReloadRef.current?.();
              } else if (msg.space === space) {
                chatReloadRef.current?.();
              }
            }
          }
        };
        const onGone = () => {
          if (rtSocket === ws) rtSocket = null;
          rtOpenRef.current = false;
          rtAggOn = false;
          if (disposed) return;
          rtRetryAt = Date.now() + rtBackoffMs;
          rtBackoffMs = Math.min(10_000, rtBackoffMs * 2);
          rtReconnectTimer = window.setTimeout(() => void connectRealtime(), rtBackoffMs);
        };
        ws.onclose = (ev) => {
          if (ev.code === 4001) {
            if (rtSocket === ws) rtSocket = null;
            markTabSuperseded();
            return;
          }
          onGone();
        };
        ws.onerror = onGone;
      } catch {
        rtRetryAt = Date.now() + rtBackoffMs;
        rtBackoffMs = Math.min(10_000, rtBackoffMs * 2);
      }
    };
    const sendHeartbeat = () => {
      if (!loggedIn || tabSuperseded) return;
      fetch("/api/worldbox/presence", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "",
          x: player.x,
          y: player.y,
          vx: player.vx,
          vy: player.vy,
          face: player.face,
          space,
          party: myPartyKeyRef.current || undefined,
          role: invRef.current?.role ?? "free",
          rank: invRef.current ? masteryRankOf(invRef.current, invRef.current.role) : 1,
          sit: sitTileRef.current ? true : undefined,
          tab: tabSession.tab,
          tabAt: tabSession.tabAt,
        }),
      })
        .then(async (res) => {
          if (res.status !== 409) return;
          try {
            const body = (await res.json()) as {
              error?: string;
              x?: number;
              y?: number;
              space?: string;
            };
            if (body.error === "tab_superseded") {
              markTabSuperseded();
              return;
            }
            if (
              body.error === "position_jump" &&
              typeof body.x === "number" &&
              typeof body.y === "number" &&
              typeof body.space === "string"
            ) {
              snapBackToServer(body.x, body.y, body.space);
            }
          } catch {
            /* noop */
          }
        })
        .catch(() => {
          /* noop */
        });
    };
    const snapBackToServer = (x: number, y: number, targetSpace: string) => {
      if (targetSpace !== space) return;
      player.x = x;
      player.y = y;
      player.vx = 0;
      player.vy = 0;
      cam.x = x;
      cam.y = y;
      lastTileKey = `${space}:${Math.floor(x)},${Math.floor(y)}`;
      lastHeartbeatPos = { x, y };
      saveNow();
      sendHeartbeat();
    };
    let nearDungeonShown = false;
    const presenceGuard = createPollGuard();
    const checkNearDungeonEntrance = () => {
      if (space === "world") {
        const ptx = Math.floor(player.x);
        const pty = Math.floor(player.y);
        let near = false;
        const ccx = Math.floor(ptx / CHUNK_SIZE);
        const ccy = Math.floor(pty / CHUNK_SIZE);
        for (let dy = -1; dy <= 1 && !near; dy++) {
          for (let dx = -1; dx <= 1 && !near; dx++) {
            for (const st of structuresForChunk(MAP_SEED, ccx + dx, ccy + dy)) {
              if (
                st.structureId === "dungeon_entrance" &&
                Math.hypot(st.x - ptx, st.y - pty) <= 6
              ) {
                near = true;
                break;
              }
            }
          }
        }
        if (near !== nearDungeonShown) {
          nearDungeonShown = near;
          setNearDungeonEntrance(near);
        }
      } else if (nearDungeonShown) {
        nearDungeonShown = false;
        setNearDungeonEntrance(false);
      }
    };
    const pollOthers = async () => {
      const ticket = presenceGuard.begin();
      if (ticket === null) return;
      lastPresencePollAt = Date.now();
      const before = Date.now();
      try {
        const res = await fetch(`/api/worldbox/presence?space=${space}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const body = (await res.json()) as { players?: PresenceEntry[]; now?: number };
        if (disposed) return;
        if (!presenceGuard.isCurrent(ticket)) return;
        if (typeof body.now === "number") absorbClockSample(body.now, before, Date.now());
        const now = presenceNow();
        const seen = new Set<string>();
        for (const entry of body.players ?? []) {
          if (isOtherPartyInDungeon(entry)) continue;
          seen.add(entry.id);
          missedPolls.delete(entry.id);
          applyPresenceEntry(entry, now);
        }
        for (const id of [...others.keys()]) {
          if (seen.has(id)) continue;
          if (Date.now() - (wsSeenAt.get(id) ?? 0) < 2500) continue;
          const missed = (missedPolls.get(id) ?? 0) + 1;
          if (missed >= 2) {
            others.delete(id);
            missedPolls.delete(id);
          } else {
            missedPolls.set(id, missed);
          }
        }
        setOthersCount(others.size);
      } catch {
        /* noop */
      } finally {
        presenceGuard.end(ticket);
      }
    };
    const leavePresence = () => {
      if (!loggedIn) return;
      fetch("/api/worldbox/presence", { method: "DELETE", keepalive: true }).catch(() => {
        /* noop */
      });
    };
    let lastHeartbeatAt = 0;
    let lastRestHeartbeatAt = 0;
    let lastHeartbeatPos = { x: player.x, y: player.y };
    const heartbeatTick = () => {
      if (!loggedIn) return;
      if (!rtSocket && Date.now() >= rtRetryAt) void connectRealtime();
      const now = performance.now();
      const movedDist = Math.hypot(player.x - lastHeartbeatPos.x, player.y - lastHeartbeatPos.y);
      const moving = Math.hypot(player.vx, player.vy) > 0.1 || movedDist > 0.05;
      const wsOpen = rtSocket?.readyState === WebSocket.OPEN;
      if (!rtAggOn && (movedDist > 4 || now - lastRestHeartbeatAt >= (moving ? 500 : 2000))) {
        lastRestHeartbeatAt = now;
        lastHeartbeatPos = { x: player.x, y: player.y };
        sendHeartbeat();
      }
      if (!wsOpen) return;
      if (movedDist <= 4 && now - lastHeartbeatAt < (moving ? 100 : 1000)) return;
      lastHeartbeatAt = now;
      lastHeartbeatPos = { x: player.x, y: player.y };
      sendWsHeartbeat();
    };
    const heartbeatTimer = window.setInterval(heartbeatTick, 250);
    const pollTick = () => {
      checkNearDungeonEntrance();
      const nowMs = Date.now();
      const healthy = isWsHealthy(rtSocket?.readyState === WebSocket.OPEN, lastWsMsgAt, nowMs);
      if (presencePollDue({ now: nowMs, lastPollAt: lastPresencePollAt, wsHealthy: healthy })) {
        void pollOthers();
      }
    };
    const pollTimer = window.setInterval(pollTick, 1000);
    pollOthers();

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (arcadeOpenRef.current) return;
      const k = e.key.toLowerCase();
      if (!e.repeat && k === "m") {
        e.preventDefault();
        playWbSe("open");
        setMapView((v) => !v);
        return;
      }
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      keys.add(k);
      if (!e.repeat && MOVE_KEYS.has(k)) {
        const r = registerKeyTap(tapTracker, k, performance.now());
        tapTracker = r.tracker;
        if (r.doubleTapped) dashKey = k;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.delete(k);
      if (k === dashKey) dashKey = null;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // タブ切替・フォーカス喪失で keyup が届かず、押下状態が残って移動し続けるのを防ぐ。
    // 非表示/ぼかしの時点で入力状態を全部落とし、戻ったあとは押し直しを要求する。
    const clearMoveInput = () => {
      keys.clear();
      dashKey = null;
      joy.active = false;
      joy.pointerId = -1;
      joy.dx = 0;
      joy.dy = 0;
    };
    const onVisibilityChange = () => {
      if (document.hidden) clearMoveInput();
    };
    window.addEventListener("blur", clearMoveInput);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const canvasPos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height };
    };
    const toTile = (e: PointerEvent) => {
      const p = canvasPos(e);
      return {
        x: Math.floor(cam.x + (p.x - p.w / 2) / TILE),
        y: Math.floor(cam.y + (p.y - p.h / 2) / TILE),
      };
    };
    const handleDungeonTap = (t: { x: number; y: number }): boolean => {
      const dfloor = dungeonNow();
      if (!dfloor) return false;
      const inst = parseInstanceSpace(space);
      if (!inst) return false;
      const px = Math.floor(player.x);
      const py = Math.floor(player.y);
      const chest = dfloor.chests.find((c) => c.x === t.x && c.y === t.y);
      if (chest) {
        if (dungeonStateRef.current.opened[`${inst.layer}:${chest.idx}`]) {
          setTileMsg(TILE_ERROR_LABEL.depleted);
          denyAtTile(t.x, t.y);
          return true;
        }
        if (Math.hypot(px - t.x, py - t.y) > 2) {
          setTileMsg(TILE_ERROR_LABEL.too_far);
          denyAtTile(t.x, t.y);
          return true;
        }
        void postInstanceRef.current("open_chest", {
          chestIdx: chest.idx,
          fxX: chest.x,
          fxY: chest.y,
        });
        return true;
      }
      return false;
    };
    const handleRuinsTap = (t: { x: number; y: number }): boolean => {
      const ruins = ruinsNow();
      if (!ruins) return false;
      const px = Math.floor(player.x);
      const py = Math.floor(player.y);
      const chest = ruins.chests.find((c) => c.x === t.x && c.y === t.y);
      if (chest) {
        if (ruinsStateRef.current.chests[String(chest.idx)]) {
          setTileMsg(TILE_ERROR_LABEL.depleted);
          denyAtTile(t.x, t.y);
          return true;
        }
        if (Math.hypot(px - t.x, py - t.y) > 2) {
          setTileMsg(TILE_ERROR_LABEL.too_far);
          denyAtTile(t.x, t.y);
          return true;
        }
        void postInstanceRef.current("open_chest", {
          chestIdx: chest.idx,
          fxX: chest.x,
          fxY: chest.y,
        });
        return true;
      }
      const door = ruins.doors.find((d) => d.x === t.x && d.y === t.y);
      if (door) {
        if (ruinsStateRef.current.doors[String(door.idx)]) return false;
        if (Math.hypot(px - t.x, py - t.y) > 2) {
          setTileMsg(TILE_ERROR_LABEL.too_far);
          denyAtTile(t.x, t.y);
          return true;
        }
        void postInstanceRef.current("open_door", { doorIdx: door.idx, fxX: door.x, fxY: door.y });
        return true;
      }
      return false;
    };
    const handleCaveTap = (t: { x: number; y: number }): boolean => {
      const cave = caveLayerNow();
      if (!cave) return false;
      const px = Math.floor(player.x);
      const py = Math.floor(player.y);
      const vein = cave.veins.find((v) => v.x === t.x && v.y === t.y);
      if (vein) {
        const def = specialObjectById(vein.objectId);
        const takenAt = caveStateRef.current.veins[vein.key] ?? 0;
        if (def && takenAt > 0 && Date.now() - takenAt < def.respawnMs) {
          setTileMsg(TILE_ERROR_LABEL.depleted);
          denyAtTile(t.x, t.y);
          return true;
        }
        if (Math.hypot(px - t.x, py - t.y) > 2) {
          setTileMsg(TILE_ERROR_LABEL.too_far);
          denyAtTile(t.x, t.y);
          return true;
        }
        void postInstanceRef.current("mine", {
          veinKey: vein.key,
          fxX: vein.x,
          fxY: vein.y,
          fxObjectId: vein.objectId,
        });
        return true;
      }
      if (cave.chest && cave.chest.x === t.x && cave.chest.y === t.y) {
        if (Math.hypot(px - t.x, py - t.y) > 2) {
          setTileMsg(TILE_ERROR_LABEL.too_far);
          denyAtTile(t.x, t.y);
          return true;
        }
        void postInstanceRef.current("open_chest", { fxX: cave.chest.x, fxY: cave.chest.y });
        return true;
      }
      return false;
    };
    const handleIndoorTap = (t: { x: number; y: number }): boolean => {
      const px = Math.floor(player.x);
      const py = Math.floor(player.y);
      if (Math.max(Math.abs(t.x - px), Math.abs(t.y - py)) > 1) return false;
      const obj = indoorData().objects.find(
        (o) => t.x >= o.x && t.x < o.x + o.w && t.y >= o.y && t.y < o.y + o.h,
      );
      if (!obj) return false;
      if (isSeatItem(obj.sprite)) {
        const sitting = sitTileRef.current;
        if (sitting && sitting.x === t.x && sitting.y === t.y) {
          sitTileRef.current = null;
        } else {
          sitTileRef.current = { x: t.x, y: t.y };
          player.x = t.x + 0.5;
          player.y = t.y + 0.5;
          playWbSe("poof");
        }
        return true;
      }
      if (isContainerItem(obj.sprite)) {
        void openContainerRef.current(
          t.x,
          t.y,
          obj.sprite,
          space as "tent" | "lobby" | "lobby2" | "lobby3",
        );
        return true;
      }
      return false;
    };
    const handleTileTap = (t: { x: number; y: number }): boolean => {
      const prof = invRef.current;
      if (!prof) return false;
      const slot = prof.hotbar[selSlotRef.current] ?? null;
      const selItem = slot ? itemById(slot.id) : null;
      const wantsPlace =
        !!selItem &&
        (selItem.category === "block" || selItem.facility === true || !!selItem.placesBlock);
      const px = Math.floor(player.x);
      const py = Math.floor(player.y);
      if (Math.max(Math.abs(t.x - px), Math.abs(t.y - py)) > 1) {
        if (wantsPlace) {
          setTileMsg(TILE_ERROR_LABEL.too_far);
          denyAtTile(t.x, t.y);
        }
        return false;
      }
      if (space === "world" && fishingSpotAt(MAP_SEED, t.x, t.y)) {
        const active = fishingRef.current;
        const nowMs = Date.now();
        if (active && active.x === t.x && active.y === t.y) {
          fishingRef.current = null;
          if (nowMs >= active.biteAt && nowMs <= active.biteAt + 1100) {
            void postCatchRef.current(t.x, t.y);
          } else {
            setTileMsg("逃げられた");
            playWbSe("splash");
          }
          return true;
        }
        if ((prof.items["fishing_rod"] ?? 0) <= 0) {
          setTileMsg(TILE_ERROR_LABEL.tool_required);
          denyAtTile(t.x, t.y);
          return true;
        }
        fishingRef.current = { x: t.x, y: t.y, biteAt: nowMs + 1200 + Math.random() * 2500 };
        playWbSe("splash");
        return true;
      }
      if (space === "world") {
        const sobj = surfaceObjectAt(MAP_SEED, t.x, t.y);
        if (sobj && sobj.objectId !== "fishing_spot") {
          const sdef = specialObjectById(sobj.objectId);
          const harvestedAt = surfaceObjStateRef.current.get(`${t.x},${t.y}`) ?? null;
          if (sdef && objectRespawned(sdef, harvestedAt, Date.now())) {
            if (
              sdef.tool &&
              !Object.keys(prof.items).some((id) => itemById(id)?.tool === sdef.tool)
            ) {
              setTileMsg(TILE_ERROR_LABEL.tool_required);
              denyAtTile(t.x, t.y);
              return true;
            }
            swing = {
              startedAt: performance.now(),
              itemId: selItem?.id ?? null,
              face: player.face,
              whiff: false,
            };
            playWbSe("swing");
            void postSurfaceObjectRef.current(t.x, t.y, sobj.objectId);
            return true;
          }
          if (!tilesRef.current[tileKey(t.x, t.y)]?.block) {
            setTileMsg(TILE_ERROR_LABEL.depleted);
            denyAtTile(t.x, t.y);
            return true;
          }
        }
      }
      const view = tileView(terrainMap, tilesRef.current, t.x, t.y, Date.now(), null);
      if (view.block) {
        const ov = tilesRef.current[tileKey(t.x, t.y)];
        view.block = {
          ...view.block,
          mine: selfIdRef.current !== null && ov?.block?.ownerId === selfIdRef.current,
        };
      }
      if (view.block && isContainerItem(view.block.itemId)) {
        void openContainerRef.current(t.x, t.y, view.block.itemId);
        return true;
      }
      if (view.block && isMachineItem(view.block.itemId)) {
        if (view.block.mine || view.block.itemId === "smart_vending") {
          setMachinePanel({ x: t.x, y: t.y });
        } else {
          setTileMsg(TILE_ERROR_LABEL.not_owner);
        }
        return true;
      }
      if (view.block && isStallItem(view.block.itemId)) {
        setStallInfo(undefined);
        setStallPanel({
          x: t.x,
          y: t.y,
          selItemId: selItem && !selItem.tool ? selItem.id : null,
          mine: view.block.mine,
        });
        void (async () => {
          try {
            const res = await fetch(`/api/worldbox/stalls?x=${t.x}&y=${t.y}`, {
              headers: { Accept: "application/json" },
            });
            const data = (await res.json().catch(() => ({}))) as { stall?: typeof stallInfo };
            setStallInfo(res.ok ? (data.stall ?? null) : null);
          } catch {
            setStallInfo(null);
          }
        })();
        return true;
      }
      if (view.block && isSignItem(view.block.itemId)) {
        const mine = view.block.mine;
        const sx = t.x;
        const sy = t.y;
        setSignReg(undefined);
        void (async () => {
          try {
            const res = await fetch(`/api/worldbox/company/sign?x=${sx}&y=${sy}`, {
              headers: { Accept: "application/json" },
            });
            const data = (await res.json().catch(() => ({}))) as {
              sign?: CompanySignView | null;
              viewerCompanyId?: string | null;
            };
            setSignViewerCompanyId(data.viewerCompanyId ?? null);
            setSignReg(data.sign ? { companyId: data.sign.companyId, name: data.sign.name } : null);
            if (data.sign && !mine) {
              setSignShopMsg("");
              setSignRevealed(null);
              setSignShop({ x: sx, y: sy, sign: data.sign });
            }
          } catch {
            setSignReg(null);
            setSignViewerCompanyId(null);
          }
        })();
        if (mine) {
          const ovHere = tilesRef.current[tileKey(t.x, t.y)];
          setSignEdit({ x: t.x, y: t.y, text: ovHere?.signText ?? "" });
        }
        return true;
      }
      if (view.block && isShelfItem(view.block.itemId)) {
        if (!view.block.mine) {
          setTileMsg(TILE_ERROR_LABEL.not_owner);
          denyAtTile(t.x, t.y);
          return true;
        }
        const ovHere = tilesRef.current[tileKey(t.x, t.y)];
        if (ovHere?.display) {
          void postTileActionRef.current("clear_display", t.x, t.y);
        } else if (selItem && !selItem.tool) {
          void postTileActionRef.current("set_display", t.x, t.y, undefined, selItem.id);
        } else {
          setTileMsg("かばんの品を選んでタップ");
        }
        return true;
      }
      if (view.block && isWellItem(view.block.itemId)) {
        if ((invRef.current?.items.bucket ?? 0) > 0) {
          void postTileActionRef.current("draw_water", t.x, t.y);
        } else {
          setTileMsg("バケツが必要");
        }
        return true;
      }
      if (view.block && view.block.itemId === "piano") {
        const key = tileKey(t.x, t.y);
        const step = pianoSteps.get(key) ?? 0;
        pianoSteps.set(key, step + 1);
        const scale = [0, 2, 4, 7, 9, 12, 9, 7, 4, 2];
        playWbSe("note", { pitch: Math.pow(2, scale[step % scale.length] / 12) });
        return true;
      }
      if (view.block && isSeatItem(view.block.itemId)) {
        const sitting = sitTileRef.current;
        if (sitting && sitting.x === t.x && sitting.y === t.y) {
          sitTileRef.current = null;
        } else {
          sitTileRef.current = { x: t.x, y: t.y };
          player.x = t.x + 0.5;
          player.y = t.y + 0.5;
          playWbSe("poof");
        }
        return true;
      }
      if (view.block && isFlowerPotItem(view.block.itemId) && view.block.mine) {
        const ovHere = tilesRef.current[tileKey(t.x, t.y)];
        if (ovHere?.deco || selItem?.id === "flower") {
          swing = {
            startedAt: performance.now(),
            itemId: selItem?.id ?? null,
            face: player.face,
            whiff: false,
          };
          playWbSe("swing");
          void postTileActionRef.current(ovHere?.deco ? "remove_flower" : "plant_flower", t.x, t.y);
          return true;
        }
      }
      if (!selItem) {
        const hqHit = companyHqsRef.current.find((h) => h.x === t.x && h.y === t.y);
        if (hqHit) {
          setCompanyAnchor(hqHit.id);
          setShowCompany(true);
          return true;
        }
      }
      const act = actionForTile(view, {
        tool: selItem?.tool,
        seedId: selItem && selItem.category === "seed" ? selItem.id : undefined,
        blockId:
          selItem && (selItem.category === "block" || selItem.facility || selItem.placesBlock)
            ? selItem.id
            : undefined,
      });
      if (!act) {
        if (selItem) {
          setTileMsg(TILE_ERROR_LABEL.tile_blocked);
          denyAtTile(t.x, t.y);
        }
        return false;
      }
      if (act.action === "plant-picker") {
        setSeedPicker({ x: t.x, y: t.y });
        return true;
      }
      swing = {
        startedAt: performance.now(),
        itemId: selItem?.id ?? null,
        face: player.face,
        whiff: false,
      };
      playWbSe("swing");
      void postTileActionRef.current(act.action, t.x, t.y, act.seedId, act.itemId);
      return true;
    };
    const onPointerDown = (e: PointerEvent) => {
      const p = canvasPos(e);
      if (isStickTouch(p.x, p.y, stickBase(p.w, p.h))) {
        joy.active = true;
        joy.pointerId = e.pointerId;
        joy.dx = 0;
        joy.dy = 0;
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (telescopeOpenRef.current) {
        telescopeDrag = { pointerId: e.pointerId, lastX: p.x, lastY: p.y };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (space === "lobby" || space === "lobby2" || space === "lobby3" || space === "tent") {
        handleIndoorTap(toTile(e));
        return;
      }
      if (space === "world" || parseInstanceSpace(space)) {
        const t = toTile(e);
        if (space === "world" || parseInstanceSpace(space)) {
          for (const [oid, other] of others) {
            if (Math.floor(other.track.rx) === t.x && Math.floor(other.track.ry) === t.y) {
              showPlayerCardRef.current({
                id: oid,
                name: other.track.entry.name || "プレイヤー",
                role: (other.track.entry.role ?? "free") as AdventureRoleId,
                rank: other.track.entry.rank ?? 1,
              });
              return;
            }
          }
        }
        const lastTap = lastTapRef.current;
        const nowTap = performance.now();
        if (
          lastTap &&
          nowTap - lastTap.at <= 450 &&
          Math.abs(lastTap.x - t.x) <= 1 &&
          Math.abs(lastTap.y - t.y) <= 1
        ) {
          lastTapRef.current = null;
          void castSkillRef.current(t).then((cast) => {
            if (cast === "denied") {
              denyAtTile(t.x, t.y);
              return;
            }
            if (!cast) {
              if (space === "world") handleTileTap(t);
              else if (parseInstanceSpace(space)?.kind === "ruins") handleRuinsTap(t);
              else if (parseInstanceSpace(space)?.kind === "dungeon") handleDungeonTap(t);
              else handleCaveTap(t);
            }
          });
          return;
        }
        lastTapRef.current = { x: t.x, y: t.y, at: nowTap };
        if (space === "world") handleTileTap(t);
        else if (parseInstanceSpace(space)?.kind === "ruins") handleRuinsTap(t);
        else if (parseInstanceSpace(space)?.kind === "dungeon") handleDungeonTap(t);
        else handleCaveTap(t);
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (telescopeDrag && e.pointerId === telescopeDrag.pointerId && telescopeCam) {
        const p = canvasPos(e);
        telescopeCam.x -= (p.x - telescopeDrag.lastX) / TILE;
        telescopeCam.y -= (p.y - telescopeDrag.lastY) / TILE;
        telescopeDrag.lastX = p.x;
        telescopeDrag.lastY = p.y;
        return;
      }
      if (!joy.active || e.pointerId !== joy.pointerId) return;
      const p = canvasPos(e);
      const v = stickVector(p.x, p.y, stickBase(p.w, p.h));
      joy.dx = v.dx;
      joy.dy = v.dy;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (telescopeDrag && e.pointerId === telescopeDrag.pointerId) {
        telescopeDrag = null;
        return;
      }
      if (e.pointerId !== joy.pointerId) return;
      joy.active = false;
      joy.dx = 0;
      joy.dy = 0;
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    const onPageHide = () => {
      saveNow(true);
      leavePresence();
    };
    window.addEventListener("pagehide", onPageHide);

    const miniTerrainCanvas = document.createElement("canvas");
    miniTerrainCanvas.width = MINIMAP_TILES;
    miniTerrainCanvas.height = MINIMAP_TILES;
    const paintLocalTerrain = (target: HTMLCanvasElement, ox: number, oy: number, size: number) => {
      const tctx = target.getContext("2d");
      if (!tctx) return;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          tctx.fillStyle = MINIMAP_COLOR[baseTileAt(ox + x, oy + y)] ?? "#57a639";
          tctx.fillRect(x, y, 1, 1);
        }
      }
    };
    getMapSnapshotRef.current = () => ({
      space,
      playerX: player.x,
      playerY: player.y,
      indoor: space === "world" ? null : indoorData(),
      nations: nationsRef.current.nations.map((n) => ({
        id: n.id,
        name: n.name,
        color: n.color,
        capital: n.capital,
      })),
      porter: porterRef.current,
      players: [...others.values()].map((o) => ({
        id: o.track.entry.id,
        name: o.track.entry.name || "プレイヤー",
        x: o.track.rx,
        y: o.track.ry,
        space,
      })),
    });

    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const drawAvatar = (
      c: CanvasRenderingContext2D,
      sx: number,
      sy: number,
      face: 1 | -1,
      phase: number,
      speedRatio: number,
      name: string | null,
      nationColor: string | null = null,
      swim = false,
      plate: { roleSymbol: string; rank: number } | null = null,
      sit = false,
      icon: HTMLImageElement | null = null,
    ) => {
      const size = TILE * AVATAR_TILES;
      const sink = swim ? size * 0.34 : sit ? size * 0.16 : 0;
      const bob = swim
        ? Math.sin(performance.now() / 280 + phase) * TILE * 0.02
        : sit
          ? 0
          : walkBob(phase) * TILE * 0.07 * speedRatio;
      const squash = swim ? 1 : sit ? 0.86 : 1 - (1 - walkSquashY(phase)) * speedRatio;
      const waterline = sy - size * 0.28;
      c.fillStyle = "rgba(20,30,16,0.30)";
      c.beginPath();
      c.ellipse(sx, sy, size * 0.3, size * 0.1, 0, 0, Math.PI * 2);
      c.fill();
      const iconReady = icon !== null && texReady(icon);
      if (iconReady || texReady(avatar)) {
        const paintSprite = (alpha: number, y0: number, y1: number) => {
          c.save();
          c.beginPath();
          c.rect(sx - size, y0, size * 2, y1 - y0);
          c.clip();
          c.globalAlpha = alpha;
          c.translate(sx, sy - bob + sink);
          c.rotate(moveLean(speedRatio) * face);
          c.scale((iconReady ? 1 : face) * (1 + (1 - squash) * 0.7), squash);
          if (iconReady && icon) {
            c.save();
            c.beginPath();
            c.arc(0, -size / 2, size / 2, 0, Math.PI * 2);
            c.clip();
            c.drawImage(icon, -size / 2, -size, size, size);
            c.restore();
            c.beginPath();
            c.arc(0, -size / 2, size / 2, 0, Math.PI * 2);
            c.lineWidth = 2;
            c.strokeStyle = "rgba(255,255,255,0.9)";
            c.stroke();
          } else {
            c.drawImage(avatar, -size / 2, -size, size, size);
          }
          c.restore();
        };
        if (swim) {
          paintSprite(0.55, waterline, sy + size);
          paintSprite(1, sy - size * 2, waterline);
        } else {
          paintSprite(1, sy - size * 2, sy + size);
        }
      } else {
        c.fillStyle = "#f4f6f8";
        c.beginPath();
        c.arc(sx, sy - size / 2 - bob + sink, size * 0.36, 0, Math.PI * 2);
        c.fill();
      }
      if (swim) {
        const t = performance.now() / 1000;
        for (let i = 0; i < 2; i++) {
          const k = (t * 0.9 + i * 0.5 + phase * 0.13) % 1;
          c.strokeStyle = `rgba(255,255,255,${(0.5 * (1 - k)).toFixed(3)})`;
          c.lineWidth = 1.5;
          c.beginPath();
          c.ellipse(
            sx,
            sy + 1,
            size * (0.3 + 0.22 * k),
            size * (0.1 + 0.07 * k),
            0,
            0,
            Math.PI * 2,
          );
          c.stroke();
        }
      }
      if (name) {
        c.font = "600 11px sans-serif";
        const nameW = c.measureText(name).width;
        const symbolW = plate ? c.measureText(plate.roleSymbol).width : 0;
        const glyphW = 11;
        const plateW = 6 + glyphW + (plate ? 3 + symbolW : 0) + 4 + nameW + 6;
        const plateH = plate && plate.rank > 1 ? 24 : 17;
        const top = sy - size + sink - bob - plateH - 4;
        const left = sx - plateW / 2;
        c.beginPath();
        c.roundRect(left, top, plateW, plateH, 5);
        c.fillStyle = "rgba(8,10,16,0.62)";
        c.fill();
        c.lineWidth = 1.5;
        c.strokeStyle = nationColor ?? "rgba(255,255,255,0.35)";
        c.stroke();
        const gx = left + 5;
        const gy = top + 4;
        c.fillStyle = "#ffffff";
        c.beginPath();
        c.roundRect(gx, gy, 9, 9, 3);
        c.fill();
        c.fillStyle = "rgba(8,10,16,0.85)";
        c.fillRect(gx + 2, gy + 3.5, 2, 2);
        c.fillRect(gx + 5.5, gy + 3.5, 2, 2);
        let tx = gx + glyphW + 1;
        c.textAlign = "left";
        if (plate) {
          c.fillStyle = "#ffd75e";
          c.fillText(plate.roleSymbol, tx, top + 12.5);
          tx += symbolW + 4;
        }
        c.lineWidth = 3;
        c.strokeStyle = "rgba(10,16,10,0.65)";
        c.strokeText(name, tx, top + 12.5);
        c.fillStyle = "#ffffff";
        c.fillText(name, tx, top + 12.5);
        if (plate && plate.rank > 1) {
          const dotsW = plate.rank * 6 - 2;
          let dx = sx - dotsW / 2;
          c.fillStyle = "#f2c53c";
          for (let i = 0; i < plate.rank; i++) {
            c.beginPath();
            c.arc(dx + 2, top + 19.5, 2, 0, Math.PI * 2);
            c.fill();
            dx += 6;
          }
        }
        c.textAlign = "center";
      }
    };

    const drawCapital = (
      c: CanvasRenderingContext2D,
      sx: number,
      sy: number,
      nation: NationView,
    ) => {
      c.fillStyle = "rgba(20,30,16,0.30)";
      c.beginPath();
      c.ellipse(sx, sy, TILE * 0.34, TILE * 0.11, 0, 0, Math.PI * 2);
      c.fill();
      const w = TILE * 0.52;
      const h = TILE * 0.62;
      const x0 = sx - w / 2;
      const y0 = sy - h;
      c.fillStyle = "#9aa0a6";
      c.fillRect(x0, y0, w, h);
      c.strokeStyle = "rgba(30,34,38,0.8)";
      c.lineWidth = 1.5;
      c.strokeRect(x0, y0, w, h);
      c.fillStyle = "#878d94";
      const bw = w / 5;
      for (let i = 0; i < 3; i++) c.fillRect(x0 + i * bw * 2, y0 - TILE * 0.1, bw, TILE * 0.1);
      c.strokeStyle = "#4c4438";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(sx, y0 - TILE * 0.08);
      c.lineTo(sx, y0 - TILE * 0.52);
      c.stroke();
      c.fillStyle = nation.color;
      c.beginPath();
      c.moveTo(sx, y0 - TILE * 0.52);
      c.lineTo(sx + TILE * 0.34, y0 - TILE * 0.42);
      c.lineTo(sx, y0 - TILE * 0.32);
      c.closePath();
      c.fill();
      c.font = "600 11px sans-serif";
      c.textAlign = "center";
      c.lineWidth = 3;
      c.strokeStyle = "rgba(10,16,10,0.65)";
      const ly = y0 - TILE * 0.62;
      c.strokeText(nation.name, sx, ly);
      c.fillStyle = "#ffffff";
      c.fillText(nation.name, sx, ly);
      const nw = c.measureText(nation.name).width;
      c.fillStyle = nation.color;
      c.fillRect(sx - nw / 2, ly + 3, nw, 2.5);
    };

    let lastTileKey = "";
    let lastStation: LobbyStation | null = null;
    let lastStationGenre: ShopGenreId | null = null;
    let lastStationArcade: string | null = null;
    let lastWorldStationKinds = "";
    const placePlayer = (x: number, y: number) => {
      const free = findFreeNear(activeMap(), x, y, activeBlocked(), { swim: space === "world" });
      player.x = free.x;
      player.y = free.y;
      player.vx = 0;
      player.vy = 0;
      cam.x = free.x;
      cam.y = free.y;
      others.clear();
      setOthersCount(0);
      lastTileKey = `${space}:${Math.floor(free.x)},${Math.floor(free.y)}`;
      saveNow();
      sendHeartbeat();
      void refreshTilesRef.current();
    };
    instanceTeleportRef.current = (x: number, y: number) =>
      beginTransition(() => placePlayer(x, y));
    const applyServerForceMove = (mv: { space: string; x: number; y: number }) => {
      beginTransition(() => {
        if (space === "world" && mv.space !== "world") {
          worldReturn = { x: player.x, y: player.y };
        }
        space = mv.space;
        setSpaceUi(mv.space);
        setStatusText(
          mv.space === "prison"
            ? "タカスミ中央刑務所"
            : parseApartmentSpace(mv.space)
              ? "専用メトロマンション"
              : mv.space === "lobby"
                ? "中央広場"
                : "共有ワールド",
        );
        lastStation = null;
        setStationUi(null);
        setBoardOpen(false);
        setGuildBoardOpen(false);
        placePlayer(mv.x, mv.y);
        spawnBurst(fxSys, "warp", player.x, player.y - 0.3);
        playWbSe("warp");
        void pollOthers();
      });
    };
    forceMoveRef.current = applyServerForceMove;

    const doWarp = (target: SaveSpace) => {
      if (target === space) return;
      if (mmoSummaryRef.current?.prison.jailed && target !== "prison") {
        setTileMsg("収監中のため脱走・保釈・刑期満了まで移動できません");
        return;
      }
      beginTransition(() => {
        if (target === "lobby") {
          worldReturn = { x: player.x, y: player.y };
          space = "lobby";
          setSpaceUi("lobby");
          setStatusText("中央広場");
          setBoardOpen(false);
          setGuildBoardOpen(false);
          placePlayer(LOBBY_ENTRY.x, LOBBY_ENTRY.y);
        } else if (target === "prison") {
          if (space === "world") worldReturn = { x: player.x, y: player.y };
          space = "prison";
          setSpaceUi("prison");
          setStatusText("タカスミ中央刑務所");
          setBoardOpen(false);
          setGuildBoardOpen(false);
          placePlayer(PRISON_VISITOR_ENTRY.x, PRISON_VISITOR_ENTRY.y);
        } else if (target === "tent") {
          worldReturn = { x: player.x, y: player.y };
          space = "tent";
          setSpaceUi("tent");
          setStatusText("テント");
          setBoardOpen(false);
          setGuildBoardOpen(false);
          const entry = tentEntryFor(invRef.current?.tentTier ?? 0);
          placePlayer(entry.x, entry.y);
        } else {
          space = "world";
          setSpaceUi("world");
          setStatusText("共有ワールド");
          lastStation = null;
          setStationUi(null);
          lastStationGenre = null;
          setStationGenre(null);
          lastStationArcade = null;
          setStationArcade(null);
          const dest = worldReturn ?? spawn;
          placePlayer(dest.x, dest.y);
        }
        spawnBurst(fxSys, "warp", player.x, player.y - 0.3);
        playWbSe("warp");
        void pollOthers();
      });
    };
    warpActionRef.current = doWarp;
    const FLOOR_LABEL: Record<LobbyFloorSpace, string> = {
      lobby: "中央広場",
      lobby2: "ラウンジ",
      lobby3: "展望デッキ",
    };
    const doFloorWarp = (target: LobbyFloorSpace, entry: { x: number; y: number }) => {
      if (target === space) return;
      beginTransition(() => {
        space = target;
        setSpaceUi(target);
        setStatusText(FLOOR_LABEL[target]);
        lastStation = null;
        setStationUi(null);
        lastStationGenre = null;
        setStationGenre(null);
        setBoardOpen(false);
        setGuildBoardOpen(false);
        placePlayer(entry.x, entry.y);
        spawnBurst(fxSys, "warp", player.x, player.y - 0.3);
        playWbSe("warp");
        void pollOthers();
      });
    };
    const warpToInstance = (target: string, entry: { x: number; y: number }) => {
      if (target === space) return;
      beginTransition(() => {
        if (space === "world") worldReturn = { x: player.x, y: player.y };
        space = target;
        setSpaceUi(target);
        const inst = parseInstanceSpace(target);
        setStatusText(
          inst?.kind === "cave"
            ? `採掘場 B${(inst.layer ?? 0) + 1}`
            : inst?.kind === "ruins"
              ? "旧市街"
              : inst?.kind === "dungeon"
                ? `廃ビル ${(inst.layer ?? 0) + 1}F`
                : "インスタンス",
        );
        lastStation = null;
        setStationUi(null);
        setBoardOpen(false);
        setGuildBoardOpen(false);
        placePlayer(entry.x, entry.y);
        spawnBurst(fxSys, "warp", player.x, player.y - 0.3);
        playWbSe("warp");
        void pollOthers();
        if (inst?.kind === "cave") {
          void refreshCaveStateRef.current(target);
        }
        if (inst?.kind === "ruins") {
          void refreshRuinsStateRef.current(target);
        }
        if (inst?.kind === "dungeon") {
          void refreshDungeonStateRef.current(target);
        }
      });
    };
    instanceWarpRef.current = warpToInstance;
    enterDungeonRef.current = (ex: number, ey: number) => {
      void (async () => {
        const result = await postPartyRef.current("enter", { entrance: { x: ex, y: ey } });
        if (!result.ok || !result.space) {
          setTileMsg(result.error === "leader_not_entered" ? "リーダーの入場待ち" : "入れない");
          return;
        }
        const floor = buildDungeonFloor(MAP_SEED, ex, ey, 0);
        warpToInstance(result.space, { x: floor.portal.x + 0.5, y: floor.portal.y + 0.5 });
      })();
    };
    const structureAt = (tx: number, ty: number): PlacedStructure | null => {
      const ccx = Math.floor(tx / CHUNK_SIZE);
      const ccy = Math.floor(ty / CHUNK_SIZE);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          for (const st of structuresForChunk(MAP_SEED, ccx + dx, ccy + dy)) {
            if (st.x === tx && st.y === ty) return st;
          }
        }
      }
      return null;
    };
    teleportActionRef.current = (x: number, y: number) => {
      beginTransition(() => {
        if (space !== "world") {
          space = "world";
          setSpaceUi("world");
          setStatusText("共有ワールド");
          lastStation = null;
          setStationUi(null);
          lastStationGenre = null;
          setStationGenre(null);
          lastStationArcade = null;
          setStationArcade(null);
          setBoardOpen(false);
        }
        placePlayer(x, y);
        void pollOthers();
      });
    };
    respawnActionRef.current = (point: { x: number; y: number }) => {
      beginTransition(() => {
        space = "world";
        setSpaceUi("world");
        setStatusText("共有ワールド");
        lastStation = null;
        setStationUi(null);
        placePlayer(point.x, point.y);
        spawnBurst(fxSys, "warp", player.x, player.y - 0.3);
        playWbSe("warp");
        void pollOthers();
      });
    };
    const checkTileTriggers = () => {
      const tx = Math.floor(player.x);
      const ty = Math.floor(player.y);
      const key = `${space}:${tx},${ty}`;
      if (lastTileKey === "") {
        lastTileKey = key;
        return;
      }
      if (key === lastTileKey) return;
      lastTileKey = key;
      if (space === "world") {
        if (tilesRef.current[tileKey(tx, ty)]?.block?.itemId === "tent") doWarp("tent");
        else {
          const st = structureAt(tx, ty);
          const stDef = st ? structureById(st.structureId) : null;
          if (stDef?.kind === "entrance" && stDef.targetSpace === "cave") {
            const c = buildCaveLayer(MAP_SEED, tx, ty, 0);
            warpToInstance(makeInstanceSpace("cave", tx, ty, 0), {
              x: c.portal.x + 0.5,
              y: c.portal.y + 0.5,
            });
          } else if (stDef?.kind === "entrance" && stDef.targetSpace === "ruins") {
            const r = buildRuins(MAP_SEED, tx, ty);
            warpToInstance(makeInstanceSpace("ruins", tx, ty, 0), {
              x: r.portal.x + 0.5,
              y: r.portal.y + 0.5,
            });
          } else if (stDef?.kind === "entrance" && stDef.targetSpace === "dungeon") {
            enterDungeonRef.current?.(tx, ty);
          }
        }
        return;
      }
      {
        const inst = parseInstanceSpace(space);
        if (inst?.kind === "cave") {
          const cave = caveLayerNow();
          if (!cave) return;
          if (tx === cave.portal.x && ty === cave.portal.y) {
            doWarp("world");
            return;
          }
          if (cave.stairsDown && tx === cave.stairsDown.x && ty === cave.stairsDown.y) {
            const next = buildCaveLayer(MAP_SEED, inst.entranceX, inst.entranceY, inst.layer + 1);
            const up = next.stairsUp ?? next.portal;
            warpToInstance(
              makeInstanceSpace("cave", inst.entranceX, inst.entranceY, inst.layer + 1),
              { x: up.x + 0.5, y: up.y + 0.5 },
            );
            return;
          }
          if (cave.stairsUp && tx === cave.stairsUp.x && ty === cave.stairsUp.y) {
            const prev = buildCaveLayer(MAP_SEED, inst.entranceX, inst.entranceY, inst.layer - 1);
            const down = prev.stairsDown ?? prev.portal;
            warpToInstance(
              makeInstanceSpace("cave", inst.entranceX, inst.entranceY, inst.layer - 1),
              { x: down.x + 0.5, y: down.y + 0.5 },
            );
            return;
          }
          if (cave.onsen.some((t) => t.x === tx && t.y === ty)) {
            void postInstanceRef.current("onsen");
          }
          return;
        }
        if (inst?.kind === "dungeon") {
          const dfloor = dungeonNow();
          if (!dfloor) return;
          if (tx === dfloor.portal.x && ty === dfloor.portal.y) {
            if (inst.layer <= 0) {
              void postInstanceRef.current("leave");
              doWarp("world");
            } else {
              const prev = buildDungeonFloor(
                MAP_SEED,
                inst.entranceX,
                inst.entranceY,
                inst.layer - 1,
              );
              const down = prev.stairsDown ?? prev.portal;
              warpToInstance(
                makeInstanceSpace("dungeon", inst.entranceX, inst.entranceY, inst.layer - 1),
                { x: down.x + 0.5, y: down.y + 0.5 },
              );
            }
            return;
          }
          if (dfloor.stairsDown && tx === dfloor.stairsDown.x && ty === dfloor.stairsDown.y) {
            const next = buildDungeonFloor(
              MAP_SEED,
              inst.entranceX,
              inst.entranceY,
              inst.layer + 1,
            );
            warpToInstance(
              makeInstanceSpace("dungeon", inst.entranceX, inst.entranceY, inst.layer + 1),
              { x: next.portal.x + 0.5, y: next.portal.y + 0.5 },
            );
            return;
          }
          return;
        }
        if (inst?.kind === "ruins") {
          const ruins = ruinsNow();
          if (!ruins) return;
          if (tx === ruins.portal.x && ty === ruins.portal.y) {
            doWarp("world");
            return;
          }
          const trap = ruins.traps.find((t) => t.x === tx && t.y === ty);
          if (trap && !ruinsStateRef.current.traps[String(trap.idx)]) {
            void postInstanceRef.current("trap", { trapIdx: trap.idx });
          }
          return;
        }
      }
      if (space === "tent") {
        const exit = tentExitFor(invRef.current?.tentTier ?? 0);
        if (tx === exit.x && ty === exit.y) doWarp("world");
        return;
      }
      if (parseApartmentSpace(space)) {
        if (tx === APARTMENT_EXIT.x && ty === APARTMENT_EXIT.y) doWarp("lobby");
        return;
      }
      const floorWarp = floorWarpAt(space, tx, ty);
      if (floorWarp) {
        doFloorWarp(floorWarp.to, floorWarp.entry);
        return;
      }
      if (space !== "lobby") return;
      if (tx === LOBBY_WARP_PAD.x && ty === LOBBY_WARP_PAD.y) {
        doWarp("world");
        return;
      }
      if (LOBBY_STAIRS_UP.some((t) => t.x === tx && t.y === ty)) {
        placePlayer(LOBBY_UP_LANDING.x, LOBBY_UP_LANDING.y);
        return;
      }
      if (LOBBY_STAIRS_DOWN.some((t) => t.x === tx && t.y === ty)) {
        placePlayer(LOBBY_DOWN_LANDING.x, LOBBY_DOWN_LANDING.y);
      }
    };

    let raf = 0;
    let lastT = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000));
      lastT = now;
      let sdt = dt;

      if (
        transitionStart >= 0 &&
        transitionKind === "warp" &&
        !transitionSwapped &&
        transitionSwapDue(now - transitionStart)
      ) {
        transitionSwapped = true;
        const apply = transitionPending;
        transitionPending = null;
        apply?.();
      }

      let ix = 0;
      let iy = 0;
      if (keys.has("a") || keys.has("arrowleft")) ix -= 1;
      if (keys.has("d") || keys.has("arrowright")) ix += 1;
      if (keys.has("w") || keys.has("arrowup")) iy -= 1;
      if (keys.has("s") || keys.has("arrowdown")) iy += 1;
      if (joy.active) {
        ix += joy.dx;
        iy += joy.dy;
      }
      if (
        transitionStart >= 0 &&
        transitionKind === "warp" &&
        !transitionDone(now - transitionStart, "warp")
      ) {
        ix = 0;
        iy = 0;
      }
      const ilen = Math.hypot(ix, iy);
      if (ilen > 1) {
        ix /= ilen;
        iy /= ilen;
      }
      if (telescopeOpenRef.current) {
        if (!telescopeCam) telescopeCam = { x: player.x, y: player.y };
        if (telescopeCenterSeen !== telescopeCenterRef.current) {
          telescopeCenterSeen = telescopeCenterRef.current;
          telescopeCam = { x: player.x, y: player.y };
        }
        const camSpeed = 14;
        telescopeCam.x += ix * camSpeed * dt;
        telescopeCam.y += iy * camSpeed * dt;
        if (space !== "world") {
          const d = indoorData();
          telescopeCam.x = Math.min(d.width - 0.5, Math.max(0.5, telescopeCam.x));
          telescopeCam.y = Math.min(d.height - 0.5, Math.max(0.5, telescopeCam.y));
        }
        ix = 0;
        iy = 0;
      } else if (telescopeCam) {
        telescopeCam = null;
        telescopeDrag = null;
      }
      const floorOv =
        space === "world"
          ? tilesRef.current[tileKey(Math.floor(player.x), Math.floor(player.y))]
          : undefined;
      const floorRaw =
        floorOv?.block && isOverrideActive(floorOv, Date.now()) ? floorOv.block.itemId : null;
      const onFloor = floorRaw !== null && isFloorItem(floorRaw) ? floorRaw : null;
      const swimming =
        space === "world" && onFloor !== "bridge_block" && isWaterAt(worldMap, player.x, player.y);
      const wantDash =
        ilen > 0.01 &&
        ((dashKey !== null && keys.has(dashKey)) || (joy.active && isStickDash(joy.dx, joy.dy)));
      const dashing = wantDash && canDash(stamina);
      let moveSpeed = WALK_SPEED;
      let staminaUse: StaminaUse = "none";
      if (swimming) {
        moveSpeed = dashing ? SWIM_DASH_SPEED : SWIM_SPEED;
        staminaUse = dashing ? "swimDash" : "swim";
      } else {
        const vSpeed = effectiveVehicleMoveSpeed(
          equippedVehicleRef.current,
          onFloor === "path_block",
          false,
        );
        if (vSpeed) {
          moveSpeed = dashing ? vSpeed : Math.max(WALK_SPEED, Number((vSpeed * 0.92).toFixed(2)));
        } else if (dashing) {
          moveSpeed = DASH_SPEED;
          staminaUse = "dash";
        }
      }
      if (!swimming && !equippedVehicleRef.current) moveSpeed *= floorSpeedMultiplier(onFloor);
      if (
        circleHitsSolid(activeMap(), player.x, player.y, PLAYER_RADIUS * 0.5, activeBlocked(), {
          swim: space === "world",
        })
      ) {
        const free = findFreeNear(activeMap(), player.x, player.y, activeBlocked(), {
          swim: space === "world",
        });
        if (free.x !== player.x || free.y !== player.y) {
          player.x = free.x;
          player.y = free.y;
        }
      }
      if (sitTileRef.current) {
        if (
          ilen > 0.01 ||
          Math.floor(player.x) !== sitTileRef.current.x ||
          Math.floor(player.y) !== sitTileRef.current.y
        ) {
          sitTileRef.current = null;
        }
      }
      let vel: { x: number; y: number };
      if (sitTileRef.current) {
        vel = { x: 0, y: 0 };
        slideVel = { x: 0, y: 0 };
      } else if (!swimming && onFloor === "ice_block") {
        const accel = 14 * sdt;
        slideVel = {
          x: slideVel.x + Math.max(-accel, Math.min(accel, ix * moveSpeed - slideVel.x)),
          y: slideVel.y + Math.max(-accel, Math.min(accel, iy * moveSpeed - slideVel.y)),
        };
        if (ilen <= 0.01) {
          const fr = Math.max(0, 1 - 0.8 * sdt);
          slideVel = { x: slideVel.x * fr, y: slideVel.y * fr };
        }
        vel = slideVel;
      } else {
        vel = { x: ix * moveSpeed, y: iy * moveSpeed };
        slideVel = vel;
      }
      let prevX = player.x;
      let prevY = player.y;
      const moved = stepMove(activeMap(), player, vel, sdt, activeBlocked(), {
        swim: space === "world",
      });
      player.x = moved.x;
      player.y = moved.y;
      const floorOvNow =
        space === "world"
          ? tilesRef.current[tileKey(Math.floor(player.x), Math.floor(player.y))]
          : undefined;
      const onBridgeNow =
        floorOvNow?.block?.itemId === "bridge_block" && isOverrideActive(floorOvNow, Date.now());
      const inWaterNow =
        space === "world" && !onBridgeNow && isWaterAt(worldMap, player.x, player.y);
      if (space === "world" && !inWaterNow) lastLand = { x: player.x, y: player.y };
      if (inWaterNow !== wasSwimming) {
        splashes.push({ x: player.x, y: player.y, at: now });
        spawnBurst(fxSys, "splash", player.x, player.y);
        playWbSe("splash");
        wasSwimming = inWaterNow;
      }
      const staminaDt =
        invRef.current?.role === "scout" && staminaUse !== "none" ? sdt * SCOUT_STAMINA_MULT : sdt;
      stamina = stepStamina(stamina, staminaUse, staminaDt).state;
      if (staminaBoostRef.current) {
        stamina = createStamina();
        staminaBoostRef.current = false;
      }
      playerSwimming = inWaterNow;
      if (inWaterNow && stamina.value <= 0) {
        stamina = rescueStamina(stamina);
        player.x = lastLand.x;
        player.y = lastLand.y;
        prevX = player.x;
        prevY = player.y;
        cam.x = player.x;
        cam.y = player.y;
        wasSwimming = false;
        playerSwimming = false;
        splashes.push({ x: player.x, y: player.y, at: now });
        spawnBurst(fxSys, "warp", player.x, player.y - 0.3);
        playWbSe("warp");
        saveNow();
      }
      checkTileTriggers();
      if (space !== "world") {
        const tx = Math.floor(player.x);
        const ty = Math.floor(player.y);
        const st = stationNear(indoorData().objects, tx, ty);
        if (st !== lastStation) {
          lastStation = st;
          setStationUi(st);
        }
        const genre =
          st === "shop"
            ? stationGenreNear(indoorData().objects, tx, ty)
            : st === "smith"
              ? "smith"
              : null;
        if (genre !== lastStationGenre) {
          lastStationGenre = genre;
          setStationGenre(genre);
        }
        const arcade = st === "arcade" ? stationArcadeNear(indoorData().objects, tx, ty) : null;
        if (arcade !== lastStationArcade) {
          lastStationArcade = arcade;
          setStationArcade(arcade);
        }
      }
      if (space === "world") {
        const kinds = new Set<string>();
        const px = Math.floor(player.x);
        const py = Math.floor(player.y);
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const ov = tilesRef.current[tileKey(px + dx, py + dy)];
            for (const k of placedStationKinds(ov?.block?.itemId)) kinds.add(k);
          }
        }
        const key = [...kinds].sort().join(",");
        if (key !== lastWorldStationKinds) {
          lastWorldStationKinds = key;
          setWorldStationKinds(key);
        }
      } else if (lastWorldStationKinds !== "") {
        lastWorldStationKinds = "";
        setWorldStationKinds("");
      }
      player.vx = (player.x - prevX) / dt;
      player.vy = (player.y - prevY) / dt;
      const speed = Math.hypot(player.vx, player.vy);
      if (player.vx < -0.2) player.face = -1;
      else if (player.vx > 0.2) player.face = 1;
      player.phase = advanceWalkPhase(player.phase, speed, sdt);
      const speedRatio = Math.min(1, speed / WALK_SPEED);

      for (const ev of fxEventsRef.current.splice(0)) {
        if (ev.kind === "whiff") {
          swing = { startedAt: now, itemId: null, face: player.face, whiff: true };
          playWbSe("swing");
          continue;
        }
        spawnBurst(fxSys, ev.kind, ev.x + 0.5, ev.y + 0.5, { colors: ev.colors });
        playWbSe(seForFxBurst(ev.kind), {
          distance: Math.max(Math.abs(ev.x + 0.5 - player.x), Math.abs(ev.y + 0.5 - player.y)),
        });
        if (ev.kind === "chop" || ev.kind === "mine") shake = startShake(shake, 2, now);
        else if (ev.kind === "debris" || ev.kind === "build") shake = startShake(shake, 3, now);
        if (ev.kind === "place" || ev.kind === "build") pops.set(`${ev.x},${ev.y}`, now);
      }
      stepFx(fxSys, sdt);
      const beat = stepBeatIndex(player.phase);
      if (beat !== lastBeat) {
        lastBeat = beat;
        if (speed > 0.6 && !reducedMotion) {
          if (playerSwimming) {
            spawnBurst(fxSys, "step", player.x, player.y, { color: "#bfe6ff" });
            playWbSe("splash");
          } else {
            spawnBurst(fxSys, "step", player.x, player.y + 0.05);
            playWbStep(
              footstepMaterialFor({
                biome:
                  space === "world"
                    ? biomeAt(MAP_SEED, Math.floor(player.x), Math.floor(player.y))
                    : undefined,
                space,
                swimming: false,
              }),
            );
          }
        }
      }
      if (dashing && speed > 0.6 && now - lastDashFxAt > 45 && !reducedMotion) {
        lastDashFxAt = now;
        spawnBurst(fxSys, "dash", player.x - player.vx * 0.06, player.y - 0.35);
        playWbSe("dash");
      }
      if (playerSwimming && speed > 0.6 && now - lastSwimFxAt > 200) {
        lastSwimFxAt = now;
        spawnBurst(fxSys, "step", player.x, player.y, { color: "#7cc0e8" });
      }
      if (
        equippedVehicleRef.current &&
        !playerSwimming &&
        speed > 2.4 &&
        now - lastDriveFxAt > 75 &&
        !reducedMotion
      ) {
        lastDriveFxAt = now;
        spawnBurst(fxSys, "step", player.x - player.vx * 0.04, player.y + 0.05, {
          color: "#cbd5e1",
        });
      }
      playerPosRef.current.x = player.x;
      playerPosRef.current.y = player.y;

      const lookX = telescopeCam ? telescopeCam.x : player.x + player.vx * 0.35;
      const lookY = telescopeCam ? telescopeCam.y : player.y + player.vy * 0.35;
      cam.x = damp(cam.x, lookX, telescopeCam ? 14 : 7.5, dt);
      cam.y = damp(cam.y, lookY, telescopeCam ? 14 : 7.5, dt);

      const nowMs = Date.now();
      const presenceNowMs = presenceNow();
      for (const o of others.values()) {
        o.track = stepRemoteTrack(o.track, presenceNowMs, sdt, activeBounds());
        const ospeed = Math.hypot(o.track.entry.vx, o.track.entry.vy);
        o.phase = advanceWalkPhase(o.phase, ospeed, sdt);
      }

      const distFromSave = Math.hypot(player.x - lastSaved.x, player.y - lastSaved.y);
      if (distFromSave >= 1 || (distFromSave >= 0.25 && now - lastSaved.at > 5000)) {
        saveNow();
      }

      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      const shakeOff =
        space === "world" && !reducedMotion ? shakeOffsetAt(shake, now) : { x: 0, y: 0 };
      const toScreenX = (wx: number) => (wx - cam.x) * TILE + cw / 2 + shakeOff.x;
      const toScreenY = (wy: number) => (wy - cam.y) * TILE + ch / 2 + shakeOff.y;
      let lobbyOx = 0;
      let lobbyOy = 0;
      let drawLobbySprite: (o: LobbyObject) => void = () => {};
      if (space === "world") {
        const tx0 = Math.floor(cam.x - cw / TILE / 2 - 1);
        const tx1 = Math.ceil(cam.x + cw / TILE / 2 + 1);
        const ty0 = Math.floor(cam.y - ch / TILE / 2 - 1);
        const ty1 = Math.ceil(cam.y + ch / TILE / 2 + 1);
        ctx.imageSmoothingEnabled = false;
        const tileOriginX = Math.round(toScreenX(tx0));
        const tileOriginY = Math.round(toScreenY(ty0));
        const tileSx = (tx: number) => tileOriginX + (tx - tx0) * TILE;
        const tileSy = (ty: number) => tileOriginY + (ty - ty0) * TILE;
        for (let ty = ty0; ty <= ty1; ty++) {
          for (let tx = tx0; tx <= tx1; tx++) {
            const id = mapTileAt(worldMap, tx, ty);
            const sx = tileSx(tx);
            const sy = tileSy(ty);
            const dungeonKey = TILE_DUNGEON[id];
            const baseTex = dungeonKey ? dungeon[dungeonKey] : textures[TILE_TEXTURE[id]];
            if (texReady(baseTex)) ctx.drawImage(baseTex, sx, sy, TILE + 1, TILE + 1);
            else {
              ctx.fillStyle = TILE_FALLBACK[id] ?? "#57a639";
              ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
            }
          }
        }
        {
          const roadStls = settlementsNear(cam.x, cam.y, 44);
          for (const stl of roadStls) {
            const rMinX = Math.max(tx0, stl.cx - stl.radius);
            const rMaxX = Math.min(tx1, stl.cx + stl.radius);
            const rMinY = Math.max(ty0, stl.cy - stl.radius);
            const rMaxY = Math.min(ty1, stl.cy + stl.radius);
            for (let ty = rMinY; ty <= rMaxY; ty++) {
              for (let tx = rMinX; tx <= rMaxX; tx++) {
                const roadKind = settlementRoadAt(stl, tx, ty);
                if (!roadKind) continue;
                const roadSx = tileSx(tx);
                const roadSy = tileSy(ty);
                if (roadKind === "plaza") {
                  ctx.fillStyle = "#94a3b8";
                  ctx.fillRect(roadSx, roadSy, TILE + 1, TILE + 1);
                  ctx.strokeStyle = "rgba(30,41,59,0.22)";
                  ctx.lineWidth = 1;
                  ctx.strokeRect(roadSx + 1, roadSy + 1, TILE - 2, TILE - 2);
                } else {
                  ctx.fillStyle = "#475569";
                  ctx.fillRect(roadSx, roadSy, TILE + 1, TILE + 1);
                  ctx.fillStyle = "rgba(226,232,240,0.45)";
                  if (tx === stl.cx && ty % 2 === 0)
                    ctx.fillRect(roadSx + TILE / 2 - 1, roadSy + 6, 2, TILE - 12);
                  else if (ty === stl.cy && tx % 2 === 0)
                    ctx.fillRect(roadSx + 6, roadSy + TILE / 2 - 1, TILE - 12, 2);
                }
              }
            }
          }
        }

        {
          const ccx0 = Math.floor(tx0 / CHUNK_SIZE);
          const ccx1 = Math.floor(tx1 / CHUNK_SIZE);
          const ccy0 = Math.floor(ty0 / CHUNK_SIZE);
          const ccy1 = Math.floor(ty1 / CHUNK_SIZE);
          for (let ccy = ccy0; ccy <= ccy1; ccy++) {
            for (let ccx = ccx0; ccx <= ccx1; ccx++) {
              for (const st of structuresForChunk(MAP_SEED, ccx, ccy)) {
                const stDef = structureById(st.structureId);
                const sx = Math.round(toScreenX(st.x));
                const sy = Math.round(toScreenY(st.y));
                if (stDef?.kind === "entrance") {
                  ctx.fillStyle = "#4a4a55";
                  ctx.fillRect(sx + 2, sy + 4, TILE - 4, TILE - 4);
                  ctx.fillStyle = "#0a0a10";
                  ctx.beginPath();
                  ctx.arc(sx + TILE / 2, sy + TILE - 6, TILE * 0.26, Math.PI, 0);
                  ctx.rect(sx + TILE / 2 - TILE * 0.26, sy + TILE - 6, TILE * 0.52, 4);
                  ctx.fill();
                } else {
                  ctx.fillStyle = "rgba(120,116,100,0.9)";
                  ctx.fillRect(sx + 6, sy + 8, TILE - 12, TILE - 10);
                  ctx.fillStyle = "rgba(90,86,70,0.9)";
                  ctx.fillRect(sx + 4, sy + 5, TILE - 8, 4);
                }
                if (Math.hypot(player.x - (st.x + 0.5), player.y - (st.y + 0.5)) <= 5) {
                  ctx.font = "11px sans-serif";
                  ctx.textAlign = "center";
                  ctx.fillStyle = "rgba(10,10,14,0.65)";
                  const label = stDef?.name ?? "";
                  const w = ctx.measureText(label).width + 10;
                  ctx.fillRect(sx + TILE / 2 - w / 2, sy - 16, w, 14);
                  ctx.fillStyle = "#fff";
                  ctx.fillText(label, sx + TILE / 2, sy - 5);
                }
              }
            }
          }
        }

        for (let ty = ty0; ty <= ty1; ty++) {
          for (let tx = tx0; tx <= tx1; tx++) {
            const ov = tilesRef.current[tileKey(tx, ty)];
            if (!isOverrideActive(ov, nowMs)) continue;
            const sx = tileSx(tx);
            const sy = tileSy(ty);
            if (ov!.farmland) {
              const img = farmSprites.farmland;
              if (texReady(img)) ctx.drawImage(img, sx, sy, TILE + 1, TILE + 1);
              else {
                ctx.fillStyle = "#8a5a2b";
                ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
              }
            }
            if (ov!.stump) {
              const img = farmSprites.stump;
              if (texReady(img)) ctx.drawImage(img, sx, sy, TILE, TILE);
            }
            if (ov!.crop) {
              const img = farmSprites[`crop${cropStage(ov!.crop, nowMs)}`];
              if (texReady(img)) ctx.drawImage(img, sx, sy, TILE, TILE);
            }
            if (ov!.hp !== undefined) {
              const frac = terrainHpFraction(ov!, mapTileAt(worldMap, tx, ty));
              if (frac < 1) drawBlockCracks(ctx, sx, sy, tx, ty, frac);
            }
            if (ov!.block) {
              const img = itemIcons[ov!.block.itemId];
              const bx = Math.round(sx);
              const by = Math.round(sy);
              const isRug = ov!.block.itemId === "rug";
              const isFlat =
                isRug || (isFloorItem(ov!.block.itemId) && ov!.block.itemId !== "bridge_block");
              const ps = isFlat ? 1 : popScaleFor(tileKey(tx, ty), now);
              ctx.save();
              if (ps !== 1) {
                ctx.translate(bx + TILE / 2, by + TILE / 2);
                ctx.scale(ps, ps);
                ctx.translate(-(bx + TILE / 2), -(by + TILE / 2));
              }
              if (isFlat) {
                if (texReady(img))
                  ctx.drawImage(
                    img,
                    bx + 2,
                    Math.round(by + TILE * 0.36),
                    TILE - 4,
                    Math.round(TILE * 0.6),
                  );
                else {
                  ctx.fillStyle = isRug ? "#8a4a56" : "#7a6a55";
                  ctx.fillRect(
                    bx + 2,
                    Math.round(by + TILE * 0.36),
                    TILE - 4,
                    Math.round(TILE * 0.6),
                  );
                }
              } else if (isGateItem(ov!.block.itemId) && ov!.gateOpen === true) {
                if (texReady(img)) ctx.drawImage(img, bx, by, Math.round(TILE * 0.28), TILE);
                else {
                  ctx.fillStyle = "#8a6a42";
                  ctx.fillRect(bx, by + 4, Math.round(TILE * 0.28), TILE - 8);
                }
              } else if (texReady(img)) ctx.drawImage(img, bx, by, TILE, TILE);
              else {
                ctx.fillStyle = "#9a7b4f";
                ctx.fillRect(bx + 5, by + 5, TILE - 10, TILE - 10);
              }
              drawBlockCracks(ctx, bx, by, tx, ty, blockHpFraction(ov!.block));
              if (ov!.deco) {
                const decoImg = itemIcons[ov!.deco];
                if (texReady(decoImg)) {
                  const ds = Math.round(TILE * 0.55);
                  ctx.drawImage(
                    decoImg,
                    Math.round(bx + (TILE - ds) / 2),
                    Math.round(by + TILE * 0.06),
                    ds,
                    ds,
                  );
                }
              }
              if (ov!.display) {
                const dispImg = itemIcons[ov!.display];
                if (texReady(dispImg)) {
                  const ds = Math.round(TILE * 0.6);
                  ctx.drawImage(
                    dispImg,
                    Math.round(bx + (TILE - ds) / 2),
                    Math.round(by + TILE * 0.02),
                    ds,
                    ds,
                  );
                }
              }
              if (ov!.signText) {
                ctx.save();
                ctx.font = "bold 10px sans-serif";
                ctx.textAlign = "center";
                const tw = Math.min(TILE - 2, ctx.measureText(ov!.signText).width + 8);
                ctx.fillStyle = "rgba(20,14,8,0.72)";
                ctx.fillRect(
                  Math.round(bx + (TILE - tw) / 2),
                  Math.round(by + TILE * 0.3),
                  Math.round(tw),
                  14,
                );
                ctx.fillStyle = "#ffe9b8";
                ctx.fillText(
                  ov!.signText,
                  Math.round(bx + TILE / 2),
                  Math.round(by + TILE * 0.3) + 10,
                  TILE - 4,
                );
                ctx.restore();
              }
              if (isMachineItem(ov!.block.itemId)) {
                const bid = ov!.block.itemId;
                const spec = machineSpecFor(bid);
                const pulse = 0.5 + 0.5 * Math.sin(now / 260 + tx * 0.7 + ty * 0.9);
                ctx.save();
                if (bid === "power_generator") {
                  ctx.strokeStyle = `rgba(56,189,248,${(0.28 + 0.28 * pulse).toFixed(2)})`;
                  ctx.lineWidth = 1.8;
                  ctx.beginPath();
                  ctx.arc(bx + TILE / 2, by + TILE / 2, TILE * 0.55 + pulse * 4, 0, Math.PI * 2);
                  ctx.stroke();
                } else if (bid === "security_camera") {
                  const sweep = (now / 900 + tx) % (Math.PI * 2);
                  ctx.fillStyle = "rgba(239,68,68,0.16)";
                  ctx.beginPath();
                  ctx.moveTo(bx + TILE / 2, by + TILE / 2);
                  ctx.arc(bx + TILE / 2, by + TILE / 2, TILE * 0.85, sweep, sweep + 0.8);
                  ctx.closePath();
                  ctx.fill();
                } else if (bid === "smart_vending") {
                  ctx.fillStyle = "rgba(20,184,166,0.92)";
                  ctx.fillRect(bx + TILE - 20, by + 2, 18, 9);
                  ctx.fillStyle = "#fff";
                  ctx.font = "bold 7px sans-serif";
                  ctx.textAlign = "center";
                  ctx.fillText("24H", bx + TILE - 11, by + 9);
                }
                ctx.fillStyle = pulse > 0.5 ? spec.accentColor : "#38bdf8";
                ctx.beginPath();
                ctx.arc(bx + TILE - 6, by + 6, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
              }
              ctx.restore();
            }
          }
        }

        const prof = invRef.current;
        const slot = prof?.hotbar[selSlotRef.current] ?? null;
        const selDef = slot ? itemById(slot.id) : null;
        if (
          prof &&
          selDef &&
          (selDef.category === "block" || selDef.facility === true || !!selDef.placesBlock)
        ) {
          const px = Math.floor(player.x);
          const py = Math.floor(player.y);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const vx = px + dx;
              const vy = py + dy;
              const v = tileView(terrainMap, tilesRef.current, vx, vy, nowMs, null);
              if (actionForTile(v, { blockId: selDef.id })?.action !== "place_block") continue;
              ctx.fillStyle = "rgba(140,255,150,0.20)";
              ctx.fillRect(toScreenX(vx), toScreenY(vy), TILE, TILE);
              ctx.strokeStyle = "rgba(225,255,225,0.55)";
              ctx.lineWidth = 1.5;
              ctx.strokeRect(toScreenX(vx) + 1, toScreenY(vy) + 1, TILE - 2, TILE - 2);
            }
          }
        }

        ctx.imageSmoothingEnabled = true;

        for (const n of nationsRef.current.nations) {
          const csx = toScreenX(n.capital.x + 0.5);
          const csy = toScreenY(n.capital.y + 1);
          if (csx < -TILE * 2 || csy < -TILE * 2 || csx > cw + TILE * 2 || csy > ch + TILE * 2)
            continue;
          drawCapital(ctx, csx, csy, n);
        }
      } else {
        ctx.fillStyle = "#14121c";
        ctx.fillRect(0, 0, cw, ch);
        lobbyOx = Math.round(cw / 2 - cam.x * TILE);
        lobbyOy = Math.round(ch / 2 - cam.y * TILE);
        drawLobbySprite = (o: LobbyObject) => {
          const img = lobbySprites[o.sprite];
          const sx = lobbyOx + o.x * TILE;
          const sy = lobbyOy + o.y * TILE;
          ctx.imageSmoothingEnabled = false;
          if (texReady(img)) ctx.drawImage(img, sx, sy, o.w * TILE, o.h * TILE);
          else {
            ctx.fillStyle = "rgba(130,130,140,0.85)";
            ctx.fillRect(sx, sy, o.w * TILE, o.h * TILE);
          }
          ctx.imageSmoothingEnabled = true;
        };
        const indoor = indoorData();
        const lx0 = Math.max(0, Math.floor(cam.x - cw / TILE / 2 - 1));
        const lx1 = Math.min(indoor.width - 1, Math.ceil(cam.x + cw / TILE / 2 + 1));
        const ly0 = Math.max(0, Math.floor(cam.y - ch / TILE / 2 - 1));
        const ly1 = Math.min(indoor.height - 1, Math.ceil(cam.y + ch / TILE / 2 + 1));
        ctx.imageSmoothingEnabled = false;
        for (let ty = ly0; ty <= ly1; ty++) {
          for (let tx = lx0; tx <= lx1; tx++) {
            const id = parseInstanceSpace(space)
              ? (indoor.tiles[ty * indoor.width + tx] ?? 0)
              : parseApartmentSpace(space)
                ? apartmentTileAt(indoor.tiles, tx, ty)
                : space === "tent"
                  ? tentTileAt(indoor.tiles, indoor.width, indoor.height, tx, ty)
                  : space === "prison"
                    ? prisonTileAt(indoor.tiles, tx, ty)
                    : space === "lobby2"
                      ? lobby2TileAt(indoor.tiles, tx, ty)
                      : space === "lobby3"
                        ? lobby3TileAt(indoor.tiles, tx, ty)
                        : lobbyTileAt(indoor.tiles, tx, ty);
            if (id === L_VOID) continue;
            const sx = lobbyOx + tx * TILE;
            const sy = lobbyOy + ty * TILE;
            const key = LOBBY_FLOOR_SPRITE[id];
            const img = key ? lobbySprites[key] : textures[TILE_TEXTURE[T_SAND]];
            if (texReady(img)) ctx.drawImage(img, sx, sy, TILE, TILE);
            else {
              ctx.fillStyle = LOBBY_FLOOR_FALLBACK[id] ?? "#888888";
              ctx.fillRect(sx, sy, TILE, TILE);
            }
            if (id === L_PLAZA) {
              ctx.fillStyle = "rgba(255,255,255,0.10)";
              ctx.fillRect(sx, sy, TILE, TILE);
            }
          }
        }
        {
          const ruinsDraw = ruinsNow();
          if (ruinsDraw) {
            const scoutNear = invRef.current?.role === "scout";
            for (const trap of ruinsDraw.traps) {
              if (ruinsStateRef.current.traps[String(trap.idx)]) continue;
              if (trap.x < lx0 || trap.x > lx1 || trap.y < ly0 || trap.y > ly1) continue;
              const sx = lobbyOx + trap.x * TILE;
              const sy = lobbyOy + trap.y * TILE;
              const near =
                scoutNear && Math.hypot(trap.x + 0.5 - player.x, trap.y + 0.5 - player.y) <= 3;
              ctx.strokeStyle = near ? "rgba(255,90,60,0.9)" : "rgba(30,26,20,0.35)";
              ctx.lineWidth = near ? 2 : 1;
              ctx.beginPath();
              ctx.moveTo(sx + 6, sy + TILE - 7);
              ctx.lineTo(sx + TILE / 2, sy + TILE / 2 + 3);
              ctx.lineTo(sx + TILE - 8, sy + 9);
              ctx.stroke();
              if (near) ctx.strokeRect(sx + 2.5, sy + 2.5, TILE - 5, TILE - 5);
            }
          }
        }
        {
          const caveDraw2 = caveLayerNow();
          if (caveDraw2 && invRef.current?.role === "miner") {
            const pulse = 0.35 + 0.25 * Math.sin(now / 240);
            ctx.strokeStyle = `rgba(255,210,62,${pulse})`;
            ctx.lineWidth = 2;
            for (const v of caveDraw2.veins) {
              if (caveStateRef.current.veins[`${v.x},${v.y}`]) continue;
              if (v.x < lx0 || v.x > lx1 || v.y < ly0 || v.y > ly1) continue;
              ctx.strokeRect(
                lobbyOx + v.x * TILE + 2.5,
                lobbyOy + v.y * TILE + 2.5,
                TILE - 5,
                TILE - 5,
              );
            }
          }
        }
        for (const o of indoor.objects) {
          if (!FLAT_LOBBY_SPRITES.has(o.sprite)) continue;
          if (o.x + o.w < lx0 || o.x > lx1 || o.y + o.h < ly0 || o.y > ly1) continue;
          drawLobbySprite(o);
        }
        ctx.imageSmoothingEnabled = true;
      }

      const drawList: { y: number; draw: () => void }[] = [];
      if (space === "world") {
        const dayPhase = phaseAtTime(nowMs / 1000);
        const nightAmt = nightAmount(dayPhase);
        const nearStls = settlementsNear(cam.x, cam.y, 44);
        for (const stl of nearStls) {
          for (const lamp of stl.lamps) {
            const lx = toScreenX(lamp.x + 0.5);
            const ly = toScreenY(lamp.y + 0.85);
            if (lx < -TILE * 2 || ly < -TILE * 2 || lx > cw + TILE * 2 || ly > ch + TILE * 2) {
              continue;
            }
            drawList.push({
              y: lamp.y + 0.9,
              draw: () => {
                ctx.fillStyle = "rgba(10,16,24,0.28)";
                ctx.beginPath();
                ctx.ellipse(lx, ly + 2, TILE * 0.18, TILE * 0.08, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#334155";
                ctx.fillRect(lx - 2, ly - TILE * 0.72, 4, TILE * 0.72);
                ctx.fillStyle = nightAmt > 0.12 ? "#fde047" : "#cbd5e1";
                ctx.beginPath();
                ctx.arc(lx, ly - TILE * 0.78, 5, 0, Math.PI * 2);
                ctx.fill();
              },
            });
          }

          for (const b of stl.buildings) {
            const bx = toScreenX(b.x);
            const by = toScreenY(b.y);
            const bw = b.w * TILE;
            const bh = b.h * TILE;
            if (
              bx + bw < -TILE * 2 ||
              by + bh < -TILE * 2 ||
              bx > cw + TILE * 2 ||
              by > ch + TILE * 2
            ) {
              continue;
            }
            drawList.push({
              y: b.y + b.h,
              draw: () => {
                ctx.fillStyle = "rgba(8,12,20,0.28)";
                ctx.fillRect(bx + 4, by + bh - 4, bw - 4, 8);
                // Main wall
                ctx.fillStyle = b.wallColor;
                ctx.fillRect(bx + 2, by + TILE * 0.45, bw - 4, bh - TILE * 0.45);
                ctx.strokeStyle = "rgba(15,23,42,0.75)";
                ctx.lineWidth = 1.5;
                ctx.strokeRect(bx + 2, by + TILE * 0.45, bw - 4, bh - TILE * 0.45);
                // Roof overhang
                ctx.fillStyle = b.roofColor;
                ctx.fillRect(bx, by, bw, TILE * 0.52);
                ctx.fillStyle = "rgba(255,255,255,0.16)";
                ctx.fillRect(bx, by, bw, 4);
                // Windows & door
                const cols = Math.max(2, b.w);
                ctx.fillStyle = nightAmt > 0.12 ? "#fde68a" : "#7dd3fc";
                for (let ci = 0; ci < cols; ci++) {
                  const wx = bx + 8 + ci * ((bw - 16) / cols);
                  ctx.fillRect(wx, by + TILE * 0.68, 10, 9);
                }
                ctx.fillStyle = "#334155";
                ctx.fillRect(bx + bw / 2 - 7, by + bh - 16, 14, 16);
                // Building plate
                ctx.font = "700 10.5px sans-serif";
                ctx.textAlign = "center";
                const tw = Math.min(bw + 24, ctx.measureText(b.label).width + 10);
                ctx.fillStyle = "rgba(12,18,30,0.82)";
                ctx.fillRect(bx + bw / 2 - tw / 2, by - 16, tw, 14);
                ctx.fillStyle = "#f8fafc";
                ctx.fillText(b.label, bx + bw / 2, by - 5.5);
              },
            });
          }

          for (const cit of stl.citizens) {
            const pose = evaluateCitizenPose(stl, cit, dayPhase, nowMs);
            if (pose.sleeping) continue;
            const sx = toScreenX(pose.x);
            const sy = toScreenY(pose.y) + TILE * PLAYER_RADIUS;
            if (sx < -TILE * 3 || sy < -TILE * 3 || sx > cw + TILE * 3 || sy > ch + TILE * 3) {
              continue;
            }
            const nearPlayer = Math.hypot(pose.x - player.x, pose.y - player.y) <= 3.6;
            const roleSym =
              cit.role === "guard"
                ? "[警]"
                : cit.role === "barista"
                  ? "[茶]"
                  : cit.role === "delivery"
                    ? "[配]"
                    : cit.role === "engineer"
                      ? "[工]"
                      : "[市]";
            drawList.push({
              y: pose.y + PLAYER_RADIUS,
              draw: () => {
                drawAvatar(
                  ctx,
                  sx,
                  sy,
                  pose.face,
                  pose.walkPhase,
                  Math.min(1, pose.walkSpeed / WALK_SPEED),
                  cit.name,
                  cit.shirtColor,
                  false,
                  { roleSymbol: roleSym, rank: 1 },
                  false,
                  null,
                );
                if (nearPlayer && cit.phrases.length > 0) {
                  const phrase =
                    cit.phrases[
                      Math.floor((nowMs / 6500 + cit.phaseOffset) % cit.phrases.length)
                    ] ?? pose.activity;
                  ctx.save();
                  ctx.font = "600 11px sans-serif";
                  ctx.textAlign = "center";
                  const btw = ctx.measureText(phrase).width + 14;
                  const bx0 = sx - btw / 2;
                  const by0 = sy - TILE * 1.95;
                  ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
                  ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
                  ctx.lineWidth = 1.2;
                  ctx.beginPath();
                  ctx.roundRect(bx0, by0, btw, 20, 6);
                  ctx.fill();
                  ctx.stroke();
                  ctx.fillStyle = "#e2e8f0";
                  ctx.fillText(phrase, sx, by0 + 13.5);
                  ctx.restore();
                }
              },
            });
          }
        }

        for (const pin of mapPinsRef.current) {
          if (pin.space !== "world") continue;
          const sx = toScreenX(pin.x + 0.5);
          const sy = toScreenY(pin.y + 0.5);
          if (sx < -TILE * 2 || sy < -TILE * 2 || sx > cw + TILE * 2 || sy > ch + TILE * 2) {
            continue;
          }
          drawList.push({
            y: pin.y + 0.7,
            draw: () => {
              const bob = Math.sin(now / 260) * 2;
              ctx.fillStyle = "rgba(8,12,20,0.35)";
              ctx.beginPath();
              ctx.ellipse(sx, sy + 2, 7, 3, 0, 0, Math.PI * 2);
              ctx.fill();
              drawCanvasPinGlyph(ctx, pin.icon, sx, sy - 14 + bob, 9.5, pin.color);
              ctx.font = "700 10.5px sans-serif";
              ctx.textAlign = "center";
              const label = pin.label;
              const tw = ctx.measureText(label).width + 8;
              ctx.fillStyle = "rgba(10,16,28,0.85)";
              ctx.fillRect(sx - tw / 2, sy - 34 + bob, tw, 14);
              ctx.fillStyle = "#ffffff";
              ctx.fillText(label, sx, sy - 23.5 + bob);
            },
          });
        }
      }
      for (const o of others.values()) {
        const nationColor = nationsRef.current.playerNations[o.track.entry.id]?.color ?? null;
        const oSwim = space === "world" && isWaterAt(worldMap, o.track.rx, o.track.ry);
        drawList.push({
          y: o.track.ry + PLAYER_RADIUS,
          draw: () =>
            drawAvatar(
              ctx,
              space !== "world" ? Math.round(lobbyOx + o.track.rx * TILE) : toScreenX(o.track.rx),
              space !== "world"
                ? Math.round(lobbyOy + o.track.ry * TILE) + TILE * PLAYER_RADIUS
                : toScreenY(o.track.ry) + TILE * PLAYER_RADIUS,
              o.track.entry.face,
              o.phase,
              Math.min(1, Math.hypot(o.track.entry.vx, o.track.entry.vy) / WALK_SPEED),
              o.track.entry.name || null,
              nationColor,
              oSwim,
              {
                roleSymbol: roleById((o.track.entry.role ?? "free") as AdventureRoleId).symbol,
                rank: o.track.entry.rank ?? 1,
              },
              o.track.entry.sit === true,
              iconFor(o.track.entry.avatar),
            ),
        });
      }
      if (space !== "world") {
        const caveDraw = caveLayerNow();
        const ruinsObjDraw = ruinsNow();
        for (const o of indoorData().objects) {
          if (FLAT_LOBBY_SPRITES.has(o.sprite)) continue;
          const sx = lobbyOx + o.x * TILE;
          const sy = lobbyOy + o.y * TILE;
          if (sx < -TILE * 4 || sy < -TILE * 4 || sx > cw + TILE * 4 || sy > ch + TILE * 4)
            continue;
          if (ruinsObjDraw && (o.sprite === "ruins_chest" || o.sprite === "gold_door")) {
            const isDoor = o.sprite === "gold_door";
            const door = ruinsObjDraw.doors.find((d) => d.x === o.x && d.y === o.y);
            const chest = ruinsObjDraw.chests.find((c) => c.x === o.x && c.y === o.y);
            if (isDoor && door && ruinsStateRef.current.doors[String(door.idx)]) continue;
            const openedChest = !!chest && ruinsStateRef.current.chests[String(chest.idx)];
            drawList.push({
              y: o.y + o.h,
              draw: () => {
                const bx = Math.round(lobbyOx + o.x * TILE);
                const by = Math.round(lobbyOy + o.y * TILE);
                if (isDoor) {
                  ctx.fillStyle = "#7a6420";
                  ctx.fillRect(bx + 3, by + 2, TILE - 6, TILE - 2);
                  ctx.fillStyle = "#e8c85a";
                  ctx.fillRect(bx + 3, by + 2, TILE - 6, 4);
                  ctx.fillRect(bx + TILE / 2 - 2, by + TILE / 2 - 2, 4, 4);
                } else {
                  ctx.fillStyle = openedChest ? "#5d5040" : "#6e5a43";
                  ctx.fillRect(bx + 4, by + 10, TILE - 8, TILE - 14);
                  ctx.fillStyle = chest?.main ? "#e8c85a" : "#b9a888";
                  ctx.fillRect(bx + 4, by + 16, TILE - 8, 3);
                }
              },
            });
            continue;
          }
          if (
            caveDraw &&
            (o.sprite === "cave_chest" ||
              caveDraw.veins.some((v) => v.objectId === o.sprite && v.x === o.x && v.y === o.y))
          ) {
            const vein = caveDraw.veins.find((v) => v.x === o.x && v.y === o.y);
            const takenAt = vein
              ? (caveStateRef.current.veins[vein.key] ?? 0)
              : caveStateRef.current.chest;
            const def = specialObjectById(o.sprite);
            const respawnMs =
              o.sprite === "cave_chest" ? 6 * 60 * 60 * 1000 : (def?.respawnMs ?? 0);
            if (vein && takenAt > 0 && Date.now() - takenAt < respawnMs) continue;
            const colors: Record<string, string> = {
              coal_vein: "#3a3a42",
              copper_vein: "#c47b4a",
              rare_vein: "#e8c85a",
              crystal_cluster: "#9fe8ff",
              mithril_vein: "#b9f2d8",
              cave_chest: "#8a5a2b",
            };
            const color = colors[o.sprite] ?? "#999";
            const opened =
              o.sprite === "cave_chest" && takenAt > 0 && Date.now() - takenAt < respawnMs;
            drawList.push({
              y: o.y + o.h,
              draw: () => {
                const bx = Math.round(lobbyOx + o.x * TILE);
                const by = Math.round(lobbyOy + o.y * TILE);
                if (o.sprite === "cave_chest") {
                  ctx.fillStyle = opened ? "#5d4020" : color;
                  ctx.fillRect(bx + 4, by + 10, TILE - 8, TILE - 14);
                  ctx.fillStyle = "#e8c85a";
                  ctx.fillRect(bx + 4, by + 16, TILE - 8, 3);
                } else {
                  ctx.fillStyle = "#55565f";
                  ctx.fillRect(bx + 2, by + 2, TILE - 4, TILE - 4);
                  ctx.fillStyle = color;
                  ctx.beginPath();
                  ctx.moveTo(bx + TILE * 0.5, by + 5);
                  ctx.lineTo(bx + TILE - 7, by + TILE * 0.55);
                  ctx.lineTo(bx + TILE * 0.62, by + TILE - 6);
                  ctx.lineTo(bx + 7, by + TILE * 0.6);
                  ctx.closePath();
                  ctx.fill();
                }
              },
            });
            continue;
          }
          drawList.push({ y: o.y + o.h, draw: () => drawLobbySprite(o) });
        }
        for (const n of indoorData().npcs) {
          drawList.push({
            y: n.y + 1,
            draw: () =>
              drawAvatar(
                ctx,
                Math.round(lobbyOx + (n.x + 0.5) * TILE),
                Math.round(lobbyOy + (n.y + 1) * TILE),
                1,
                0,
                0,
                null,
              ),
          });
        }
      }
      const selfFloorOv =
        space === "world"
          ? tilesRef.current[tileKey(Math.floor(player.x), Math.floor(player.y))]
          : undefined;
      const slimeBouncePx =
        selfFloorOv?.block?.itemId === "slime_block" && isOverrideActive(selfFloorOv, Date.now())
          ? Math.abs(Math.sin(now / 170)) * TILE * 0.16
          : 0;
      drawList.push({
        y: player.y + PLAYER_RADIUS,
        draw: () => {
          const sx =
            space !== "world" ? Math.round(lobbyOx + player.x * TILE) : toScreenX(player.x);
          const sy =
            (space !== "world"
              ? Math.round(lobbyOy + player.y * TILE) + TILE * PLAYER_RADIUS
              : toScreenY(player.y) + TILE * PLAYER_RADIUS) - slimeBouncePx;
          const vSpec = vehicleSpecFor(equippedVehicleRef.current);
          if (vSpec && !playerSwimming) {
            const w = TILE * 1.15;
            const h = TILE * 0.48;
            ctx.fillStyle = "rgba(0,0,0,0.35)";
            ctx.beginPath();
            ctx.ellipse(sx, sy + 2, w * 0.55, h * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = vSpec.bodyColor;
            ctx.fillRect(sx - w / 2, sy - h * 0.65, w, h);
            ctx.strokeStyle = vSpec.trimColor;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(sx - w / 2, sy - h * 0.65, w, h);
            if (vSpec.hasSiren) {
              const flash = Math.floor(now / 180) % 2 === 0;
              ctx.fillStyle = flash ? "#ef4444" : "#3b82f6";
              ctx.fillRect(sx - 6, sy - h * 0.8, 12, 4);
            }
          }
          drawAvatar(
            ctx,
            sx,
            vSpec && !playerSwimming ? sy - 5 : sy,
            player.face,
            player.phase,
            speedRatio,
            null,
            null,
            playerSwimming,
            null,
            sitTileRef.current !== null,
            iconFor(myIconUrl),
          );
        },
      });
      if (space === "lobby") {
        const sched = scheduleAt(Date.now());
        if (sched.runningPostMs !== null) {
          if (!raceAnimCache || raceAnimCache.postMs !== sched.runningPostMs) {
            raceAnimCache = {
              postMs: sched.runningPostMs,
              core: generateRaceCore(sched.runningPostMs),
            };
          }
          const core = raceAnimCache.core;
          const progress = Math.min(
            1,
            Math.max(0, (Date.now() - sched.runningPostMs) / RACE_DURATION_MS),
          );
          for (const e of core.entries) {
            const pose = horseTrackPose(core, e.horse.id, progress, RACETRACK);
            const coat = COAT_COLORS[e.horse.coat] ?? "#8a5a2b";
            const gate = e.gate;
            drawList.push({
              y: pose.y + 0.3,
              draw: () => {
                const sx = Math.round(lobbyOx + pose.x * TILE);
                const sy = Math.round(lobbyOy + pose.y * TILE);
                ctx.beginPath();
                ctx.arc(sx, sy, TILE * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = coat;
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = "rgba(0,0,0,0.45)";
                ctx.stroke();
                ctx.fillStyle =
                  e.horse.coat === "芦毛" || e.horse.coat === "白毛" ? "#222" : "#fff";
                ctx.font = `700 ${Math.round(TILE * 0.34)}px sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(String(gate), sx, sy + 1);
              },
            });
          }
        } else {
          raceAnimCache = null;
        }
      }
      drawList.sort((a, b) => a.y - b.y);
      for (const d of drawList) d.draw();

      if (space === "lobby") {
        for (const plot of guildShopPlotsRef.current) {
          const anchor = GUILD_PLOT_ANCHORS[plot.idx];
          if (!anchor) continue;
          const gx = Math.round(lobbyOx + (anchor.x + 0.5) * TILE);
          const gy = Math.round(lobbyOy + anchor.y * TILE);
          if (gx < -TILE * 4 || gy < -TILE * 2 || gx > cw + TILE * 4 || gy > ch + TILE * 2)
            continue;
          ctx.font = "600 11px sans-serif";
          ctx.textAlign = "center";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(10,16,10,0.65)";
          ctx.strokeText(plot.guildName, gx, gy - 5);
          ctx.fillStyle = "#ffffff";
          ctx.fillText(plot.guildName, gx, gy - 5);
        }
      }

      for (const hq of companyHqsRef.current) {
        const gx =
          space === "world"
            ? Math.round(toScreenX(hq.x + 0.5))
            : Math.round(lobbyOx + (hq.x + 0.5) * TILE);
        const gy =
          space === "world" ? Math.round(toScreenY(hq.y)) : Math.round(lobbyOy + hq.y * TILE);
        if (gx < -TILE * 3 || gy < -TILE * 2 || gx > cw + TILE * 3 || gy > ch + TILE * 2) continue;
        ctx.fillStyle = "#ffb340";
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(gx, gy - 11);
        ctx.lineTo(gx + 5, gy - 4);
        ctx.lineTo(gx, gy + 3);
        ctx.lineTo(gx - 5, gy - 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.font = "600 11px sans-serif";
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(10,16,10,0.65)";
        const label = `${hq.name} 本社`;
        ctx.strokeText(label, gx, gy - 15);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, gx, gy - 15);
      }

      if (space === "prison") {
        const ts = Date.now();
        const sweep = isPrisonGuardSweepingVent(ts);
        const phase = (ts % 16_000) / 16_000;
        const guardX = phase < 0.3 ? 6.5 : 13.5 - Math.abs(phase - 0.65) * 10;
        const guardY = 25.5;
        const gx = Math.round(lobbyOx + guardX * TILE);
        const gy = Math.round(lobbyOy + guardY * TILE);
        ctx.save();
        ctx.fillStyle = sweep ? "rgba(239, 68, 68, 0.24)" : "rgba(250, 204, 21, 0.14)";
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        const dir = phase < 0.3 ? Math.PI : 0;
        ctx.arc(gx, gy, TILE * 3.4, dir - 0.55, dir + 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#1e3a8a";
        ctx.beginPath();
        ctx.arc(gx, gy, TILE * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = "700 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = sweep ? "#fca5a5" : "#fef08a";
        ctx.fillText(sweep ? "巡回看守 [警戒中]" : "巡回看守", gx, gy - 16);
        ctx.restore();
      }

      const trNow = trackedTargetRef.current;
      if (trNow) {
        let txTile: number | null = null;
        let tyTile: number | null = null;
        let sameSpace = false;
        if (trNow.kind === "player") {
          const otherPl = others.get(trNow.presenceId);
          if (otherPl) {
            txTile = otherPl.track.rx;
            tyTile = otherPl.track.ry;
            sameSpace = true;
          }
        } else if (trNow.space === space) {
          txTile = trNow.x + 0.5;
          tyTile = trNow.y + 0.5;
          sameSpace = true;
        }

        if (sameSpace && txTile !== null && tyTile !== null) {
          const pxScreen =
            space === "world" ? toScreenX(player.x) : Math.round(lobbyOx + player.x * TILE);
          const pyScreen =
            space === "world" ? toScreenY(player.y) : Math.round(lobbyOy + player.y * TILE);
          const txScreen =
            space === "world" ? toScreenX(txTile) : Math.round(lobbyOx + txTile * TILE);
          const tyScreen =
            space === "world" ? toScreenY(tyTile) : Math.round(lobbyOy + tyTile * TILE);
          const dist = Math.hypot(txTile - player.x, tyTile - player.y);
          if (trackedDistElRef.current) {
            trackedDistElRef.current.textContent = `${Math.round(dist)}m`;
          }
          const near = dist <= 4.5;
          const ang = Math.atan2(tyScreen - pyScreen, txScreen - pxScreen);

          ctx.save();
          ctx.strokeStyle = near ? "#4ade80" : (trNow.color ?? "#38bdf8");
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(txScreen, tyScreen, TILE * (0.55 + Math.sin(now / 180) * 0.12), 0, Math.PI * 2);
          ctx.stroke();

          if (dist > 2) {
            const ax = pxScreen + Math.cos(ang) * TILE * 1.3;
            const ay = pyScreen + Math.sin(ang) * TILE * 1.3;
            ctx.translate(ax, ay);
            ctx.rotate(ang);
            ctx.fillStyle = near ? "#4ade80" : (trNow.color ?? "#38bdf8");
            ctx.beginPath();
            ctx.moveTo(10, 0);
            ctx.lineTo(-6, -6);
            ctx.lineTo(-3, 0);
            ctx.lineTo(-6, 6);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        } else if (trackedDistElRef.current) {
          trackedDistElRef.current.textContent =
            trNow.kind === "player" ? "他エリア/圏外" : "別エリア";
        }
      }

      if (space !== "world") {
        const indoor = indoorData();
        const ruinsDraw = ruinsNow();
        const caveDraw = caveLayerNow();
        for (const o of indoor.objects) {
          const key = o.station ?? o.sprite;
          const isTarget =
            !!o.station ||
            FLAT_LOBBY_SPRITES.has(o.sprite) ||
            o.sprite === "ruins_chest" ||
            o.sprite === "gold_door" ||
            o.sprite === "cave_chest";
          if (!isTarget) continue;
          if (ruinsDraw && o.sprite === "ruins_chest") {
            const chest = ruinsDraw.chests.find((c) => c.x === o.x && c.y === o.y);
            if (chest && ruinsStateRef.current.chests[String(chest.idx)]) continue;
          }
          if (ruinsDraw && o.sprite === "gold_door") {
            const door = ruinsDraw.doors.find((d) => d.x === o.x && d.y === o.y);
            if (door && ruinsStateRef.current.doors[String(door.idx)]) continue;
          }
          if (caveDraw && o.sprite === "cave_chest") {
            const takenAt = caveStateRef.current.chest;
            if (takenAt > 0 && Date.now() - takenAt < 6 * 60 * 60 * 1000) continue;
          }
          if (!isWithinAffordanceRange(player.x, player.y, o.x, o.y, o.w, o.h)) continue;
          const sx = Math.round(lobbyOx + o.x * TILE);
          const sy = Math.round(lobbyOy + o.y * TILE);
          if (sx < -TILE * 2 || sy < -TILE * 2 || sx > cw + TILE * 2 || sy > ch + TILE * 2)
            continue;
          let seenAt = seenAffordanceRef.current.get(key);
          if (seenAt === undefined) {
            seenAt = now;
            seenAffordanceRef.current.set(key, now);
          }
          const age = now - seenAt;
          const alpha = reducedMotion ? 0.35 : nudgeRingAlpha(now, age);
          const bob = reducedMotion ? 0 : nudgeBobPx(age);
          ctx.strokeStyle = `rgba(${AFFORDANCE_RING_RGB},${alpha.toFixed(3)})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(sx + 2.5, sy + 2.5 + bob, o.w * TILE - 5, o.h * TILE - 5);
        }
      }

      {
        const deny = denyFxRef.current;
        if (deny) {
          const fb = deniedFeedback(now - deny.at);
          if (!fb) denyFxRef.current = null;
          else {
            const dx0 =
              space !== "world"
                ? Math.round(lobbyOx + deny.x * TILE)
                : Math.round(toScreenX(deny.x));
            const dy0 =
              space !== "world"
                ? Math.round(lobbyOy + deny.y * TILE)
                : Math.round(toScreenY(deny.y));
            ctx.strokeStyle = `rgba(${DENIED_RING_RGB},${fb.alpha.toFixed(3)})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(dx0 + 2.5 + (reducedMotion ? 0 : fb.dx), dy0 + 2.5, TILE - 5, TILE - 5);
          }
        }
      }

      if (space === "world") {
        const activeFish = fishingRef.current;
        if (activeFish && now > activeFish.biteAt + 1100) fishingRef.current = null;
        const fcx0 = Math.floor((cam.x - cw / TILE / 2) / CHUNK_SIZE);
        const fcx1 = Math.ceil((cam.x + cw / TILE / 2) / CHUNK_SIZE);
        const fcy0 = Math.floor((cam.y - ch / TILE / 2) / CHUNK_SIZE);
        const fcy1 = Math.ceil((cam.y + ch / TILE / 2) / CHUNK_SIZE);
        for (let fcy = fcy0; fcy <= fcy1; fcy++) {
          for (let fcx = fcx0; fcx <= fcx1; fcx++) {
            for (const o of objectsForChunk(MAP_SEED, fcx, fcy)) {
              if (o.objectId !== "fishing_spot") continue;
              const caughtAt = fishCaughtRef.current.get(`${o.x},${o.y}`) ?? 0;
              if (caughtAt && now - caughtAt < 10 * 60 * 1000) continue;
              const sx = toScreenX(o.x + 0.5);
              const sy = toScreenY(o.y + 0.55);
              const bob = Math.sin(now / 600 + o.x * 1.7 + o.y) * 2;
              ctx.fillStyle = "rgba(10,30,50,0.55)";
              ctx.beginPath();
              ctx.ellipse(sx, sy + bob, TILE * 0.3, TILE * 0.13, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              ctx.moveTo(sx + TILE * 0.28, sy + bob);
              ctx.lineTo(sx + TILE * 0.44, sy - TILE * 0.08 + bob);
              ctx.lineTo(sx + TILE * 0.44, sy + TILE * 0.08 + bob);
              ctx.closePath();
              ctx.fill();
            }
          }
        }
        for (let fcy = fcy0; fcy <= fcy1; fcy++) {
          for (let fcx = fcx0; fcx <= fcx1; fcx++) {
            for (const o of objectsForChunk(MAP_SEED, fcx, fcy)) {
              if (o.objectId === "fishing_spot") continue;
              const odef = specialObjectById(o.objectId);
              if (!odef) continue;
              const harvestedAt = surfaceObjStateRef.current.get(`${o.x},${o.y}`) ?? null;
              const ready = objectRespawned(odef, harvestedAt, now);
              if (!ready && odef.respawnMs > 0) continue;
              drawSurfaceObject(ctx, o.objectId, toScreenX(o.x), toScreenY(o.y), TILE, !ready, now);
              if (
                ready &&
                Math.max(Math.abs(o.x + 0.5 - player.x), Math.abs(o.y + 0.5 - player.y)) <= 2
              ) {
                const alpha = reducedMotion ? 0.3 : 0.28 + 0.14 * Math.sin(now / 300);
                ctx.strokeStyle = `rgba(${AFFORDANCE_RING_RGB},${alpha.toFixed(3)})`;
                ctx.lineWidth = 2;
                ctx.strokeRect(toScreenX(o.x) + 2.5, toScreenY(o.y) + 2.5, TILE - 5, TILE - 5);
              }
            }
          }
        }
        const f = fishingRef.current;
        if (f) {
          const sx = toScreenX(f.x + 0.5);
          const sy = toScreenY(f.y + 0.5);
          ctx.strokeStyle = "rgba(255,255,255,0.5)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(toScreenX(player.x + 0.4), toScreenY(player.y - 0.4));
          ctx.lineTo(sx, sy);
          ctx.stroke();
          const biting = now >= f.biteAt;
          ctx.fillStyle = biting ? "#e84a3c" : "#f2f2f2";
          ctx.beginPath();
          ctx.arc(sx, sy + (biting ? 2 : 0), 3, 0, Math.PI * 2);
          ctx.fill();
          if (biting) {
            const age = Math.min(1, (now - f.biteAt) / 1100);
            ctx.strokeStyle = `rgba(255,255,255,${(0.8 * (1 - age)).toFixed(3)})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(
              sx,
              sy,
              TILE * (0.15 + 0.35 * age),
              TILE * (0.06 + 0.14 * age),
              0,
              0,
              Math.PI * 2,
            );
            ctx.stroke();
          }
        }
      }

      if (
        parseInstanceSpace(space)?.kind === "cave" ||
        parseInstanceSpace(space)?.kind === "dungeon"
      ) {
        if (!darkCanvasRef.current) darkCanvasRef.current = document.createElement("canvas");
        const dark = darkCanvasRef.current;
        if (dark.width !== cw || dark.height !== ch) {
          dark.width = cw;
          dark.height = ch;
        }
        const dctx = dark.getContext("2d");
        if (dctx) {
          dctx.setTransform(1, 0, 0, 1, 0, 0);
          dctx.clearRect(0, 0, cw, ch);
          const radius = lightRadiusTiles(invRef.current?.items) * TILE;
          const cxp = Math.round(lobbyOx + player.x * TILE);
          const cyp = Math.round(lobbyOy + player.y * TILE);
          const grad = dctx.createRadialGradient(cxp, cyp, radius * 0.55, cxp, cyp, radius);
          grad.addColorStop(0, "rgba(5,6,14,0)");
          grad.addColorStop(1, "rgba(5,6,14,0.93)");
          dctx.fillStyle = grad;
          dctx.fillRect(0, 0, cw, ch);
          dctx.globalCompositeOperation = "destination-out";
          for (const [key, ov] of Object.entries(tilesRef.current)) {
            const itemId = ov.block?.itemId;
            const rTiles = placedLightRadiusTiles(itemId);
            if (!rTiles) continue;
            const comma = key.indexOf(",");
            const lx = Number(key.slice(0, comma));
            const ly = Number(key.slice(comma + 1));
            const sx = Math.round(lobbyOx + (lx + 0.5) * TILE);
            const sy = Math.round(lobbyOy + (ly + 0.5) * TILE);
            const r = rTiles * TILE;
            if (sx < -r || sy < -r || sx > cw + r || sy > ch + r) continue;
            const g = dctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, r);
            g.addColorStop(0, "rgba(0,0,0,0.95)");
            g.addColorStop(1, "rgba(0,0,0,0)");
            dctx.fillStyle = g;
            dctx.beginPath();
            dctx.arc(sx, sy, r, 0, Math.PI * 2);
            dctx.fill();
          }
          dctx.globalCompositeOperation = "source-over";
          ctx.drawImage(dark, 0, 0, cw, ch);
        }
      }

      if (space === "world" && splashes.length > 0) {
        for (let i = splashes.length - 1; i >= 0; i--) {
          const s = splashes[i];
          const age = (now - s.at) / 450;
          if (age >= 1) {
            splashes.splice(i, 1);
            continue;
          }
          ctx.strokeStyle = `rgba(255,255,255,${(0.65 * (1 - age)).toFixed(3)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(
            toScreenX(s.x),
            toScreenY(s.y),
            TILE * (0.25 + 0.45 * age),
            TILE * (0.09 + 0.16 * age),
            0,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
      }

      const drawParticles = (glowPass: boolean) => {
        for (const p of fxSys.particles) {
          const isGlow = p.shape === "glow";
          if (isGlow !== glowPass) continue;
          const sx = space !== "world" ? Math.round(lobbyOx + p.x * TILE) : toScreenX(p.x);
          const sy = space !== "world" ? Math.round(lobbyOy + p.y * TILE) : toScreenY(p.y);
          if (sx < -TILE || sy < -TILE || sx > cw + TILE || sy > ch + TILE) continue;
          const ratio = fxLifeRatio(p);
          const sizePx = Math.max(1.5, p.size * TILE);
          ctx.fillStyle = p.color;
          ctx.strokeStyle = p.color;
          if (p.shape === "chip" || p.shape === "leaf") {
            ctx.save();
            ctx.globalAlpha = Math.min(1, ratio * 1.6);
            ctx.translate(sx, sy);
            ctx.rotate(p.rot);
            ctx.fillRect(-sizePx / 2, -sizePx / 4, sizePx, sizePx / 2);
            ctx.restore();
          } else if (p.shape === "spark") {
            ctx.save();
            ctx.globalAlpha = Math.min(1, ratio * 1.8);
            ctx.translate(sx, sy);
            ctx.rotate(Math.atan2(p.vy, p.vx));
            ctx.fillRect(-sizePx / 2, -1, sizePx, 2);
            ctx.restore();
          } else if (p.shape === "ring") {
            const prog = 1 - ratio;
            ctx.save();
            ctx.globalAlpha = 0.65 * ratio;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(
              sx,
              sy,
              sizePx * (0.6 + 2.2 * prog),
              sizePx * (0.25 + 0.8 * prog),
              0,
              0,
              Math.PI * 2,
            );
            ctx.stroke();
            ctx.restore();
          } else if (p.shape === "puff") {
            ctx.save();
            ctx.globalAlpha = 0.32 * ratio;
            ctx.beginPath();
            ctx.arc(sx, sy, sizePx * (1.15 - 0.35 * ratio), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else if (p.shape === "glow") {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = 0.75 * ratio;
            ctx.beginPath();
            ctx.arc(sx, sy, sizePx / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else {
            ctx.save();
            ctx.globalAlpha = Math.min(1, ratio * 1.7);
            ctx.beginPath();
            ctx.arc(sx, sy, sizePx / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      };
      if (space === "world" && now - lastAmbientAt > 150 && !reducedMotion) {
        lastAmbientAt = now;
        const ptile = mapTileAt(worldMap, Math.floor(player.x), Math.floor(player.y));
        const nowSec = nowMs / 1000;
        const phase = phaseAtTime(nowSec);
        const isTreeTile = ptile === T_TREE || ptile === T_SNOW_TREE;
        const blend = weatherBlendAt(nowSec);
        const dryKind = weatherAmbientKind("clear", ptile, isTreeTile, nightAmount(phase));
        const kind = dryKind === "snow" ? "snow" : blend.rainStrength >= 0.5 ? "rain" : dryKind;
        const ax0 = cam.x - cw / TILE / 2 - 1;
        const ax1 = cam.x + cw / TILE / 2 + 1;
        const ay0 = cam.y - ch / TILE / 2 - 1;
        const pk = phaseKind(phase);
        if (lastPhaseKind !== "" && pk !== lastPhaseKind) {
          for (let i = 0; i < 4; i++) spawnAmbient(fxSys, kind, ax0, ax1, ay0);
        }
        lastPhaseKind = pk;
        if (dryKind === "snow") {
          spawnAmbient(fxSys, "snow", ax0, ax1, ay0);
        } else {
          const rainN = Math.round(3 * blend.rainStrength);
          for (let i = 0; i < rainN; i++) spawnAmbient(fxSys, "rain", ax0, ax1, ay0);
          if (blend.rainStrength < 0.5) spawnAmbient(fxSys, dryKind, ax0, ax1, ay0);
        }
      }
      drawParticles(false);

      {
        const inCaveFx = space !== "world";
        const sx = (wx: number) => (inCaveFx ? Math.round(lobbyOx + wx * TILE) : toScreenX(wx));
        const sy = (wy: number) => (inCaveFx ? Math.round(lobbyOy + wy * TILE) : toScreenY(wy));
        skillFxRef.current = skillFxRef.current.filter(
          (entry) => skillFxProgress(entry.effect, now) < 1,
        );
        for (const entry of skillFxRef.current) {
          const eff = entry.effect;
          const stage = skillFxStage(eff, now);
          if (stage > entry.stage) {
            entry.stage = stage;
            spawnSkillFx(fxSys, eff, stage);
          }
          const prog = Math.max(0, skillFxProgress(eff, now));
          const cxp = sx(eff.x);
          const cyp = sy(eff.y);
          ctx.save();
          {
            const rise = Math.min(1, prog * 1.5);
            const colW = TILE * 0.55 * (1 - prog * 0.35);
            ctx.globalAlpha = 0.5 * (1 - prog * 0.55);
            ctx.fillStyle = "#ffe9a8";
            ctx.fillRect(cxp - colW / 2, cyp - TILE * 3.4 * rise, colW, TILE * 3.4 * rise);
            ctx.globalAlpha = 0.85 * (1 - prog);
            ctx.strokeStyle = "#ffd23e";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(
              cxp,
              cyp,
              (0.3 + prog * 1.2) * TILE,
              (0.3 + prog * 1.2) * TILE * 0.45,
              0,
              0,
              Math.PI * 2,
            );
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      if (space === "world" || parseInstanceSpace(space)) {
        const sk = swingProgress(swing.startedAt, now);
        if (sk < 1) {
          const inCave = space !== "world";
          const cxp = inCave ? Math.round(lobbyOx + player.x * TILE) : toScreenX(player.x);
          const cyp =
            (inCave ? Math.round(lobbyOy + player.y * TILE) : toScreenY(player.y)) - TILE * 0.45;
          const ang = attackSwingAngle(sk);
          ctx.save();
          ctx.translate(cxp, cyp);
          ctx.scale(swing.face, 1);
          ctx.strokeStyle = `rgba(255,255,255,${(slashAlpha(sk) * 0.85 * (swing.whiff ? WHIFF_ALPHA_SCALE : 1)).toFixed(3)})`;
          ctx.lineWidth = swing.whiff ? 1.5 : 3;
          ctx.beginPath();
          ctx.arc(0, 0, TILE * 0.78, ang - 1.15, ang + 0.35);
          ctx.stroke();
          const img = !swing.whiff && swing.itemId ? itemIcons[swing.itemId] : undefined;
          if (texReady(img)) {
            ctx.rotate(ang);
            ctx.drawImage(img, TILE * 0.3, -TILE * 0.3, TILE * 0.62, TILE * 0.62);
          }
          ctx.restore();
        }
      }

      if (space === "world" && nowMs - lastFountainFxAt > 500) {
        lastFountainFxAt = nowMs;
        for (const [key, ov] of Object.entries(tilesRef.current)) {
          if (ov.block?.itemId !== "fountain") continue;
          const comma = key.indexOf(",");
          const fx0 = Number(key.slice(0, comma));
          const fy0 = Number(key.slice(comma + 1));
          if (Math.abs(fx0 + 0.5 - player.x) > 14 || Math.abs(fy0 + 0.5 - player.y) > 10) continue;
          spawnBurst(fxSys, "splash", fx0 + 0.5, fy0 + 0.4);
        }
      }

      const night = nightAmount(phaseAtTime(nowMs / 1000));
      if (space === "world" && night > 0.01) {
        if (!darkCanvasRef.current) darkCanvasRef.current = document.createElement("canvas");
        const dark = darkCanvasRef.current;
        if (dark.width !== cw || dark.height !== ch) {
          dark.width = cw;
          dark.height = ch;
        }
        const dctx = dark.getContext("2d");
        if (dctx) {
          dctx.setTransform(1, 0, 0, 1, 0, 0);
          dctx.clearRect(0, 0, cw, ch);
          dctx.fillStyle = `rgba(9,13,42,${(night * 0.36).toFixed(3)})`;
          dctx.fillRect(0, 0, cw, ch);
          dctx.globalCompositeOperation = "destination-out";
          const punch = (sx: number, sy: number, rTiles: number) => {
            const r = rTiles * TILE;
            if (sx < -r || sy < -r || sx > cw + r || sy > ch + r) return;
            const g = dctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, r);
            g.addColorStop(0, "rgba(0,0,0,0.95)");
            g.addColorStop(1, "rgba(0,0,0,0)");
            dctx.fillStyle = g;
            dctx.beginPath();
            dctx.arc(sx, sy, r, 0, Math.PI * 2);
            dctx.fill();
          };
          punch(toScreenX(player.x), toScreenY(player.y), lightRadiusTiles(invRef.current?.items));
          for (const [key, ov] of Object.entries(tilesRef.current)) {
            const rTiles = placedLightRadiusTiles(ov.block?.itemId);
            if (!rTiles) continue;
            const comma = key.indexOf(",");
            const lx = Number(key.slice(0, comma));
            const ly = Number(key.slice(comma + 1));
            punch(toScreenX(lx + 0.5), toScreenY(ly + 0.5), rTiles);
          }
          for (const stl of settlementsNear(cam.x, cam.y, 44)) {
            for (const lamp of stl.lamps) {
              punch(toScreenX(lamp.x + 0.5), toScreenY(lamp.y + 0.5), 4.6);
            }
          }
          dctx.globalCompositeOperation = "source-over";
          ctx.drawImage(dark, 0, 0, cw, ch);
          for (const stl of settlementsNear(cam.x, cam.y, 44)) {
            for (const lamp of stl.lamps) {
              const lsx = toScreenX(lamp.x + 0.5);
              const lsy = toScreenY(lamp.y + 0.5);
              const r = TILE * 2.2;
              if (lsx < -r || lsy < -r || lsx > cw + r || lsy > ch + r) continue;
              const g = ctx.createRadialGradient(lsx, lsy, 2, lsx, lsy, r);
              g.addColorStop(0, `rgba(253, 224, 71, ${(night * 0.22).toFixed(3)})`);
              g.addColorStop(1, "rgba(253, 224, 71, 0)");
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(lsx, lsy, r, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else {
          ctx.fillStyle = `rgba(9,13,42,${(night * 0.36).toFixed(3)})`;
          ctx.fillRect(0, 0, cw, ch);
        }
      }

      if (worldFloatTextsRef.current.length > 0) {
        worldFloatTextsRef.current = worldFloatTextsRef.current.filter(
          (f) => now - f.startedAt < 1800,
        );
        for (const ft of worldFloatTextsRef.current) {
          if (ft.space !== space) continue;
          const age = Math.max(0, Math.min(1, (now - ft.startedAt) / 1800));
          const sx = space === "world" ? toScreenX(ft.x) : Math.round(lobbyOx + ft.x * TILE);
          const sy =
            (space === "world" ? toScreenY(ft.y) : Math.round(lobbyOy + ft.y * TILE)) -
            age * TILE * 1.15;
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1 - age * age);
          ctx.font = "800 13px sans-serif";
          ctx.textAlign = "center";
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = "rgba(8,12,20,0.88)";
          ctx.strokeText(ft.text, sx, sy);
          ctx.fillStyle = ft.color;
          ctx.fillText(ft.text, sx, sy);
          ctx.restore();
        }
      }
      if (space === "world") drawParticles(true);

      const base = stickBase(cw, ch);
      ctx.fillStyle = joy.active ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.arc(base.x, base.y, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = joy.active ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.22)";
      ctx.beginPath();
      ctx.arc(
        base.x + joy.dx * 34,
        base.y + joy.dy * 34,
        stickKnobRadius(joy.active),
        0,
        Math.PI * 2,
      );
      ctx.fill();

      if (staminaGaugeVisible(stamina)) {
        const px = space !== "world" ? Math.round(lobbyOx + player.x * TILE) : toScreenX(player.x);
        const py = space !== "world" ? Math.round(lobbyOy + player.y * TILE) : toScreenY(player.y);
        const size = TILE * AVATAR_TILES;
        const gx = px - size * 0.72;
        const gy = py - size * 0.8;
        const gr = 11;
        const frac = stamina.value / STAMINA_MAX;
        ctx.beginPath();
        ctx.arc(gx, gy, gr, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(10,16,10,0.45)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gx, gy, gr - 2.5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.strokeStyle = stamina.exhausted ? "#e5484d" : frac < 0.35 ? "#f5c542" : "#58d158";
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      if (transitionStart >= 0) {
        const overlayAlpha = transitionAlpha(now - transitionStart, transitionKind);
        if (overlayAlpha > 0) {
          ctx.fillStyle = `rgba(${TRANSITION_OVERLAY_RGB},${overlayAlpha.toFixed(3)})`;
          ctx.fillRect(0, 0, cw, ch);
        }
        if (transitionDone(now - transitionStart, transitionKind)) {
          transitionStart = -1;
          transitionKind = "warp";
          transitionSwapped = true;
          transitionPending = null;
        }
      }

      if (showMapRef.current && now - lastMinimapAt > 180) {
        lastMinimapAt = now;
        const mm = minimapRef.current;
        const mctx = mm?.getContext("2d");
        if (mm && mctx) {
          if (space !== "world") {
            const indoorPlayers = [...others.values()].map((o) => ({
              id: o.track.entry.id,
              name: o.track.entry.name || "プレイヤー",
              x: o.track.rx,
              y: o.track.ry,
              space,
            }));
            paintIndoorMapCanvas(
              mctx,
              mm.width,
              mm.height,
              indoorData(),
              player.x,
              player.y,
              indoorPlayers,
              space,
              mapPinsRef.current,
              trackedTargetRef.current,
              false,
            );
          } else {
            const ox = Math.floor(player.x) - MINIMAP_TILES / 2;
            const oy = Math.floor(player.y) - MINIMAP_TILES / 2;
            const toMapX = (wx: number) => (wx - ox) * MINIMAP_SCALE;
            const toMapY = (wy: number) => (wy - oy) * MINIMAP_SCALE;
            paintLocalTerrain(miniTerrainCanvas, ox, oy, MINIMAP_TILES);
            mctx.clearRect(0, 0, mm.width, mm.height);
            mctx.imageSmoothingEnabled = false;
            mctx.drawImage(miniTerrainCanvas, 0, 0, mm.width, mm.height);
            mctx.imageSmoothingEnabled = true;

            for (const stl of settlementsNear(player.x, player.y, 96)) {
              const mx = toMapX(stl.cx);
              const my = toMapY(stl.cy);
              const rPx = Math.max(4, stl.radius * MINIMAP_SCALE * 0.72);
              mctx.fillStyle =
                stl.tier === "city"
                  ? "rgba(56, 189, 248, 0.25)"
                  : stl.tier === "town"
                    ? "rgba(251, 191, 36, 0.22)"
                    : "rgba(167, 139, 250, 0.2)";
              mctx.beginPath();
              mctx.arc(mx, my, rPx, 0, Math.PI * 2);
              mctx.fill();
              mctx.fillStyle = stl.tier === "city" ? "#38bdf8" : "#fbbf24";
              mctx.fillRect(mx - 2, my - 2, 4, 4);
            }

            for (const n of nationsRef.current.nations) {
              const mx = toMapX(n.capital.x);
              const my = toMapY(n.capital.y);
              if (mx < -4 || my < -4 || mx > mm.width + 4 || my > mm.height + 4) continue;
              mctx.fillStyle = n.color;
              mctx.fillRect(mx - 1.5, my - 1.5, 3.5, 3.5);
            }

            for (const pin of mapPinsRef.current) {
              if (pin.space !== "world") continue;
              const px = toMapX(pin.x);
              const py = toMapY(pin.y);
              if (px < -4 || py < -4 || px > mm.width + 4 || py > mm.height + 4) continue;
              mctx.fillStyle = pin.color;
              mctx.strokeStyle = "#ffffff";
              mctx.lineWidth = 1.2;
              mctx.beginPath();
              mctx.arc(px, py, 3, 0, Math.PI * 2);
              mctx.fill();
              mctx.stroke();
            }

            const tr = trackedTargetRef.current;
            for (const o of others.values()) {
              const omx = Math.floor(toMapX(o.track.rx));
              const omy = Math.floor(toMapY(o.track.ry));
              mctx.fillStyle =
                tr?.kind === "player" && tr.presenceId === o.track.entry.id ? "#38bdf8" : "#ffffff";
              mctx.fillRect(omx - 1, omy - 1, 2.5, 2.5);
            }

            if (tr) {
              let tPos: { x: number; y: number } | null = null;
              if (tr.kind === "player") {
                const targetObj = others.get(tr.presenceId);
                if (targetObj) tPos = { x: targetObj.track.rx, y: targetObj.track.ry };
              } else if (tr.space === "world") {
                tPos = { x: tr.x + 0.5, y: tr.y + 0.5 };
              }
              if (tPos) {
                drawCompassOnMinimap(mctx, tPos, "#38bdf8", ox, oy, player.x, player.y);
              }
            }

            mctx.fillStyle = "#ffd23e";
            mctx.strokeStyle = "rgba(0,0,0,0.6)";
            mctx.beginPath();
            mctx.arc(toMapX(player.x), toMapY(player.y), 2.8, 0, Math.PI * 2);
            mctx.fill();
            mctx.stroke();
            if (invRef.current && countItem(invRef.current, "explorer_compass") > 0) {
              if (
                !compassCache ||
                Math.hypot(player.x - compassCache.ax, player.y - compassCache.ay) >= 16
              ) {
                const near = nearestEntrances(MAP_SEED, player.x, player.y);
                compassCache = {
                  ax: player.x,
                  ay: player.y,
                  cave: near.cave,
                  dungeon: near.dungeon,
                };
              }
              drawCompassOnMinimap(
                mctx,
                compassCache.cave,
                COMPASS_CAVE_COLOR,
                ox,
                oy,
                player.x,
                player.y,
              );
              drawCompassOnMinimap(
                mctx,
                compassCache.dungeon,
                COMPASS_DUNGEON_COLOR,
                ox,
                oy,
                player.x,
                player.y,
              );
              updateCompassHud(
                compassCaveArrowRef.current,
                compassCaveDistRef.current,
                compassCache.cave,
                player.x,
                player.y,
              );
              updateCompassHud(
                compassDungeonArrowRef.current,
                compassDungeonDistRef.current,
                compassCache.dungeon,
                player.x,
                player.y,
              );
            }
          }
        }
      }
    };
    transitionKind = "enter";
    transitionSwapped = true;
    transitionPending = null;
    transitionStart = performance.now();
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (onlineSaveTimer !== null) window.clearTimeout(onlineSaveTimer);
      window.clearInterval(heartbeatTimer);
      window.clearInterval(pollTimer);
      if (rtReconnectTimer !== undefined) window.clearTimeout(rtReconnectTimer);
      try {
        rtSocket?.close();
      } catch {
        /* noop */
      }
      rtSocket = null;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearMoveInput);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pagehide", onPageHide);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      saveNow(true);
      leavePresence();
    };
    // ゲートを通過するまでは canvas が無く、ここは空振りする。通過後に起動する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateOk]);

  const btn: React.CSSProperties = {
    minHeight: hud.buttonMinHeight,
    padding: "6px 14px",
    borderRadius: 10,
    cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.06)",
    color: "inherit",
    touchAction: "manipulation",
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
  };

  const panelOverlay: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: "min(600px, calc(100% - 20px))",
    maxHeight: "calc(100% - 20px)",
    overflowY: "auto",
    overscrollBehavior: "contain",
    touchAction: "pan-y",
    padding: 12,
    borderRadius: 12,
    zIndex: 6,
    textAlign: "left",
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(10,12,18,0.93)",
    color: "#f2f2f2",
    boxShadow: "0 12px 36px rgba(0,0,0,0.5)",
  };
  const stickyPanelHead: React.CSSProperties = {
    position: "sticky",
    top: -12,
    zIndex: 3,
    margin: "-12px -12px 0",
    padding: "12px 12px 6px",
    background: "rgba(10,12,18,0.98)",
  };
  const slotBox: React.CSSProperties = {
    ...btn,
    position: "relative",
    boxSizing: "border-box",
    width: "var(--slot, 42px)",
    height: "var(--slot, 42px)",
    minHeight: "var(--slot, 42px)",
    padding: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    background: "rgba(255,255,255,0.08)",
  };
  const compassArrow = (color: string): React.CSSProperties => ({
    width: 9,
    height: 10,
    flexShrink: 0,
    background: color,
    clipPath: "polygon(0 0, 100% 50%, 0 100%)",
  });
  const renderInvSlot = (zone: SlotRef["zone"], index: number, slot: ItemSlot) => {
    const held = heldSlot?.zone === zone && heldSlot?.index === index;
    return (
      <button
        key={`${zone}-${index}`}
        type="button"
        aria-label={slot ? (itemById(slot.id)?.name ?? slot.id) : "空き枠"}
        aria-pressed={held}
        onClick={() => tapSlot(zone, index)}
        style={{
          ...slotBox,
          width: "100%",
          height: 44,
          ...(held
            ? { background: "rgba(255,210,62,0.30)", borderColor: "rgba(255,210,62,0.85)" }
            : {}),
        }}
      >
        <SlotContent
          slot={slot}
          durFrac={slot && invProfile ? toolDurabilityFraction(invProfile, slot.id) : null}
        />
      </button>
    );
  };
  const heldStack: ItemSlot =
    heldSlot && invProfile
      ? ((heldSlot.zone === "hotbar"
          ? invProfile.hotbar[heldSlot.index]
          : invProfile.storage[heldSlot.index]) ?? null)
      : null;
  const renderPanelSlot = (side: ContainerSlotRef["side"], index: number, slot: ItemSlot) => {
    const held = heldPanelSlot?.side === side && heldPanelSlot?.index === index;
    return (
      <button
        key={`${side}-${index}`}
        type="button"
        aria-label={slot ? (itemById(slot.id)?.name ?? slot.id) : "空き枠"}
        aria-pressed={held}
        onClick={() => tapPanelSlot({ side, index })}
        style={{
          ...slotBox,
          width: "100%",
          height: 44,
          ...(held
            ? { background: "rgba(255,210,62,0.30)", borderColor: "rgba(255,210,62,0.85)" }
            : {}),
        }}
      >
        <SlotContent
          slot={slot}
          durFrac={
            slot && invProfile && side !== "container"
              ? toolDurabilityFraction(invProfile, slot.id)
              : null
          }
        />
      </button>
    );
  };
  const heldPanelStack: ItemSlot = heldPanelSlot
    ? heldPanelSlot.side === "container"
      ? (containerSlots?.[heldPanelSlot.index] ?? null)
      : heldPanelSlot.side === "profile_hotbar"
        ? (invProfile?.hotbar[heldPanelSlot.index] ?? null)
        : (invProfile?.storage[heldPanelSlot.index] ?? null)
    : null;
  const containerGridSlots: ItemSlot[] = containerPanel
    ? Array.from(
        { length: containerCapacity(containerPanel.itemId) },
        (_, i) => containerSlots?.[i] ?? null,
      )
    : [];
  const containerEmpty =
    containerPanel !== null && containerSlots !== null && containerSlots.every((s) => s === null);

  type MenuAction = { id: string; label: string; show: boolean; run: () => void };
  const menuActions: MenuAction[] = [
    {
      id: "warp",
      label: spaceUi === "world" ? "中央広場へ行く" : "郊外へ戻る",
      show: true,
      run: () => warpActionRef.current(spaceUi === "world" ? "lobby" : "world"),
    },
    {
      id: "expand_tent",
      label:
        invProfile && invProfile.tentTier < TENT_MAX_TIER
          ? `テント拡張（${TENT_TIERS[invProfile.tentTier + 1].w}×${TENT_TIERS[invProfile.tentTier + 1].h} / ${TENT_TIERS[invProfile.tentTier + 1].price}）`
          : "テント拡張",
      show: spaceUi === "tent" && !!invProfile && invProfile.tentTier < TENT_MAX_TIER,
      run: () => {
        void expandTent();
      },
    },
    {
      id: "event_dungeon",
      label: `${eventsUi.find((e) => e.kind === "limited_dungeon")?.name ?? "期間限定エリア"}へ行く`,
      show: spaceUi === "world" && eventsUi.some((e) => e.kind === "limited_dungeon"),
      run: () => enterEventDungeon(),
    },
    {
      id: "travel",
      label: "国へ移動",
      show: nationsUi.me !== null,
      run: () => {
        void travelToNation();
      },
    },
    {
      id: "map",
      label: showMap ? "マップを隠す" : "マップを出す",
      show: true,
      run: () => setShowMap((v) => !v),
    },
    {
      id: "guild_shop",
      label: guildShopOpen ? "ギルドショップを閉じる" : "ギルドショップ",
      show: spaceUi === "lobby",
      run: () => setGuildShopOpen((v) => !v),
    },
    {
      id: "economy",
      label: showEconomy ? "経済を閉じる" : "経済",
      show: true,
      run: () => setShowEconomy((v) => !v),
    },
    {
      id: "company",
      label: showCompany ? "会社を閉じる" : "会社",
      show: true,
      run: () => {
        setCompanyAnchor(null);
        setShowCompany((v) => !v);
      },
    },
    {
      id: "market",
      label: marketOpen ? "商品取引所を閉じる" : "商品取引所",
      show: true,
      run: () => setMarketOpen((v) => !v),
    },
    {
      id: "finance",
      label: financeOpen ? "FX・予測・LPを閉じる" : "FX・予測・LP",
      show: true,
      run: () => setFinanceOpen((v) => !v),
    },
    {
      id: "jobs",
      label: jobOpen ? "仕事を閉じる" : "仕事・キャリア",
      show: true,
      run: () => setJobOpen((v) => !v),
    },
    {
      id: "trade",
      label: tradeOpen ? "P2P取引・契約を閉じる" : "P2P取引・契約",
      show: true,
      run: () => {
        setTradeTarget(null);
        setTradeOpen((v) => !v);
      },
    },
    {
      id: "realestate",
      label: realEstateOpen ? "不動産・マンションを閉じる" : "不動産・マンション",
      show: true,
      run: () => setRealEstateOpen((v) => !v),
    },
    {
      id: "governance",
      label: governanceOpen ? "市政庁・裁判所を閉じる" : "市政庁・裁判所",
      show: true,
      run: () => setGovernanceOpen((v) => !v),
    },
    {
      id: "engineering",
      label: engineeringOpen ? "機械制作ラボを閉じる" : "機械制作・図鑑",
      show: true,
      run: () => setEngineeringOpen((v) => !v),
    },
    {
      id: "prison",
      label: prisonOpen ? "警察・刑務所を閉じる" : "警察・刑務所",
      show: true,
      run: () => setPrisonOpen((v) => !v),
    },
    {
      id: "metro",
      label: metroOpen ? "METRO OSを閉じる" : "METRO OS (SNS・車両)",
      show: true,
      run: () => setMetroOpen((v) => !v),
    },
    {
      id: "mapview",
      label: mapView ? "マップを閉じる" : "マップを見る",
      show: true,
      run: () => setMapView((v) => !v),
    },
    { id: "close", label: "閉じる", show: true, run: () => {} },
  ];

  if (!gateOk) {
    return (
      <div
        className="wb-shell"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          padding: 20,
          boxSizing: "border-box",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 28, margin: 0 }}>TAKASUMI WORLD BOX</h1>
        {gate === "checking" || (gate === "ok" && !booted) ? (
          <p role="status" style={{ margin: 0 }}>
            読み込み中…
          </p>
        ) : (
          <>
            <p role="status" style={{ margin: 0 }}>
              ログインが必要
            </p>
            {embedded ? (
              <button
                type="button"
                onClick={() => {
                  retryIdentity?.();
                  setGateTry((t) => t + 1);
                }}
                style={{
                  ...btn,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                再試行
              </button>
            ) : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                <a
                  href="/api/auth/discord/authorize?next=/games/worldbox"
                  style={{
                    ...btn,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  Discordでログイン
                </a>
                <button
                  type="button"
                  disabled={guestBusy}
                  onClick={async () => {
                    if (guestBusy) return;
                    setGuestBusy(true);
                    try {
                      const res = await fetch("/api/auth/guest", {
                        method: "POST",
                        headers: { Accept: "application/json" },
                      });
                      if (res.ok) setGateTry((t) => t + 1);
                    } catch {
                      // 失敗時はその場に留まる（もう一度押せる）
                    } finally {
                      setGuestBusy(false);
                    }
                  }}
                  style={{
                    ...btn,
                    display: "inline-flex",
                    alignItems: "center",
                    background: "rgba(255,255,255,0.02)",
                    color: "#c8d2dc",
                  }}
                >
                  ゲストで入る
                </button>
              </div>
            )}
            <Link href={`${prefix}/games`} style={{ color: "#9fd8e8", fontSize: 13 }}>
              ゲーム一覧へ
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className="wb-shell"
      onContextMenu={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        const t = e.target as HTMLElement | null;
        if (!t || typeof t.closest !== "function") return;
        if (!t.closest("button")) return;
        if (t.closest("[data-wb-se='self']")) return;
        playWbSe("click");
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        MozUserSelect: "none",
        msUserSelect: "none",
        userSelect: "none",
      }}
    >
      <div
        ref={stageRef}
        style={{
          position: "relative",
          touchAction: "none",
          width: "100%",
          flex: "1 1 auto",
          minHeight: 0,
          ...(isFullscreen ? { height: "100%", background: "#0b0e14" } : {}),
        }}
      >
        <canvas
          ref={canvasRef}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="TAKASUMI WORLD BOX の見下ろしマップ。スティックか WASD で歩けます"
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        />
        <div
          role="status"
          style={{
            position: "absolute",
            top: "calc(10px + env(safe-area-inset-top, 0px))",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "4px 12px",
            borderRadius: 10,
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 4,
            maxWidth: "calc(100% - 176px)",
            boxSizing: "border-box",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {statusText}
          {othersCount > 0 ? ` ・ いま ${othersCount} 人が歩いている` : ""}
          {spaceUi === "lobby" ? ` ・ ${lobbyDistrictAt(coords.x, coords.y)}` : ""}
          {spaceUi === "prison" ? ` ・ ${prisonDistrictAt(coords.x, coords.y)}` : ""}
          {spaceUi === "world"
            ? (() => {
                const nearStl = nearestSettlement(coords.x, coords.y, 26);
                return nearStl ? ` ・ ${nearStl.name} (${nearStl.population}人)` : "";
              })()
            : ""}
          {` ・ 座標 X ${coords.x} / Y ${coords.y}`}
        </div>
        {mmoFeedText && (
          <button
            type="button"
            className="wb-mmo-ticker"
            onClick={() => setMetroOpen(true)}
            title="クリックしてデイリー任務・経済速報を開く"
          >
            <span
              className={`wb-mmo-ticker-tag ${
                mmoFeedKind === "prison" || mmoFeedKind === "crime" ? "is-alert" : ""
              }`}
            >
              {mmoFeedKind === "prison" || mmoFeedKind === "crime" ? "ALERT" : "LIVE"}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{mmoFeedText}</span>
          </button>
        )}
        {mmoSummary?.prison.jailed && (
          <div
            className="wb-mmo-prison-banner"
            style={{
              top: trackedTarget
                ? "calc(78px + env(safe-area-inset-top, 0px))"
                : "calc(42px + env(safe-area-inset-top, 0px))",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <WbIcon name="lock" size={13} color="#fca5a5" /> 収監中 ({mmoSummary.prison.cellId})
              ・ 残刑期 {Math.max(0, Math.ceil(mmoSummary.prison.remainingMs / 1000))}秒
            </span>
            <button
              type="button"
              className="wb-mmo-btn wb-mmo-btn-amber"
              style={{ padding: "2px 8px", fontSize: 11 }}
              onClick={() => setPrisonOpen(true)}
            >
              刑務作業 / 保釈 / 脱獄
            </button>
          </div>
        )}
        {trackedTarget && (
          <div className="wb-mmo-waypoint" role="status">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <WbIcon
                name={trackedTarget.kind === "player" ? "target" : "compass"}
                size={13}
                color="#38bdf8"
              />
              {trackedTarget.kind === "player" ? "追跡中:" : "目的地:"} {trackedTarget.label}
            </span>
            <span
              ref={trackedDistElRef}
              style={{ fontVariantNumeric: "tabular-nums", color: "#38bdf8", fontWeight: 800 }}
            >
              --m
            </span>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>
              (
              {trackedTarget.kind === "player"
                ? "リアルタイム"
                : trackedTarget.space === "world"
                  ? "ワールド"
                  : trackedTarget.space === "prison"
                    ? "刑務所"
                    : trackedTarget.space === "lobby2"
                      ? "ロビー2F"
                      : trackedTarget.space === "lobby3"
                        ? "ロビー3F"
                        : "ロビー"}
              )
            </span>
            <button
              type="button"
              className="wb-mmo-waypoint-btn"
              onClick={() => setMapView(true)}
              style={{ borderColor: "rgba(56,189,248,0.45)", color: "#e0f2fe" }}
            >
              地図
            </button>
            <button
              type="button"
              className="wb-mmo-waypoint-btn"
              onClick={() => setTrackedTarget(null)}
            >
              案内終了
            </button>
          </div>
        )}
        <button
          type="button"
          aria-label="メニュー"
          aria-expanded={menuOpen}
          data-wb-se="self"
          onClick={() => {
            playWbSe(menuOpen ? "close" : "open");
            setMenuOpen((v) => !v);
          }}
          style={{
            ...btn,
            position: "absolute",
            left: "calc(10px + env(safe-area-inset-left, 0px))",
            top: "calc(10px + env(safe-area-inset-top, 0px))",
            minHeight: hud.buttonMinHeight,
            minWidth: 44,
            zIndex: 7,
            padding: "4px 10px",
            fontSize: 18,
            lineHeight: 1,
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
          }}
        >
          ≡
        </button>
        {canFullscreen && (
          <button
            type="button"
            aria-label={isFullscreen ? "全画面を終わる" : "全画面にする"}
            aria-pressed={isFullscreen}
            onClick={toggleFullscreen}
            style={{
              ...btn,
              position: "absolute",
              right: "calc(10px + env(safe-area-inset-right, 0px))",
              top: "calc(10px + env(safe-area-inset-top, 0px))",
              minHeight: hud.buttonMinHeight,
              zIndex: 5,
              padding: "4px 12px",
              fontSize: 12,
              lineHeight: 1,
              background: "rgba(0,0,0,0.55)",
              color: "#fff",
            }}
          >
            {isFullscreen ? "戻す" : "全画面"}
          </button>
        )}
        {menuOpen && (
          <div
            data-wb-se="self"
            style={{
              position: "absolute",
              left: "calc(10px + env(safe-area-inset-left, 0px))",
              top: "calc(58px + env(safe-area-inset-top, 0px))",
              display: "grid",
              gap: 6,
              padding: 8,
              borderRadius: 10,
              background: "rgba(0,0,0,0.72)",
              color: "#fff",
              zIndex: 8,
              maxHeight: "calc(100% - 68px)",
              maxWidth: "calc(100% - 20px)",
              boxSizing: "border-box",
              overflowY: "auto",
              overscrollBehavior: "contain",
              touchAction: "pan-y",
            }}
          >
            {menuActions
              .filter((a) => a.show)
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  style={{ ...btn, background: "rgba(255,255,255,0.10)", color: "#fff" }}
                  onClick={() => {
                    playWbSe("click");
                    a.run();
                    setMenuOpen(false);
                  }}
                >
                  {a.label}
                </button>
              ))}
            <button
              type="button"
              style={{ ...btn, background: "rgba(255,255,255,0.10)", color: "#fff" }}
              aria-expanded={settingsOpen}
              onClick={() => {
                playWbSe("click");
                setSettingsOpen((v) => !v);
              }}
            >
              設定
            </button>
            {settingsOpen && (
              <div style={{ display: "grid", gap: 6, paddingLeft: 14 }}>
                <button
                  type="button"
                  style={{ ...btn, background: "rgba(255,255,255,0.10)", color: "#fff" }}
                  onClick={() => toggleSound("bgm")}
                >
                  {soundSettings.bgm ? "BGMを切る" : "BGMを入れる"}
                </button>
                <button
                  type="button"
                  style={{ ...btn, background: "rgba(255,255,255,0.10)", color: "#fff" }}
                  onClick={() => toggleSound("se")}
                >
                  {soundSettings.se ? "効果音を切る" : "効果音を入れる"}
                </button>
                <button
                  type="button"
                  style={{ ...btn, background: "rgba(255,255,255,0.10)", color: "#fff" }}
                  onClick={() => {
                    playWbSe("click");
                    setReportOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  通報する
                </button>
              </div>
            )}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.18)", paddingTop: 6 }}>
              <div style={{ fontSize: 12, display: "flex", gap: 6 }}>
                <span style={{ flex: 1 }}>{SEASON_NAMES[seasonOf(Date.now())]}</span>
                <span style={{ opacity: 0.75 }}>あと{seasonDaysLeft(Date.now())}日</span>
              </div>
            </div>
            {eventsUi.length > 0 && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.18)", paddingTop: 6 }}>
                {eventsUi.map((e) => (
                  <div key={e.id} style={{ fontSize: 12, display: "flex", gap: 6 }}>
                    <span style={{ flex: 1 }}>{e.name}</span>
                    <span style={{ opacity: 0.75 }}>あと{e.daysLeft}日</span>
                  </div>
                ))}
              </div>
            )}
            {invProfile && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.18)", paddingTop: 6 }}>
                <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>コレクション</div>
                <ItemSlotGrid>
                  {[
                    "ancient_relic",
                    "star_map",
                    "ancient_coin",
                    "dragon_scale",
                    "ghost_tear",
                    "golden_key",
                  ].map((id) => {
                    const count = invProfile.items[id] ?? 0;
                    return (
                      <span
                        key={id}
                        style={{ opacity: count > 0 ? 1 : 0.38, display: "inline-flex" }}
                      >
                        <ItemSlotView
                          itemId={id}
                          count={count}
                          selected={collectionSel === id}
                          onClick={() => setCollectionSel(id)}
                        />
                      </span>
                    );
                  })}
                </ItemSlotGrid>
                {collectionSel && (
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    {itemById(collectionSel)?.name ?? collectionSel} ×
                    {invProfile.items[collectionSel] ?? 0}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {spaceUi !== "world" && stationUi && (
          <div
            key={stationUi}
            style={{
              position: "absolute",
              left: "50%",
              bottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
              transform: "translateX(-50%)",
              display: "flex",
              gap: 8,
              alignItems: "center",
              padding: "6px 8px 6px 14px",
              borderRadius: 10,
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              fontSize: 13,
              whiteSpace: "nowrap",
              animation: "wb-chip-pop 240ms ease-out",
            }}
          >
            <span>
              {stationUi === "shop" && stationGenre
                ? (genreById(stationGenre)?.name ?? STATION_LABEL[stationUi])
                : stationUi === "arcade" && stationArcade
                  ? (getWebGame(stationArcade)?.title ?? STATION_LABEL[stationUi])
                  : STATION_LABEL[stationUi]}
            </span>
            {stationUi === "board" && (
              <button
                type="button"
                style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                onClick={() => setBoardOpen((v) => !v)}
              >
                {boardOpen ? "閉じる" : "開く"}
              </button>
            )}
            {stationUi === "casino" && (
              <>
                <button
                  type="button"
                  style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                  onClick={() => setCasinoOpen((v) => !v)}
                >
                  {casinoOpen ? "閉じる" : "遊ぶ"}
                </button>
                <button
                  type="button"
                  style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                  onClick={() => setFinanceOpen((v) => !v)}
                >
                  {financeOpen ? "LP閉じる" : "胴元LP・予測"}
                </button>
              </>
            )}
            {stationUi === "arcade" && (
              <button
                type="button"
                style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                onClick={() => setArcadeOpen((v) => !v)}
              >
                {arcadeOpen ? "閉じる" : "遊ぶ"}
              </button>
            )}
            {stationUi === "guild" && (
              <button
                type="button"
                style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                onClick={() => setGuildBoardOpen((v) => !v)}
              >
                {guildBoardOpen ? "閉じる" : "開く"}
              </button>
            )}
            {(stationUi === "shop" ||
              stationUi === "bank" ||
              stationUi === "smith" ||
              stationUi === "sell") && (
              <button
                type="button"
                style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                onClick={() => setShowEconomy(true)}
              >
                開く
              </button>
            )}
            {stationUi === "shop" && stationGenre === "food" && (
              <button
                type="button"
                style={{
                  ...btn,
                  minHeight: hud.buttonMinHeight,
                  padding: "2px 10px",
                  background: "#d97706",
                  borderColor: "#fbbf24",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
                onClick={() => setJobOpen(true)}
              >
                <WbIcon name="cafe" size={13} color="#fef3c7" /> カフェ運営
              </button>
            )}
            {stationUi === "bank" && (
              <>
                <button
                  type="button"
                  style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                  onClick={() => setFinanceOpen((v) => !v)}
                >
                  {financeOpen ? "閉じる" : "FX・予測・LP"}
                </button>
                <button
                  type="button"
                  style={{
                    ...btn,
                    minHeight: hud.buttonMinHeight,
                    padding: "2px 10px",
                    background: "#991b1b",
                    borderColor: "#f87171",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                  onClick={() => setPrisonOpen(true)}
                >
                  <WbIcon name="keyhole" size={13} color="#fecaca" /> 金庫/工作
                </button>
              </>
            )}
            {stationUi === "sell" && (
              <button
                type="button"
                style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                onClick={() => setMarketOpen((v) => !v)}
              >
                {marketOpen ? "閉じる" : "商品取引所"}
              </button>
            )}
            {stationUi === "telescope" && (
              <button
                type="button"
                style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                onClick={() => setTelescopeOpen((v) => !v)}
              >
                {telescopeOpen ? "閉じる" : "覗く"}
              </button>
            )}
            {stationUi === "piano" && (
              <button
                type="button"
                style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                onClick={() => setPianoOpen((v) => !v)}
              >
                {pianoOpen ? "閉じる" : "弾く"}
              </button>
            )}
            {stationUi === "race" && (
              <>
                <button
                  type="button"
                  style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                  onClick={() => setRacingOpen((v) => !v)}
                >
                  {racingOpen ? "閉じる" : "馬券"}
                </button>
                <button
                  type="button"
                  style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                  onClick={() => setFinanceOpen((v) => !v)}
                >
                  {financeOpen ? "LP閉じる" : "胴元LP"}
                </button>
              </>
            )}
            {stationUi === "stock" && (
              <>
                <button
                  type="button"
                  style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                  onClick={() => setStockOpen((v) => !v)}
                >
                  {stockOpen ? "閉じる" : "株式"}
                </button>
                <button
                  type="button"
                  style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                  onClick={() => setMarketOpen((v) => !v)}
                >
                  {marketOpen ? "板閉じる" : "商品板"}
                </button>
                <button
                  type="button"
                  style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                  onClick={() => setFinanceOpen((v) => !v)}
                >
                  {financeOpen ? "FX閉じる" : "FX・予測"}
                </button>
              </>
            )}
            {stationUi === "fountain" && (
              <button
                type="button"
                style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                onClick={() => void plazaAction("fountain")}
              >
                小銭を投げる（10円）
              </button>
            )}
            {stationUi === "rest" && (
              <button
                type="button"
                style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                onClick={() => void plazaAction("rest")}
              >
                休む
              </button>
            )}
            {stationUi === "smith" && (
              <button
                type="button"
                style={{
                  ...btn,
                  minHeight: hud.buttonMinHeight,
                  padding: "2px 10px",
                  background: "#0891b2",
                  borderColor: "#22d3ee",
                }}
                onClick={() => setEngineeringOpen((v) => !v)}
              >
                {engineeringOpen ? "ラボ閉じる" : "機械制作ラボ"}
              </button>
            )}
            {(stationUi === "prison_work" ||
              stationUi === "prison_desk" ||
              stationUi === "prison_escape" ||
              stationUi === "prison_visit") && (
              <button
                type="button"
                style={{
                  ...btn,
                  minHeight: hud.buttonMinHeight,
                  padding: "2px 10px",
                  background: stationUi === "prison_escape" ? "#dc2626" : "#0891b2",
                  borderColor: stationUi === "prison_escape" ? "#f87171" : "#22d3ee",
                }}
                onClick={() => setPrisonOpen(true)}
              >
                {stationUi === "prison_work"
                  ? "懲役作業を実行"
                  : stationUi === "prison_escape"
                    ? "脱獄ルートを開く"
                    : stationUi === "prison_visit"
                      ? "面会・差し入れ"
                      : "保釈・刑務所端末"}
              </button>
            )}
            {plazaMsg && <span role="status">{plazaMsg}</span>}
          </div>
        )}
        {showMap && (
          <div
            style={{
              position: "absolute",
              right: "calc(10px + env(safe-area-inset-right, 0px))",
              top: "calc(10px + env(safe-area-inset-top, 0px))",
              width: hud.minimapPx,
              height: hud.minimapPx,
              zIndex: 6,
            }}
          >
            <canvas
              ref={minimapRef}
              width={MINIMAP_PX}
              height={MINIMAP_PX}
              aria-label="周辺マップ"
              onClick={() => {
                playWbSe("open");
                setMapView((v) => !v);
              }}
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.38)",
                background: "rgba(9,13,22,0.45)",
                cursor: "pointer",
                pointerEvents: "auto",
                display: "block",
              }}
            />
            <span
              aria-hidden
              style={{
                position: "absolute",
                right: 4,
                bottom: 4,
                padding: "1px 5px",
                borderRadius: 5,
                background: "rgba(10, 14, 24, 0.85)",
                border: "1px solid rgba(56, 189, 248, 0.45)",
                color: "#e2e8f0",
                fontSize: 9.5,
                fontWeight: 800,
                pointerEvents: "none",
              }}
            >
              M
            </span>
          </div>
        )}
        {showMap && spaceUi === "world" && hasCompass && (
          <div
            aria-label="開拓のコンパス"
            style={{
              position: "absolute",
              right: "calc(10px + env(safe-area-inset-right, 0px))",
              top: `calc(${hud.minimapPx + 16}px + env(safe-area-inset-top, 0px))`,
              width: hud.minimapPx,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              gap: 3,
              padding: "5px 8px",
              borderRadius: 10,
              background: "rgba(0,0,0,0.6)",
              border: "1px solid rgba(255,255,255,0.25)",
              pointerEvents: "none",
              zIndex: 4,
              color: "#fff",
              fontSize: 11,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span ref={compassCaveArrowRef} style={compassArrow(COMPASS_CAVE_COLOR)} />
              <span>採掘場</span>
              <span ref={compassCaveDistRef} style={{ marginLeft: "auto" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span ref={compassDungeonArrowRef} style={compassArrow(COMPASS_DUNGEON_COLOR)} />
              <span>廃ビル</span>
              <span ref={compassDungeonDistRef} style={{ marginLeft: "auto" }} />
            </div>
          </div>
        )}
        {invProfile && (
          <div
            aria-label="空腹度"
            style={{
              position: "absolute",
              left: "calc(10px + env(safe-area-inset-left, 0px))",
              top: "calc(52px + env(safe-area-inset-top, 0px))",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "6px 8px",
              borderRadius: 10,
              background: "rgba(0,0,0,0.6)",
              zIndex: 4,
              pointerEvents: "none",
              minWidth: 132,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#ffd23e", fontSize: 11, width: 28 }}>空腹</span>
              <span
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.18)",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    display: "block",
                    width: `${Math.max(0, Math.min(100, (invProfile.hunger / HUNGER_MAX) * 100))}%`,
                    height: "100%",
                    background: invProfile.hunger <= 20 ? "#ff7a59" : "#ffd23e",
                  }}
                />
              </span>
              <strong style={{ color: "#fff", fontSize: 11 }}>
                {Math.floor(invProfile.hunger)}
              </strong>
            </div>
            {invProfile.status
              .filter((e) => (e.kind === "warm" || e.kind === "alert") && e.until > gaugeNow)
              .map((e) => (
                <span
                  key={e.kind}
                  style={{ color: e.kind === "warm" ? "#ffb37a" : "#9adfff", fontSize: 11 }}
                >
                  {e.kind === "warm" ? "温かい食事" : "自然回復"} あと
                  {Math.max(1, Math.ceil((e.until - gaugeNow) / 60000))}分
                </span>
              ))}
            {invProfile.role !== "free" &&
              (() => {
                const role = roleById(invProfile.role);
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      aria-label={role.name}
                      style={{
                        position: "relative",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,0.4)",
                        background: "rgba(255,255,255,0.1)",
                      }}
                    >
                      <span style={{ position: "relative" }}>{role.symbol}</span>
                    </span>
                    <span style={{ color: "#fff", fontSize: 11, letterSpacing: 2 }}>
                      {"●".repeat(masteryRankOf(invProfile, invProfile.role))}
                      <span style={{ opacity: 0.3 }}>
                        {"●".repeat(5 - masteryRankOf(invProfile, invProfile.role))}
                      </span>
                    </span>
                  </div>
                );
              })()}
          </div>
        )}
        {invProfile &&
          gaugeSkill &&
          (() => {
            const role = roleById(invProfile.role);
            const total = SKILLS[gaugeSkill.id].cooldownMs;
            const left = skillCooldownLeft(invProfile, gaugeSkill.id, gaugeNow);
            const charged = total > 0 ? Math.max(0, Math.min(1, 1 - left / total)) : 1;
            const ready = left <= 0;
            return (
              <div
                aria-label={ready ? "技が使える" : "技チャージ中"}
                style={{
                  position: "absolute",
                  left: "calc(10px + env(safe-area-inset-left, 0px))",
                  top: "calc(168px + env(safe-area-inset-top, 0px))",
                  width: 54,
                  height: 54,
                  zIndex: 4,
                  pointerEvents: "none",
                }}
              >
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    background: `conic-gradient(#ffd23e ${charged * 360}deg, rgba(255,255,255,0.16) ${charged * 360}deg)`,
                    boxShadow: ready ? "0 0 14px rgba(255,210,62,0.85)" : "0 0 4px rgba(0,0,0,0.5)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 5,
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.74)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: ready ? "#ffd23e" : "#ffffff",
                    fontSize: 17,
                    fontWeight: 700,
                  }}
                >
                  {role.symbol}
                </div>
              </div>
            );
          })()}
        {spaceUi === "world" && invProfile && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
              transform: "translateX(-50%)",
              display: "flex",
              gap: 4,
              alignItems: "stretch",
              padding: 4,
              borderRadius: 10,
              background: "rgba(0,0,0,0.6)",
              zIndex: 4,
              maxWidth: "calc(100% - 16px)",
              boxSizing: "border-box",
              ...({ "--slot": hud.hotbarSlotCss } as React.CSSProperties),
            }}
          >
            {invProfile.hotbar.map((slot, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={selSlot === i}
                aria-label={slot ? (itemById(slot.id)?.name ?? slot.id) : "空き枠"}
                onClick={() => tapHotbar(i)}
                style={{
                  ...slotBox,
                  ...(selSlot === i
                    ? { background: "rgba(255,210,62,0.30)", borderColor: "rgba(255,210,62,0.85)" }
                    : {}),
                }}
              >
                <SlotContent
                  slot={slot}
                  durFrac={slot ? toolDurabilityFraction(invProfile, slot.id) : null}
                />
              </button>
            ))}
            <button
              type="button"
              style={{
                ...btn,
                boxSizing: "border-box",
                flexShrink: 0,
                whiteSpace: "nowrap",
                height: "var(--slot, 42px)",
                minHeight: "var(--slot, 42px)",
                padding: "2px 8px",
                fontSize: 11,
                color: "#fff",
                background: "rgba(255,255,255,0.08)",
              }}
              onClick={() => setStorageOpen((v) => !v)}
              aria-expanded={storageOpen}
            >
              インベントリ
            </button>
          </div>
        )}
        {partyUi.invite && (
          <div
            style={{
              position: "absolute",
              top: "calc(64px + env(safe-area-inset-top, 0px))",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 10,
              background: "rgba(10,12,24,0.88)",
              color: "#fff",
              fontSize: 13,
              zIndex: 5,
            }}
          >
            <span>{partyUi.invite.leaderName} のパーティ</span>
            <button
              type="button"
              style={btn}
              onClick={() => {
                void postParty("accept", { partyId: partyUi.invite?.partyId });
              }}
            >
              参加
            </button>
            <button
              type="button"
              style={btn}
              onClick={() => {
                void postParty("decline", { partyId: partyUi.invite?.partyId });
              }}
            >
              断る
            </button>
          </div>
        )}
        {spaceUi === "world" && nearDungeonEntrance && (
          <div
            style={{
              position: "absolute",
              right: "calc(10px + env(safe-area-inset-right, 0px))",
              bottom: `calc(${hud.partyCardBottomPx}px + env(safe-area-inset-bottom, 0px))`,
              width: 168,
              padding: "8px 10px",
              borderRadius: 10,
              background: "rgba(10,12,24,0.88)",
              color: "#fff",
              fontSize: 12,
              zIndex: 5,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {partyUi.party ? (
              <>
                {partyUi.party.members.map((m, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span aria-hidden style={{ fontSize: 14 }}>
                      {roleById(m.role).symbol}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.name}
                    </span>
                    <span aria-hidden style={{ color: "#f2c53c", fontSize: 9, letterSpacing: 1 }}>
                      {"●".repeat(m.rank)}
                    </span>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    style={{ ...btn, flex: 1 }}
                    onClick={() => {
                      if (partyUi.party)
                        enterDungeonRef.current?.(
                          partyUi.party.entrance.x,
                          partyUi.party.entrance.y,
                        );
                    }}
                  >
                    入場
                  </button>
                  <button
                    type="button"
                    style={btn}
                    onClick={() => {
                      void postParty("leave");
                    }}
                  >
                    {partyUi.isLeader ? "解散" : "離脱"}
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                style={btn}
                onClick={() => {
                  void postParty("create");
                }}
              >
                パーティ編成
              </button>
            )}
          </div>
        )}
        {parseInstanceSpace(spaceUi)?.kind === "dungeon" && partyUi.party && (
          <div
            style={{
              position: "absolute",
              top: "calc(64px + env(safe-area-inset-top, 0px))",
              right: "calc(10px + env(safe-area-inset-right, 0px))",
              display: "flex",
              gap: 4,
              padding: "4px 6px",
              borderRadius: 8,
              background: "rgba(10,12,24,0.7)",
              zIndex: 5,
            }}
          >
            {partyUi.party.members.map((m, i) => (
              <span key={i} title={m.name} aria-hidden style={{ fontSize: 15, color: "#fff" }}>
                {roleById(m.role).symbol}
              </span>
            ))}
          </div>
        )}
        {playerCard && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: `calc(${hud.playerCardBottomPx}px + env(safe-area-inset-bottom, 0px))`,
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 10,
              background: "rgba(10,12,24,0.9)",
              color: "#fff",
              fontSize: 13,
              zIndex: 5,
              maxWidth: "calc(100% - 16px)",
              boxSizing: "border-box",
            }}
          >
            <span aria-hidden style={{ color: "#ffd75e", fontSize: 15 }}>
              {roleById(playerCard.role).symbol}
            </span>
            <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {playerCard.name}
            </strong>
            <span aria-hidden style={{ color: "#f2c53c", fontSize: 9, letterSpacing: 1 }}>
              {"●".repeat(playerCard.rank)}
            </span>
            <span style={{ fontSize: 12, opacity: 0.8 }}>{roleById(playerCard.role).name}</span>
            {partyUi.isLeader && partyUi.party && (
              <button
                type="button"
                style={btn}
                onClick={() => {
                  void postParty("invite", { targetId: playerCard.id }).then((r) => {
                    setTileMsg(r.ok ? "招待した" : "招待できない");
                  });
                  setPlayerCard(null);
                }}
              >
                招待
              </button>
            )}
            <button
              type="button"
              style={{ ...btn, background: "#0369a1", borderColor: "#38bdf8" }}
              onClick={() => {
                setTrackedTarget({
                  kind: "player",
                  presenceId: playerCard.id,
                  label: playerCard.name,
                  color: "#38bdf8",
                });
                pushFloatText(
                  playerPosRef.current.x,
                  playerPosRef.current.y - 0.8,
                  `追跡: ${playerCard.name}`,
                  "#38bdf8",
                );
                setPlayerCard(null);
              }}
            >
              追跡
            </button>
            <button
              type="button"
              style={{ ...btn, background: "#0284c7", borderColor: "#38bdf8" }}
              onClick={() => {
                setTradeTarget({ presenceId: playerCard.id, name: playerCard.name });
                setTradeOpen(true);
                setPlayerCard(null);
              }}
            >
              取引
            </button>
            <button
              type="button"
              style={{ ...btn, background: "#0891b2", borderColor: "#22d3ee" }}
              onClick={() => {
                void fetch("/api/worldbox/prison", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "arrest_player",
                    targetPresenceId: playerCard.id,
                  }),
                }).then(async (res) => {
                  const d = (await res.json().catch(() => ({}))) as {
                    error?: string;
                    reward?: number;
                    arrestedName?: string;
                  };
                  if (res.ok) {
                    setTileMsg(`逮捕成功！懸賞金 +¥${Number(d.reward ?? 0).toLocaleString()}`);
                    void refreshMmoRef.current?.();
                  } else {
                    setTileMsg(
                      d.error === "not_wanted"
                        ? "指名手配中の相手ではありません"
                        : d.error === "target_too_far"
                          ? "もう少し近づいてから逮捕してください"
                          : "逮捕できませんでした",
                    );
                  }
                });
                setPlayerCard(null);
              }}
            >
              逮捕
            </button>
            <button
              type="button"
              style={{ ...btn, background: "#991b1b", borderColor: "#f87171" }}
              onClick={() => {
                void fetch("/api/worldbox/prison", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "commit_crime",
                    crimeId: "pickpocket",
                    targetPresenceId: playerCard.id,
                  }),
                }).then(async (res) => {
                  const d = (await res.json().catch(() => ({}))) as {
                    success?: boolean;
                    reward?: number;
                    forceMove?: { space: string; x: number; y: number };
                  };
                  if (res.ok) {
                    if (d.success) {
                      setTileMsg(`スリ成功！ +¥${Number(d.reward ?? 0).toLocaleString()}`);
                    } else {
                      setTileMsg("スリに失敗し逮捕されました！");
                      if (d.forceMove) forceMoveRef.current?.(d.forceMove);
                    }
                    void refreshMmoRef.current?.();
                  } else {
                    setTileMsg("現在は実行できません（クールタイム等）");
                  }
                });
                setPlayerCard(null);
              }}
            >
              スリ
            </button>
            <button type="button" style={btn} onClick={() => setPlayerCard(null)}>
              閉じる
            </button>
          </div>
        )}
        <div
          style={{
            position: "absolute",
            zIndex: 5,
            flexDirection: "column",
            gap: 4,
            display: hud.chatOnRight && nearDungeonEntrance ? "none" : "flex",
            ...(hud.chatOnRight
              ? {
                  right: "calc(10px + env(safe-area-inset-right, 0px))",
                  bottom: `calc(${hud.chatBottomPx}px + env(safe-area-inset-bottom, 0px))`,
                  width: hud.chatWidthCss,
                }
              : {
                  left: "calc(10px + env(safe-area-inset-left, 0px))",
                  bottom: `calc(${hud.chatBottomPx}px + env(safe-area-inset-bottom, 0px))`,
                  width: hud.chatWidthCss,
                }),
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              maxHeight: hud.chatMessagesPx,
              overflow: "hidden",
              justifyContent: "flex-end",
            }}
          >
            {[...chatMsgs]
              .slice(0, 6)
              .reverse()
              .map((m, i) => (
                <div
                  key={`${m.at}-${i}`}
                  style={{
                    alignSelf: "flex-start",
                    maxWidth: "100%",
                    padding: "2px 8px",
                    borderRadius: 8,
                    background: "rgba(8,10,16,0.55)",
                    color: "#fff",
                    fontSize: 12,
                    lineHeight: 1.35,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  <strong style={{ marginRight: 5 }}>{m.name}</strong>
                  {m.source === "discord" && (
                    <span
                      style={{
                        marginRight: 5,
                        fontSize: 9,
                        padding: "0 4px",
                        borderRadius: 5,
                        border: "1px solid rgba(255,255,255,0.4)",
                      }}
                    >
                      Discord
                    </span>
                  )}
                  {m.text}
                </div>
              ))}
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {(
              [
                ["proximity", "近"],
                ["global", "全"],
                ["union", "ユ"],
              ] as const
            ).map(([ch, label]) => (
              <button
                key={ch}
                type="button"
                aria-pressed={chatChannel === ch}
                onClick={() => setChatChannel(ch)}
                style={{
                  ...btn,
                  minHeight: hud.chatOnRight ? 36 : 30,
                  padding: "2px 8px",
                  fontSize: 12,
                  ...(chatChannel === ch
                    ? { background: "rgba(255,215,94,0.25)", borderColor: "#ffd75e" }
                    : {}),
                }}
              >
                {label}
              </button>
            ))}
            <input
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void sendChat();
                }
                e.stopPropagation();
              }}
              maxLength={120}
              placeholder="チャット"
              style={{
                flex: 1,
                minWidth: 0,
                padding: "6px 8px",
                borderRadius: 8,
                fontSize: 13,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(8,10,16,0.7)",
                color: "#fff",
              }}
            />
          </div>
        </div>
        {tabTaken && (
          <div
            role="alert"
            style={{
              position: "absolute",
              left: "50%",
              bottom: "calc(58px + env(safe-area-inset-bottom, 0px))",
              transform: "translateX(-50%)",
              padding: "6px 14px",
              borderRadius: 10,
              background: "rgba(120,20,20,0.85)",
              color: "#fff",
              fontSize: 13,
              whiteSpace: "nowrap",
              zIndex: 5,
              maxWidth: "calc(100% - 16px)",
              boxSizing: "border-box",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            別のタブで開いています（このタブは無効）
          </div>
        )}
        {tileMsg && (
          <div
            key={denyStamp}
            role="status"
            style={{
              position: "absolute",
              left: "50%",
              bottom: "calc(58px + env(safe-area-inset-bottom, 0px))",
              transform: "translateX(-50%)",
              padding: "4px 12px",
              borderRadius: 10,
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              fontSize: 13,
              whiteSpace: "nowrap",
              zIndex: 4,
              maxWidth: "calc(100% - 16px)",
              boxSizing: "border-box",
              overflow: "hidden",
              textOverflow: "ellipsis",
              animation: denyStamp > 0 ? "wb-deny-shake 260ms ease-out" : undefined,
            }}
          >
            {tileMsg}
          </div>
        )}
        {storageOpen && invProfile && (
          <div
            className="wb-panel"
            style={{ ...panelOverlay, width: "min(330px, calc(100% - 20px))" }}
          >
            <div style={{ ...stickyPanelHead, display: "flex", alignItems: "center", gap: 8 }}>
              <strong>インベントリ</strong>
              {heldStack && (
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
                >
                  <ItemIcon id={heldStack.id} size={18} />
                  {itemById(heldStack.id)?.name ?? heldStack.id}
                </span>
              )}
              <span style={{ flex: 1 }} />
              <button
                type="button"
                style={btn}
                onClick={() => {
                  setStorageOpen(false);
                  setHeldSlot(null);
                }}
              >
                閉じる
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 4,
                marginTop: 8,
              }}
            >
              {invProfile.storage.map((slot, i) => renderInvSlot("storage", i, slot))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 4,
                marginTop: 6,
                paddingTop: 6,
                borderTop: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              {invProfile.hotbar.map((slot, i) => renderInvSlot("hotbar", i, slot))}
            </div>
          </div>
        )}

        {containerPanel && invProfile && (
          <div
            className="wb-panel"
            style={{ ...panelOverlay, width: "min(330px, calc(100% - 20px))" }}
          >
            <div style={{ ...stickyPanelHead, display: "flex", alignItems: "center", gap: 8 }}>
              <strong>{itemById(containerPanel.itemId)?.name ?? "収納"}</strong>
              {heldPanelStack && (
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
                >
                  <ItemIcon id={heldPanelStack.id} size={18} />
                  {itemById(heldPanelStack.id)?.name ?? heldPanelStack.id}
                </span>
              )}
              <span style={{ flex: 1 }} />
              <button
                type="button"
                style={btn}
                onClick={() => {
                  setContainerPanel(null);
                  setHeldPanelSlot(null);
                }}
              >
                閉じる
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 4,
                marginTop: 8,
              }}
            >
              {containerGridSlots.map((slot, i) => renderPanelSlot("container", i, slot))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 4,
                marginTop: 6,
                paddingTop: 6,
                borderTop: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              {invProfile.storage.map((slot, i) => renderPanelSlot("profile_storage", i, slot))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 4,
                marginTop: 6,
                paddingTop: 6,
                borderTop: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              {invProfile.hotbar.map((slot, i) => renderPanelSlot("profile_hotbar", i, slot))}
            </div>
            {containerEmpty && (
              <div style={{ marginTop: 8, display: "flex" }}>
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  style={btn}
                  onClick={() => {
                    const p = containerPanel;
                    setContainerPanel(null);
                    setHeldPanelSlot(null);
                    void postTileAction("mine_block", p.x, p.y);
                  }}
                >
                  回収
                </button>
              </div>
            )}
          </div>
        )}

        {stallPanel && (
          <div style={panelOverlay} className="wb-panel">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <strong>屋台</strong>
              <span style={{ flex: 1 }} />
              <button type="button" style={btn} onClick={() => setStallPanel(null)}>
                閉じる
              </button>
            </div>
            {stallInfo === undefined ? (
              <div style={{ marginTop: 10, fontSize: 13 }}>…</div>
            ) : stallInfo ? (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ItemIcon id={stallInfo.itemId} size={20} />
                  <span>{stallInfo.name}</span>
                  <span>
                    {stallInfo.price} 円 × {stallInfo.count}
                  </span>
                </div>
                <div style={{ marginTop: 10 }}>
                  {stallInfo.mine ? (
                    <button
                      type="button"
                      style={btn}
                      onClick={() => void postStallAction("unlist", stallPanel.x, stallPanel.y)}
                    >
                      取り下げる
                    </button>
                  ) : (
                    <button
                      type="button"
                      style={btn}
                      onClick={() => void postStallAction("buy", stallPanel.x, stallPanel.y)}
                    >
                      買う
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                {!stallPanel.mine ? (
                  <span>出品なし</span>
                ) : stallPanel.selItemId ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ItemIcon id={stallPanel.selItemId} size={20} />
                      <span>{itemById(stallPanel.selItemId)?.name ?? stallPanel.selItemId}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                      <input
                        value={stallPriceText}
                        inputMode="numeric"
                        onChange={(e) => setStallPriceText(e.target.value)}
                        style={{
                          width: 80,
                          padding: "6px 8px",
                          borderRadius: 8,
                          fontSize: 13,
                          border: "1px solid rgba(255,255,255,0.25)",
                          background: "rgba(8,10,16,0.7)",
                          color: "#fff",
                        }}
                      />
                      <span>円 ×</span>
                      <input
                        value={stallCountText}
                        inputMode="numeric"
                        onChange={(e) => setStallCountText(e.target.value)}
                        style={{
                          width: 52,
                          padding: "6px 8px",
                          borderRadius: 8,
                          fontSize: 13,
                          border: "1px solid rgba(255,255,255,0.25)",
                          background: "rgba(8,10,16,0.7)",
                          color: "#fff",
                        }}
                      />
                      <button
                        type="button"
                        style={btn}
                        onClick={() =>
                          void postStallAction("list_item", stallPanel.x, stallPanel.y, {
                            itemId: stallPanel.selItemId ?? undefined,
                            price: Number(stallPriceText),
                            count: Number(stallCountText),
                          })
                        }
                      >
                        出す
                      </button>
                    </div>
                  </>
                ) : (
                  <span>かばんの品を選んでから開くと出品できます</span>
                )}
              </div>
            )}
          </div>
        )}
        {signEdit && (
          <div style={panelOverlay} className="wb-panel">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <strong>看板</strong>
              <span style={{ flex: 1 }} />
              <button type="button" style={btn} onClick={() => setSignEdit(null)}>
                閉じる
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <input
                value={signEdit.text}
                maxLength={40}
                onChange={(e) => setSignEdit({ ...signEdit, text: e.target.value })}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "6px 8px",
                  borderRadius: 8,
                  fontSize: 13,
                  border: "1px solid rgba(255,255,255,0.25)",
                  background: "rgba(8,10,16,0.7)",
                  color: "#fff",
                }}
              />
              <button
                type="button"
                style={btn}
                onClick={() => {
                  void postTileAction(
                    "set_sign",
                    signEdit.x,
                    signEdit.y,
                    undefined,
                    undefined,
                    signEdit.text,
                  );
                  setSignEdit(null);
                }}
              >
                書く
              </button>
            </div>
            {signReg !== undefined && (
              <div style={{ marginTop: 10 }}>
                {signReg ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 13, flex: 1 }}>
                      会社の店舗・受付として登録済み（{signReg.name}）
                    </span>
                    <button
                      type="button"
                      style={btn}
                      onClick={() => void postSignRegistration("sign_unregister")}
                    >
                      登録を解除
                    </button>
                  </div>
                ) : signViewerCompanyId ? (
                  <button
                    type="button"
                    style={btn}
                    onClick={() => void postSignRegistration("sign_register")}
                  >
                    会社の店舗・受付として登録
                  </button>
                ) : (
                  <p style={{ fontSize: 12, opacity: 0.75, margin: 0 }}>
                    会社に所属すると、この看板を自社の店舗・受付として登録できます。
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {signShop && (
          <div style={panelOverlay} className="wb-panel">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <strong>{signShop.sign.name}（店舗）</strong>
              <span style={{ flex: 1 }} />
              <button type="button" style={btn} onClick={() => setSignShop(null)}>
                閉じる
              </button>
            </div>
            <p style={{ margin: "6px 0", opacity: 0.9 }}>{signShop.sign.description}</p>
            <p style={{ margin: "4px 0", opacity: 0.85, fontSize: 13 }}>
              従業員 {signShop.sign.memberCount}人
              {signShop.sign.isMember ? " ・ あなたの会社です" : ""}
            </p>
            {signShopMsg && <p role="status">{signShopMsg}</p>}
            {signRevealed && (
              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.3)",
                  borderRadius: 10,
                  padding: 10,
                  margin: "8px 0",
                }}
              >
                <div style={{ fontWeight: 700 }}>購入した商品「{signRevealed.name}」の内容</div>
                <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{signRevealed.content}</p>
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              {signShop.sign.products.length === 0 && (
                <p style={{ opacity: 0.8 }}>出品中の商品はありません。</p>
              )}
              {signShop.sign.products.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 0",
                    borderTop: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>
                      {p.name} <span style={{ opacity: 0.75 }}>{p.price.toLocaleString()}円</span>
                    </div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>
                      {p.description}（出品: {p.creatorName || "社員"}）
                    </div>
                  </div>
                  <button
                    type="button"
                    style={btn}
                    disabled={signShopBusy}
                    onClick={() => void buySignProduct(p.id)}
                  >
                    購入
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                style={btn}
                onClick={() => {
                  setCompanyAnchor(signShop.sign.companyId);
                  setSignShop(null);
                  setShowCompany(true);
                }}
              >
                受付を開く（会社情報・入社はこちら）
              </button>
            </div>
          </div>
        )}
        {seedPicker && invProfile && (
          <div style={panelOverlay} className="wb-panel">
            <div style={{ ...stickyPanelHead, display: "flex", alignItems: "center", gap: 10 }}>
              <strong>種</strong>
              <span style={{ flex: 1 }} />
              <button type="button" style={btn} onClick={() => setSeedPicker(null)}>
                閉じる
              </button>
            </div>
            <div style={{ marginTop: 10 }}>
              <ItemSlotGrid>
                {CROPS.filter((c) => countItem(invProfile, c.seedId) > 0).map((c) => (
                  <ItemSlotView
                    key={c.id}
                    itemId={c.seedId}
                    count={countItem(invProfile, c.seedId)}
                    onClick={() => {
                      void postTileAction("plant", seedPicker.x, seedPicker.y, c.seedId);
                      setSeedPicker(null);
                    }}
                  />
                ))}
              </ItemSlotGrid>
              {CROPS.every((c) => countItem(invProfile, c.seedId) === 0) && (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  種がない
                </p>
              )}
            </div>
          </div>
        )}

        {boardOpen && spaceUi === "lobby" && (
          <div style={panelOverlay} className="wb-panel">
            <div style={{ ...stickyPanelHead, display: "flex", alignItems: "center", gap: 10 }}>
              <strong>グローバル掲示板</strong>
              <span style={{ flex: 1 }} />
              <button type="button" style={btn} onClick={() => setBoardOpen(false)}>
                閉じる
              </button>
            </div>
            {boardPosts.length === 0 ? (
              <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
                まだ投稿はありません
              </p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: "10px 0 0",
                  padding: 0,
                  display: "grid",
                  gap: 8,
                  maxHeight: 260,
                  overflowY: "auto",
                }}
              >
                {boardPosts.map((p, i) => (
                  <li key={`${p.at}-${i}`} style={{ fontSize: 13 }}>
                    <strong>{p.name}</strong>{" "}
                    <span className="muted">
                      {new Date(p.at).toLocaleString("ja-JP", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <div>{p.text}</div>
                  </li>
                ))}
              </ul>
            )}
            {boardLoggedIn ? (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <input
                  value={boardText}
                  onChange={(e) => setBoardText(e.target.value)}
                  maxLength={120}
                  placeholder="投稿（120文字まで）"
                  style={{
                    flex: 1,
                    minHeight: 40,
                    padding: "6px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.25)",
                    background: "rgba(255,255,255,0.06)",
                    color: "inherit",
                  }}
                />
                <button type="button" style={btn} onClick={() => void postBoard()}>
                  投稿
                </button>
              </div>
            ) : (
              <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
                投稿はログイン後
              </p>
            )}
            {boardMsg && (
              <p role="status" style={{ margin: "10px 0 0" }}>
                {boardMsg}
              </p>
            )}
          </div>
        )}

        {mapView && (
          <WorldBoxMapModal
            getSnapshot={() => getMapSnapshotRef.current()}
            pins={mapPins}
            trackedTarget={trackedTarget}
            onAddPin={addMapPin}
            onDeletePin={deleteMapPin}
            onTrackTarget={(target) => {
              setTrackedTarget(target);
              pushFloatText(
                playerPosRef.current.x,
                playerPosRef.current.y - 0.8,
                target.kind === "player" ? `追跡: ${target.label}` : `案内: ${target.label}`,
                "#38bdf8",
              );
            }}
            onClearTrack={() => setTrackedTarget(null)}
            onTeleportPorter={porterUi ? () => void teleportToPorter() : undefined}
            onClose={() => setMapView(false)}
          />
        )}

        {/* パネルの開閉は左上の ≡ メニューに統合（ボタン行は置かない） */}

        {showEconomy && (
          <WorldBoxEconomyPanel
            space={spaceUi}
            station={stationUi}
            genre={stationGenre}
            worldStationKinds={worldStationKinds}
            onClose={() => setShowEconomy(false)}
          />
        )}
        {showCompany && (
          <WorldBoxCompanyPanel
            anchorCompanyId={companyAnchor}
            onClose={() => {
              setShowCompany(false);
              setCompanyAnchor(null);
            }}
          />
        )}
        {telescopeOpen && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 6 }}>
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at center, transparent 52%, rgba(4,6,14,0.55) 78%, rgba(2,3,8,0.92) 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "calc(10px + env(safe-area-inset-top, 0px))",
                transform: "translateX(-50%)",
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: "6px 8px 6px 14px",
                pointerEvents: "auto",
                borderRadius: 10,
                background: "rgba(0,0,0,0.6)",
                color: "#fff",
                fontSize: 13,
                whiteSpace: "nowrap",
              }}
            >
              <span>展望台</span>
              <button
                type="button"
                style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                onClick={() => {
                  telescopeCenterRef.current += 1;
                }}
              >
                戻す
              </button>
              <button
                type="button"
                style={{ ...btn, minHeight: hud.buttonMinHeight, padding: "2px 10px" }}
                onClick={() => setTelescopeOpen(false)}
              >
                閉じる
              </button>
            </div>
          </div>
        )}
        {racingOpen && spaceUi === "lobby" && (
          <WorldBoxRacingPanel onClose={() => setRacingOpen(false)} />
        )}
        {stockOpen && spaceUi === "lobby" && (
          <WorldBoxStockPanel onClose={() => setStockOpen(false)} />
        )}
        {marketOpen && <WorldBoxMarketPanel onClose={() => setMarketOpen(false)} />}
        {financeOpen && <WorldBoxFinancePanel onClose={() => setFinanceOpen(false)} />}
        {pianoOpen && spaceUi === "lobby" && (
          <WorldBoxPianoPanel onClose={() => setPianoOpen(false)} onPlay={playPianoNote} />
        )}
        {casinoOpen && spaceUi === "lobby" && (
          <WorldBoxCasinoPanel onClose={() => setCasinoOpen(false)} />
        )}
        {arcadeOpen && stationArcade && (spaceUi === "lobby2" || spaceUi === "lobby3") && (
          <WorldBoxArcadePanel gameId={stationArcade} onClose={() => setArcadeOpen(false)} />
        )}
        {reportOpen && (
          <div
            className="wb-panel"
            style={{ ...panelOverlay, width: "min(330px, calc(100% - 20px))" }}
          >
            <div style={{ ...stickyPanelHead, display: "flex", alignItems: "center", gap: 8 }}>
              <strong>通報</strong>
              <span style={{ flex: 1 }} />
              <button type="button" style={btn} onClick={() => setReportOpen(false)}>
                閉じる
              </button>
            </div>
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              rows={3}
              maxLength={300}
              style={{
                width: "100%",
                marginTop: 8,
                borderRadius: 8,
                padding: 8,
                boxSizing: "border-box",
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
              }}
              aria-label="通報内容"
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button
                type="button"
                style={btn}
                disabled={!reportText.trim()}
                onClick={() => {
                  void sendReport();
                }}
              >
                送る
              </button>
            </div>
          </div>
        )}
        {machinePanel && spaceUi === "world" && (
          <WorldBoxMachinePanel
            x={machinePanel.x}
            y={machinePanel.y}
            profile={invProfile}
            onProfileChange={(profile) => setInvProfile(profile)}
            onClose={() => setMachinePanel(null)}
          />
        )}
        {jobOpen && (
          <WorldBoxJobPanel
            onProfileChange={(p) => setInvProfile(p)}
            onStatusChange={() => void refreshMmoRef.current?.()}
            onSetWaypoint={(wp) => setWaypoint(wp)}
            onClose={() => setJobOpen(false)}
          />
        )}
        {prisonOpen && (
          <WorldBoxPrisonPanel
            currentSpace={spaceUi}
            profile={invProfile}
            onForceMove={(mv) => {
              forceMoveRef.current?.(mv);
            }}
            onProfileChange={(p) => setInvProfile(p)}
            onStatusChange={() => void refreshMmoRef.current?.()}
            onSetWaypoint={(wp) => setWaypoint(wp)}
            onClose={() => setPrisonOpen(false)}
          />
        )}
        {engineeringOpen && (
          <WorldBoxEngineeringPanel
            onProfileChange={(p) => setInvProfile(p)}
            onClose={() => setEngineeringOpen(false)}
          />
        )}
        {metroOpen && (
          <WorldBoxMetroPanel
            onProfileChange={(p) => setInvProfile(p)}
            onStatusChange={() => void refreshMmoRef.current?.()}
            onVehicleChange={(v) => setEquippedVehicle(v)}
            onOpenPanel={(p) => {
              if (p === "jobs") setJobOpen(true);
              else if (p === "trade") {
                setTradeTarget(null);
                setTradeOpen(true);
              } else if (p === "realestate") setRealEstateOpen(true);
              else if (p === "governance") setGovernanceOpen(true);
              else if (p === "engineering") setEngineeringOpen(true);
              else if (p === "prison") setPrisonOpen(true);
              else if (p === "market") setMarketOpen(true);
              else if (p === "finance") setFinanceOpen(true);
              else if (p === "company") setShowCompany(true);
              else if (p === "economy") setShowEconomy(true);
            }}
            onClose={() => setMetroOpen(false)}
          />
        )}
        {tradeOpen && (
          <WorldBoxTradePanel
            initialTarget={tradeTarget}
            profile={invProfile}
            onProfileChange={(p) => setInvProfile(p)}
            onStatusChange={() => void refreshMmoRef.current?.()}
            onClose={() => {
              setTradeOpen(false);
              setTradeTarget(null);
            }}
          />
        )}
        {realEstateOpen && (
          <WorldBoxRealEstatePanel
            onForceMove={(mv) => {
              forceMoveRef.current?.(mv);
            }}
            onStatusChange={() => void refreshMmoRef.current?.()}
            onClose={() => setRealEstateOpen(false)}
          />
        )}
        {governanceOpen && (
          <WorldBoxGovernancePanel
            jailed={Boolean(mmoSummary?.prison.jailed)}
            onStatusChange={() => void refreshMmoRef.current?.()}
            onClose={() => setGovernanceOpen(false)}
          />
        )}
        {guildShopOpen && spaceUi === "lobby" && (
          <WorldBoxGuildShopPanel
            profile={invProfile}
            onProfileChange={setInvProfile}
            onClose={() => setGuildShopOpen(false)}
          />
        )}
        {guildBoardOpen && spaceUi === "lobby" && (
          <WorldBoxGuildBoardPanel
            inviteGuildId={inviteGuildId}
            nations={nationsUi}
            nationMsg={nationMsg}
            onNationAction={(body) => void nationAction(body)}
            profile={invProfile}
            onProfileChange={setInvProfile}
            getPlayerPos={() => playerPosRef.current}
            onClose={() => setGuildBoardOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
