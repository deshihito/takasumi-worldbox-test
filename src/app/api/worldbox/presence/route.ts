import { NextResponse } from "next/server";
import {
  getRequestSession,
  isSameOriginRequest,
  sessionAvatarUrl,
  sessionOwnerKey,
} from "@/lib/auth";
import { rectBounds, worldBounds } from "@/lib/worldbox/world/mapgen";
import { LOBBY_H, LOBBY_W } from "@/lib/worldbox/world/lobby";
import { LOBBY2_H, LOBBY2_W, LOBBY3_H, LOBBY3_W } from "@/lib/worldbox/world/lobby-floors";
import { TENT_MAX_H, TENT_MAX_W } from "@/lib/worldbox/world/tent";
import {
  isPresenceEnabled,
  listPresence,
  loadStoredPresence,
  putPresenceTabGuarded,
  removePresence,
} from "@/lib/worldbox/player/presence-online";
import { parseSave } from "@/lib/worldbox/core/save";
import { loadWorldBoxSave } from "@/lib/worldbox/core/save-online";
import { recordFirstStep, recordPresenceMetric } from "@/lib/worldbox/core/metrics-online";
import {
  checkMovementContinuity,
  checkSaveFallbackContinuity,
  presenceIdFor,
  sanitizeHeartbeat,
  sanitizePresenceSpace,
  selectVisiblePlayers,
  thinPresenceNear,
} from "@/lib/worldbox/player/presence";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function sameOrigin(request: Request) {
  return isSameOriginRequest(request);
}

export async function GET(request: Request) {
  if (!isPresenceEnabled()) {
    return NextResponse.json({ error: "presence_unavailable" }, { status: 503, headers: NO_STORE });
  }
  const session = getRequestSession(request);
  const selfId = session ? presenceIdFor(sessionOwnerKey(session)) : null;
  const space = sanitizePresenceSpace(new URL(request.url).searchParams.get("space"));
  const entries = await listPresence();
  const self = space === "world" && selfId ? (entries.find((e) => e.id === selfId) ?? null) : null;
  let visible = selectVisiblePlayers(entries, selfId, Date.now(), self ? 4096 : undefined, space);
  if (self) visible = thinPresenceNear(visible, self);
  const players = visible.map((e) => ({
    id: e.id,
    name: e.name,
    x: e.x,
    y: e.y,
    vx: e.vx,
    vy: e.vy,
    face: e.face,
    space: e.space,
    role: e.role ?? "free",
    rank: e.rank ?? 1,
    party: e.party ?? "",
    ...(e.sit === true ? { sit: true } : {}),
    ts: e.ts,
  }));
  return NextResponse.json({ players, now: Date.now() }, { headers: NO_STORE });
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  const session = getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  if (!isPresenceEnabled()) {
    return NextResponse.json({ error: "presence_unavailable" }, { status: 503, headers: NO_STORE });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });
  }
  const space = sanitizePresenceSpace((body as { space?: unknown } | null)?.space);
  const isCave = /^cave:-?\d+,-?\d+:\d+$/.test(space);
  const isRuins = /^ruins:-?\d+,-?\d+:\d+$/.test(space);
  const isDungeon = /^dungeon:-?\d+,-?\d+:\d+$/.test(space);
  const isApartment = /^apartment:[a-zA-Z0-9_-]{1,24}$/.test(space);
  const bounds =
    space === "lobby"
      ? rectBounds(LOBBY_W, LOBBY_H)
      : space === "lobby2"
        ? rectBounds(LOBBY2_W, LOBBY2_H)
        : space === "lobby3"
          ? rectBounds(LOBBY3_W, LOBBY3_H)
          : space === "tent"
            ? rectBounds(TENT_MAX_W, TENT_MAX_H)
            : space === "prison"
              ? rectBounds(44, 32)
              : isApartment
                ? rectBounds(24, 18)
                : isCave
                  ? rectBounds(64, 64)
                  : isRuins
                    ? rectBounds(48, 48)
                    : isDungeon
                      ? rectBounds(52, 52)
                      : worldBounds();
  const heartbeat = sanitizeHeartbeat(body, bounds);
  if (!heartbeat) {
    return NextResponse.json({ error: "invalid_heartbeat" }, { status: 400, headers: NO_STORE });
  }
  const name = session.username?.trim() || heartbeat.name || "プレイヤー";
  const avatar = sessionAvatarUrl(session);
  const ownerKey = sessionOwnerKey(session);
  const now = Date.now();
  const prev = await loadStoredPresence(ownerKey);
  if (prev) {
    if (!checkMovementContinuity(prev, heartbeat, now).ok) {
      return NextResponse.json(
        { error: "position_jump", x: prev.x, y: prev.y, space: prev.space },
        { status: 409, headers: NO_STORE },
      );
    }
  } else {
    const saved = parseSave(await loadWorldBoxSave(ownerKey));
    if (saved && !checkSaveFallbackContinuity(saved, heartbeat).ok) {
      return NextResponse.json(
        { error: "position_jump", x: saved.x, y: saved.y, space: saved.space },
        { status: 409, headers: NO_STORE },
      );
    }
  }
  const stored = await putPresenceTabGuarded(
    ownerKey,
    { ...heartbeat, name, ...(avatar ? { avatar } : {}) },
    now,
  );
  if (stored === "rejected") {
    return NextResponse.json({ error: "tab_superseded" }, { status: 409, headers: NO_STORE });
  }
  if (stored !== "stored") {
    return NextResponse.json({ error: "presence_failed" }, { status: 500, headers: NO_STORE });
  }
  const fresh = (await listPresence()).filter((e) => now - e.ts <= 15_000).length;
  void recordPresenceMetric(ownerKey, fresh, now);
  if (space === "lobby" || space === "lobby2" || space === "lobby3") {
    void recordFirstStep(ownerKey, "lobby", now);
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  const session = getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  await removePresence(sessionOwnerKey(session));
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
