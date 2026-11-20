import { isBotApiConfigured, kvGet, kvList, kvSet } from "../../bot-api";
import {
  parsePropertyDeed,
  type ApartmentOwnership,
  type ApartmentTierId,
  type PropertyDeed,
} from "./realestate";

export const WORLDBOX_REALESTATE_NAMESPACE = "worldbox_realestate";

export function isRealEstateEnabled(): boolean {
  return isBotApiConfigured();
}

export async function loadPropertyDeed(chunkKey: string): Promise<PropertyDeed | null> {
  if (!isBotApiConfigured()) return null;
  try {
    const raw = await kvGet(WORLDBOX_REALESTATE_NAMESPACE, `deed:${chunkKey}`);
    return parsePropertyDeed(raw);
  } catch {
    return null;
  }
}

export async function storePropertyDeed(deed: PropertyDeed): Promise<boolean> {
  if (!isBotApiConfigured()) return false;
  try {
    await kvSet(WORLDBOX_REALESTATE_NAMESPACE, `deed:${deed.chunkKey}`, JSON.stringify(deed));
    return true;
  } catch {
    return false;
  }
}

export async function listAllPropertyDeeds(): Promise<PropertyDeed[]> {
  if (!isBotApiConfigured()) return [];
  try {
    const rows = await kvList(WORLDBOX_REALESTATE_NAMESPACE);
    const out: PropertyDeed[] = [];
    for (const [k, raw] of rows) {
      if (!k.startsWith("deed:")) continue;
      const d = parsePropertyDeed(raw);
      if (d) out.push(d);
    }
    return out;
  } catch {
    return [];
  }
}

function parseApartment(raw: unknown): ApartmentOwnership | null {
  let d = raw;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      return null;
    }
  }
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const v = d as Record<string, unknown>;
  if (typeof v.unitId !== "string" || typeof v.ownerKey !== "string") return null;
  const tier: ApartmentTierId =
    v.tier === "penthouse" || v.tier === "commercial_office" ? v.tier : "studio";
  return {
    unitId: v.unitId,
    tier,
    ownerKey: v.ownerKey,
    ownerName: typeof v.ownerName === "string" ? v.ownerName : "オーナー",
    purchasedAt: typeof v.purchasedAt === "number" ? v.purchasedAt : 0,
    lastIncomeAt: typeof v.lastIncomeAt === "number" ? v.lastIncomeAt : 0,
  };
}

export async function loadApartment(unitId: string): Promise<ApartmentOwnership | null> {
  if (!isBotApiConfigured()) return null;
  try {
    const raw = await kvGet(WORLDBOX_REALESTATE_NAMESPACE, `apt:${unitId}`);
    return parseApartment(raw);
  } catch {
    return null;
  }
}

export async function storeApartment(apt: ApartmentOwnership): Promise<boolean> {
  if (!isBotApiConfigured()) return false;
  try {
    await kvSet(WORLDBOX_REALESTATE_NAMESPACE, `apt:${apt.unitId}`, JSON.stringify(apt));
    return true;
  } catch {
    return false;
  }
}

export async function listAllApartments(): Promise<ApartmentOwnership[]> {
  if (!isBotApiConfigured()) return [];
  try {
    const rows = await kvList(WORLDBOX_REALESTATE_NAMESPACE);
    const out: ApartmentOwnership[] = [];
    for (const [k, raw] of rows) {
      if (!k.startsWith("apt:")) continue;
      const a = parseApartment(raw);
      if (a) out.push(a);
    }
    return out;
  } catch {
    return [];
  }
}
