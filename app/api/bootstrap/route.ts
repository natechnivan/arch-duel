import { NextResponse } from "next/server";
import { getCurrentSession } from "@/app/api/_lib/auth";
import { listActiveTopics } from "@/db/queries";

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession(request);
    const topics = await listActiveTopics();

    return NextResponse.json({
      user: session
        ? {
            id: session.userId,
            email: session.email,
            username: session.username,
            role: session.role,
          }
        : null,
      topics,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "bootstrap_failed", detail: String(error?.message ?? error) }, { status: 500 });
  }
}
