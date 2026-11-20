import { NextResponse } from "next/server";
import { getRequestSession, isSameOriginRequest, sessionOwnerKey } from "@/lib/auth";
import { withUserLock } from "@/lib/worldbox/core/user-lock";
import { itemById } from "@/lib/worldbox/economy/items";
import { awardMmoCoins, getMmoBalance, spendMmoCoins } from "@/lib/worldbox/economy/mmo-wallet";
import { payoutUserChunked } from "@/lib/worldbox/economy/settlement";
import { addItem } from "@/lib/worldbox/player/profile";
import { loadProfile, storeProfile } from "@/lib/worldbox/player/profile-online";
import { pushMmoNews } from "@/lib/worldbox/social/mmo-events-online";
import {
  canFulfillItemContract,
  MAX_OPEN_CONTRACTS_PER_PLAYER,
  type CitizenContract,
  type ContractCategory,
} from "@/lib/worldbox/social/contracts";
import {
  isContractsEnabled,
  listAllContracts,
  loadContract,
  storeContract,
} from "@/lib/worldbox/social/contracts-online";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function err(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

function sanitizeText(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLen);
}

async function refundKey(targetKey: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  if (targetKey.startsWith("discord:")) {
    await payoutUserChunked(targetKey, targetKey.slice(8), amount, "contract_refund");
    return;
  }
  const prof = await loadProfile(targetKey);
  if (prof) {
    await storeProfile(targetKey, {
      ...prof,
      coins: Math.min(100_000_000, prof.coins + amount),
    });
  }
}

export async function GET(request: Request) {
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (!isContractsEnabled()) return err("contracts_unavailable", 503);

  const ownerKey = sessionOwnerKey(session);
  const [contracts, balance, profile] = await Promise.all([
    listAllContracts(),
    getMmoBalance(session, ownerKey),
    loadProfile(ownerKey),
  ]);

  return NextResponse.json(
    {
      selfKey: ownerKey,
      contracts,
      balance,
      inventory: profile.items,
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return err("forbidden", 403);
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  if (!isContractsEnabled()) return err("contracts_unavailable", 503);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return err("invalid_request", 400);
  }

  const ownerKey = sessionOwnerKey(session);
  const displayName = (session.username || "市民").slice(0, 24);
  const action = body.action;

  return withUserLock("contracts:global", async () => {
    const now = Date.now();

    if (action === "create") {
      const all = await listAllContracts();
      const myOpen = all.filter(
        (c) => c.posterKey === ownerKey && (c.status === "open" || c.status === "claimed"),
      );
      if (myOpen.length >= MAX_OPEN_CONTRACTS_PER_PLAYER) {
        return err("too_many_open_contracts", 409);
      }

      const category: ContractCategory =
        body.category === "craft_machine" ||
        body.category === "legal_bail" ||
        body.category === "bounty"
          ? body.category
          : "delivery";
      const title = sanitizeText(body.title, 48);
      if (!title) return err("invalid_title", 400);
      const desc = sanitizeText(body.desc, 120);
      const itemDef = typeof body.itemId === "string" && body.itemId ? itemById(body.itemId) : null;
      const itemCount =
        itemDef && typeof body.itemCount === "number" && Number.isFinite(body.itemCount)
          ? Math.max(1, Math.min(99, Math.floor(body.itemCount)))
          : itemDef
            ? 1
            : 0;
      const rewardCoins =
        typeof body.rewardCoins === "number" && Number.isFinite(body.rewardCoins)
          ? Math.max(100, Math.min(2_000_000, Math.floor(body.rewardCoins)))
          : 500;

      const escrowed = await spendMmoCoins(
        session,
        ownerKey,
        rewardCoins,
        "contract_reward",
        "contract_refund",
      );
      if (!escrowed.ok) return err(escrowed.error, 409);

      const contract: CitizenContract = {
        id: `ctr_${now}_${Math.floor(Math.random() * 9999)}`,
        category,
        title,
        desc,
        posterKey: ownerKey,
        posterName: displayName,
        assigneeKey: null,
        assigneeName: null,
        itemId: itemDef ? itemDef.id : null,
        itemCount,
        rewardCoins,
        status: "open",
        createdAt: now,
      };
      await storeContract(contract);
      void pushMmoNews(
        "job",
        `[契約募集] ${displayName}「${title}」（報酬 ¥${rewardCoins.toLocaleString()}）`,
        now,
      );

      return NextResponse.json(
        { ok: true, contract, balance: escrowed.balance },
        { headers: NO_STORE },
      );
    }

    const contractId = typeof body.contractId === "string" ? body.contractId : "";
    if (!contractId) return err("missing_contract_id", 400);
    const contract = await loadContract(contractId);
    if (!contract) return err("contract_not_found", 404);

    if (action === "claim") {
      if (contract.status !== "open") return err("not_open", 409);
      if (contract.posterKey === ownerKey) return err("cannot_claim_own", 409);
      const updated: CitizenContract = {
        ...contract,
        assigneeKey: ownerKey,
        assigneeName: displayName,
        status: "claimed",
      };
      await storeContract(updated);
      return NextResponse.json({ ok: true, contract: updated }, { headers: NO_STORE });
    }

    if (action === "complete") {
      if (contract.posterKey === ownerKey) return err("cannot_complete_own", 409);
      if (
        contract.status !== "open" &&
        !(contract.status === "claimed" && contract.assigneeKey === ownerKey)
      ) {
        return err("not_claimable", 409);
      }

      const actorProfile = await loadProfile(ownerKey);
      const itemCheck = canFulfillItemContract(contract, actorProfile);
      if (!itemCheck.ok) return err(itemCheck.error, 409);

      if (contract.itemId && contract.itemCount > 0) {
        const posterProfile = await loadProfile(contract.posterKey);
        await storeProfile(ownerKey, itemCheck.nextProfile);
        await storeProfile(
          contract.posterKey,
          addItem(posterProfile, contract.itemId, contract.itemCount),
        );
      }

      const paid = await awardMmoCoins(session, ownerKey, contract.rewardCoins, "contract_reward");
      if (!paid.ok) return err(paid.error, 503);

      const completed: CitizenContract = {
        ...contract,
        assigneeKey: ownerKey,
        assigneeName: displayName,
        status: "completed",
      };
      await storeContract(completed);
      void pushMmoNews(
        "job",
        `[契約達成] ${displayName} が「${contract.title}」を納品し ¥${contract.rewardCoins.toLocaleString()} を獲得`,
        now,
      );

      return NextResponse.json(
        {
          ok: true,
          contract: completed,
          profile: itemCheck.nextProfile,
          balance: paid.balance,
        },
        { headers: NO_STORE },
      );
    }

    if (action === "cancel") {
      if (contract.posterKey !== ownerKey) return err("not_poster", 403);
      if (contract.status !== "open") return err("already_in_progress", 409);
      await storeContract({ ...contract, status: "cancelled" });
      await refundKey(ownerKey, contract.rewardCoins);
      return NextResponse.json(
        { ok: true, balance: await getMmoBalance(session, ownerKey) },
        { headers: NO_STORE },
      );
    }

    return err("invalid_action", 400);
  });
}
