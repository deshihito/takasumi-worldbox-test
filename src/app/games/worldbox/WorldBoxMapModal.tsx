"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LOBBY_FLOOR_FALLBACK, type LobbyData } from "@/lib/worldbox/world/lobby";
import {
  MAP_SEED,
  T_DIRT,
  T_GRASS,
  T_ROCK,
  T_SAND,
  T_SNOW,
  T_SNOW_TREE,
  T_TREE,
  T_WATER,
  tileAt,
} from "@/lib/worldbox/world/mapgen";
import {
  PIN_ICONS,
  poisForSpace,
  type MapPin,
  type PinIconId,
  type TrackedTarget,
} from "@/lib/worldbox/world/map-pins";
import { settlementsNear, type Settlement } from "@/lib/worldbox/world/settlements";

const TILE_COLOR: Record<number, string> = {
  [T_GRASS]: "#57a639",
  [T_WATER]: "#3a7cb4",
  [T_SAND]: "#ddd29a",
  [T_TREE]: "#2f6121",
  [T_ROCK]: "#8d8d93",
  [T_DIRT]: "#8a5a2b",
  [T_SNOW]: "#f4f8fa",
  [T_SNOW_TREE]: "#9fc4bb",
};

const CANVAS_SIZE = 512;

export interface MapLivePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  space: string;
}

export interface MapSnapshot {
  space: string;
  playerX: number;
  playerY: number;
  indoor: LobbyData | null;
  nations: { id: string; name: string; color: string; capital: { x: number; y: number } }[];
  porter: { x: number; y: number } | null;
  players: MapLivePlayer[];
}

