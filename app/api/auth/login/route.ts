import { NextResponse } from "next/server";
import { createSession, getUserByEmail } from "@/db/queries";
import { createSessionToken, getSessionCookieConfig, getSessionExpiryDate, hashSessionToken, verifyPassword } from "@/app/api/_lib/auth";
import { z } from "zod";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  try {
    const body = LoginSchema.parse(await request.json());
    const email = body.email.trim().toLowerCase();
    const user = await getUserByEmail(email);

    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return NextResponse.json({ error: "login_failed", detail: "Invalid email or password." }, { status: 401 });
    }

    const sessionToken = createSessionToken();
    const expiresAt = getSessionExpiryDate();
    await createSession({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt,
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    });
    response.cookies.set({ ...getSessionCookieConfig(expiresAt), value: sessionToken });
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: "login_failed", detail: String(error?.message ?? error) }, { status: 400 });
  }
}
