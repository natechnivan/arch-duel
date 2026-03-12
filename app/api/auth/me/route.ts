import { NextResponse } from "next/server";
import { getCurrentSession } from "@/app/api/_lib/auth";

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession(request);
    if (!session) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        id: session.userId,
        email: session.email,
        username: session.username,
        role: session.role,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: "me_failed", detail: String(error?.message ?? error) }, { status: 500 });
  }
}