export function paintIndoorMapCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  indoor: LobbyData,
  playerX: number,
  playerY: number,
  players: readonly MapLivePlayer[],
  space: string,
  pins: readonly MapPin[],
  tracked: TrackedTarget | null,
  showLabels = false,
): { ox: number; oy: number; scale: number } {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0b101b";
  ctx.fillRect(0, 0, w, h);

  const pad = 8;
  const scale = Math.min((w - pad * 2) / indoor.width, (h - pad * 2) / indoor.height);
  const drawW = indoor.width * scale;
  const drawH = indoor.height * scale;
  const ox = (w - drawW) / 2;
  const oy = (h - drawH) / 2;

  for (let y = 0; y < indoor.height; y++) {
    for (let x = 0; x < indoor.width; x++) {
      const id = indoor.tiles[y * indoor.width + x];
      if (id === 0) continue;
      ctx.fillStyle = LOBBY_FLOOR_FALLBACK[id] ?? "#64748b";
      ctx.fillRect(ox + x * scale, oy + y * scale, Math.ceil(scale), Math.ceil(scale));
    }
  }

  // Highlight station objects cleanly
  for (const o of indoor.objects) {
    if (!o.station) continue;
    const col =
      o.station === "bank" || o.station === "casino"
        ? "#facc15"
        : o.station === "arcade"
          ? "#22d3ee"
          : o.station === "shop" || o.station === "sell"
            ? "#fb923c"
            : o.station === "prison_escape"
              ? "#ef4444"
              : o.station === "prison_work"
                ? "#4ade80"
                : "#cbd5e1";
    ctx.fillStyle = col;
    ctx.fillRect(
      ox + o.x * scale,
      oy + o.y * scale,
      Math.max(2, o.w * scale),
      Math.max(2, o.h * scale),
    );
  }

  // POI dots in full map mode
  const pois = poisForSpace(space);
  if (showLabels) {
    ctx.font = "700 10px sans-serif";
    ctx.textAlign = "center";
    for (const poi of pois) {
      const sx = ox + (poi.x + 0.5) * scale;
      const sy = oy + (poi.y + 0.5) * scale;
      ctx.fillStyle = poi.color;
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(10,14,22,0.8)";
      const tw = ctx.measureText(poi.label).width + 6;
      ctx.fillRect(sx - tw / 2, sy - 16, tw, 12);
      ctx.fillStyle = "#f8fafc";
      ctx.fillText(poi.label, sx, sy - 7);
    }
  }

  // Saved Pins for this space
  for (const p of pins) {
    if (p.space !== space) continue;
    const px = ox + p.x * scale;
    const py = oy + p.y * scale;
    ctx.fillStyle = p.color;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, showLabels ? 5 : 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (showLabels) {
      ctx.font = "700 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.fillText(`${p.icon}${p.label}`, px, py - 8);
    }
  }

  // Tracked target beacon
  if (tracked) {
    let tx: number | null = null;
    let ty: number | null = null;
    if (tracked.kind === "player") {
      const targetPl = players.find((pl) => pl.id === tracked.presenceId && pl.space === space);
      if (targetPl) {
        tx = targetPl.x;
        ty = targetPl.y;
      }
    } else if (tracked.space === space) {
      tx = tracked.x;
      ty = tracked.y;
    }
    if (tx !== null && ty !== null) {
      const sx = ox + tx * scale;
      const sy = oy + ty * scale;
      const psx = ox + playerX * scale;
      const psy = oy + playerY * scale;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(psx, psy);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, showLabels ? 9 : 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Other online players in same space
  for (const pl of players) {
    if (pl.space !== space) continue;
    const sx = ox + pl.x * scale;
    const sy = oy + pl.y * scale;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(sx, sy, showLabels ? 3.5 : 2, 0, Math.PI * 2);
    ctx.fill();
    if (showLabels) {
      ctx.font = "600 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(pl.name, sx, sy + 12);
    }
  }

  // Self dot
  ctx.fillStyle = "#ffd23e";
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(ox + playerX * scale, oy + playerY * scale, showLabels ? 5 : 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  return { ox, oy, scale };
}

const modalStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  width: "min(860px, calc(100vw - 20px))",
  maxHeight: "min(90svh, 760px)",
  overflowY: "auto",
  borderRadius: 14,
  padding: "0 14px 14px",
  background: "rgba(11, 16, 26, 0.97)",
  border: "1px solid rgba(148, 163, 184, 0.3)",
  boxShadow: "0 20px 52px rgba(0,0,0,0.7)",
  color: "#f8fafc",
  zIndex: 27,
  fontSize: 12.5,
};

const stickyHead: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  padding: "12px 0 8px",
  marginBottom: 10,
  background: "rgba(11, 16, 26, 0.98)",
  borderBottom: "1px solid rgba(148,163,184,0.22)",
};

const chipBtn = (active = false): CSSProperties => ({
  minHeight: 30,
  padding: "4px 10px",
  borderRadius: 8,
  border: active ? "1px solid #38bdf8" : "1px solid rgba(148,163,184,0.28)",
  background: active ? "rgba(56,189,248,0.22)" : "rgba(255,255,255,0.08)",
  color: "#f8fafc",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
});

export default function WorldBoxMapModal({
  getSnapshot,
  pins,
  trackedTarget,
  onAddPin,
  onDeletePin,
  onTrackTarget,
  onClearTrack,
  onTeleportPorter,
  onClose,
}: {
  getSnapshot: () => MapSnapshot;
  pins: readonly MapPin[];
  trackedTarget: TrackedTarget | null;
  onAddPin: (pin: Omit<MapPin, "id" | "createdAt">) => void;
  onDeletePin: (id: string) => void;
  onTrackTarget: (target: TrackedTarget) => void;
  onClearTrack: () => void;
  onTeleportPorter?: () => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainCacheRef = useRef<{
    key: string;
    canvas: HTMLCanvasElement;
  } | null>(null);
  const indoorTransformRef = useRef<{ ox: number; oy: number; scale: number }>({
    ox: 0,
    oy: 0,
    scale: 1,
  });

  const [zoomSpan, setZoomSpan] = useState<256 | 512 | 1024>(512);
  const [pinMode, setPinMode] = useState(true);
  const [pinIcon, setPinIcon] = useState<PinIconId>("📌");
  const [pinName, setPinName] = useState("");
  const [sideTab, setSideTab] = useState<"settlements" | "pins" | "pois" | "players">(
    getSnapshot().space === "world" ? "settlements" : "pois",
  );
  const [snapTick, setSnapTick] = useState(0);

  const snap = getSnapshot();
  const nearSettlements: Settlement[] =
    snap.space === "world" ? settlementsNear(snap.playerX, snap.playerY, zoomSpan * 0.9) : [];
  const spacePois = poisForSpace(snap.space);
  const visiblePlayers = snap.players.filter((p) => p.space === snap.space);

  useEffect(() => {
    const paint = () => {
      setSnapTick((t) => (t + 1) % 10000);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const s = getSnapshot();
      if (s.space !== "world" && s.indoor) {
        indoorTransformRef.current = paintIndoorMapCanvas(
          ctx,
          CANVAS_SIZE,
          CANVAS_SIZE,
          s.indoor,
          s.playerX,
          s.playerY,
          s.players,
          s.space,
          pins,
          trackedTarget,
          true,
        );
        return;
      }

      // World Global Map render (supports 256 / 512 / 1024 spans seamlessly!)
      const ox = Math.floor(s.playerX - zoomSpan / 2);
      const oy = Math.floor(s.playerY - zoomSpan / 2);
      const step = zoomSpan >= 1024 ? 4 : zoomSpan >= 512 ? 2 : 1;
      const gridSize = zoomSpan / step;
      const key = `${Math.floor(ox / 16)},${Math.floor(oy / 16)},${zoomSpan}`;

      if (!terrainCacheRef.current || terrainCacheRef.current.key !== key) {
        const off = document.createElement("canvas");
        off.width = gridSize;
        off.height = gridSize;
        const octx = off.getContext("2d");
        if (octx) {
          for (let gy = 0; gy < gridSize; gy++) {
            for (let gx = 0; gx < gridSize; gx++) {
              const id = tileAt(ox + gx * step, oy + gy * step, MAP_SEED);
              octx.fillStyle = TILE_COLOR[id] ?? "#57a639";
              octx.fillRect(gx, gy, 1, 1);
            }
          }
        }
        terrainCacheRef.current = { key, canvas: off };
      }

      const scale = CANVAS_SIZE / zoomSpan;
      const toX = (wx: number) => (wx - ox) * scale;
      const toY = (wy: number) => (wy - oy) * scale;

      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(terrainCacheRef.current.canvas, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.imageSmoothingEnabled = true;

      // Render Settlement Districts & Roads
      const visibleStls = settlementsNear(s.playerX, s.playerY, zoomSpan * 0.78);
      for (const stl of visibleStls) {
        const mx = toX(stl.cx);
        const my = toY(stl.cy);
        const mr = Math.max(4, stl.radius * scale);
        ctx.fillStyle =
          stl.tier === "city"
            ? "rgba(56,189,248,0.28)"
            : stl.tier === "town"
              ? "rgba(250,204,21,0.24)"
              : "rgba(134,239,172,0.22)";
        ctx.strokeStyle =
          stl.tier === "city" ? "#38bdf8" : stl.tier === "town" ? "#facc15" : "#4ade80";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, mr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Crossroad grid hint
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(mx - mr * 0.8, my - 1, mr * 1.6, 2);
        ctx.fillRect(mx - 1, my - mr * 0.8, 2, mr * 1.6);

        // City / Town nameplate
        ctx.font = "700 11px sans-serif";
        ctx.textAlign = "center";
        const tag = `${stl.tier === "city" ? "🏙️" : stl.tier === "town" ? "🏘️" : "🏡"} ${stl.name}`;
        const tw = ctx.measureText(tag).width + 8;
        ctx.fillStyle = "rgba(10,14,22,0.82)";
        ctx.fillRect(mx - tw / 2, my - mr - 15, tw, 13);
        ctx.fillStyle = "#f8fafc";
        ctx.fillText(tag, mx, my - mr - 5);
      }

      // Render Nation capitals
      for (const n of s.nations) {
        const mx = toX(n.capital.x);
        const my = toY(n.capital.y);
        if (mx < -10 || my < -10 || mx > CANVAS_SIZE + 10 || my > CANVAS_SIZE + 10) continue;
        ctx.fillStyle = n.color;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.fillRect(mx - 4, my - 4, 8, 8);
        ctx.strokeRect(mx - 4, my - 4, 8, 8);
      }

      // Render Porter
      if (s.porter) {
        const mx = toX(s.porter.x + 0.5);
        const my = toY(s.porter.y + 0.5);
        ctx.fillStyle = "#ffd23e";
        ctx.beginPath();
        ctx.moveTo(mx, my - 6);
        ctx.lineTo(mx + 6, my);
        ctx.lineTo(mx, my + 6);
        ctx.lineTo(mx - 6, my);
        ctx.closePath();
        ctx.fill();
      }

      // Render World Map Pins
      for (const p of pins) {
        if (p.space !== "world") continue;
        const px = toX(p.x);
        const py = toY(p.y);
        if (px < -12 || py < -12 || px > CANVAS_SIZE + 12 || py > CANVAS_SIZE + 12) continue;
        ctx.fillStyle = p.color;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(px, py, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.font = "700 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff";
        ctx.fillText(`${p.icon} ${p.label}`, px, py - 9);
      }

      // Online players
      for (const pl of s.players) {
        if (pl.space !== "world") continue;
        const sx = toX(pl.x);
        const sy = toY(pl.y);
        if (sx < -8 || sy < -8 || sx > CANVAS_SIZE + 8 || sy > CANVAS_SIZE + 8) continue;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "600 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(pl.name, sx, sy + 12);
      }

      // Active Tracking Vector & Crosshairs
      if (trackedTarget) {
        let tx: number | null = null;
        let ty: number | null = null;
        if (trackedTarget.kind === "player") {
          const tpl = s.players.find(
            (p) => p.id === trackedTarget.presenceId && p.space === "world",
          );
          if (tpl) {
            tx = tpl.x;
            ty = tpl.y;
          }
        } else if (trackedTarget.space === "world") {
          tx = trackedTarget.x;
          ty = trackedTarget.y;
        }
        if (tx !== null && ty !== null) {
          const tsx = toX(tx);
          const tsy = toY(ty);
          const psx = toX(s.playerX);
          const psy = toY(s.playerY);
          ctx.save();
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(psx, psy);
          ctx.lineTo(tsx, tsy);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = "#facc15";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(tsx, tsy, 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Self marker
      ctx.fillStyle = "#ffd23e";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(toX(s.playerX), toY(s.playerY), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };

    paint();
    const t = window.setInterval(paint, 220);
    return () => window.clearInterval(t);
  }, [getSnapshot, pins, trackedTarget, zoomSpan]);

  void snapTick;

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const cx = (e.clientX - rect.left) * (CANVAS_SIZE / rect.width);
    const cy = (e.clientY - rect.top) * (CANVAS_SIZE / rect.height);
    const s = getSnapshot();

    let worldX = 0;
    let worldY = 0;

    if (s.space !== "world" && s.indoor) {
      const tr = indoorTransformRef.current;
      worldX = Math.max(0, Math.min(s.indoor.width - 1, (cx - tr.ox) / tr.scale));
      worldY = Math.max(0, Math.min(s.indoor.height - 1, (cy - tr.oy) / tr.scale));
    } else {
      const ox = Math.floor(s.playerX - zoomSpan / 2);
      const oy = Math.floor(s.playerY - zoomSpan / 2);
      const scale = CANVAS_SIZE / zoomSpan;
      worldX = ox + cx / scale;
      worldY = oy + cy / scale;

      if (s.porter && Math.hypot(worldX - s.porter.x, worldY - s.porter.y) <= zoomSpan * 0.03) {
        onTeleportPorter?.();
        return;
      }
    }

    // Check if user clicked close to an existing pin to track it immediately
    const hitTol = s.space === "world" ? zoomSpan * 0.035 : 4;
    const hitPin = pins.find(
      (p) => p.space === s.space && Math.hypot(p.x - worldX, p.y - worldY) <= hitTol,
    );
    if (hitPin) {
      onTrackTarget({
        kind: "pin",
        space: hitPin.space,
        x: hitPin.x,
        y: hitPin.y,
        label: `${hitPin.icon} ${hitPin.label}`,
        color: hitPin.color,
        pinId: hitPin.id,
      });
      return;
    }

    // Check if user clicked a Settlement on Global Map
    if (s.space === "world") {
      const hitStl = nearSettlements.find(
        (stl) => Math.hypot(stl.cx - worldX, stl.cy - worldY) <= Math.max(stl.radius, hitTol),
      );
      if (hitStl && !pinMode) {
        onTrackTarget({
          kind: "settlement",
          space: "world",
          x: hitStl.cx,
          y: hitStl.cy,
          label: hitStl.name,
          color: "#38bdf8",
        });
        return;
      }
    }

    // Drop a new Custom Pin & start tracking it right away
    const iconMeta = PIN_ICONS.find((i) => i.icon === pinIcon) ?? PIN_ICONS[0];
    const cleanLabel =
      pinName.trim() || `${iconMeta.label} (${Math.round(worldX)}, ${Math.round(worldY)})`;
    onAddPin({
      label: cleanLabel,
      icon: pinIcon,
      color: iconMeta.color,
      space: s.space,
      x: Math.round(worldX),
      y: Math.round(worldY),
    });
    setPinName("");
  };

  return (
    <div
      style={modalStyle}
      className="wb-panel"
      role="dialog"
      aria-label="メトロ・グローバルマップ"
    >
      <div style={stickyHead}>
        <strong style={{ fontSize: 15 }}>
          🗺️ {snap.space === "world" ? "グローバル生活圏マップ" : `エリアマップ (${snap.space})`}
        </strong>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>
          現在地 X {Math.round(snap.playerX)} / Y {Math.round(snap.playerY)}
        </span>
        {snap.space === "world" && (
          <div style={{ display: "flex", gap: 4 }}>
            {([256, 512, 1024] as const).map((sp) => (
              <button
                key={sp}
                type="button"
                style={chipBtn(zoomSpan === sp)}
                onClick={() => setZoomSpan(sp)}
              >
                {sp === 256 ? "1x 詳細" : sp === 512 ? "2x 広域" : "4x 大域"}
              </button>
            ))}
          </div>
        )}
        {snap.porter && snap.space === "world" && onTeleportPorter && (
          <button type="button" style={chipBtn(false)} onClick={onTeleportPorter}>
            ポーター ({snap.porter.x}, {snap.porter.y})
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" style={chipBtn(false)} onClick={onClose}>
          閉じる [M]
        </button>
      </div>

      {/* Pin Drop Controls Bar */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 10,
          padding: "8px 10px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(148,163,184,0.2)",
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          {PIN_ICONS.map((pi) => (
            <button
              key={pi.icon}
              type="button"
              style={chipBtn(pinIcon === pi.icon)}
              onClick={() => {
                setPinIcon(pi.icon);
                setPinMode(true);
              }}
              title={pi.label}
            >
              {pi.icon}
            </button>
          ))}
        </div>
        <input
          value={pinName}
          onChange={(e) => setPinName(e.target.value)}
          maxLength={24}
          placeholder="ピン名称 (地図クリックで即時設置・追跡)"
          style={{
            flex: "1 1 160px",
            padding: "5px 9px",
            borderRadius: 8,
            border: "1px solid rgba(148,163,184,0.3)",
            background: "rgba(0,0,0,0.4)",
            color: "#fff",
            fontSize: 12,
          }}
        />
        {trackedTarget && (
          <button
            type="button"
            style={{
              ...chipBtn(false),
              background: "rgba(220,38,38,0.28)",
              borderColor: "#f87171",
            }}
            onClick={onClearTrack}
          >
            🎯 追跡解除: {trackedTarget.label}
          </button>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 512px) minmax(200px, 1fr)",
          gap: 12,
          alignItems: "start",
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          onClick={handleCanvasClick}
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "#0b101b",
            cursor: "crosshair",
          }}
        />

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {snap.space === "world" && (
              <button
                type="button"
                style={chipBtn(sideTab === "settlements")}
                onClick={() => setSideTab("settlements")}
              >
                🏙️ 都市・町村 ({nearSettlements.length})
              </button>
            )}
            {spacePois.length > 0 && (
              <button
                type="button"
                style={chipBtn(sideTab === "pois")}
                onClick={() => setSideTab("pois")}
              >
                📍 施設 ({spacePois.length})
              </button>
            )}
            <button
              type="button"
              style={chipBtn(sideTab === "pins")}
              onClick={() => setSideTab("pins")}
            >
              📌 ピン ({pins.length})
            </button>
            <button
              type="button"
              style={chipBtn(sideTab === "players")}
              onClick={() => setSideTab("players")}
            >
              🧑 市民 ({visiblePlayers.length})
            </button>
          </div>

          <div
            style={{
              maxHeight: 420,
              overflowY: "auto",
              display: "grid",
              gap: 6,
            }}
          >
            {sideTab === "settlements" &&
              nearSettlements.map((stl) => {
                const dist = Math.round(Math.hypot(stl.cx - snap.playerX, stl.cy - snap.playerY));
                return (
                  <div
                    key={stl.id}
                    className="wb-mmo-card"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>
                        {stl.tier === "city" ? "🏙️" : stl.tier === "town" ? "🏘️" : "🏡"} {stl.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        人口 {stl.population}人 ・ ({stl.cx}, {stl.cy}) ・ {dist}m
                      </div>
                    </div>
                    <button
                      type="button"
                      style={chipBtn(true)}
                      onClick={() =>
                        onTrackTarget({
                          kind: "settlement",
                          space: "world",
                          x: stl.cx,
                          y: stl.cy,
                          label: stl.name,
                          color: "#38bdf8",
                        })
                      }
                    >
                      追跡
                    </button>
                  </div>
                );
              })}

            {sideTab === "pois" &&
              spacePois.map((poi) => {
                const dist = Math.round(Math.hypot(poi.x - snap.playerX, poi.y - snap.playerY));
                return (
                  <div
                    key={poi.id}
                    className="wb-mmo-card"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>
                        {poi.badge} {poi.label}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        ({poi.x}, {poi.y}) ・ 距離 {dist}m
                      </div>
                    </div>
                    <button
                      type="button"
                      style={chipBtn(true)}
                      onClick={() =>
                        onTrackTarget({
                          kind: "poi",
                          space: poi.space,
                          x: poi.x,
                          y: poi.y,
                          label: `${poi.badge} ${poi.label}`,
                          color: poi.color,
                        })
                      }
                    >
                      追跡
                    </button>
                  </div>
                );
              })}

            {sideTab === "pins" && (
              <>
                {pins.length === 0 && (
                  <div className="wb-mmo-card" style={{ opacity: 0.7 }}>
                    左のマップ上の任意の地点をクリックするとピンを設置・追跡できます。
                  </div>
                )}
                {pins.map((p) => {
                  const same = p.space === snap.space;
                  const dist = same
                    ? `${Math.round(Math.hypot(p.x - snap.playerX, p.y - snap.playerY))}m`
                    : p.space;
                  return (
                    <div
                      key={p.id}
                      className="wb-mmo-card"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>
                          {p.icon} {p.label}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                          ({p.x}, {p.y}) ・ {dist}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          type="button"
                          style={chipBtn(true)}
                          onClick={() =>
                            onTrackTarget({
                              kind: "pin",
                              space: p.space,
                              x: p.x,
                              y: p.y,
                              label: `${p.icon} ${p.label}`,
                              color: p.color,
                              pinId: p.id,
                            })
                          }
                        >
                          追跡
                        </button>
                        <button
                          type="button"
                          style={chipBtn(false)}
                          onClick={() => onDeletePin(p.id)}
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {sideTab === "players" && (
              <>
                {visiblePlayers.length === 0 && (
                  <div className="wb-mmo-card" style={{ opacity: 0.7 }}>
                    同じエリア内に他のオンラインプレイヤーはいません。
                  </div>
                )}
                {visiblePlayers.map((pl) => {
                  const dist = Math.round(Math.hypot(pl.x - snap.playerX, pl.y - snap.playerY));
                  return (
                    <div
                      key={pl.id}
                      className="wb-mmo-card"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{pl.name}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                          現在位置 ({Math.round(pl.x)}, {Math.round(pl.y)}) ・ {dist}m
                        </div>
                      </div>
                      <button
                        type="button"
                        style={chipBtn(true)}
                        onClick={() =>
                          onTrackTarget({
                            kind: "player",
                            presenceId: pl.id,
                            label: `🏃 ${pl.name}`,
                            color: "#4ade80",
                          })
                        }
                      >
                        リアルタイム追跡
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
