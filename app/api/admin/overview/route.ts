import { NextResponse } from "next/server";
import { getCurrentSession } from "@/app/api/_lib/auth";

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession(request);

    if (!session) {
      return NextResponse.json({ user: null, admin: null });
    }

    if (session.role !== "admin") {
      return NextResponse.json({
        user: {
          id: session.userId,
          email: session.email,
          username: session.username,
          role: session.role,
        },
        admin: null,
      });
    }

    return NextResponse.json({
      user: {
        id: session.userId,
        email: session.email,
        username: session.username,
        role: session.role,
      },
      admin: [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: "admin_overview_failed", detail: String(error?.message ?? error) }, { status: 500 });
  }
}
