import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/app/api/_lib/auth";
import { getLatestAttemptForRound } from "@/db/queries";

const RequestSchema = z.object({
  round_id: z.string(),
  session_id: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = RequestSchema.parse(await request.json());
    const session = await getCurrentSession(request);
    const attempt = await getLatestAttemptForRound(body.round_id, {
      userId: session?.userId,
      sessionId: body.session_id,
    });

    if (!attempt) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({
      correct: attempt.correct,
      score_delta: attempt.scoreDelta,
      short_verdict: attempt.shortVerdict,
      why: attempt.why,
      what_to_fix: attempt.whatToFix,
      learning_takeaway: attempt.learningTakeaway,
      player_submission: {
        kind: attempt.playerKind,
        bucket: attempt.playerBucket,
      },
      ground_truth: {
        kind: attempt.expectedKind,
        bucket: attempt.expectedBucket,
        hidden_issue: attempt.hiddenIssue,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "round_result_failed", detail: String(error?.message ?? error) },
      { status: 400 }
    );
  }
}
