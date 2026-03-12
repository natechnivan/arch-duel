import { NextResponse } from "next/server";
import { deleteSessionByTokenHash } from "@/db/queries";
import { SESSION_COOKIE_NAME, hashSessionToken } from "@/app/api/_lib/auth";

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

export async function POST(request: Request) {
  try {
    const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
    if (token) {
      await deleteSessionByTokenHash(hashSessionToken(token));
    }
  } catch {}

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
  return response;
}
