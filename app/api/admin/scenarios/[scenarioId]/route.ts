import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/app/api/_lib/auth";
import { updateScenario } from "@/db/queries";
import { listScenarioTopics } from "@/app/api/_lib/scenarios";

const CANONICAL_TOPICS = listScenarioTopics();
const CANONICAL_TOPIC_SET = new Set(CANONICAL_TOPICS);

const UpdateScenarioSchema = z.object({
  slug: z.string().min(3).max(80),
  topic: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .refine((value) => CANONICAL_TOPIC_SET.has(value), {
      message: `Topic must be one of: ${CANONICAL_TOPICS.join(", ")}`,
    }),
  difficulty: z.enum(["junior", "mid", "senior", "staff"]),
  prompt: z.string().min(12).max(500),
});

function toAdminScenarioError(error: unknown) {
  const message = String((error as any)?.message ?? error);

  if (message.includes("Scenario not found")) {
    return message;
  }

  if (message.includes("duplicate key") || message.includes("unique constraint")) {
    return "A scenario with the same identifier already exists. Change the slug and try again.";
  }

  if (message.includes("Failed query: update \"scenarios\"")) {
    return "The scenario could not be updated because of a database constraint. Check the fields and try again.";
  }

  return message;
}

export async function PATCH(request: Request, context: { params: Promise<{ scenarioId: string }> }) {
  const session = await getCurrentSession(request);
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const { scenarioId } = await context.params;
    const body = UpdateScenarioSchema.parse(await request.json());
    await updateScenario(scenarioId, {
      slug: body.slug.trim(),
      topic: body.topic.trim(),
      difficulty: body.difficulty,
      prompt: body.prompt.trim(),
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const detail = toAdminScenarioError(error);
    const status = detail === "Scenario not found." ? 404 : 400;
    return NextResponse.json({ error: "update_scenario_failed", detail }, { status });
  }
}
