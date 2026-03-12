import { NextResponse } from "next/server";
import { getCurrentSession } from "@/app/api/_lib/auth";
import { createScenarioPack, listScenarioPackSummaries } from "@/db/queries";
import { z } from "zod";

const CreatePackSchema = z.object({
  slug: z.string().min(3).max(64),
  name: z.string().min(3).max(80),
  description: z.string().max(240).optional(),
});

export async function GET(request: Request) {
  const session = await getCurrentSession(request);
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const packs = await listScenarioPackSummaries();
  return NextResponse.json({ packs });
}

export async function POST(request: Request) {
  const session = await getCurrentSession(request);
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const body = CreatePackSchema.parse(await request.json());
    await createScenarioPack({
      id: crypto.randomUUID(),
      slug: body.slug.trim(),
      name: body.name.trim(),
      description: body.description?.trim(),
      createdBy: session.userId,
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: "create_pack_failed", detail: String(error?.message ?? error) }, { status: 400 });
  }
}
