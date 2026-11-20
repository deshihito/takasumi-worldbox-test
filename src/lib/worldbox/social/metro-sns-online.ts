import { isBotApiConfigured, kvGet, kvSet } from "../../bot-api";
import { parseSnsPost, type MetroSnsPost } from "./metro-sns";

const SNS_NAMESPACE = "worldbox_metro_sns";
const SNS_KEY = "timeline_v1";

export async function loadSnsPosts(): Promise<MetroSnsPost[]> {
  if (!isBotApiConfigured()) return [];
  try {
    const raw = await kvGet(SNS_NAMESPACE, SNS_KEY);
    if (!raw) return [];
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr.map(parseSnsPost).filter((p): p is MetroSnsPost => p !== null);
  } catch {
    return [];
  }
}

export async function storeSnsPosts(posts: readonly MetroSnsPost[]): Promise<boolean> {
  if (!isBotApiConfigured()) return false;
  try {
    await kvSet(SNS_NAMESPACE, SNS_KEY, JSON.stringify(posts.slice(0, 40)));
    return true;
  } catch {
    return false;
  }
}
