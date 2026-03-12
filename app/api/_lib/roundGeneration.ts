import { Difficulty, getDifficultyGuidance } from "@/app/api/_lib/scenarios";
import { z } from "zod";

const ALLOWED_BUCKETS = new Set([
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

export const ModelRoundSchema = z.object({
  kind: z.enum(["legit", "incomplete", "flawed", "buzzword_bs"]),
  design_text: z.string(),
  hidden_issue: z.string(),
  missing_bucket: z.enum([
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
  ]),
});

const BUCKET_GUIDANCE = `
Bucket guidance:
- none: only for fully legit designs with no major missing area
- api: weak API shape, contract design, or request/response handling
- data_model: bad schema/entity modeling or missing core data relationships
- scaling: capacity, throughput, autoscaling, hot paths, or load distribution
- caching: missing or incorrect cache usage, invalidation, or read optimization
- queue_stream: async pipelines, eventing, fanout, consumer flow, retries, DLQs
- consistency: correctness across writes/reads, ordering, dedupe, idempotency
- partitioning: sharding, tenant/data placement, hotspot distribution
- observability: monitoring, alerting, tracing, debugging, operational visibility
- security: authn/authz, secrets, abuse prevention, data protection
- other_tradeoffs: broad reasoning gaps that do not fit a single concrete bucket
`;

export function normalizeBucket(value: string) {
  if (value === "other" || value === "tradeoffs") {
    return "other_tradeoffs";
  }
  return value;
}

export function sanitizeGeneratedRound(obj: any) {
  // Gemini occasionally returns partial JSON; this keeps the payload parseable before Zod validates it.
  if (obj.hidden_issue == null || typeof obj.hidden_issue !== "string") {
    obj.hidden_issue = "Model did not provide a hidden_issue. Treat this as incomplete reasoning.";
  }

  if (!ALLOWED_BUCKETS.has(obj.missing_bucket)) {
    obj.missing_bucket = "other_tradeoffs";
  }
  obj.missing_bucket = normalizeBucket(obj.missing_bucket);

  if (typeof obj.design_text !== "string" || !obj.design_text.trim()) {
    obj.design_text = "No design text generated.";
  }

  const allowedKinds = new Set(["legit", "incomplete", "flawed", "buzzword_bs"]);
  if (!allowedKinds.has(obj.kind)) {
    obj.kind = "incomplete";
  }

  if (obj.kind === "legit") {
    obj.missing_bucket = "none";
    obj.hidden_issue = "";
  } else if (obj.kind === "buzzword_bs") {
    obj.missing_bucket = "other_tradeoffs";
  } else if (obj.missing_bucket === "none") {
    obj.missing_bucket = "other_tradeoffs";
  }

  return obj;
}

export function extractJson(raw: string) {
  const noFences = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(noFences);
  } catch {}

  const match = noFences.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`Model did not return JSON. Raw (first 300 chars): ${raw.slice(0, 300)}`);
  }
  return JSON.parse(match[0]);
}

function normalizeDifficulty(value: string): Difficulty {
  if (value === "junior" || value === "mid" || value === "senior" || value === "staff") {
    return value;
  }
  return "mid";
}

export function buildRoundGenerationPrompt(scenario: { topic: string; difficulty: string; prompt: string }) {
  return `
Return ONLY valid JSON. No markdown. No backticks. No extra text.

You are generating a game round for "Arch Duel".
The app has already selected the scenario. You must follow it exactly.

You MUST choose missing_bucket from this exact list:
["none","api","data_model","scaling","caching","queue_stream","consistency","partitioning","observability","security","other_tradeoffs"]

You MUST set hidden_issue as a string.
If kind is "legit", hidden_issue must be "".
If kind is not "legit", hidden_issue must clearly name the core flaw or missing idea.

JSON schema:
{
  "kind": "legit"|"incomplete"|"flawed"|"buzzword_bs",
  "design_text": string,
  "hidden_issue": string,
  "missing_bucket": "none"|"api"|"data_model"|"scaling"|"caching"|"queue_stream"|"consistency"|"partitioning"|"observability"|"security"|"other_tradeoffs"
}

Scenario metadata:
- topic: ${scenario.topic}
- difficulty: ${scenario.difficulty}
- player question: ${scenario.prompt}

Difficulty guidance:
${getDifficultyGuidance(normalizeDifficulty(scenario.difficulty))}

${BUCKET_GUIDANCE}

Rules:
- design_text: 6-10 sentences.
- Keep the answer tightly scoped to the selected scenario.
- Vary architecture choices naturally so different rounds do not feel templated.
- legit: complete and correct. Set missing_bucket to "none". Do not imply a hidden flaw.
- incomplete: miss one critical bucket. Set missing_bucket to the missing bucket.
- flawed: include one subtle incorrect claim. Set missing_bucket to the most impacted bucket.
- buzzword_bs: vague and buzzword-heavy. Set missing_bucket to "other_tradeoffs".

Return JSON only.
`;
}
