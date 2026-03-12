import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { getCurrentSession } from "@/app/api/_lib/auth";
import { buildRoundGenerationPrompt, extractJson, ModelRoundSchema, sanitizeGeneratedRound } from "@/app/api/_lib/roundGeneration";
import { generateTextWithRetry } from "@/app/api/_lib/geminiModels";
import { Difficulty } from "@/app/api/_lib/scenarios";
import { pickScenarioFromDatabase } from "@/db/queries";

const RequestSchema = z.object({
  count: z.number().int().min(1).max(5).default(3),
  difficulty: z.enum(["junior", "mid", "senior", "staff", "any"]).default("any"),
  topic: z.string().optional(),
});

function mustGetKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is missing in environment variables.");
  }
  return key;
}

function approximateSentenceCount(text: string) {
  return text
    .split(/[.!?]+/)
    .map((segment) => segment.trim())
    .filter(Boolean).length;
}

export async function POST(request: Request) {
  const session = await getCurrentSession(request);
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const body = RequestSchema.parse(await request.json().catch(() => ({})));
    const apiKey = mustGetKey();
    const genAI = new GoogleGenerativeAI(apiKey);
    const usedScenarioIds: string[] = [];
    const results = [];

    for (let index = 0; index < body.count; index += 1) {
      const scenario = await pickScenarioFromDatabase({
        difficulty: body.difficulty as Difficulty | "any",
        topic: body.topic ?? "any",
        excludeIds: usedScenarioIds,
      });
      usedScenarioIds.push(scenario.id);

      const raw = await generateTextWithRetry(genAI, apiKey, buildRoundGenerationPrompt(scenario));
      const parsed = ModelRoundSchema.parse(sanitizeGeneratedRound(extractJson(raw)));
      const issues: string[] = [];
      const sentenceCount = approximateSentenceCount(parsed.design_text);

      if (parsed.kind === "legit" && parsed.missing_bucket !== "none") {
        issues.push("Legit round returned a non-none bucket.");
      }
      if (parsed.kind === "legit" && parsed.hidden_issue.trim() !== "") {
        issues.push("Legit round returned a hidden issue.");
      }
      if (parsed.kind !== "legit" && parsed.missing_bucket === "none") {
        issues.push("Non-legit round returned bucket none.");
      }
      if (parsed.kind !== "legit" && parsed.hidden_issue.trim() === "") {
        issues.push("Non-legit round is missing hidden issue.");
      }
      if (parsed.kind === "buzzword_bs" && parsed.missing_bucket !== "other_tradeoffs") {
        issues.push("Buzzword BS round did not use other_tradeoffs.");
      }
      if (sentenceCount < 6 || sentenceCount > 10) {
        issues.push(`Design text has ${sentenceCount} sentences instead of 6-10.`);
      }

      results.push({
        scenario,
        generated: parsed,
        issues,
      });
    }

    return NextResponse.json({
      ok: results.every((result) => result.issues.length === 0),
      checked: results.length,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "validate_prompts_failed", detail: String(error?.message ?? error) },
      { status: 400 }
    );
  }
}
