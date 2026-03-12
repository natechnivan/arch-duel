import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { getCurrentSession } from "@/app/api/_lib/auth";
import { createScenario, getScenarioPackById } from "@/db/queries";
import { listScenarioTopics } from "@/app/api/_lib/scenarios";

const RequestSchema = z.object({
  packId: z.string(),
  count: z.number().int().min(1).max(20).default(10),
  difficulty: z.enum(["junior", "mid", "senior", "staff", "mixed"]).default("mixed"),
  theme: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined))
    .pipe(z.string().min(2).max(120).optional()),
});

const CANONICAL_TOPICS = listScenarioTopics();
const CANONICAL_TOPIC_SET = new Set(CANONICAL_TOPICS);

const GeneratedScenarioSchema = z.object({
  topic: z
    .string()
    .min(2)
    .max(80)
    .transform((value) => value.trim())
    .refine((value) => CANONICAL_TOPIC_SET.has(value), {
      message: `Topic must be one of the canonical topics: ${CANONICAL_TOPICS.join(", ")}`,
    }),
  difficulty: z.enum(["junior", "mid", "senior", "staff"]),
  prompt: z.string().min(16).max(500),
});

const ResponseSchema = z.object({
  scenarios: z.array(GeneratedScenarioSchema).min(1).max(20),
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
    return "One of the generated scenarios collided with an existing identifier. Run the generation again.";
  }

  if (message.includes("Failed query: insert into \"scenarios\"")) {
    return "One or more generated scenarios could not be saved because of a database constraint. Refresh the admin page and try again.";
  }

  return message;
}

function mustGetKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is missing in environment variables.");
  }
  return key;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function extractJson(raw: string) {
  const noFences = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(noFences);
  } catch {}

  const match = noFences.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`Model did not return valid JSON. Raw: ${raw.slice(0, 300)}`);
  }
  return JSON.parse(match[0]);
}

export async function POST(request: Request) {
  const session = await getCurrentSession(request);
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const body = RequestSchema.parse(await request.json());
    const pack = await getScenarioPackById(body.packId);
    if (!pack) {
      return NextResponse.json(
        {
          error: "generate_scenarios_failed",
          detail: "The selected scenario pack no longer exists. Refresh the admin page and choose a valid pack.",
        },
        { status: 400 }
      );
    }

    const apiKey = mustGetKey();
    const genAI = new GoogleGenerativeAI(apiKey);

    // This generator expands the topic catalog while still persisting everything into the DB-backed scenario system.
    const prompt = `
Return ONLY valid JSON. No markdown. No backticks. No extra text.

You are generating new system design practice scenarios for a game called "Arch Duel".

Return exactly this schema:
{
  "scenarios": [
    {
      "topic": string,
      "difficulty": "junior"|"mid"|"senior"|"staff",
      "prompt": string
    }
  ]
}

Requirements:
- Generate ${body.count} scenarios.
- Difficulty mode: ${body.difficulty}.
- Theme hint: ${body.theme ?? "broad system design coverage"}.
- You MUST choose topic from this exact canonical list:
  ${CANONICAL_TOPICS.map((topic) => `- ${topic}`).join("\n  ")}
- "topic" is the stable category shown in filters, not the scenario title.
- Put the specific system idea and constraints in the "prompt", not in the "topic".
- Topics should be diverse and not limited to simple CRUD apps.
- Prompts should be one sentence each and concrete enough for system design discussion.
- Avoid duplicates and near-duplicates.
- Avoid overly similar names like "social feed" and "news feed" unless the system shape is meaningfully different.

Return JSON only.
`;

    const raw = await genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" }).generateContent(prompt);
    const parsed = ResponseSchema.parse(extractJson(raw.response.text().trim()));

    for (const scenario of parsed.scenarios) {
      await createScenario({
        id: crypto.randomUUID(),
        packId: body.packId,
        slug: `${slugify(scenario.topic)}-${scenario.difficulty}-${crypto.randomUUID().slice(0, 8)}`,
        topic: scenario.topic.trim(),
        difficulty: scenario.difficulty,
        prompt: scenario.prompt.trim(),
      });
    }

    return NextResponse.json({ inserted: parsed.scenarios.length, scenarios: parsed.scenarios });
  } catch (error: any) {
    return NextResponse.json(
      { error: "generate_scenarios_failed", detail: toAdminScenarioError(error) },
      { status: 400 }
    );
  }
}
