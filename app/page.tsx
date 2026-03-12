"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/app/components/Spinner";
import { Skeleton } from "@/app/components/Skeleton";

type Kind = "legit" | "incomplete" | "flawed" | "buzzword_bs";
type Difficulty = "junior" | "mid" | "senior" | "staff";
type DifficultyFilter = Difficulty | "any";

const BUCKETS = [
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
] as const;

type Bucket = (typeof BUCKETS)[number];

type Round = {
  roundId: string;
  scenarioId: string;
  prompt: string;
  topic: string;
  difficulty: Difficulty;
  design_text: string;
  isDaily?: boolean;
};

type EvalResp = {
  correct: boolean;
  score_delta: number;
  practice_only?: boolean;
  short_verdict: string;
  why: string;
  what_to_fix: string[];
  learning_takeaway: string;
  player_submission?: {
    kind: Kind;
    bucket: Bucket;
  };
  ground_truth: {
    kind: Kind;
    bucket: Bucket;
    hidden_issue: string;
  };
};

type User = {
  id: string;
  email: string;
  username: string;
  role: string;
};

type BootstrapData = {
  user: User | null;
  topics: string[];
};

type DashboardData = {
  leaderboard: Array<{
    userId: string;
    username: string;
    totalScore: number;
    totalAttempts: number;
    correctAttempts: number;
    accuracy: number;
    streak: number;
  }>;
  stats: null | {
    summary: {
      totalAttempts: number;
      correctAttempts: number;
      totalScore: number;
      accuracy: number;
      streak: number;
    };
    weakAreas: Array<{
      topic: string;
      attempts: number;
      accuracy: number;
    }>;
    difficultyStats: Array<{
      difficulty: string;
      attempts: number;
      accuracy: number;
    }>;
    history: Array<{
      attemptId: string;
      topic: string;
      difficulty: string;
      prompt: string;
      shortVerdict: string;
      scoreDelta: number;
      correct: boolean;
      createdAt: string;
    }>;
  };
  admin: null | unknown[];
};

const KIND_LABELS: Record<Kind, string> = {
  legit: "Legit",
  incomplete: "Incomplete",
  flawed: "Flawed",
  buzzword_bs: "Buzzword BS",
};

const BUCKET_LABELS: Record<Bucket, string> = {
  none: "None",
  api: "API",
  data_model: "Data model",
  scaling: "Scaling",
  caching: "Caching",
  queue_stream: "Queue / stream",
  consistency: "Consistency",
  partitioning: "Partitioning",
  observability: "Observability",
  security: "Security",
  other_tradeoffs: "Other tradeoffs",
};

const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const LS_DAILY_KEY = (dateKey: string, difficulty: DifficultyFilter, topic: string) =>
  `archduel:daily:${dateKey}:${difficulty}:${topic}`;
const LS_THEME_KEY = "archduel:theme";
const LS_SCORE_KEY = "archduel:score:v1";
const LS_RECENT_SCENARIOS_KEY = "archduel:recent-scenarios:v1";
const LS_SESSION_KEY = "archduel:session:v1";
const LS_ACTIVE_ROUND_KEY = "archduel:active-round:v1";

const REQUIRE_SUBMIT_BEFORE_NEXT = true;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 600;
const MIN_SHIMMER_MS = 100;
const RECENT_SCENARIO_LIMIT = 8;
const ACTIVE_ROUND_TTL_MS = 30 * 60 * 1000;
const MIN_WEAK_AREA_ATTEMPTS = 3;
const DIFFICULTY_OPTIONS: DifficultyFilter[] = ["any", "junior", "mid", "senior", "staff"];

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

