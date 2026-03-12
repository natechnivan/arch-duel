import { NextResponse } from "next/server";
import { createSession, createUser, getUserByEmail } from "@/db/queries";
import {
  createSessionToken,
  getSessionCookieConfig,
  getSessionExpiryDate,
  hashPassword,
  hashSessionToken,
  isAdminEmail,
} from "@/app/api/_lib/auth";
import { z } from "zod";

const RegisterSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  try {
    const body = RegisterSchema.parse(await request.json());
    const email = body.email.trim().toLowerCase();
    const username = body.username.trim();

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return NextResponse.json({ error: "register_failed", detail: "Email is already registered." }, { status: 409 });
    }

    // Admin privileges are granted through explicit configuration, not registration order.
    const role = isAdminEmail(email) ? "admin" : "player";
    const userId = crypto.randomUUID();
    await createUser({
      id: userId,
      email,
      username,
      passwordHash: hashPassword(body.password),
      role,
    });

    const sessionToken = createSessionToken();
    const expiresAt = getSessionExpiryDate();
    await createSession({
      id: crypto.randomUUID(),
      userId,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt,
    });

    const response = NextResponse.json({
      user: {
        id: userId,
        email,
        username,
        role,
      },
    });
    response.cookies.set({ ...getSessionCookieConfig(expiresAt), value: sessionToken });
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: "register_failed", detail: String(error?.message ?? error) }, { status: 400 });
  }
}
