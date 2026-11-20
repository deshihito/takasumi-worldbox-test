import {
  buildLobby,
  stationGenreNear,
  stationNear,
  type LobbyObject,
  type LobbyStation,
} from "./lobby";
import { buildLobby2, buildLobby3 } from "./lobby-floors";
import type { ShopGenreId } from "../economy/shops";
import { buildTent } from "./tent";
import { loadProfile } from "../player/profile-online";
import { isPresenceEnabled, loadMyPresence } from "../player/presence-online";
import { parseSave } from "../core/save";
import { loadWorldBoxSave } from "../core/save-online";
import { placedStationKinds, type StationKind } from "./tiles";
import { loadTileOverride } from "./tiles-online";

async function resolveSpaceObjects(space: string): Promise<readonly LobbyObject[] | null> {
  if (space === "lobby") return buildLobby().objects;
  if (space === "lobby2") return buildLobby2().objects;
  if (space === "lobby3") return buildLobby3().objects;
  if (space.startsWith("interior:")) {
    const { buildSettlementInterior } = await import("./settlement-interiors");
    const interior = buildSettlementInterior(space);
    return interior ? interior.data.objects : null;
  }
  return null;
}

async function loadMyIndoorPosition(
  ownerKey: string,
): Promise<{ objects: readonly LobbyObject[]; tx: number; ty: number } | null> {
  if (!isPresenceEnabled()) return null;
  const presence = await loadMyPresence(ownerKey);
  if (presence) {
    const objs = await resolveSpaceObjects(presence.space);
    if (objs) {
      return {
        objects: objs,
        tx: Math.floor(presence.x),
        ty: Math.floor(presence.y),
      };
    }
    if (presence.space === "tent") {
      const profile = await loadProfile(ownerKey);
      return {
        objects: buildTent(profile.tentTier).objects,
        tx: Math.floor(presence.x),
        ty: Math.floor(presence.y),
      };
    }
    return null;
  }
  const saved = parseSave(await loadWorldBoxSave(ownerKey));
  if (!saved) return null;
  const savedObjs = await resolveSpaceObjects(saved.space);
  if (savedObjs) {
    return {
      objects: savedObjs,
      tx: Math.floor(saved.x),
      ty: Math.floor(saved.y),
    };
  }
  if (saved.space === "tent") {
    const profile = await loadProfile(ownerKey);
    return {
      objects: buildTent(profile.tentTier).objects,
      tx: Math.floor(saved.x),
      ty: Math.floor(saved.y),
    };
  }
  return null;
}

export async function loadMyLobbyStation(ownerKey: string): Promise<LobbyStation | null> {
  const pos = await loadMyIndoorPosition(ownerKey);
  if (!pos) return null;
  return stationNear(pos.objects, pos.tx, pos.ty);
}

export async function loadMyLobbyShopGenre(ownerKey: string): Promise<ShopGenreId | null> {
  const pos = await loadMyIndoorPosition(ownerKey);
  if (!pos) return null;
  const station = stationNear(pos.objects, pos.tx, pos.ty);
  if (station === "smith") return "smith";
  if (station !== "shop") return null;
  return stationGenreNear(pos.objects, pos.tx, pos.ty);
}

export const WORLD_STATION_RADIUS = 2;

export async function loadMyWorldStationKinds(ownerKey: string): Promise<ReadonlySet<StationKind>> {
  const kinds = new Set<StationKind>();
  if (!isPresenceEnabled()) return kinds;
  let wx: number | null = null;
  let wy: number | null = null;
  const presence = await loadMyPresence(ownerKey);
  if (presence && presence.space === "world") {
    wx = Math.floor(presence.x);
    wy = Math.floor(presence.y);
  } else if (!presence) {
    const saved = parseSave(await loadWorldBoxSave(ownerKey));
    if (saved && saved.space === "world") {
      wx = Math.floor(saved.x);
      wy = Math.floor(saved.y);
    }
  }
  if (wx === null || wy === null) return kinds;
  const jobs: Promise<void>[] = [];
  for (let dy = -WORLD_STATION_RADIUS; dy <= WORLD_STATION_RADIUS; dy++) {
    for (let dx = -WORLD_STATION_RADIUS; dx <= WORLD_STATION_RADIUS; dx++) {
      jobs.push(
        (async () => {
          const ov = await loadTileOverride(wx + dx, wy + dy);
          for (const kind of placedStationKinds(ov?.block?.itemId)) kinds.add(kind);
        })(),
      );
    }
  }
  await Promise.all(jobs);
  return kinds;
}
