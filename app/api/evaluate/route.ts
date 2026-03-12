import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateTextWithRetry, isOverloaded } from "../_lib/geminiModels";
import { getCurrentSession } from "@/app/api/_lib/auth";
import { getRoundById, hasScoredAttemptForRound, saveAttempt } from "@/db/queries";
import { z } from "zod";

export const runtime = "nodejs";

const KindSchema = z.enum(["legit", "incomplete", "flawed", "buzzword_bs"]);
const BucketSchema = z.enum([
  "none",
  "api",
  "data_model",
  "scaling",
  "caching",
  "queue_stream",
  "consistency",
  "partitioning",
  "observability",
  "security",
  "other_tradeoffs",
  "tradeoffs",
  "other",
]);

const ReqSchema = z.object({
  round_id: z.string(),
  scenario_id: z.string(),
  session_id: z.string().optional(),
  design_text: z.string(),
  player_kind: KindSchema,
  player_bucket: BucketSchema,
  practice_only: z.boolean().optional(),
});

const ExplanationSchema = z.object({
  short_verdict: z.string(),
  why: z.string(),
  what_to_fix: z.array(z.string()),
  learning_takeaway: z.string(),
});

const BUCKET_GUIDANCE = `
Bucket guidance:
- none: only for legit designs
- api: request/response contracts, surface design, endpoint behavior
- data_model: core entities, schema choices, storage relationships
- scaling: throughput, hot paths, load growth, autoscaling
- caching: cache placement, invalidation, stale reads, read optimization
- queue_stream: events, queues, consumer pipelines, retries, DLQs
- consistency: correctness, ordering, dedupe, idempotency, write/read guarantees
- partitioning: sharding, hotspot handling, data placement
- observability: logs, metrics, traces, alerts, diagnosis
- security: authn/authz, secrets, abuse prevention, privacy
- other_tradeoffs: broad reasoning gaps not centered on one concrete bucket
`;

function mustGetKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is missing in environment variables.");
  return key;
}

function extractJson(raw: string): any {
  const noFences = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(noFences);
  } catch {}

  const match = noFences.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Model did not return valid JSON. Raw: ${raw.slice(0, 300)}`);
  return JSON.parse(match[0]);
}

function normalizeBucket(value: string) {
  if (value === "other" || value === "tradeoffs") {
    return "other_tradeoffs";
  }
  return value;
}

function resolveExpectedBucket(answerKind: string, storedBucket: string) {
  if (answerKind === "legit") {
    return "none";
  }

  return normalizeBucket(storedBucket);
}

function scoreSubmission(expectedKind: string, expectedBucket: string, playerKind: string, playerBucket: string) {
  if (expectedKind === "legit") {
    return {
      correct: playerKind === "legit",
      scoreDelta: playerKind === "legit" ? 10 : 0,
    };
  }

  if (playerKind === expectedKind && playerBucket === expectedBucket) {
    return { correct: true, scoreDelta: 10 };
  }

  if (playerKind === expectedKind) {
    return { correct: false, scoreDelta: 7 };
  }

  const closeKinds =
    (expectedKind === "incomplete" && playerKind === "flawed") ||
    (expectedKind === "flawed" && playerKind === "incomplete");

  if (closeKinds) {
    return { correct: false, scoreDelta: 5 };
  }

  return { correct: false, scoreDelta: 0 };
}

export async function POST(request: Request) {
  try {
    const body = ReqSchema.parse(await request.json());
    const practiceOnly = body.practice_only === true;
    const round = await getRoundById(body.round_id);
    if (!round) {
      throw new Error("Round not found. Generate a new round before submitting.");
    }

    const session = await getCurrentSession(request);
    if (!practiceOnly) {
      const alreadySubmitted = await hasScoredAttemptForRound(body.round_id, {
        userId: session?.userId,
        sessionId: body.session_id,
      });

      if (alreadySubmitted) {
        return NextResponse.json(
          {
            error: "round_already_scored",
            detail: "This round has already been scored. Use the practice retry instead.",
          },
          { status: 409 }
        );
      }
    }

    const apiKey = mustGetKey();
    const genAI = new GoogleGenerativeAI(apiKey);

    // Evaluation now always uses the persisted round so the client cannot tamper with the answer key.
    const expectedBucket = resolveExpectedBucket(round.answerKind, round.missingBucket);
    const playerBucket = normalizeBucket(body.player_bucket);
    const scoring = scoreSubmission(round.answerKind, expectedBucket, body.player_kind, playerBucket);
    const prompt = `
You are a judge for a game called "Arch Duel".

Return ONLY valid JSON (no markdown, no backticks) matching exactly this schema:
{
  "short_verdict": string,
  "why": string,
  "what_to_fix": string[],
  "learning_takeaway": string
}

Ground truth:
- expected_kind: ${round.answerKind}
- expected_bucket: ${expectedBucket}
- hidden_issue: ${round.hiddenIssue}

Player chose:
- player_kind: ${body.player_kind}
- player_bucket: ${playerBucket}

Design text:
${round.designText}

Scored result:
- correct: ${String(scoring.correct)}
- score_delta: ${scoring.scoreDelta}

${BUCKET_GUIDANCE}

Rules:
- Treat the scored result above as final. Do not contradict it.
- If expected_kind is "legit", explain why the design works. Do not imply a hidden flaw.
- If expected_kind is not "legit", explain the hidden issue clearly.
- If the player matched kind but missed bucket, explain why the bucket should have been "${expectedBucket}".
- short_verdict must be a single concise sentence.
- what_to_fix should have 0-4 bullets.
- If expected_kind is "legit" and the player was correct, what_to_fix should be [].

Keep "why" and "learning_takeaway" concise for mobile.
`;

    const raw = await generateTextWithRetry(genAI, apiKey, prompt);
    const parsed = ExplanationSchema.parse(extractJson(raw));
    const whatToFix =
      round.answerKind === "legit" && body.player_kind === "legit" ? [] : parsed.what_to_fix.slice(0, 4);

    if (!practiceOnly) {
      await saveAttempt({
        id: crypto.randomUUID(),
        roundId: body.round_id,
        userId: session?.userId,
        sessionId: body.session_id,
        scenarioId: body.scenario_id,
        playerKind: body.player_kind,
        playerBucket,
        expectedKind: round.answerKind,
        expectedBucket,
        hiddenIssue: round.hiddenIssue,
        correct: scoring.correct,
        scoreDelta: scoring.scoreDelta,
        shortVerdict: parsed.short_verdict,
        why: parsed.why,
        whatToFix,
        learningTakeaway: parsed.learning_takeaway,
      });
    }

    return NextResponse.json({
      ...parsed,
      correct: scoring.correct,
      score_delta: scoring.scoreDelta,
      what_to_fix: whatToFix,
      practice_only: practiceOnly,
      ground_truth: {
        kind: round.answerKind,
        bucket: expectedBucket,
        hidden_issue: round.hiddenIssue,
      },
    });
  } catch (error: any) {
    const msg = String(error?.message ?? error);
    const status = isOverloaded(msg) ? 503 : 500;
    return NextResponse.json({ error: "evaluate_failed", detail: msg }, { status });
  }
}
