import { NextResponse } from "next/server";
import { getRequestSession, isSameOriginRequest, sessionOwnerKey } from "@/lib/auth";
import { buildEconomyOp } from "@/lib/worldbox/economy/economy-bridge";
import {
  isEconomyEnabled,
  loadMyEconomyOps,
  readUserBalance,
  submitEconomyOp,
  waitForOpDone,
} from "@/lib/worldbox/economy/economy-bridge-online";
import { loadMyLobbyStation } from "@/lib/worldbox/world/station-online";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function sameOrigin(request: Request) {
  return isSameOriginRequest(request);
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

function economySession(request: Request) {
  const session = getRequestSession(request);
  if (!session) return { session: null, status: 401 as const };
  if (session.provider !== "discord") return { session: null, status: 403 as const };
  return { session, status: 200 as const };
}

export async function GET(request: Request) {
  const { session, status } = economySession(request);
  if (!session) return errorResponse(status === 401 ? "unauthorized" : "discord_required", status);
  if (!isEconomyEnabled()) return errorResponse("economy_unavailable", 503);
  const userKey = sessionOwnerKey(session);
  const [balance, ops] = await Promise.all([
    readUserBalance(session.id),
    loadMyEconomyOps(userKey),
  ]);
  if (balance === null) return errorResponse("economy_unavailable", 503);
  return NextResponse.json({ balance, ops }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorResponse("forbidden", 403);
  const { session, status } = economySession(request);
  if (!session) return errorResponse(status === 401 ? "unauthorized" : "discord_required", status);
  if (!isEconomyEnabled()) return errorResponse("economy_unavailable", 503);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_request", 400);
  }
  const fields = (body ?? {}) as { action?: unknown; toDiscordId?: unknown; amount?: unknown };
  if (fields.action !== "transfer") return errorResponse("invalid_action", 400);
  const op = buildEconomyOp(
    {
      kind: "transfer",
      userKey: sessionOwnerKey(session),
      discordId: session.id,
      amount: fields.amount,
      reason: "transfer",
      toDiscordId: fields.toDiscordId,
    },
    crypto.randomUUID(),
    Date.now(),
  );
  if (!op) {
    if (typeof fields.toDiscordId !== "string" || !/^\d{5,25}$/.test(fields.toDiscordId)) {
      return errorResponse("invalid_recipient", 400);
    }
    if (fields.toDiscordId === session.id) return errorResponse("self_transfer", 400);
    return errorResponse("invalid_amount", 400);
  }
  if ((await loadMyLobbyStation(sessionOwnerKey(session))) !== "bank") {
    return errorResponse("not_at_bank", 409);
  }
  const userKey = sessionOwnerKey(session);
  const submitted = await submitEconomyOp(op, { freshId: true });
  if (submitted.state === "unavailable") return errorResponse("economy_failed", 500);
  const finalOp =
    submitted.state === "pending"
      ? ((await waitForOpDone(userKey, op.id)) ?? submitted.op)
      : submitted.op;
  if (finalOp.status !== "pending") {
    const balance =
      submitted.state !== "pending" && submitted.newBalance !== undefined
        ? submitted.newBalance
        : await readUserBalance(session.id);
    return NextResponse.json(
      { ok: true, op: finalOp, ...(balance !== null ? { balance } : {}) },
      { headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true, op: finalOp }, { headers: NO_STORE });
}
