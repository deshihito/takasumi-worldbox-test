export interface MetroSnsPost {
  id: string;
  authorKey: string;
  authorName: string;
  tag: "経済" | "日常" | "求む" | "事件" | "募集";
  body: string;
  likes: string[]; // ownerKeys
  tipsTotal: number;
  createdAt: number;
}

export function sanitizePostBody(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 140);
}

export function parseSnsPost(raw: unknown): MetroSnsPost | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.authorKey !== "string" || typeof v.body !== "string") {
    return null;
  }
  const tag: MetroSnsPost["tag"] =
    v.tag === "経済" || v.tag === "求む" || v.tag === "事件" || v.tag === "募集" ? v.tag : "日常";
  return {
    id: v.id,
    authorKey: v.authorKey,
    authorName: typeof v.authorName === "string" ? v.authorName.slice(0, 24) : "市民",
    tag,
    body: v.body.slice(0, 140),
    likes: Array.isArray(v.likes) ? v.likes.map(String).slice(0, 100) : [],
    tipsTotal:
      typeof v.tipsTotal === "number" && Number.isFinite(v.tipsTotal)
        ? Math.max(0, Math.floor(v.tipsTotal))
        : 0,
    createdAt: typeof v.createdAt === "number" ? v.createdAt : 0,
  };
}
