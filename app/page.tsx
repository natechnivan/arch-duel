"use client";

import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@/app/components/Spinner";
import { Skeleton } from "@/app/components/Skeleton";

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

const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const LS_DAILY_KEY = (dateKey: string) => `archduel:daily:${dateKey}`;
const LS_THEME_KEY = "archduel:theme"; // "light" | "dark" | "system"
const LS_SCORE_KEY = "archduel:score:v1";

// Configuration constants
const REQUIRE_SUBMIT_BEFORE_NEXT = true;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 600;
const MIN_SHIMMER_MS = 100;

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function minDelay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getSystemPrefersDark() {
  if (typeof window === "undefined") return false;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function safeParseInt(v: string | null, fallback = 0) {
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Ensures a minimum duration for async operations (useful for shimmer effects)
 */
async function ensureMinLoadTime(startTime: number, minMs: number) {
  const elapsed = Date.now() - startTime;
  if (elapsed < minMs) {
    await minDelay(minMs - elapsed);
  }
}

/**
 * Fetches with automatic retry logic for transient failures
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  onRetry?: (attempt: number) => void
): Promise<Response> {
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    onRetry?.(attempt);

    const res = await fetch(url, options);
    if (res.ok) return res;

    // Retry on transient errors if not the last attempt
    if (RETRY_STATUSES.has(res.status) && attempt < MAX_RETRY_ATTEMPTS) {
      await minDelay(RETRY_DELAY_MS * attempt);
      continue;
    }

    return res;
  }

  // Should never reach here, but return last attempt
  return fetch(url, options);
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

  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  // ------------ Score persistence ------------
  useEffect(() => {
    const saved = localStorage.getItem(LS_SCORE_KEY);
    setScore(safeParseInt(saved, 0));
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_SCORE_KEY, String(score));
  }, [score]);

  function resetScore() {
    setScore(0);
    localStorage.setItem(LS_SCORE_KEY, "0");
  }

  function resetRound() {
    setReveal(false);
    setChoice(null);
    setBucket(null);
    setEvalResp(null);
    setErrorMsg(null);
    setRetryInfo(null);
  }

  // ------------ Theme persistence ------------
  useEffect(() => {
    const saved = localStorage.getItem(LS_THEME_KEY) || "system";
    const t: "light" | "dark" | "system" =
      saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
    setTheme(t);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const effectiveDark = theme === "dark" || (theme === "system" && getSystemPrefersDark());
    root.classList.toggle("dark", effectiveDark);
    localStorage.setItem(LS_THEME_KEY, theme);
  }, [theme]);

  // If user changes selection after seeing results, clear old result.
  useEffect(() => {
    if (!round) return;
    if (reveal) {
      setReveal(false);
      setEvalResp(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice, bucket]);

  const canGoNext = useMemo(() => {
    if (!REQUIRE_SUBMIT_BEFORE_NEXT) return true;
    if (!round) return true;
    return reveal === true;
  }, [round, reveal]);
  const nextRoundLocked = Boolean(round && !canGoNext);

  async function start() {
    if (!canGoNext) return;

    setIsGenerating(true);
    resetRound();

    try {
      const t0 = Date.now();
      const res = await fetchWithRetry("/api/generate", { method: "POST" }, (attempt) => {
        setRetryInfo(attempt > 1 ? `Retrying... (${attempt}/${MAX_RETRY_ATTEMPTS})` : null);
      });

      if (!res.ok) {
        const txt = await res.text();
        setErrorMsg(`Generate failed (${res.status}). ${txt}`);
        return;
      }

      const data = (await res.json()) as Round;
      await ensureMinLoadTime(t0, MIN_SHIMMER_MS);
      setRound(data);
      setRetryInfo(null);
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setIsGenerating(false);
    }
  }

  async function startDaily() {
    if (!canGoNext) return;

    setIsGenerating(true);
    resetRound();

    try {
      const key = LS_DAILY_KEY(todayKey());
      const cached = localStorage.getItem(key);
      if (cached) {
        setRound(JSON.parse(cached));
        return;
      }

      const t0 = Date.now();
      const res = await fetchWithRetry("/api/generate?daily=true", { method: "POST" }, (attempt) => {
        setRetryInfo(attempt > 1 ? `Retrying daily... (${attempt}/${MAX_RETRY_ATTEMPTS})` : null);
      });

      if (!res.ok) {
        const txt = await res.text();
        setErrorMsg(`Daily challenge failed (${res.status}). ${txt}`);
        return;
      }

      const data = (await res.json()) as Round;
      await ensureMinLoadTime(t0, MIN_SHIMMER_MS);
      setRound(data);
      localStorage.setItem(key, JSON.stringify(data));
      setRetryInfo(null);
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
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

    try {
      const t0 = Date.now();
      const res = await fetchWithRetry(
        "/api/evaluate",
        {
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
        },
        (attempt) => {
          setRetryInfo(attempt > 1 ? `Retrying evaluation... (${attempt}/${MAX_RETRY_ATTEMPTS})` : null);
        }
      );

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Evaluate failed: ${res.status} ${txt}`);
      }

      await ensureMinLoadTime(t0, MIN_SHIMMER_MS);
      const data = (await res.json()) as EvalResp;
      setEvalResp(data);
      setScore((s) => s + (data.score_delta ?? 0));
      setReveal(true);
      setRetryInfo(null);
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setIsEvaluating(false);
    }
  }

  const card = "bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800";
  const textMain = "text-gray-900 dark:text-gray-100";
  const textSub = "text-gray-700 dark:text-gray-300";
  const textMuted = "text-gray-600 dark:text-gray-400";

  return (
    <main className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className={`select-none text-3xl font-extrabold tracking-tight ${textMain}`}>
              Arch <span className="text-blue-600">Duel</span>
            </h1>
            <p className={`select-none mt-2 max-w-2xl ${textSub}`}>
              AI generates a system design answer. You classify it and pick the missing / impacted bucket.
            </p>
          </div>

          {/* Right controls */}
          <div className="shrink-0 flex flex-wrap items-center justify-between sm:justify-end gap-2">
            {/* Theme segmented */}
            <div className={`select-none inline-flex rounded-xl border ${card} overflow-hidden`}>
              {(["system", "light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={[
                    "select-none cursor-pointer px-3 py-2 text-sm transition-all duration-200 active:scale-[0.99]",
                    theme === t
                      ? "bg-blue-600 text-white"
                      : "bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800",
                    theme === t ? "" : textSub,
                  ].join(" ")}
                >
                  {t === "system" ? "System" : t === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>

            <div className={`select-none text-sm px-4 py-2 rounded-full ${card}`}>
              <span className={textSub}>Score </span>
              <span className={`font-semibold ${textMain}`}>{score}</span>
            </div>

            <button
              onClick={resetScore}
              className="select-none cursor-pointer text-sm px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200 active:scale-[0.99] dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:hover:bg-gray-900"
              title="Reset score"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <button
            onClick={start}
            disabled={isGenerating || !canGoNext}
            className="select-none w-full sm:w-auto h-12 px-5 py-3 rounded-lg bg-blue-600 text-white cursor-pointer hover:bg-blue-700 transition-all duration-200 active:scale-[0.99] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            title={!canGoNext ? "Submit this round first" : undefined}
          >
            {isGenerating ? <Spinner /> : null}
            {round ? (nextRoundLocked ? "Next Round Locked" : "Next Round") : "Start"}
          </button>

          <button
            onClick={startDaily}
            disabled={isGenerating || !canGoNext}
            className="select-none w-full sm:w-auto h-12 px-5 py-3 rounded-lg border border-gray-300 bg-white cursor-pointer hover:bg-gray-50 transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center dark:bg-gray-950 dark:hover:bg-gray-900 dark:border-gray-800 dark:text-gray-100"
            title={!canGoNext ? "Submit this round first" : undefined}
          >
            {nextRoundLocked ? "Daily Challenge Locked" : "Daily Challenge"}
          </button>
        </div>

        {REQUIRE_SUBMIT_BEFORE_NEXT && nextRoundLocked && (
          <p className={`select-none mt-3 text-sm ${textMuted}`}>
            Tip: Submit your answer to unlock <b>Next Round</b>.
          </p>
        )}

        {errorMsg && (
          <div className="select-none mt-4 p-3 rounded border border-red-300 bg-red-50 text-sm dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {errorMsg}
          </div>
        )}

        {retryInfo && (
          <div className="select-none mt-3 p-3 rounded border border-blue-200 bg-blue-50 text-sm dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
            {retryInfo}
          </div>
        )}

        {!round && !isGenerating && (
          <section className={`mt-8 rounded-xl p-4 sm:p-6 ${card}`}>
            <h2 className={`select-none text-lg sm:text-xl font-semibold ${textMain}`}>
              Welcome to Arch Duel
            </h2>
            <p className={`select-none mt-2 text-sm sm:text-base ${textSub}`}>
              Train your system design instincts by classifying AI-generated answers and spotting what is missing.
            </p>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                <p className={`select-none text-xs uppercase tracking-wide ${textMuted}`}>Step 1</p>
                <p className={`select-none mt-1 text-sm ${textMain}`}>Start a new challenge.</p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                <p className={`select-none text-xs uppercase tracking-wide ${textMuted}`}>Step 2</p>
                <p className={`select-none mt-1 text-sm ${textMain}`}>Pick a quality verdict and impacted bucket.</p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                <p className={`select-none text-xs uppercase tracking-wide ${textMuted}`}>Step 3</p>
                <p className={`select-none mt-1 text-sm ${textMain}`}>Submit to get feedback and score points.</p>
              </div>
            </div>

            <p className={`select-none mt-4 text-sm ${textMuted}`}>
              Tap <b>Start</b> for a fresh round or <b>Daily Challenge</b> for today&apos;s prompt.
            </p>
          </section>
        )}

        {/* LOADING STATE */}
        {isGenerating && (
          <section className="mt-8">
            <div className={`select-none text-sm ${textSub} h-4 w-20 rounded shimmer`} />
            <div className={`mt-2 text-lg font-semibold ${textMain} h-6 w-40 rounded shimmer`} />
            <div className={`mt-5 min-h-[200px] p-4 sm:p-6 rounded-xl ${card}`}>
              <div className="space-y-3">
                <Skeleton className="h-4 w-[90%]" />
                <Skeleton className="h-4 w-[96%]" />
                <Skeleton className="h-4 w-[88%]" />
                <Skeleton className="h-4 w-[92%]" />
                <Skeleton className="h-4 w-[78%]" />
                <Skeleton className="h-4 w-[85%]" />
              </div>
            </div>
          </section>
        )}

        {/* MAIN GAME AREA */}
        {round && !isGenerating && (
          <section className="mt-8">
            {/* Meta */}
            <div className={`select-none text-sm ${textSub}`}>
              Topic: <b>{round.topic}</b> • Difficulty: <b>{round.difficulty}</b>
            </div>

            {/* Prompt */}
            <h2 className={`select-none mt-2 text-lg sm:text-xl font-semibold ${textMain}`}>
              {round.prompt}
            </h2>

            {/* Design Text Card */}
            <div className={`mt-5 min-h-[200px] p-4 sm:p-6 rounded-xl ${card}`}>
              <div className={`select-none whitespace-pre-wrap leading-relaxed ${textSub}`}>
                {round.design_text}
              </div>
            </div>

            <hr className="my-8 border-gray-200 dark:border-gray-800" />

            {/* Classify */}
            <h3 className={`select-none text-lg font-semibold mb-3 ${textMain}`}>
              1) Classify
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.keys(KIND_LABELS) as Kind[]).map((k) => {
                const active = choice === k;
                return (
                  <button
                    key={k}
                    onClick={() => setChoice(k)}
                    className={[
                      "select-none p-4 rounded-xl border transition-all duration-200 active:scale-[0.99] cursor-pointer text-left",
                      active
                        ? "border-blue-200 bg-blue-50 ring-2 ring-blue-500 ring-offset-2 dark:bg-blue-950/40 dark:border-blue-900 dark:ring-offset-gray-950"
                        : "border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 dark:bg-gray-950 dark:border-gray-800 dark:hover:bg-gray-900",
                      textMain,
                    ].join(" ")}
                  >
                    {KIND_LABELS[k]}
                  </button>
                );
              })}
            </div>

            {/* Bucket */}
            <h3 className={`select-none text-lg font-semibold mt-7 mb-1 ${textMain}`}>
              2) Pick missing / most impacted bucket
            </h3>

            <p className={`select-none text-sm mb-3 ${textMuted}`}>
              If the answer is <b>Legit</b>, pick <b>other</b>.
            </p>

            <div className="flex flex-wrap gap-2">
              {BUCKETS.map((b) => {
                const active = bucket === b;
                return (
                  <button
                    key={b}
                    onClick={() => setBucket(b)}
                    className={[
                      "select-none px-3 py-2 rounded-full border text-sm cursor-pointer transition-all duration-200 active:scale-[0.99]",
                      active
                        ? "border-blue-200 bg-blue-50 ring-2 ring-blue-500 ring-offset-2 dark:bg-blue-950/40 dark:border-blue-900 dark:ring-offset-gray-950"
                        : "border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 dark:bg-gray-950 dark:border-gray-800 dark:hover:bg-gray-900",
                      textMain,
                    ].join(" ")}
                  >
                    {b}
                  </button>
                );
              })}
            </div>

            {/* Submit helper */}
            {(!choice || !bucket) && (
              <p className={`select-none mt-4 text-sm ${textMuted}`}>
                Select a <b>classification</b> and a <b>bucket</b> to unlock Submit.
              </p>
            )}

            {/* Submit button */}
            {choice && bucket && (
              <div className="mt-6">
                <button
                  onClick={submit}
                  disabled={isEvaluating}
                  className="select-none cursor-pointer w-full sm:w-auto h-12 px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-all duration-200 active:scale-[0.99] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 justify-center"
                >
                  {isEvaluating ? <Spinner /> : null}
                  Submit Answer
                </button>
              </div>
            )}

            {/* Results */}
            {isEvaluating && (
              <div className={`mt-7 p-5 rounded-xl ${card}`}>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-[55%]" />
                  <Skeleton className="h-4 w-[90%]" />
                  <Skeleton className="h-4 w-[85%]" />
                  <Skeleton className="h-4 w-[70%]" />
                </div>
              </div>
            )}

            {reveal && evalResp && !isEvaluating && (
              <div className={`mt-7 p-5 rounded-xl ${card}`}>
                <div className={`select-none font-semibold ${textMain}`}>
                  {evalResp.correct ? "✅ Perfect!" : "⚠️ Not perfect"}{" "}
                  <span className={`text-sm font-normal ${textMuted}`}>
                    ({evalResp.score_delta >= 0 ? "+" : ""}
                    {evalResp.score_delta})
                  </span>
                </div>

                <p className={`select-none mt-3 text-sm ${textSub}`}>
                  <b>Verdict:</b> {evalResp.short_verdict}
                </p>

                <p className={`select-none mt-2 text-sm ${textSub}`}>
                  <b>Why:</b> {evalResp.why}
                </p>

                {evalResp.what_to_fix?.length ? (
                  <>
                    <h4 className={`select-none mt-4 font-semibold ${textMain}`}>What to fix</h4>
                    <ul className={`select-none list-disc pl-5 text-sm mt-2 ${textSub}`}>
                      {evalResp.what_to_fix.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </>
                ) : null}

                <p className={`select-none mt-4 text-sm ${textSub}`}>
                  <b>Takeaway:</b> {evalResp.learning_takeaway}
                </p>

                <details className={`mt-4 text-xs ${textMuted}`}>
                  <summary className="cursor-pointer select-none">Debug: Ground truth</summary>
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
