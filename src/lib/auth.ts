import crypto from "node:crypto";
import { DEPLOY_CONFIG } from "./deploy-config";
import { effectiveHost } from "./subdomain";

export const SESSION_COOKIE = "taka_session";
export const OAUTH_STATE_COOKIE = "taka_discord_oauth_state";
export const GOOGLE_STATE_COOKIE = "taka_google_oauth_state";
export const OAUTH_NEXT_COOKIE = "taka_oauth_next";

const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export type AuthProvider = "discord" | "google" | "guest";

type SessionPayload = {
  id: string;
  username: string;
  expiresAt: number;
  sid?: string;
  avatar?: string | null;
  provider?: AuthProvider;
};

export type DiscordUser = Pick<SessionPayload, "id" | "username"> & {
  avatar?: string | null;
  provider?: AuthProvider;
};

export type SessionInfo = DiscordUser & { sid?: string; provider: AuthProvider };

export function sessionOwnerKey(info: { provider: AuthProvider; id: string }): string {
  return `${info.provider}:${info.id}`;
}

export function discordClientId() {
  return process.env.DISCORD_CLIENT_ID || DEPLOY_CONFIG.discordClientId || "";
}

export function discordClientSecret() {
  return process.env.DISCORD_CLIENT_SECRET || DEPLOY_CONFIG.discordClientSecret || "";
}

export function discordRedirectUri() {
  return process.env.DISCORD_REDIRECT_URI || DEPLOY_CONFIG.discordRedirectUri || "";
}

export function sessionSecret() {
  return (
    process.env.DISCORD_SESSION_SECRET ||
    process.env.DISCORD_CLIENT_SECRET ||
    DEPLOY_CONFIG.discordClientSecret ||
    ""
  );
}

const GUEST_SESSION_FALLBACK_SECRET = "taka-worldbox-guest-session-fallback";

function signWith(secret: string, value: string) {
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function safelyEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function isDiscordConfigured() {
  return Boolean(discordClientId() && discordClientSecret() && discordRedirectUri());
}

export function isGoogleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI,
  );
}

export function createSession(user: DiscordUser, sid?: string) {
  const payload: SessionPayload = {
    id: user.id,
    username: user.username.slice(0, 80),
    expiresAt: Date.now() + SESSION_MAX_AGE * 1000,
    ...(sid ? { sid } : {}),
    ...(user.avatar !== undefined ? { avatar: user.avatar } : {}),
    ...(user.provider ? { provider: user.provider } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret =
    sessionSecret() || (user.provider === "guest" ? GUEST_SESSION_FALLBACK_SECRET : "");
  const signature = signWith(secret, encoded);
  if (!signature) throw new Error("session secret is not configured");
  return `${encoded}.${signature}`;
}

export function readSession(value?: string): DiscordUser | null {
  const info = readSessionInfo(value);
  return info
    ? { id: info.id, username: info.username, avatar: info.avatar ?? null, provider: info.provider }
    : null;
}

const GUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readSessionInfo(value?: string): SessionInfo | null {
  if (!value) return null;
  const [encoded, signature, ...rest] = value.split(".");
  if (!encoded || !signature || rest.length > 0) return null;

  let payload: Partial<SessionPayload>;
  try {
    payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
  } catch {
    return null;
  }
  const candidates =
    payload.provider === "guest"
      ? [sessionSecret(), GUEST_SESSION_FALLBACK_SECRET]
      : [sessionSecret()];
  if (!candidates.some((secret) => secret && safelyEqual(signature, signWith(secret, encoded))))
    return null;

  try {
    const provider: AuthProvider =
      payload.provider === "google" ? "google" : payload.provider === "guest" ? "guest" : "discord";
    const idOk =
      typeof payload.id === "string" &&
      (provider === "guest" ? GUEST_ID_RE.test(payload.id) : /^\d+$/.test(payload.id));
    if (!idOk) return null;
    if (typeof payload.username !== "string" || !payload.username.trim()) return null;
    if (typeof payload.expiresAt !== "number" || payload.expiresAt <= Date.now()) return null;
    const sid =
      typeof payload.sid === "string" && /^[0-9a-f]{64}$/.test(payload.sid)
        ? payload.sid
        : undefined;
    const avatar = typeof payload.avatar === "string" && payload.avatar ? payload.avatar : null;
    return {
      id: payload.id as string,
      username: payload.username,
      avatar,
      provider,
      ...(sid ? { sid } : {}),
    };
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string) {
  const value = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
  return value ? decodeURIComponent(value) : undefined;
}

function discordAvatarUrl(userId: string, avatarHash: string | null): string {
  if (avatarHash) {
    const ext = avatarHash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=64`;
  }
  let index = 0;
  try {
    index = Number((BigInt(userId) >> 22n) % 6n);
  } catch {
    index = 0;
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export function sessionAvatarUrl(session: SessionInfo): string | null {
  const avatar = session.avatar ?? null;
  if (avatar && avatar.startsWith("http")) return avatar;
  if (session.provider === "google" || session.provider === "guest") return null;
  return discordAvatarUrl(session.id, avatar);
}

export function getRequestSession(request: Request) {
  return readSessionInfo(readCookie(request, SESSION_COOKIE));
}

export function publicOrigin(request: Request): string {
  const redirectUri = discordRedirectUri();
  if (redirectUri) {
    try {
      return new URL(redirectUri).origin;
    } catch {
      // 設定がURLとして不正なら request.url にフォールバックする
    }
  }
  return new URL(request.url).origin;
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    const fetchSite = request.headers.get("sec-fetch-site");
    return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
  }
  if (origin === publicOrigin(request)) return true;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) {
    try {
      if (origin === new URL(siteUrl).origin) return true;
    } catch {
      // NEXT_PUBLIC_SITE_URL が不正でもリクエストオリジン照合へ進める
    }
  }
  try {
    const url = new URL(request.url);
    const host = effectiveHost(request.headers.get("x-forwarded-host"), url.host);
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      url.protocol.replace(/:$/, "");
    return origin === `${proto}://${host}`;
  } catch {
    return false;
  }
}

function isSecureRequest(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwardedProto === "https" || new URL(request.url).protocol === "https:";
}

export function sessionCookieOptions(request: Request, maxAge = SESSION_MAX_AGE) {
  const secure = isSecureRequest(request);
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    path: "/",
    maxAge,
  };
}

export function stateCookieOptions(request: Request, maxAge = 600) {
  return {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function resolveOAuthNext(
  value: string | null | undefined,
  fallback = "/games/worldbox",
): string {
  if (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/\s/.test(value)
  ) {
    return value;
  }
  return fallback;
}

export function canonicalAuthorizeRedirect(
  request: Request,
  pathname: string,
  redirectUri: string | undefined,
): string | null {
  if (!redirectUri) return null;
  let canonical: URL;
  try {
    canonical = new URL(redirectUri);
  } catch {
    return null;
  }
  const url = new URL(request.url);
  const host = effectiveHost(request.headers.get("x-forwarded-host"), url.hostname);
  if (host === canonical.host) return null;
  return `${canonical.origin}${pathname}${url.search}`;
}
