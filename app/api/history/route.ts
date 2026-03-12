import { NextResponse } from "next/server";
import { getCurrentSession } from "@/app/api/_lib/auth";
import { getUserHistoryPage } from "@/db/queries";

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession(request);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const history = await getUserHistoryPage(session.userId, page);
    return NextResponse.json(history);
  } catch (error: any) {
    return NextResponse.json({ error: "history_failed", detail: String(error?.message ?? error) }, { status: 500 });
  }
}
