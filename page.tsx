"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/app/components/Spinner";
import { SpinnerDark } from "@/app/components/SpinnerDark";

type Kind = "legit" | "incomplete" | "flawed" | "buzzword_bs";

const BUCKETS = [
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
] as const;

type Bucket = (typeof BUCKETS)[number];

type Round = {
  roundId: string;
  prompt: string;
  topic: string;
  difficulty: string;
  design_text: string;
  __answerKey: { kind: Kind; hidden_issue: string; missing_bucket: Bucket };
};

type EvalResp = {
  correct: boolean;
  score_delta: number;
  short_verdict: string;
  why: string;
  what_to_fix: string[];
  learning_takeaway: string;
};

const KIND_LABELS: Record<Kind, string> = {
  legit: "Legit ✅",
  incomplete: "Incomplete ⚠️",
  flawed: "Flawed ❌",
  buzzword_bs: "Buzzword BS 💀",
};

const LS_SCORE_KEY = "archduel:score"; // optional, for persistence later
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const LS_DAILY_KEY = (dateKey: string) => `archduel:daily:${dateKey}`;

async function fetchWithRetry(url: string, init: RequestInit, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, init);

    if (res.ok) return res;

    if (RETRY_STATUSES.has(res.status) && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 600 * attempt));
      continue;
    }

    return res; // fail out
  }
  // should never reach here
  return fetch(url, init);
}

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function Home() {
  const [round, setRound] = useState<Round | null>(null);
  const [choice, setChoice] = useState<Kind | null>(null);
  const [bucket, setBucket] = useState<Bucket | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [reveal, setReveal] = useState(false);

  const [evalResp, setEvalResp] = useState<EvalResp | null>(null);
  const [score, setScore] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryInfo, setRetryInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!round) return;
    if (reveal) {
      setReveal(false);
      setEvalResp(null);
    }
    // we intentionally don't include evalResp in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice, bucket]);

  async function start() {
    setIsGenerating(true);
    setReveal(false);
    setChoice(null);
    setBucket(null);
    setEvalResp(null);
    setErrorMsg(null);
    setRetryInfo(null);

    const maxAttempts = 3;

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        setRetryInfo(attempt > 1 ? `Retrying... (${attempt}/${maxAttempts})` : null);

        const res = await fetch("/api/generate", { method: "POST" });

        if (res.ok) {
          const data = (await res.json()) as Round;
          setRound(data);
          setRetryInfo(null);
          return;
        }

        if (res.status === 503 && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 600 * attempt)); // 600ms, 1200ms...
          continue;
        }

        const txt = await res.text();
        setErrorMsg(`Generate failed (${res.status}). ${txt}`);
        setRetryInfo(null);
        return;
      }
    } finally {
      setIsGenerating(false);
    }
  }

  async function startDaily() {
    setIsGenerating(true);
    setReveal(false);
    setChoice(null);
    setBucket(null);
    setEvalResp(null);
    setErrorMsg(null);
    setRetryInfo(null);

    const maxAttempts = 3;

    try {
      const key = LS_DAILY_KEY(todayKey());
      const cached = localStorage.getItem(key);
      if (cached) {
        setRound(JSON.parse(cached));
        return;
      }

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        setRetryInfo(attempt > 1 ? `Retrying daily... (${attempt}/${maxAttempts})` : null);

        const res = await fetch("/api/generate", { method: "POST" });

        if (res.ok) {
          const data = (await res.json()) as Round;
          setRound(data);
          localStorage.setItem(key, JSON.stringify(data));
          setRetryInfo(null);
          return;
        }

        if (RETRY_STATUSES.has(res.status) && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 600 * attempt));
          continue;
        }

        const txt = await res.text();
        setErrorMsg(`Daily challenge failed (${res.status}). ${txt}`);
        setRetryInfo(null);
        return;
      }
    } finally {
      setIsGenerating(false);
    }
  }

  async function submit() {
    if (!round || !choice || !bucket) return;

    setIsEvaluating(true);
    setEvalResp(null);
    setReveal(false);
    setErrorMsg(null);

    const maxAttempts = 3;

    try {
      let res: Response | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        setRetryInfo(attempt > 1 ? `Retrying evaluation... (${attempt}/${maxAttempts})` : null);

        res = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            design_text: round.design_text,
            expected_kind: round.__answerKey.kind,
            expected_bucket: round.__answerKey.missing_bucket,
            hidden_issue: round.__answerKey.hidden_issue,
            player_kind: choice,
            player_bucket: bucket,
          }),
        });

        if (res.ok) break;

        if (RETRY_STATUSES.has(res.status) && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 600 * attempt));
          continue;
        }

        const txt = await res.text();
        throw new Error(`Evaluate failed: ${res.status} ${txt}`);
      }

      setRetryInfo(null);

      const data = (await res!.json()) as EvalResp;
      setEvalResp(data);
      setScore((s) => s + (data.score_delta ?? 0));
      setReveal(true);
    } catch (e: any) {
      setRetryInfo(null);
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setIsEvaluating(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">
          Arch <span className="text-blue-600">Duel</span>
        </h1>

        <p className="text-gray-500 mt-2">
          AI generates a system design answer. You classify it and pick the main bucket.
        </p>

        <div className="flex items-center gap-3 mt-6 flex-wrap">
          <button
            onClick={start}
            disabled={isGenerating}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white cursor-pointer hover:bg-blue-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isGenerating ? <Spinner /> : null}
            {round ? "Next Round" : "Start"}
          </button>

          <button
            onClick={startDaily}
            disabled={isGenerating}
            className="px-5 py-2.5 rounded-lg border border-gray-300 bg-white cursor-pointer hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Daily Challenge
          </button>

          <div className="ml-auto text-sm bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
            Score <span className="font-semibold">{score}</span>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded border border-red-300 bg-red-50 text-sm">
            {errorMsg}
          </div>
        )}

        {retryInfo && (
          <div className="mt-3 p-3 rounded border border-blue-200 bg-blue-50 text-sm">
            {retryInfo}
          </div>
        )}

        {!round && (
          <p className="mt-10 text-gray-700">
            Tap <b>Start</b> to play.
          </p>
        )}

        {round && (
          <section className="mt-8">
            <div className="text-xs text-gray-600">
              Topic: <b>{round.topic}</b> • Difficulty: <b>{round.difficulty}</b>
            </div>

            <h2 className="mt-2 text-lg font-semibold">{round.prompt}</h2>

            <div className="mt-5 p-6 rounded-xl bg-white shadow-sm border border-gray-200 whitespace-pre-wrap leading-relaxed text-gray-800">
              {round.design_text}
            </div>

            <hr className="my-8 border-gray-200" />

            <h3 className="text-lg font-semibold mb-3">1) Classify</h3>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setChoice(k)}
                  className={`
                    p-4 rounded-xl border transition cursor-pointer text-left bg-white
                    ${choice === k
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 hover:border-blue-400 hover:bg-blue-50 active:scale-[0.99]"}
                  `}
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>

            <h3 className="text-lg font-semibold mt-7 mb-1">2) Pick missing / most impacted bucket</h3>
            <p className="text-sm text-gray-500 mb-3">
              If the answer is <b>Legit</b>, pick <b>other</b>.
            </p>
            <div className="flex flex-wrap gap-2">
              {BUCKETS.map((b) => (
                <button
                  key={b}
                  onClick={() => setBucket(b)}
                  className={`
                    px-3 py-2 rounded-full border text-sm cursor-pointer transition bg-white
                    ${bucket === b
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 hover:border-blue-400 hover:bg-blue-50 active:scale-[0.99]"}
                  `}
                >
                  {b}
                </button>
              ))}
            </div>

            {round && (!choice || !bucket) && (
              <p className="mt-4 text-sm text-gray-500">
                Select a <b>classification</b> and a <b>bucket</b> to unlock Submit.
              </p>
            )}
            {round && choice && bucket && (
              <div className="mt-6">
                <button
                  onClick={submit}
                  disabled={isEvaluating}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer hover:bg-blue-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 justify-center"
                >
                  {isEvaluating ? <Spinner /> : null}
                  Submit Answer
                </button>
              </div>
            )}

            {reveal && evalResp && (
              <div className="mt-7 p-5 rounded-xl bg-white border border-gray-200 shadow-sm">
                <div className="font-semibold">
                  {evalResp.correct ? "✅ Perfect!" : "⚠️ Not perfect"}{" "}
                  <span className="text-sm font-normal text-gray-600">
                    ({evalResp.score_delta >= 0 ? "+" : ""}{evalResp.score_delta})
                  </span>
                </div>

                <p className="mt-3 text-sm">
                  <b>Verdict:</b> {evalResp.short_verdict}
                </p>

                <p className="mt-2 text-sm">
                  <b>Why:</b> {evalResp.why}
                </p>

                {evalResp.what_to_fix?.length ? (
                  <>
                    <h4 className="mt-4 font-semibold">What to fix</h4>
                    <ul className="list-disc pl-5 text-sm mt-2">
                      {evalResp.what_to_fix.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </>
                ) : null}

                <p className="mt-4 text-sm">
                  <b>Takeaway:</b> {evalResp.learning_takeaway}
                </p>

                <details className="mt-4 text-xs text-gray-600">
                  <summary className="cursor-pointer">Debug: Ground truth</summary>
                  <div className="mt-2 space-y-1">
                    <div>Expected kind: {round.__answerKey.kind}</div>
                    <div>Expected bucket: {round.__answerKey.missing_bucket}</div>
                    <div>Hidden issue: {round.__answerKey.hidden_issue}</div>
                  </div>
                </details>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}