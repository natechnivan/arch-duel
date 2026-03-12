import { NextResponse } from "next/server";
import { getCurrentSession } from "@/app/api/_lib/auth";
import { seedDefaultScenarioPack } from "@/db/queries";

export async function POST(request: Request) {
  const session = await getCurrentSession(request);
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await seedDefaultScenarioPack(session.userId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: "seed_defaults_failed", detail: String(error?.message ?? error) }, { status: 400 });
  }
}
