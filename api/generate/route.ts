import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateTextWithRetry, isOverloaded } from "../_lib/geminiModels";
import { z } from "zod";

export const runtime = "nodejs";


const ALLOWED_BUCKETS = new Set([
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
]);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function sanitizeRound(obj: any) {
  // hidden_issue: force string
  if (obj.hidden_issue == null || typeof obj.hidden_issue !== "string" || obj.hidden_issue.trim() === "") {
    obj.hidden_issue = "Model did not provide a hidden_issue. Treat this as incomplete/low-quality reasoning.";
  }

  // missing_bucket: force allowed
  if (!ALLOWED_BUCKETS.has(obj.missing_bucket)) {
    obj.missing_bucket = "other";
  }

  // prompt/design_text must exist
  if (typeof obj.prompt !== "string" || !obj.prompt.trim()) obj.prompt = "Classify the system design answer below.";
  if (typeof obj.design_text !== "string" || !obj.design_text.trim()) obj.design_text = "No design text generated.";

  // kind: if invalid, default
  const allowedKinds = new Set(["legit", "incomplete", "flawed", "buzzword_bs"]);
  if (!allowedKinds.has(obj.kind)) obj.kind = "incomplete";

  // difficulty: if invalid, default
  const allowedDiff = new Set(["junior", "mid", "senior", "staff"]);
  if (!allowedDiff.has(obj.difficulty)) obj.difficulty = "mid";

  // topic: if invalid, default
  if (typeof obj.topic !== "string" || !obj.topic.trim()) obj.topic = "system design";
  return obj;
}

const RoundSchema = z.object({
  topic: z.string(),
  difficulty: z.enum(["junior", "mid", "senior", "staff"]),
  kind: z.enum(["legit", "incomplete", "flawed", "buzzword_bs"]),
  prompt: z.string(),
  design_text: z.string(),
  hidden_issue: z.string(),
  missing_bucket: z.enum([
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

export async function POST() {
  try {
    const apiKey = mustGetKey();
    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = `
Return ONLY valid JSON. No markdown. No backticks. No extra text.

You are generating a game round for "Arch Duel".

You MUST choose missing_bucket from this exact list:
["api","data_model","scaling","caching","queue_stream","consistency","partitioning","observability","security","other"]

You MUST set hidden_issue as a non-empty string (never null).

JSON schema:
{
  "topic": string,
  "difficulty": "junior"|"mid"|"senior"|"staff",
  "kind": "legit"|"incomplete"|"flawed"|"buzzword_bs",
  "prompt": string,
  "design_text": string,
  "hidden_issue": string,
  "missing_bucket": "api"|"data_model"|"scaling"|"caching"|"queue_stream"|"consistency"|"partitioning"|"observability"|"security"|"other"
}

Rules:
- topic: one of (URL shortener, rate limiter, notification system, feed, chat, file upload, analytics pipeline)
- design_text: 6–10 sentences.

- legit: complete and correct. Set missing_bucket to "other".
- incomplete: missing one critical bucket (set missing_bucket to the missing bucket).
- flawed: include one subtle incorrect claim (set missing_bucket to the most impacted bucket).
- buzzword_bs: vague and buzzword-heavy. Set missing_bucket to "other".

Return JSON only.
`;

    const raw = await generateTextWithRetry(genAI, apiKey, prompt);
    const obj = sanitizeRound(extractJson(raw));
    const parsed = RoundSchema.parse(obj);

    return NextResponse.json({
      roundId: crypto.randomUUID(),
      prompt: parsed.prompt,
      topic: parsed.topic,
      difficulty: parsed.difficulty,
      design_text: parsed.design_text,
      // MVP: returning answer key to client (hide in UI).
      // Later: keep answer key server-side for anti-cheat.
      __answerKey: {
        kind: parsed.kind,
        hidden_issue: parsed.hidden_issue,
        missing_bucket: parsed.missing_bucket,
      },
    });
  } catch (error: any) {
    const msg = String(error?.message ?? error);
    const status = msg.includes("503") ? 503 : 500;

    return NextResponse.json(
      { error: "generate_failed", detail: msg },
      { status }
    );
  }

  function mustGetKey(): string {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is missing in environment variables.");
    }
    return key;
  }
  function extractJson(s: string): any {
    // 1) Remove ```json ... ``` fences if present
    const noFences = s
      .replace(/```json\s*/gi, "")
      .replace(/```/g, "")
      .trim();

    // 2) Try direct parse
    try {
      return JSON.parse(noFences);
    } catch { }

    // 3) Fallback: extract the first JSON object block {...}
    const match = noFences.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(
        `Model did not return JSON. Raw (first 300 chars): ${s.slice(0, 300)}`
      );
    }
    return JSON.parse(match[0]);
  }
}