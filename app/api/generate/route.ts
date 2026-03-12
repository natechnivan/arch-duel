import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateTextWithRetry } from "../_lib/geminiModels";
import { Difficulty } from "../_lib/scenarios";
import { getCurrentSession } from "@/app/api/_lib/auth";
import { hasScoredDailyAttemptForDate, pickScenarioFromDatabase, saveRound } from "@/db/queries";
import { z } from "zod";
import { buildRoundGenerationPrompt, extractJson, ModelRoundSchema, sanitizeGeneratedRound } from "../_lib/roundGeneration";

export const runtime = "nodejs";

const GenerateRequestSchema = z.object({
  difficulty: z.enum(["junior", "mid", "senior", "staff", "any"]).optional(),
  topic: z.string().optional(),
  excludeScenarioIds: z.array(z.string()).max(20).optional(),
  session_id: z.string().optional(),
});

function mustGetKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is missing in environment variables.");
  }
  return key;
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const isDaily = url.searchParams.get("daily") === "true";
    const difficultyQuery = url.searchParams.get("difficulty");
    const topicQuery = url.searchParams.get("topic");
    const requestJson = await request.json().catch(() => ({}));
    const parsedRequest = GenerateRequestSchema.parse(requestJson);
    const requestedDifficulty = (difficultyQuery ?? parsedRequest.difficulty ?? "any") as Difficulty | "any";
    const requestedTopic = topicQuery ?? parsedRequest.topic ?? "any";
    const session = await getCurrentSession(request);
    const dateKey = new Date().toISOString().slice(0, 10);

    if (isDaily) {
      const alreadyPlayedDaily = await hasScoredDailyAttemptForDate(dateKey, {
        userId: session?.userId,
        sessionId: parsedRequest.session_id,
      });

      if (alreadyPlayedDaily) {
        return NextResponse.json(
          {
            error: "daily_already_played",
            detail: "You have already completed today's daily challenge.",
          },
          { status: 409 }
        );
      }
    }

    // Scenario selection is DB-backed so admins can manage the playable catalog without code changes.
    const scenario = await pickScenarioFromDatabase({
      difficulty: requestedDifficulty,
      topic: requestedTopic,
      excludeIds: isDaily ? [] : parsedRequest.excludeScenarioIds,
      dailySeed: isDaily ? dateKey : undefined,
    });

    const apiKey = mustGetKey();
    const genAI = new GoogleGenerativeAI(apiKey);
    const raw = await generateTextWithRetry(genAI, apiKey, buildRoundGenerationPrompt(scenario));
    const parsed = ModelRoundSchema.parse(sanitizeGeneratedRound(extractJson(raw)));
    const roundId = crypto.randomUUID();

    // The answer key is stored with the round and never returned to the browser.
    await saveRound({
      id: roundId,
      scenarioId: scenario.id,
      topic: scenario.topic,
      difficulty: scenario.difficulty,
      prompt: scenario.prompt,
      designText: parsed.design_text,
      answerKind: parsed.kind,
      hiddenIssue: parsed.hidden_issue,
      missingBucket: parsed.missing_bucket,
      isDaily,
    });

    const headers: Record<string, string> = {};
    if (isDaily) {
      headers["Cache-Control"] = "public, s-maxage=86400, stale-while-revalidate=300";
      headers["CDN-Cache-Control"] = "public, s-maxage=86400, stale-while-revalidate=300";
      headers["Vercel-CDN-Cache-Control"] = "public, s-maxage=86400, stale-while-revalidate=300";
    }

    return NextResponse.json(
      {
        roundId,
        scenarioId: scenario.id,
        prompt: scenario.prompt,
        topic: scenario.topic,
        difficulty: scenario.difficulty,
        design_text: parsed.design_text,
        isDaily,
      },
      { headers }
    );
  } catch (error: any) {
    const msg = String(error?.message ?? error);
    const status = msg.includes("503") ? 503 : 500;
    return NextResponse.json({ error: "generate_failed", detail: msg }, { status });
  }
}
