"use client";
import type { ComponentType } from "react";
import { ARCADE_GAMES } from "@/lib/worldbox/activity/arcade";
import MiniArcadeGame from "./arcade/MiniArcadeGame";

export const ARCADE_CLIENTS: Record<string, ComponentType> = Object.fromEntries(
  ARCADE_GAMES.map((entry) => [
    entry.id,
    function ArcadeCabinetMount() {
      return <MiniArcadeGame gameId={entry.id} />;
    },
  ]),
);

export function arcadeClientFor(gameId: string): ComponentType | null {
  return ARCADE_CLIENTS[gameId] ?? null;
}
