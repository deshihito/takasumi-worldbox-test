export type DiscordIdentity = {
  id: string;
  name: string;
  avatarUrl: string;
};

const SNOWFLAKE = /^\d{1,30}$/;
const ROOM_CODE_PATTERN = /^[A-Z2-9]{6}$/;
const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function discordAvatarUrl(userId: string, avatarHash?: string | null): string {
  if (avatarHash) {
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=64`;
  }
  let index = 0;
  try {
    index = Number((BigInt(userId) >> 22n) % 6n);
  } catch {
    index = 0;
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export type DiscordUserLike = {
  id?: unknown;
  username?: unknown;
  global_name?: unknown;
  avatar?: unknown;
};

export function buildDiscordIdentity(
  user: DiscordUserLike | null | undefined,
): DiscordIdentity | null {
  if (!user || typeof user.id !== "string" || !SNOWFLAKE.test(user.id)) return null;
  const username = typeof user.username === "string" ? user.username.trim() : "";
  const globalName = typeof user.global_name === "string" ? user.global_name.trim() : "";
  let name = globalName.length >= 2 ? globalName : username;
  if (name.length > 24) name = name.slice(0, 24);
  if (name.length < 2) return null;
  const avatarHash = typeof user.avatar === "string" && user.avatar ? user.avatar : null;
  return { id: user.id, name, avatarUrl: discordAvatarUrl(user.id, avatarHash) };
}

export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

export function isGameSlug(raw: unknown): raw is string {
  return typeof raw === "string" && GAME_ID_PATTERN.test(raw);
}

export function shareCustomIdForRoom(gameId: string, code: string): string | null {
  const normalized = normalizeRoomCode(code);
  if (!normalized || !isGameSlug(gameId)) return null;
  return `room:${gameId}:${normalized}`;
}

export function roomFromShareCustomId(
  raw: string | null | undefined,
): { gameId: string; code: string } | null {
  if (typeof raw !== "string") return null;
  const parts = raw.split(":");
  if (parts.length !== 3 || parts[0] !== "room") return null;
  const code = normalizeRoomCode(parts[2]);
  if (!code || !isGameSlug(parts[1])) return null;
  return { gameId: parts[1], code };
}
