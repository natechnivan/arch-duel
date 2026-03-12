import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { getSessionByTokenHash } from "@/db/queries";

export const SESSION_COOKIE_NAME = "archduel_session";
const SESSION_TTL_DAYS = 30;

function base64Url(input: Buffer) {
  return input.toString("base64url");
}

// Password hashes stay in the database, while the browser only keeps an opaque session token.
export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${base64Url(salt)}:${base64Url(derived)}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [saltB64, hashB64] = storedHash.split(":");
  if (!saltB64 || !hashB64) {
    return false;
  }

  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(hashB64, "base64url");
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

export function createSessionToken() {
  return base64Url(randomBytes(32));
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getSessionExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + SESSION_TTL_DAYS);
  return expiresAt;
}

export function getSessionCookieConfig(expiresAt: Date) {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export function isAdminEmail(email: string) {
  const configured = process.env.ADMIN_EMAILS;
  if (!configured) {
    return false;
  }

  const allowed = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(email.trim().toLowerCase());
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  for (const segment of cookieHeader.split(";")) {
    const [key, ...rest] = segment.trim().split("=");
    if (key === name) {
      return rest.join("=") || null;
    }
  }

  return null;
}

export async function getCurrentSession(request: Request) {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (!token) {
    return null;
  }

  const session = await getSessionByTokenHash(hashSessionToken(token));
  if (!session) {
    return null;
  }

  if (new Date(session.expiresAt) < new Date()) {
    return null;
  }

  return session;
}
