// app/api/evaluate/route.ts
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateTextWithRetry, isOverloaded } from "../_lib/geminiModels";
import { z } from "zod";

export const runtime = "nodejs";

const ReqSchema = z.object({
  design_text: z.string(),
  expected_kind: z.enum(["legit", "incomplete", "flawed", "buzzword_bs"]),
  expected_bucket: z.enum([
    "api",
    "data_model",
    "scaling",
    "caching",
    "queue_stream",
    "consistency",
    "partitioning",
    "observability",
    "security",
    "other",
  ]),
  hidden_issue: z.string(),
  player_kind: z.enum(["legit", "incomplete", "flawed", "buzzword_bs"]),
  player_bucket: z.enum([
    "api",
    "data_model",
    "scaling",
    "caching",
    "queue_stream",
    "consistency",
    "partitioning",
    "observability",
    "security",
    "other",
  ]),
});

const RespSchema = z.object({
  correct: z.boolean(),
  score_delta: z.number(),
  short_verdict: z.string(),
  why: z.string(),
  what_to_fix: z.array(z.string()),
  learning_takeaway: z.string(),
});

function mustGetKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is missing in environment variables.");
  return key;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractJson(raw: string): any {
  const noFences = raw
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(noFences);
  } catch {}

  const match = noFences.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Model did not return valid JSON. Raw: ${raw.slice(0, 300)}`);
  return JSON.parse(match[0]);
}

export async function POST(req: Request) {
  try {
    const body = ReqSchema.parse(await req.json());
    const apiKey = mustGetKey();
    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = `
You are a judge for a game called "Arch Duel".

Return ONLY valid JSON (no markdown, no backticks) matching exactly this schema:
{
  "correct": boolean,
  "score_delta": number,
  "short_verdict": string,
  "why": string,
  "what_to_fix": string[],
  "learning_takeaway": string
}

Ground truth:
- expected_kind: ${body.expected_kind}
- expected_bucket: ${body.expected_bucket}
- hidden_issue: ${body.hidden_issue}

Player chose:
- player_kind: ${body.player_kind}
- player_bucket: ${body.player_bucket}

Design text:
${body.design_text}

Scoring rules (IMPORTANT):
- If expected_kind == "legit":
    - correct if player_kind == "legit" (ignore bucket), score_delta = 10
- Else:
    - If player_kind == expected_kind AND player_bucket == expected_bucket => score_delta = 10 and correct=true
    - If player_kind == expected_kind BUT bucket wrong => score_delta = 7 and correct=false
    - If player_kind is close (expected_kind in {incomplete,flawed} and player picked the other) => score_delta = 5 and correct=false
    - Else score_delta = 0 and correct=false

Keep "why" and "learning_takeaway" concise for mobile.
"what_to_fix" should have 2-5 bullets.
`;

    const raw = await generateTextWithRetry(genAI, apiKey, prompt);
    const parsed = RespSchema.parse(extractJson(raw));
    return NextResponse.json(parsed);
  } catch (error: any) {
    const msg = String(error?.message ?? error);
    const status = isOverloaded(msg) ? 503 : 500;
    return NextResponse.json({ error: "evaluate_failed", detail: msg }, { status });
  }
}