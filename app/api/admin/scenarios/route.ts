import { NextResponse } from "next/server";
import { getCurrentSession } from "@/app/api/_lib/auth";
import { createScenario } from "@/db/queries";
import { listScenarioTopics } from "@/app/api/_lib/scenarios";
import { z } from "zod";

const CANONICAL_TOPICS = listScenarioTopics();
const CANONICAL_TOPIC_SET = new Set(CANONICAL_TOPICS);

const CreateScenarioSchema = z.object({
  packId: z.string(),
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

  if (message.includes("scenario pack no longer exists")) {
    return message;
  }

  if (message.includes("violates foreign key constraint")) {
    return "The selected scenario pack is invalid. Refresh the admin page and choose a valid pack.";
  }

  if (message.includes("duplicate key") || message.includes("unique constraint")) {
    return "A scenario with the same identifier already exists. Change the slug or try generating again.";
  }

  if (message.includes("Failed query: insert into \"scenarios\"")) {
    return "The scenario could not be saved due to a database constraint. Check the selected pack and scenario fields, then try again.";
  }

  return message;
}

export async function POST(request: Request) {
  const session = await getCurrentSession(request);
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const body = CreateScenarioSchema.parse(await request.json());
    await createScenario({
      id: crypto.randomUUID(),
      packId: body.packId,
      slug: body.slug.trim(),
      topic: body.topic.trim(),
      difficulty: body.difficulty,
      prompt: body.prompt.trim(),
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: "create_scenario_failed", detail: toAdminScenarioError(error) }, { status: 400 });
  }
}
