import { isBotApiConfigured, kvGet, kvList, kvSet } from "../../bot-api";
import { parseContract, type CitizenContract } from "./contracts";

export const WORLDBOX_CONTRACTS_NAMESPACE = "worldbox_contracts";

export function isContractsEnabled(): boolean {
  return isBotApiConfigured();
}

export async function loadContract(id: string): Promise<CitizenContract | null> {
  if (!isBotApiConfigured()) return null;
  try {
    const raw = await kvGet(WORLDBOX_CONTRACTS_NAMESPACE, `ctr:${id}`);
    return parseContract(raw);
  } catch {
    return null;
  }
}

export async function storeContract(contract: CitizenContract): Promise<boolean> {
  if (!isBotApiConfigured()) return false;
  try {
    await kvSet(WORLDBOX_CONTRACTS_NAMESPACE, `ctr:${contract.id}`, JSON.stringify(contract));
    return true;
  } catch {
    return false;
  }
}

export async function listAllContracts(): Promise<CitizenContract[]> {
  if (!isBotApiConfigured()) return [];
  try {
    const rows = await kvList(WORLDBOX_CONTRACTS_NAMESPACE);
    const out: CitizenContract[] = [];
    for (const [k, raw] of rows) {
      if (!k.startsWith("ctr:")) continue;
      const c = parseContract(raw);
      if (c) out.push(c);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, 60);
  } catch {
    return [];
  }
}