function readRecentScenarioIds() {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(LS_RECENT_SCENARIOS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function writeRecentScenarioId(scenarioId: string) {
  if (typeof window === "undefined") return;

  const nextIds = [scenarioId, ...readRecentScenarioIds().filter((id) => id !== scenarioId)].slice(
    0,
    RECENT_SCENARIO_LIMIT
  );
  localStorage.setItem(LS_RECENT_SCENARIOS_KEY, JSON.stringify(nextIds));
}

function getOrCreateSessionId() {
  if (typeof window === "undefined") return "server";

  const existing = localStorage.getItem(LS_SESSION_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  localStorage.setItem(LS_SESSION_KEY, created);
  return created;
}

async function ensureMinLoadTime(startTime: number, minMs: number) {
  const elapsed = Date.now() - startTime;
  if (elapsed < minMs) {
    await minDelay(minMs - elapsed);
  }
}

// Retries smooth out transient failures from serverless and CDN layers.
async function fetchWithRetry(url: string, options: RequestInit, onRetry?: (attempt: number) => void): Promise<Response> {
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    onRetry?.(attempt);
    const res = await fetch(url, options);
    if (res.ok) return res;

    if (RETRY_STATUSES.has(res.status) && attempt < MAX_RETRY_ATTEMPTS) {
      await minDelay(RETRY_DELAY_MS * attempt);
      continue;
    }

    return res;
  }

  return fetch(url, options);
}

export default function Home() {
  const [round, setRound] = useState<Round | null>(null);
  const [choice, setChoice] = useState<Kind | null>(null);
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMode, setGenerationMode] = useState<"round" | "daily" | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [evalResp, setEvalResp] = useState<EvalResp | null>(null);
  const [score, setScore] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryInfo, setRetryInfo] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [preferredDifficulty, setPreferredDifficulty] = useState<DifficultyFilter>("any");
  const [preferredTopic, setPreferredTopic] = useState("any");
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapLoadTimedOut, setBootstrapLoadTimedOut] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authBusy, setAuthBusy] = useState(false);
  const [authForm, setAuthForm] = useState({ email: "", username: "", password: "" });
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [practiceRetryActive, setPracticeRetryActive] = useState(false);
  const [isRestoringResult, setIsRestoringResult] = useState(false);
  const topicMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const activeRoundHydratedRef = useRef(false);

  function clearPersistedRound() {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.removeItem(LS_ACTIVE_ROUND_KEY);
  }

  useEffect(() => {
    setScore(safeParseInt(localStorage.getItem(LS_SCORE_KEY), 0));
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_SCORE_KEY, String(score));
  }, [score]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_ACTIVE_ROUND_KEY);
      if (!raw) {
        activeRoundHydratedRef.current = true;
        return;
      }

      const parsed = JSON.parse(raw) as {
        savedAt?: number;
        round?: Round | null;
        choice?: Kind | null;
        bucket?: Bucket | null;
        reveal?: boolean;
        evalResp?: EvalResp | null;
        practiceRetryActive?: boolean;
      };

      if (!parsed.savedAt || Date.now() - parsed.savedAt > ACTIVE_ROUND_TTL_MS) {
        clearPersistedRound();
        activeRoundHydratedRef.current = true;
        return;
      }

      if (parsed.round) {
        setRound({ ...parsed.round, isDaily: parsed.round.isDaily === true });
      }
      setChoice(parsed.choice ?? null);
      setBucket(parsed.bucket ?? null);
      setReveal(parsed.reveal === true);
      setEvalResp(parsed.evalResp ?? null);
      setPracticeRetryActive(parsed.practiceRetryActive === true);
    } catch {
      localStorage.removeItem(LS_ACTIVE_ROUND_KEY);
    } finally {
      activeRoundHydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!activeRoundHydratedRef.current) {
      return;
    }

    if (!round) {
      clearPersistedRound();
      return;
    }

    localStorage.setItem(
      LS_ACTIVE_ROUND_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        round,
        choice,
        bucket,
        reveal,
        evalResp,
        practiceRetryActive,
      })
    );
  }, [round, choice, bucket, reveal, evalResp, practiceRetryActive]);

  useEffect(() => {
    const saved = localStorage.getItem(LS_THEME_KEY) || "system";
    setTheme(saved === "light" || saved === "dark" || saved === "system" ? saved : "system");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && getSystemPrefersDark()));
    localStorage.setItem(LS_THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (choice === "legit" && bucket !== "none") {
      setBucket("none");
      return;
    }

    if (choice !== "legit" && bucket === "none") {
      setBucket(null);
    }
  }, [choice, bucket]);

  useEffect(() => {
    void refreshBootstrap();
  }, []);

  useEffect(() => {
    if (!bootstrapLoading) {
      setBootstrapLoadTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setBootstrapLoadTimedOut(true);
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [bootstrapLoading]);

  useEffect(() => {
    if (bootstrapLoading || !bootstrap?.user) {
      return;
    }

    async function restoreRoundResult() {
      if (!round || evalResp) {
        return;
      }

      try {
        setIsRestoringResult(true);
        const res = await fetch("/api/round-result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            round_id: round.roundId,
            session_id: getOrCreateSessionId(),
          }),
        });

        if (!res.ok) {
          return;
        }

        const data = (await res.json()) as EvalResp;
        if (data.player_submission) {
          setChoice(data.player_submission.kind);
          setBucket(data.player_submission.bucket);
        }
        setEvalResp(data);
        setReveal(true);
      } catch {
        // Restoring the result is best-effort; keep the round usable even if this fails.
      } finally {
        setIsRestoringResult(false);
      }
    }

    void restoreRoundResult();
  }, [bootstrapLoading, bootstrap?.user, round, evalResp]);

  useEffect(() => {
    if (bootstrapLoading || bootstrap?.user) {
      return;
    }

    clearPersistedRound();
    setRound(null);
    setChoice(null);
    setBucket(null);
    setReveal(false);
    setEvalResp(null);
    setPracticeRetryActive(false);
    setIsRestoringResult(false);
    setDashboard(null);
  }, [bootstrapLoading, bootstrap?.user]);

  useEffect(() => {
    if (!bootstrap?.user) {
      setDashboard(null);
      setDashboardLoading(false);
      return;
    }

    void refreshDashboard();
  }, [bootstrap?.user?.id]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (topicMenuRef.current && !topicMenuRef.current.contains(target)) {
        setTopicMenuOpen(false);
      }

      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const hasVisibleResult = Boolean(evalResp) || reveal;
  const restoringCompletedDaily = Boolean(round?.isDaily) && isRestoringResult;
  const canGoNext = useMemo(
    () => (!round ? true : !REQUIRE_SUBMIT_BEFORE_NEXT || hasVisibleResult || restoringCompletedDaily),
    [round, hasVisibleResult, restoringCompletedDaily]
  );
  const nextRoundLocked = Boolean(round && !canGoNext);
  const answerControlsLocked = Boolean(evalResp && !evalResp.practice_only) && !practiceRetryActive;
  const activeDailyRound = Boolean(round?.isDaily);
  const dailyCacheKey = LS_DAILY_KEY(todayKey(), preferredDifficulty, preferredTopic);
  const hasCachedDaily = typeof window !== "undefined" && Boolean(localStorage.getItem(dailyCacheKey));
  const unresolvedNonDailyRound = Boolean(round && !activeDailyRound && !hasVisibleResult);
  const nextRoundDisabled = isGenerating || !canGoNext;
  const dailyChallengeDisabled = isGenerating || (isRestoringResult && activeDailyRound) || unresolvedNonDailyRound;
  const nextRoundLabel =
    generationMode === "daily"
      ? round
        ? "Next Round"
        : "Start"
      : isGenerating && generationMode === "round"
        ? "Loading Round"
        : round
          ? nextRoundLocked
            ? "Next Round Locked"
            : "Next Round"
          : "Start";
  const dailyChallengeLabel =
    isGenerating && generationMode === "daily"
      ? "Loading Daily Challenge"
      : unresolvedNonDailyRound
        ? "Finish Current Round First"
        : activeDailyRound && isRestoringResult
          ? "Restoring Today's Daily"
          : hasCachedDaily
            ? activeDailyRound && !hasVisibleResult
              ? "Resume Today's Daily"
              : "View Today's Daily"
            : "Daily Challenge";
  const user = bootstrap?.user ?? null;
  const topics = bootstrap?.topics ?? [];
  const authResolved = bootstrap !== null && !bootstrapLoading;
  const displayedScore = user ? dashboard?.stats?.summary.totalScore ?? 0 : score;
  const scoreLabel = !authResolved ? "Loading" : "Score";
  const meaningfulWeakAreas = (dashboard?.stats?.weakAreas ?? []).filter((item) => item.attempts >= MIN_WEAK_AREA_ATTEMPTS);

  function resetRound(options?: { preserveRestoring?: boolean }) {
    setReveal(false);
    setChoice(null);
    setBucket(null);
    setEvalResp(null);
    setErrorMsg(null);
    setRetryInfo(null);
    setPracticeRetryActive(false);
    if (!options?.preserveRestoring) {
      setIsRestoringResult(false);
    }
  }

  function replaceRound(nextRound: Round, options?: { dailyCacheKey?: string; preserveRestoring?: boolean }) {
    resetRound({ preserveRestoring: options?.preserveRestoring });
    setRound(nextRound);
    writeRecentScenarioId(nextRound.scenarioId);

    if (options?.dailyCacheKey) {
      localStorage.setItem(options.dailyCacheKey, JSON.stringify(nextRound));
    }
  }

  function handleChoiceSelect(nextChoice: Kind) {
    if (answerControlsLocked) {
      return;
    }

    if (hasVisibleResult && choice !== nextChoice) {
      setReveal(false);
      setEvalResp(null);
    }
    setChoice(nextChoice);
  }

  function handleBucketSelect(nextBucket: Bucket) {
    if (answerControlsLocked) {
      return;
    }

    if (hasVisibleResult && bucket !== nextBucket) {
      setReveal(false);
      setEvalResp(null);
    }
    setBucket(nextBucket);
  }

  async function refreshBootstrap() {
    setBootstrapLoading(true);
    try {
      const res = await fetch("/api/bootstrap", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load app.");
      setBootstrap(data);
      if (preferredTopic !== "any" && Array.isArray(data.topics) && !data.topics.includes(preferredTopic)) {
        setPreferredTopic("any");
      }
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
      setBootstrap({ user: null, topics: [] });
    } finally {
      setBootstrapLoading(false);
    }
  }

  // The heavy dashboard loads only after bootstrap resolves the user state.
  async function refreshDashboard() {
    setDashboardLoading(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load dashboard.");
      setDashboard(data);
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setDashboardLoading(false);
    }
  }

  async function start() {
    if (!canGoNext) return;
    setIsGenerating(true);
    setGenerationMode("round");
    clearPersistedRound();
    resetRound();

    try {
      const t0 = Date.now();
      const res = await fetchWithRetry(
        "/api/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            difficulty: preferredDifficulty,
            topic: preferredTopic,
            excludeScenarioIds: readRecentScenarioIds(),
            session_id: getOrCreateSessionId(),
          }),
        },
        (attempt) => setRetryInfo(attempt > 1 ? `Retrying... (${attempt}/${MAX_RETRY_ATTEMPTS})` : null)
      );

      if (!res.ok) throw new Error(`Generate failed (${res.status}). ${await res.text()}`);
      const data = (await res.json()) as Round;
      await ensureMinLoadTime(t0, MIN_SHIMMER_MS);
      replaceRound({ ...data, isDaily: false });
      setRetryInfo(null);
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setIsGenerating(false);
      setGenerationMode(null);
    }
  }

  async function startDaily() {
    if (!canGoNext) return;
    setGenerationMode("daily");
    try {
      const key = dailyCacheKey;
      const cached = localStorage.getItem(key);
      if (cached) {
        const cachedRound = JSON.parse(cached) as Round;
        clearPersistedRound();
        const viewingCompletedDaily = dailyChallengeLabel === "View Today's Daily";
        if (viewingCompletedDaily) {
          setIsRestoringResult(true);
        }
        replaceRound(
          { ...cachedRound, isDaily: true },
          { dailyCacheKey: key, preserveRestoring: viewingCompletedDaily }
        );
        return;
      }

      setIsGenerating(true);
      clearPersistedRound();
      resetRound();

      const query = new URLSearchParams({ daily: "true" });
      if (preferredDifficulty !== "any") query.set("difficulty", preferredDifficulty);
      if (preferredTopic !== "any") query.set("topic", preferredTopic);

      const t0 = Date.now();
      const res = await fetchWithRetry(
        `/api/generate?${query.toString()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: getOrCreateSessionId() }),
        },
        (attempt) => setRetryInfo(attempt > 1 ? `Retrying daily... (${attempt}/${MAX_RETRY_ATTEMPTS})` : null)
      );

      if (!res.ok) throw new Error(`Daily challenge failed (${res.status}). ${await res.text()}`);
      const data = (await res.json()) as Round;
      await ensureMinLoadTime(t0, MIN_SHIMMER_MS);
      replaceRound({ ...data, isDaily: true }, { dailyCacheKey: key });
      setRetryInfo(null);
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setIsGenerating(false);
      setGenerationMode(null);
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
            round_id: round.roundId,
            scenario_id: round.scenarioId,
            session_id: getOrCreateSessionId(),
            design_text: round.design_text,
            player_kind: choice,
            player_bucket: bucket,
            practice_only: practiceRetryActive,
          }),
        },
        (attempt) => setRetryInfo(attempt > 1 ? `Retrying evaluation... (${attempt}/${MAX_RETRY_ATTEMPTS})` : null)
      );

      if (!res.ok) throw new Error(`Evaluate failed: ${res.status} ${await res.text()}`);
      await ensureMinLoadTime(t0, MIN_SHIMMER_MS);
      const data = (await res.json()) as EvalResp;
      setEvalResp(data);
      if (!user && !practiceRetryActive) {
        setScore((currentScore) => currentScore + (data.score_delta ?? 0));
      }
      setReveal(true);
      setRetryInfo(null);
      if (!practiceRetryActive) {
        await refreshDashboard();
      }
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setIsEvaluating(false);
    }
  }

  function retryRoundForPractice() {
    setPracticeRetryActive(true);
    setReveal(false);
    setEvalResp(null);
    setChoice(null);
    setBucket(null);
    setErrorMsg(null);
    setRetryInfo(null);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setErrorMsg(null);

    try {
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        authMode === "login"
          ? { email: authForm.email, password: authForm.password }
          : { email: authForm.email, username: authForm.username, password: authForm.password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed.");

      setAuthForm({ email: "", username: "", password: "" });
      await refreshBootstrap();
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await refreshBootstrap();
  }

  const card = "bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800";
  const textMain = "text-gray-900 dark:text-gray-100";
  const textSub = "text-gray-700 dark:text-gray-300";
  const textMuted = "text-gray-600 dark:text-gray-400";
  const selectedTopicLabel = preferredTopic === "any" ? "Any Topic" : preferredTopic;

  return (
    <main className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <h1 className={`select-none text-3xl font-extrabold tracking-tight ${textMain}`}>
              Arch <span className="text-blue-600">Duel</span>
            </h1>
            <p className={`select-none mt-2 max-w-3xl ${textSub}`}>
              Practice system design with short architecture prompts, sharpen your judgment, and track how your decisions improve over time.
            </p>
          </div>

          <div className="shrink-0 ml-auto flex flex-wrap items-center justify-end gap-2">
            <div className={`select-none inline-flex rounded-xl border ${card} overflow-hidden`}>
              {(["system", "light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={[
                    "select-none cursor-pointer caret-transparent px-3 py-2 text-sm transition-all duration-200 active:scale-[0.99]",
                    theme === t ? "bg-blue-600 text-white" : "bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800",
                    theme === t ? "" : textSub,
                  ].join(" ")}
                >
                  {t === "system" ? "System" : t === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>

            {user ? (
              <div className={`select-none text-sm px-4 py-2 rounded-full ${card}`}>
                <span className={textSub}>{scoreLabel} </span>
                <span className={`font-semibold ${textMain}`}>{authResolved ? displayedScore : "..."}</span>
              </div>
            ) : null}

            {user ? (
              <div ref={accountMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((current) => !current)}
                  className={`select-none cursor-pointer caret-transparent inline-flex max-w-full items-center gap-3 rounded-xl border px-4 py-2 ${card}`}
                >
                  <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
                    {user.username.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 text-left">
                    <p className={`truncate text-sm font-semibold ${textMain}`}>{user.username}</p>
                    <p className={`truncate text-xs ${textMuted}`}>{user.role === "admin" ? "Admin account" : "Player account"}</p>
                  </div>
                  <span className={`select-none text-xs transition-transform ${accountMenuOpen ? "rotate-180" : ""} ${textMuted}`}>▼</span>
                </button>

                {accountMenuOpen ? (
                  <div className={`absolute right-0 mt-2 w-72 rounded-2xl border p-3 ${card} z-20`}>
                    <div className="rounded-xl bg-gray-50 px-3 py-3 dark:bg-gray-950">
                      <p className={`text-sm font-semibold ${textMain}`}>{user.username}</p>
                      <p className={`mt-1 text-sm break-all ${textMuted}`}>{user.email}</p>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {user.role === "admin" ? (
                        <Link
                          href="/admin"
                          onClick={() => setAccountMenuOpen(false)}
                          className="select-none caret-transparent rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-100 dark:border-gray-800 dark:hover:bg-gray-900"
                        >
                          Admin Console
                        </Link>
                      ) : null}
                      <button
                        onClick={logout}
                        className="select-none cursor-pointer caret-transparent rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-700"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {!authResolved ? (
          <section className="mt-8 grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
            <div className={`rounded-2xl p-6 sm:p-8 ${card}`}>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-4 h-10 w-[80%]" />
              <Skeleton className="mt-3 h-5 w-[92%]" />
              <Skeleton className="mt-2 h-5 w-[75%]" />
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-28 w-full rounded-xl" />
              </div>
            </div>

            <section className={`rounded-2xl p-6 sm:p-8 ${card}`}>
              <Skeleton className="h-7 w-40" />
              <Skeleton className="mt-3 h-4 w-[90%]" />
              <div className="mt-6 space-y-3">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
              {bootstrapLoadTimedOut ? (
                <p className={`mt-4 text-sm ${textMuted}`}>Still checking your session...</p>
              ) : null}
            </section>
          </section>
        ) : !user ? (
          <section className="mt-8 grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
            <div className={`rounded-2xl p-6 sm:p-8 ${card}`}>
              <p className={`text-sm uppercase tracking-[0.2em] ${textMuted}`}>Daily System Design Trainer</p>
              <h2 className={`mt-3 text-3xl sm:text-4xl font-extrabold leading-tight ${textMain}`}>
                Train your system design instincts, one round at a time.
              </h2>
              <p className={`mt-4 max-w-2xl text-base sm:text-lg ${textSub}`}>
                Read a proposed design, decide whether it holds up, identify the weakest part of the system, and learn from the feedback after each round.
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                  <p className={`text-xs uppercase tracking-wide ${textMuted}`}>Practice</p>
                  <p className={`mt-2 text-sm ${textMain}`}>Filter by difficulty and topic, then play fresh or daily rounds.</p>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                  <p className={`text-xs uppercase tracking-wide ${textMuted}`}>Track</p>
                  <p className={`mt-2 text-sm ${textMain}`}>Save streaks, weak areas, history, and leaderboard progress in Postgres.</p>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                  <p className={`text-xs uppercase tracking-wide ${textMuted}`}>Expand</p>
                  <p className={`mt-2 text-sm ${textMain}`}>Admins can seed packs and generate new scenario batches with Gemini.</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {topics.slice(0, 8).map((topic) => (
                  <span key={topic} className="px-3 py-2 rounded-full border border-gray-200 bg-white text-sm text-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:border-gray-800">
                    {topic}
                  </span>
                ))}
              </div>
            </div>

            <section className={`rounded-2xl p-6 sm:p-8 ${card}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className={`text-xl font-semibold ${textMain}`}>{authMode === "login" ? "Login" : "Create Account"}</h3>
                  <p className={`mt-1 text-sm ${textMuted}`}>
                    {authMode === "login"
                      ? "Continue to your dashboard, saved history, and leaderboard progress."
                      : "Create an account to unlock saved progress, history, and leaderboard tracking."}
                  </p>
                </div>
              </div>

              <form onSubmit={submitAuth} className="mt-6 space-y-3">
                <input
                  value={authForm.email}
                  onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Email"
                  className="w-full px-3 py-3 rounded-lg border border-gray-300 bg-white dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100"
                />
                {authMode === "register" ? (
                  <input
                    value={authForm.username}
                    onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))}
                    placeholder="Username"
                    className="w-full px-3 py-3 rounded-lg border border-gray-300 bg-white dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100"
                  />
                ) : null}
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Password"
                  className="w-full px-3 py-3 rounded-lg border border-gray-300 bg-white dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100"
                />
                <button
                  type="submit"
                  disabled={authBusy}
                  className="select-none cursor-pointer caret-transparent w-full px-4 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {authBusy ? "Working..." : authMode === "login" ? "Login" : "Register"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => setAuthMode((current) => (current === "login" ? "register" : "login"))}
                className={`mt-4 select-none cursor-pointer caret-transparent text-sm ${textMuted}`}
              >
                {authMode === "login" ? "Need an account? Switch to register." : "Already registered? Switch to login."}
              </button>
            </section>
          </section>
        ) : null}

        {user ? (
          <div className="mt-6 grid grid-cols-1 xl:grid-cols-[1.35fr_1.3fr_0.62fr_0.88fr] gap-3 items-stretch">
            <div className={`select-none inline-flex h-14 rounded-2xl border ${card} overflow-hidden`}>
              {DIFFICULTY_OPTIONS.map((level) => (
                <button
                  key={level}
                  onClick={() => setPreferredDifficulty(level)}
                  disabled={isGenerating}
                  className={[
                    "select-none cursor-pointer caret-transparent flex-1 px-3 py-2 text-sm transition-all duration-200 active:scale-[0.99] disabled:opacity-50",
                    preferredDifficulty === level ? "bg-blue-600 text-white" : "bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800",
                    preferredDifficulty === level ? "" : textSub,
                  ].join(" ")}
                >
                  {level === "any" ? "Any Difficulty" : level}
                </button>
              ))}
            </div>

            <div ref={topicMenuRef} className="relative min-w-0">
              <button
                type="button"
                onClick={() => setTopicMenuOpen((current) => !current)}
                className="select-none cursor-pointer caret-transparent h-14 w-full px-4 rounded-2xl border border-gray-300 bg-white dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 flex items-center justify-between text-left"
              >
                <div className="min-w-0">
                  <p className={`text-xs uppercase tracking-[0.18em] ${textMuted}`}>Topic</p>
                  <p className={`truncate text-base ${textMain}`}>{selectedTopicLabel}</p>
                </div>
                <span className={`select-none text-sm transition-transform ${topicMenuOpen ? "rotate-180" : ""} ${textMuted}`}>▼</span>
              </button>

              {topicMenuOpen ? (
                <div className={`absolute left-0 right-0 mt-2 rounded-2xl border p-3 ${card} z-20`}>
                  <button
                    type="button"
                    onClick={() => {
                      setPreferredTopic("any");
                      setTopicMenuOpen(false);
                    }}
                    className={[
                      "select-none cursor-pointer caret-transparent mb-3 w-full rounded-xl border px-3 py-3 text-left transition-colors",
                      preferredTopic === "any"
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-200"
                        : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900",
                    ].join(" ")}
                  >
                    <p className="text-sm font-medium">Any Topic</p>
                    <p className={`mt-1 text-xs ${textMuted}`}>Mix across the full active scenario catalog.</p>
                  </button>

                  <div className="flex flex-wrap gap-2">
                    {topics.map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => {
                          setPreferredTopic(topic);
                          setTopicMenuOpen(false);
                        }}
                        className={[
                          "select-none cursor-pointer caret-transparent rounded-full border px-3 py-2 text-sm transition-colors",
                          preferredTopic === topic
                            ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-200"
                            : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900",
                        ].join(" ")}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <button onClick={start} disabled={nextRoundDisabled} className="select-none caret-transparent w-full h-14 px-5 py-3 rounded-2xl bg-blue-600 text-white cursor-pointer hover:bg-blue-700 transition-all duration-200 active:scale-[0.99] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {isGenerating && generationMode === "round" ? <Spinner /> : null}
              {nextRoundLabel}
            </button>

            <button onClick={startDaily} disabled={dailyChallengeDisabled} className="select-none caret-transparent w-full h-14 px-5 py-3 rounded-2xl border border-gray-300 bg-white cursor-pointer hover:bg-gray-50 transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center dark:bg-gray-950 dark:hover:bg-gray-900 dark:border-gray-800 dark:text-gray-100">
              {dailyChallengeLabel}
            </button>
          </div>
        ) : null}

        {errorMsg ? <div className="mt-4 p-3 rounded border border-red-300 bg-red-50 text-sm dark:border-red-900 dark:bg-red-950 dark:text-red-200">{errorMsg}</div> : null}
        {retryInfo ? <div className="mt-3 p-3 rounded border border-blue-200 bg-blue-50 text-sm dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">{retryInfo}</div> : null}

        {!user && authResolved ? (
          <section className={`mt-8 rounded-2xl p-6 sm:p-8 ${card}`}>
            <p className={`text-sm uppercase tracking-[0.18em] ${textMuted}`}>How It Works</p>
            <h2 className={`mt-3 text-2xl sm:text-3xl font-semibold ${textMain}`}>Sign in to start playing</h2>
            <p className={`mt-3 max-w-3xl ${textSub}`}>
              Create an account or log in to unlock rounds, daily challenges, score tracking, progress history, and leaderboard participation.
            </p>
          </section>
        ) : null}

        {!round && !isGenerating && authResolved && user ? (
          <section className={`mt-8 rounded-xl p-4 sm:p-6 ${card}`}>
            <h2 className={`text-lg sm:text-xl font-semibold ${textMain}`}>Welcome to Arch Duel</h2>
            <p className={`mt-2 text-sm sm:text-base ${textSub}`}>
              Pick a topic and difficulty, play a fresh round or the daily challenge, and build confidence through repeated practice.
            </p>
          </section>
        ) : null}

        {user && isGenerating ? (
          <section className="mt-8">
            <div className={`text-sm ${textSub} h-4 w-20 rounded shimmer`} />
            <div className={`mt-2 text-lg font-semibold ${textMain} h-6 w-40 rounded shimmer`} />
            <div className={`mt-5 min-h-[200px] p-4 sm:p-6 rounded-xl ${card}`}>
              <div className="space-y-3">
                <Skeleton className="h-4 w-[90%]" />
                <Skeleton className="h-4 w-[96%]" />
                <Skeleton className="h-4 w-[88%]" />
                <Skeleton className="h-4 w-[92%]" />
              </div>
            </div>
          </section>
        ) : null}

        {user && round && !isGenerating ? (
          <section className="mt-8">
            <div className={`text-sm ${textSub}`}>
              <span>Topic: <b>{round.topic}</b></span>
              <span className="mx-2 text-gray-500">•</span>
              <span>Difficulty: <b>{round.difficulty}</b></span>
            </div>
            <h2 className={`mt-2 text-lg sm:text-xl font-semibold ${textMain}`}>{round.prompt}</h2>
            <div className={`mt-5 min-h-[200px] p-4 sm:p-6 rounded-xl ${card}`}>
              <div className={`whitespace-pre-wrap leading-relaxed ${textSub}`}>{round.design_text}</div>
            </div>
            <hr className="my-8 border-gray-200 dark:border-gray-800" />

            <h3 className={`text-lg font-semibold mb-3 ${textMain}`}>1) Classify</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.keys(KIND_LABELS) as Kind[]).map((k) => {
                const active = choice === k;
                return (
                  <button
                    key={k}
                    onClick={() => handleChoiceSelect(k)}
                    disabled={answerControlsLocked}
                    className={[
                      "select-none caret-transparent p-4 rounded-xl border transition-all duration-200 cursor-pointer text-left disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none",
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

            <h3 className={`text-lg font-semibold mt-7 mb-1 ${textMain}`}>2) Pick missing or most impacted bucket</h3>
            {choice === "legit" ? (
              <p className={`mb-3 text-sm ${textMuted}`}>If you think the design is legit, select <b>None</b> for the bucket.</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {BUCKETS.map((b) => (
                <button
                  key={b}
                  onClick={() => handleBucketSelect(b)}
                  disabled={answerControlsLocked}
                  className={[
                    "select-none caret-transparent px-3 py-2 rounded-full border text-sm cursor-pointer transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none",
                    bucket === b
                      ? "border-blue-200 bg-blue-50 ring-2 ring-blue-500 ring-offset-2 dark:bg-blue-950/40 dark:border-blue-900 dark:ring-offset-gray-950"
                      : "border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 dark:bg-gray-950 dark:border-gray-800 dark:hover:bg-gray-900",
                    textMain,
                  ].join(" ")}
                >
                  {BUCKET_LABELS[b]}
                </button>
              ))}
            </div>

            {choice && bucket ? (
              <div className="mt-6">
                {answerControlsLocked ? (
                  <div className={`inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300`}>
                    This round has already been scored.
                  </div>
                ) : (
                  <button onClick={submit} disabled={isEvaluating} className="select-none caret-transparent cursor-pointer w-full sm:w-auto h-12 px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 justify-center">
                    {isEvaluating ? <Spinner /> : null}
                    Submit Answer
                  </button>
                )}
              </div>
            ) : (
              <p className={`mt-4 text-sm ${textMuted}`}>
                {answerControlsLocked
                  ? "Start a practice retry to change your answer, or move on to the next round."
                  : "Select a classification and bucket to unlock Submit."}
              </p>
            )}

            {evalResp && !isEvaluating ? (
              <div className={`mt-7 p-5 rounded-xl ${card}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className={`text-xs uppercase tracking-[0.18em] ${textMuted}`}>Round Result</p>
                    <div className={`mt-2 font-semibold text-xl ${textMain}`}>
                      {evalResp.practice_only ? "Practice retry" : evalResp.correct ? "Correct answer" : "Not quite"}
                    </div>
                    <p className={`mt-1 text-sm ${textSub}`}>
                      {evalResp.practice_only
                        ? "This retry is for learning only and does not affect score, streak, or leaderboard."
                        : evalResp.correct
                        ? "You identified the design correctly."
                        : "Compare your selection with the expected answer and review the hidden issue below."}
                    </p>
                  </div>
                  <div
                    className={[
                      "inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold",
                      evalResp.practice_only
                        ? "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        : evalResp.correct
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                    ].join(" ")}
                  >
                    {evalResp.practice_only ? "Not scored" : `Score ${evalResp.score_delta >= 0 ? "+" : ""}${evalResp.score_delta}`}
                  </div>
                </div>

                <div className="mt-5">
                  <h4 className={`font-semibold ${textMain}`}>Correct Answer vs Your Submission</h4>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                      <p className={`text-xs uppercase tracking-wide ${textMuted}`}>Correct Answer</p>
                      <div className="mt-3 space-y-2">
                        <div>
                          <p className={`text-xs ${textMuted}`}>Classification</p>
                          <p className={`text-sm font-medium ${textMain}`}>{KIND_LABELS[evalResp.ground_truth.kind]}</p>
                        </div>
                        <div>
                          <p className={`text-xs ${textMuted}`}>Bucket</p>
                          <p className={`text-sm font-medium ${textMain}`}>{BUCKET_LABELS[evalResp.ground_truth.bucket]}</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                      <p className={`text-xs uppercase tracking-wide ${textMuted}`}>Your Pick</p>
                      <div className="mt-3 space-y-2">
                        <div>
                          <p className={`text-xs ${textMuted}`}>Classification</p>
                          <p className={`text-sm font-medium ${textMain}`}>{choice ? KIND_LABELS[choice] : "-"}</p>
                        </div>
                        <div>
                          <p className={`text-xs ${textMuted}`}>Bucket</p>
                          <p className={`text-sm font-medium ${textMain}`}>{bucket ? BUCKET_LABELS[bucket] : "-"}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                    <h4 className={`font-semibold ${textMain}`}>Why</h4>
                    <p className={`mt-3 text-sm ${textSub}`}>{evalResp.why}</p>

                    {evalResp.ground_truth.kind !== "legit" ? (
                      <>
                        <h4 className={`mt-4 font-semibold ${textMain}`}>Hidden Issue</h4>
                        <p className={`mt-3 text-sm ${textSub}`}>{evalResp.ground_truth.hidden_issue}</p>
                      </>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                    <h4 className={`font-semibold ${textMain}`}>Key Takeaway</h4>
                    <p className={`mt-3 text-sm ${textSub}`}>{evalResp.learning_takeaway}</p>
                  </div>
                </div>

                <div className="mt-5 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                  <h4 className={`font-semibold ${textMain}`}>Verdict</h4>
                  <p className={`mt-3 text-sm ${textSub}`}>{evalResp.short_verdict}</p>
                </div>

                {evalResp.what_to_fix.length > 0 ? (
                  <div className="mt-5 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                    <h4 className={`font-semibold ${textMain}`}>What to Fix</h4>
                    <ul className={`list-disc pl-5 text-sm mt-3 ${textSub}`}>
                      {evalResp.what_to_fix.map((item, index) => <li key={index}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}

                {!evalResp.practice_only ? (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={retryRoundForPractice}
                      className="select-none caret-transparent cursor-pointer rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-100 dark:border-gray-800 dark:hover:bg-gray-900"
                    >
                      Retry This Round (Practice)
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {user ? (
        <section className="mt-10 grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6">
          <div className="space-y-6">
            <section className={`rounded-xl p-4 sm:p-5 ${card}`}>
              <h2 className={`text-lg font-semibold ${textMain}`}>Your Progress</h2>
              {dashboardLoading ? (
                <div className="mt-4 space-y-3">
                  <Skeleton className="h-5 w-[40%]" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : user && dashboard?.stats ? (
                <>
                  <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3"><p className={`text-xs ${textMuted}`}>Attempts</p><p className={`mt-1 text-xl font-semibold ${textMain}`}>{dashboard.stats.summary.totalAttempts}</p></div>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3"><p className={`text-xs ${textMuted}`}>Correct</p><p className={`mt-1 text-xl font-semibold ${textMain}`}>{dashboard.stats.summary.correctAttempts}</p></div>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3"><p className={`text-xs ${textMuted}`}>Accuracy</p><p className={`mt-1 text-xl font-semibold ${textMain}`}>{dashboard.stats.summary.accuracy}%</p></div>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3"><p className={`text-xs ${textMuted}`}>Score</p><p className={`mt-1 text-xl font-semibold ${textMain}`}>{dashboard.stats.summary.totalScore}</p></div>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3"><p className={`text-xs ${textMuted}`}>Streak</p><p className={`mt-1 text-xl font-semibold ${textMain}`}>{dashboard.stats.summary.streak}d</p></div>
                  </div>

                  <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                      <h3 className={`font-semibold ${textMain}`}>Recent Weak Areas</h3>
                      <div className="mt-3 space-y-2">
                        {meaningfulWeakAreas.length > 0 ? (
                          meaningfulWeakAreas.map((item) => (
                            <div key={item.topic} className="rounded-lg border border-gray-200/70 p-3 dark:border-gray-800/80">
                              <p className={`text-sm font-medium ${textMain}`}>{item.topic}</p>
                              <p className={`mt-1 text-sm ${textMuted}`}>
                                {item.accuracy}% accuracy across {item.attempts} {item.attempts === 1 ? "attempt" : "attempts"}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className={`text-sm ${textMuted}`}>
                            Not enough recent data yet. Play at least {MIN_WEAK_AREA_ATTEMPTS} recent rounds in a topic to identify a real weak area.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                      <h3 className={`font-semibold ${textMain}`}>By Difficulty</h3>
                      <div className="mt-3 space-y-2">
                        {dashboard.stats.difficultyStats.map((item) => (
                          <div key={item.difficulty} className="rounded-lg border border-gray-200/70 p-3 dark:border-gray-800/80">
                            <p className={`text-sm font-medium capitalize ${textMain}`}>{item.difficulty}</p>
                            <p className={`mt-1 text-sm ${textMuted}`}>
                              {item.accuracy}% accuracy across {item.attempts} {item.attempts === 1 ? "attempt" : "attempts"}
                              {item.attempts < MIN_WEAK_AREA_ATTEMPTS ? " (low sample)" : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className={`font-semibold ${textMain}`}>Recent History</h3>
                        <p className={`mt-1 text-sm ${textMuted}`}>The dashboard stays focused on your latest 10 attempts.</p>
                      </div>
                      <Link
                        href="/history"
                        className="select-none caret-transparent inline-flex h-10 items-center justify-center rounded-xl border border-gray-300 px-4 text-sm text-gray-900 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900"
                      >
                        View all history
                      </Link>
                    </div>
                    <div className="mt-3 space-y-3">
                      {dashboard.stats.history.map((item) => (
                        <div key={item.attemptId} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`font-medium ${textMain}`}>{item.topic}</span>
                            <span className={`text-xs ${textMuted}`}>{new Date(item.createdAt).toLocaleString()}</span>
                          </div>
                          <p className={`mt-2 text-sm ${textSub}`}>{item.prompt}</p>
                          <p className={`mt-2 text-sm ${textMuted}`}>
                            {item.shortVerdict}
                            <span className="mx-2 text-gray-500">•</span>
                            {item.difficulty}
                            <span className="mx-2 text-gray-500">•</span>
                            Score {item.scoreDelta >= 0 ? "+" : ""}{item.scoreDelta}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className={`mt-4 text-sm ${textMuted}`}>Login to unlock persistent history, topic stats, and streak tracking.</p>
              )}
            </section>

          </div>

          <div className="space-y-6">
            <section className={`rounded-xl p-4 sm:p-5 ${card}`}>
              <h2 className={`text-lg font-semibold ${textMain}`}>Leaderboard</h2>
              <div className="mt-4 space-y-3">
                {dashboardLoading ? (
                  <>
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </>
                ) : (
                  (dashboard?.leaderboard ?? []).map((entry, index) => (
                    <div key={entry.userId} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                      <div>
                        <p className={`font-medium ${textMain}`}>#{index + 1} {entry.username}</p>
                        <p className={`text-sm ${textMuted}`}>
                          {entry.accuracy}% accuracy
                          <span className="mx-2 text-gray-500">•</span>
                          {entry.totalAttempts} attempts
                          <span className="mx-2 text-gray-500">•</span>
                          {entry.streak}d streak
                        </p>
                      </div>
                      <span className={`font-semibold ${textMain}`}>{entry.totalScore}</span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className={`rounded-xl p-4 sm:p-5 ${card}`}>
              <h2 className={`text-lg font-semibold ${textMain}`}>Topic Coverage</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {topics.map((topic) => (
                  <button
                    key={topic}
                    onClick={() => setPreferredTopic(topic)}
                    className={[
                      "select-none caret-transparent cursor-pointer px-3 py-2 rounded-full border text-sm",
                      preferredTopic === topic ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:border-gray-800",
                    ].join(" ")}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </section>
        ) : null}
      </div>
    </main>
  );
}
