import { itemById } from "../economy/items";
import { countItem, removeItem, type PlayerProfile } from "../player/profile";

export type ContractCategory = "delivery" | "craft_machine" | "legal_bail" | "bounty";
export type ContractStatus = "open" | "claimed" | "completed" | "cancelled";

export interface CitizenContract {
  id: string;
  category: ContractCategory;
  title: string;
  desc: string;
  posterKey: string;
  posterName: string;
  assigneeKey: string | null;
  assigneeName: string | null;
  itemId: string | null;
  itemCount: number;
  rewardCoins: number;
  status: ContractStatus;
  createdAt: number;
}

export const MAX_OPEN_CONTRACTS_PER_PLAYER = 5;

export function parseContract(raw: unknown): CitizenContract | null {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const v = data as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.posterKey !== "string" || typeof v.title !== "string") {
    return null;
  }
  const cat: ContractCategory =
    v.category === "craft_machine" || v.category === "legal_bail" || v.category === "bounty"
      ? v.category
      : "delivery";
  const status: ContractStatus =
    v.status === "claimed" || v.status === "completed" || v.status === "cancelled"
      ? v.status
      : "open";
  const itemDef = typeof v.itemId === "string" ? itemById(v.itemId) : null;
  const reward =
    typeof v.rewardCoins === "number" && Number.isFinite(v.rewardCoins)
      ? Math.max(100, Math.min(2_000_000, Math.floor(v.rewardCoins)))
      : 500;
  return {
    id: v.id,
    category: cat,
    title: v.title.slice(0, 48),
    desc: typeof v.desc === "string" ? v.desc.slice(0, 120) : "",
    posterKey: v.posterKey,
    posterName: typeof v.posterName === "string" ? v.posterName.slice(0, 24) : "市民",
    assigneeKey: typeof v.assigneeKey === "string" ? v.assigneeKey : null,
    assigneeName: typeof v.assigneeName === "string" ? v.assigneeName : null,
    itemId: itemDef ? itemDef.id : null,
    itemCount:
      itemDef && typeof v.itemCount === "number" && Number.isFinite(v.itemCount)
        ? Math.max(1, Math.min(99, Math.floor(v.itemCount)))
        : itemDef
          ? 1
          : 0,
    rewardCoins: reward,
    status,
    createdAt: typeof v.createdAt === "number" ? v.createdAt : 0,
  };
}

export function canFulfillItemContract(
  contract: CitizenContract,
  fulfillerProfile: PlayerProfile,
): { ok: true; nextProfile: PlayerProfile } | { ok: false; error: string } {
  if (!contract.itemId || contract.itemCount <= 0) {
    return { ok: true, nextProfile: fulfillerProfile };
  }
  if (countItem(fulfillerProfile, contract.itemId) < contract.itemCount) {
    return { ok: false, error: "not_enough_items" };
  }
  const next = removeItem(fulfillerProfile, contract.itemId, contract.itemCount);
  if (!next) return { ok: false, error: "not_enough_items" };
  return { ok: true, nextProfile: next };
}
