import { NextResponse } from "next/server";
import { getCurrentSession } from "@/app/api/_lib/auth";
import { getLeaderboard, getUserDashboard, listActiveTopics, listScenarioPacksWithScenarios } from "@/db/queries";

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession(request);
    const topics = await listActiveTopics();
    const leaderboard = await getLeaderboard(10);
    const stats = session ? await getUserDashboard(session.userId) : null;
    const admin = session?.role === "admin" ? await listScenarioPacksWithScenarios() : null;

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
      leaderboard,
      stats,
      admin,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "dashboard_failed", detail: String(error?.message ?? error) }, { status: 500 });
  }
}
