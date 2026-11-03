import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mock-auth session token: `<userId>.<expiresMs>.<hmac>`.
 * This is NOT production authentication — it exists so the demo has real
 * per-user, per-organisation boundaries. Replace with SSO/OIDC before any pilot.
 */
const DEV_FALLBACK_SECRET = "svara-local-demo-secret-change-me";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production builds.");
  }
  return s ?? DEV_FALLBACK_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now + SESSION_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(
  token: string | undefined,
  now = Date.now(),
): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, signature] = parts;
  const expected = sign(`${userId}.${expires}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (!/^\d+$/.test(expires) || Number(expires) < now) return null;
  return userId;
}

export const SESSION_COOKIE = "svara_session";
