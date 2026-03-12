import { NextResponse } from "next/server";
import { getCurrentSession } from "@/app/api/_lib/auth";
import { getScenarioPackById, listScenariosForPack, updateScenarioPack } from "@/db/queries";
import { z } from "zod";

const UpdatePackSchema = z.object({
  slug: z.string().min(3).max(64),
  name: z.string().min(3).max(80),
  description: z.string().max(240).optional(),
});

export async function GET(request: Request, context: { params: Promise<{ packId: string }> }) {
  const session = await getCurrentSession(request);
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const { packId } = await context.params;
    const { searchParams } = new URL(request.url);
    const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const query = searchParams.get("q")?.trim() ?? "";
    const pack = await getScenarioPackById(packId);
    if (!pack) {
      return NextResponse.json({ error: "not_found", detail: "Scenario pack not found." }, { status: 404 });
    }

    const scenarios = await listScenariosForPack(packId, {
      page,
      query,
    });
    return NextResponse.json({
      pack: {
        ...pack,
        scenarios: scenarios.items,
        scenarioPagination: {
          page: scenarios.page,
          pageSize: scenarios.pageSize,
          total: scenarios.total,
          totalPages: scenarios.totalPages,
          hasMore: scenarios.hasMore,
          query: scenarios.query,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "pack_details_failed", detail: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ packId: string }> }) {
  const session = await getCurrentSession(request);
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const { packId } = await context.params;
    const body = UpdatePackSchema.parse(await request.json());
    await updateScenarioPack(packId, {
      slug: body.slug.trim(),
      name: body.name.trim(),
      description: body.description?.trim(),
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const detail = String(error?.message ?? error);
    const status = detail === "Scenario pack not found." ? 404 : 400;
    return NextResponse.json({ error: "update_pack_failed", detail }, { status });
  }
}
