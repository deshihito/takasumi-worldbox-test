import { NextResponse } from "next/server";
import { getRequestSession, isSameOriginRequest, sessionOwnerKey } from "@/lib/auth";
import { withUserLock } from "@/lib/worldbox/core/user-lock";
import { getMmoBalance, spendMmoCoins } from "@/lib/worldbox/economy/mmo-wallet";
import { payoutUserChunked } from "@/lib/worldbox/economy/settlement";
import { loadProfile, storeProfile } from "@/lib/worldbox/player/profile-online";
import { loadAllCompanies } from "@/lib/worldbox/social/company-online";
import { sanitizePostBody, type MetroSnsPost } from "@/lib/worldbox/social/metro-sns";
import { loadSnsPosts, storeSnsPosts } from "@/lib/worldbox/social/metro-sns-online";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function err(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export async function GET(request: Request) {
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);
  const ownerKey = sessionOwnerKey(session);

  const [posts, companies, balance] = await Promise.all([
    loadSnsPosts(),
    loadAllCompanies(),
    getMmoBalance(session, ownerKey),
  ]);

  const recruitingCompanies = companies
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      ticker: c.ipo?.ticker ?? null,
      memberCount: c.members.length,
      salary: c.salary,
      assets: c.assets,
    }))
    .slice(0, 15);

  return NextResponse.json(
    {
      selfKey: ownerKey,
      posts,
      recruitingCompanies,
      balance,
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return err("forbidden", 403);
  const session = getRequestSession(request);
  if (!session) return err("unauthorized", 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return err("invalid_request", 400);
  }

  const ownerKey = sessionOwnerKey(session);
  const displayName = (session.username || "市民").slice(0, 24);
  const action = body.action;

  return withUserLock("sns:global", async () => {
    const now = Date.now();
    const posts = await loadSnsPosts();

    if (action === "post") {
      const text = sanitizePostBody(body.body);
      if (!text) return err("empty_body", 400);
      const tag: MetroSnsPost["tag"] =
        body.tag === "経済" || body.tag === "求む" || body.tag === "事件" || body.tag === "募集"
          ? body.tag
          : "日常";
      const next: MetroSnsPost = {
        id: `sns_${now}_${Math.floor(Math.random() * 9999)}`,
        authorKey: ownerKey,
        authorName: displayName,
        tag,
        body: text,
        likes: [],
        tipsTotal: 0,
        createdAt: now,
      };
      const updated = [next, ...posts].slice(0, 60);
      await storeSnsPosts(updated);
      return NextResponse.json({ ok: true, posts: updated }, { headers: NO_STORE });
    }

    const postId = typeof body.postId === "string" ? body.postId : "";
    const idx = posts.findIndex((p) => p.id === postId);
    if (idx < 0) return err("post_not_found", 404);
    const target = posts[idx];

    if (action === "like") {
      const liked = target.likes.includes(ownerKey);
      const nextLikes = liked
        ? target.likes.filter((k) => k !== ownerKey)
        : [...target.likes, ownerKey];
      const next = [...posts];
      next[idx] = { ...target, likes: nextLikes };
      await storeSnsPosts(next);
      return NextResponse.json({ ok: true, posts: next }, { headers: NO_STORE });
    }

    if (action === "tip") {
      if (target.authorKey === ownerKey) return err("cannot_tip_self", 409);
      const amount =
        typeof body.amount === "number" && Number.isFinite(body.amount)
          ? Math.max(50, Math.min(50_000, Math.floor(body.amount)))
          : 100;
      const paid = await spendMmoCoins(session, ownerKey, amount, "p2p_transfer", "p2p_trade");
      if (!paid.ok) return err(paid.error, 409);

      if (target.authorKey.startsWith("discord:")) {
        await payoutUserChunked(
          target.authorKey,
          target.authorKey.slice(8),
          amount,
          "p2p_transfer",
        );
      } else {
        const authorProf = await loadProfile(target.authorKey);
        if (authorProf) {
          await storeProfile(target.authorKey, {
            ...authorProf,
            coins: Math.min(100_000_000, authorProf.coins + amount),
          });
        }
      }

      const next = [...posts];
      next[idx] = { ...target, tipsTotal: target.tipsTotal + amount };
      await storeSnsPosts(next);
      return NextResponse.json(
        { ok: true, posts: next, balance: paid.balance },
        { headers: NO_STORE },
      );
    }

    return err("invalid_action", 400);
  });
}
