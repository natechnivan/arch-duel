"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Skeleton } from "@/app/components/Skeleton";
import { listScenarioTopics } from "@/app/api/_lib/scenarios";

type Difficulty = "junior" | "mid" | "senior" | "staff";

type User = {
  id: string;
  email: string;
  username: string;
  role: string;
};

type ScenarioPack = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  scenarioCount: number;
};

type ScenarioPackDetails = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  scenarios: Array<{
    id: string;
    slug: string;
    topic: string;
    difficulty: string;
    prompt: string;
  }>;
  scenarioPagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
    query: string;
  };
};

type DashboardData = {
  user: User | null;
  admin: null | ScenarioPack[];
};

type PromptValidationResult = {
  scenario: {
    id: string;
    topic: string;
    difficulty: string;
    prompt: string;
  };
  generated: {
    kind: string;
    missing_bucket: string;
    hidden_issue: string;
    design_text: string;
  };
  issues: string[];
};

const DIFFICULTY_OPTIONS: Difficulty[] = ["junior", "mid", "senior", "staff"];
const TOPIC_OPTIONS = listScenarioTopics();

export default function AdminPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [packsLoading, setPacksLoading] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [packForm, setPackForm] = useState({ slug: "", name: "", description: "" });
  const [scenarioForm, setScenarioForm] = useState({
    packId: "",
    slug: "",
    topic: TOPIC_OPTIONS[0] ?? "",
    difficulty: "mid" as Difficulty,
    prompt: "",
  });
  const [aiScenarioForm, setAiScenarioForm] = useState({
    packId: "",
    count: 10,
    difficulty: "mixed" as Difficulty | "mixed",
    theme: "",
  });
  const [validationForm, setValidationForm] = useState({
    count: 3,
    difficulty: "any" as Difficulty | "any",
    topic: "",
  });
  const [validationBusy, setValidationBusy] = useState(false);
  const [validationResults, setValidationResults] = useState<PromptValidationResult[]>([]);
  const [selectedPackId, setSelectedPackId] = useState("");
  const [selectedPackDetails, setSelectedPackDetails] = useState<ScenarioPackDetails | null>(null);
  const [packEditForm, setPackEditForm] = useState({ slug: "", name: "", description: "" });
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [scenarioEditForm, setScenarioEditForm] = useState({
    slug: "",
    topic: TOPIC_OPTIONS[0] ?? "",
    difficulty: "mid" as Difficulty,
    prompt: "",
  });
  const [packDetailsLoading, setPackDetailsLoading] = useState(false);
  const [scenarioPage, setScenarioPage] = useState(1);
  const [scenarioSearchInput, setScenarioSearchInput] = useState("");
  const [scenarioQuery, setScenarioQuery] = useState("");
  const user = dashboard?.user ?? null;

  useEffect(() => {
    void refreshOverview();
  }, []);

  useEffect(() => {
    if (!overviewLoading) {
      setLoadTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setLoadTimedOut(true);
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [overviewLoading]);

  useEffect(() => {
    const defaultPackId = dashboard?.admin?.[0]?.id ?? "";

    if (defaultPackId && !scenarioForm.packId) {
      setScenarioForm((current) => ({ ...current, packId: defaultPackId }));
    }

    if (defaultPackId && !aiScenarioForm.packId) {
      setAiScenarioForm((current) => ({ ...current, packId: defaultPackId }));
    }

    if (defaultPackId && !selectedPackId) {
      setSelectedPackId(defaultPackId);
    }
  }, [dashboard?.admin, scenarioForm.packId, aiScenarioForm.packId, selectedPackId]);

  function selectPack(packId: string) {
    setSelectedPackId(packId);
    setScenarioPage(1);
    setScenarioSearchInput("");
    setScenarioQuery("");
    setSelectedScenarioId("");
  }

  useEffect(() => {
    if (!selectedPackId || !user || user.role !== "admin") {
      setSelectedPackDetails(null);
      setPackEditForm({ slug: "", name: "", description: "" });
      setSelectedScenarioId("");
      setScenarioEditForm({ slug: "", topic: TOPIC_OPTIONS[0] ?? "", difficulty: "mid", prompt: "" });
      setPackDetailsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPackDetails() {
      setPackDetailsLoading(true);

      try {
        const searchParams = new URLSearchParams({ page: String(scenarioPage) });
        if (scenarioQuery) {
          searchParams.set("q", scenarioQuery);
        }
        const res = await fetch(`/api/admin/scenario-packs/${selectedPackId}?${searchParams.toString()}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Failed to load scenario pack.");
        }

        if (!cancelled) {
          const pack = data.pack ?? null;
          setSelectedPackDetails(pack);
          setPackEditForm({
            slug: pack?.slug ?? "",
            name: pack?.name ?? "",
            description: pack?.description ?? "",
          });
          setScenarioSearchInput(pack?.scenarioPagination?.query ?? scenarioQuery);
          const firstScenario = pack?.scenarios?.[0];
          setSelectedScenarioId((current) =>
            current && pack?.scenarios?.some((scenario: { id: string }) => scenario.id === current)
              ? current
              : (firstScenario?.id ?? "")
          );
        }
      } catch (error: any) {
        if (!cancelled) {
          setSelectedPackDetails(null);
          setErrorMsg((current) => current ?? String(error?.message ?? error));
        }
      } finally {
        if (!cancelled) {
          setPackDetailsLoading(false);
        }
      }
    }

    void loadPackDetails();

    return () => {
      cancelled = true;
    };
  }, [selectedPackId, user?.id, user?.role, scenarioPage, scenarioQuery]);

  useEffect(() => {
    const selectedScenario = selectedPackDetails?.scenarios.find((scenario) => scenario.id === selectedScenarioId);
    if (!selectedScenario) {
      setScenarioEditForm({ slug: "", topic: TOPIC_OPTIONS[0] ?? "", difficulty: "mid", prompt: "" });
      return;
    }

    setScenarioEditForm({
      slug: selectedScenario.slug,
      topic: selectedScenario.topic,
      difficulty: selectedScenario.difficulty as Difficulty,
      prompt: selectedScenario.prompt,
    });
  }, [selectedPackDetails, selectedScenarioId]);

  useEffect(() => {
    if (!user || user.role !== "admin") {
      return;
    }

    void refreshPackSummaries();
  }, [user?.id, user?.role]);

  async function refreshOverview() {
    setOverviewLoading(true);
    setLoadTimedOut(false);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to load admin dashboard.");
      }
      setDashboard(data);
    } catch (error: any) {
      setErrorMsg(String(error?.message ?? error));
      setDashboard({ user: null, admin: null });
    } finally {
      setOverviewLoading(false);
    }
  }

  async function refreshPackSummaries() {
    setPacksLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/scenario-packs", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to load scenario packs.");
      }

      setDashboard((current) => ({
        user: current?.user ?? null,
        admin: data.packs ?? [],
      }));
    } catch (error: any) {
      setErrorMsg(String(error?.message ?? error));
      setDashboard((current) => ({
        user: current?.user ?? null,
        admin: [],
      }));
    } finally {
      setPacksLoading(false);
    }
  }

  async function refreshSelectedPackDetails(
    packId = selectedPackId,
    options?: {
      page?: number;
      query?: string;
    }
  ) {
    if (!packId) {
      return;
    }

    setPackDetailsLoading(true);

    try {
      const nextPage = options?.page ?? scenarioPage;
      const nextQuery = options?.query ?? scenarioQuery;
      if (options?.page !== undefined) {
        setScenarioPage(nextPage);
      }
      if (options?.query !== undefined) {
        setScenarioQuery(nextQuery);
      }
      const searchParams = new URLSearchParams({ page: String(nextPage) });
      if (nextQuery) {
        searchParams.set("q", nextQuery);
      }
      const res = await fetch(`/api/admin/scenario-packs/${packId}?${searchParams.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to load scenario pack.");
      }

      const pack = data.pack ?? null;
      setSelectedPackDetails(pack);
      setPackEditForm({
        slug: pack?.slug ?? "",
        name: pack?.name ?? "",
        description: pack?.description ?? "",
      });
      setScenarioSearchInput(pack?.scenarioPagination?.query ?? nextQuery);
      setSelectedScenarioId((current) =>
        current && pack?.scenarios?.some((scenario: { id: string }) => scenario.id === current)
          ? current
          : (pack?.scenarios?.[0]?.id ?? "")
      );
    } catch (error: any) {
      setSelectedPackDetails(null);
      setErrorMsg(String(error?.message ?? error));
    } finally {
      setPackDetailsLoading(false);
    }
  }

  async function seedDefaults() {
    setErrorMsg(null);
    setNotice(null);

    const res = await fetch("/api/admin/seed-defaults", { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      setErrorMsg(data.detail || "Failed to seed default scenarios.");
      return;
    }

    setNotice("Default scenario pack seeded.");
    await refreshPackSummaries();
  }

  async function createPack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg(null);
    setNotice(null);

    const res = await fetch("/api/admin/scenario-packs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(packForm),
    });
    const data = await res.json();

    if (!res.ok) {
      setErrorMsg(data.detail || "Failed to create scenario pack.");
      return;
    }

    setPackForm({ slug: "", name: "", description: "" });
    setNotice("Scenario pack created.");
    await refreshPackSummaries();
  }

  async function updatePack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPackId) {
      return;
    }

    setErrorMsg(null);
    setNotice(null);

    const res = await fetch(`/api/admin/scenario-packs/${selectedPackId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(packEditForm),
    });
    const data = await res.json();

    if (!res.ok) {
      setErrorMsg(data.detail || "Failed to update scenario pack.");
      return;
    }

    setNotice("Scenario pack updated.");
    await refreshPackSummaries();
    await refreshSelectedPackDetails(selectedPackId);
  }

  async function createScenarioEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg(null);
    setNotice(null);

    const res = await fetch("/api/admin/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenarioForm),
    });
    const data = await res.json();

    if (!res.ok) {
      setErrorMsg(data.detail || "Failed to create scenario.");
      return;
    }

    setScenarioForm((current) => ({ ...current, slug: "", topic: TOPIC_OPTIONS[0] ?? "", prompt: "" }));
    setNotice("Scenario created.");
    setScenarioPage(1);
    setScenarioQuery("");
    setScenarioSearchInput("");
    setSelectedScenarioId("");
    await refreshPackSummaries();
    await refreshSelectedPackDetails(scenarioForm.packId, { page: 1, query: "" });
  }

  async function updateScenarioEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedScenarioId) {
      return;
    }

    setErrorMsg(null);
    setNotice(null);

    const res = await fetch(`/api/admin/scenarios/${selectedScenarioId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenarioEditForm),
    });
    const data = await res.json();

    if (!res.ok) {
      setErrorMsg(data.detail || "Failed to update scenario.");
      return;
    }

    setNotice("Scenario updated.");
    await refreshPackSummaries();
    await refreshSelectedPackDetails(selectedPackId);
  }

  async function generateAiScenarios(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg(null);
    setNotice(null);

    const res = await fetch("/api/admin/generate-scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aiScenarioForm),
    });
    const data = await res.json();

    if (!res.ok) {
      setErrorMsg(data.detail || "Failed to generate AI scenarios.");
      return;
    }

    setNotice(`Generated ${data.inserted ?? 0} AI scenarios.`);
    await refreshPackSummaries();
  }

  async function validatePrompts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg(null);
    setNotice(null);
    setValidationBusy(true);

    try {
      const res = await fetch("/api/admin/validate-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: validationForm.count,
          difficulty: validationForm.difficulty,
          topic: validationForm.topic.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Failed to validate prompts.");
      }

      setValidationResults(data.results ?? []);
      setNotice(data.ok ? "Prompt validation passed for this sample batch." : "Prompt validation finished with flagged samples.");
    } catch (error: any) {
      setValidationResults([]);
      setErrorMsg(String(error?.message ?? error));
    } finally {
      setValidationBusy(false);
    }
  }

  function submitScenarioSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScenarioPage(1);
    setScenarioQuery(scenarioSearchInput.trim());
    setSelectedScenarioId("");
  }

  function clearScenarioSearch() {
    setScenarioSearchInput("");
    setScenarioQuery("");
    setScenarioPage(1);
    setSelectedScenarioId("");
  }

  const card = "bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800";
  const textMain = "text-gray-900 dark:text-gray-100";
  const textSub = "text-gray-700 dark:text-gray-300";
  const textMuted = "text-gray-600 dark:text-gray-400";
  const formControl =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500";
  const selectControl = (hasValue: boolean) =>
    [
      formControl,
      "appearance-none",
      hasValue ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-500",
    ].join(" ");
  return (
    <main className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className={`text-sm uppercase tracking-[0.2em] ${textMuted}`}>Internal Tools</p>
            <h1 className={`mt-2 text-3xl font-extrabold tracking-tight ${textMain}`}>Admin Console</h1>
            <p className={`mt-3 max-w-3xl ${textSub}`}>
              Manage scenario packs, expand topic coverage with AI-generated prompts, and keep operational tools away from the player experience.
            </p>
          </div>

          <Link
            href="/"
            className="shrink-0 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-100 dark:border-gray-800 dark:hover:bg-gray-900"
          >
            Back to game
          </Link>
        </div>

        {errorMsg ? (
          <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {errorMsg}
          </div>
        ) : null}
        {notice ? (
          <div className="mt-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
            {notice}
          </div>
        ) : null}

        {overviewLoading ? (
          <section className={`mt-8 rounded-xl p-6 ${card}`}>
            <div className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
            {loadTimedOut ? (
              <p className={`mt-4 text-sm ${textMuted}`}>Still loading admin data...</p>
            ) : null}
          </section>
        ) : !user ? (
          <section className={`mt-8 rounded-xl p-6 ${card}`}>
            <h2 className={`text-xl font-semibold ${textMain}`}>Login required</h2>
            <p className={`mt-2 ${textSub}`}>Sign in on the main page before accessing the admin console.</p>
          </section>
        ) : user.role !== "admin" ? (
          <section className={`mt-8 rounded-xl p-6 ${card}`}>
            <h2 className={`text-xl font-semibold ${textMain}`}>Forbidden</h2>
            <p className={`mt-2 ${textSub}`}>This route is restricted to explicitly authorized admin users.</p>
          </section>
        ) : (
          <section className="mt-8 grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
            <div className="space-y-6">
              <section className={`rounded-xl p-4 sm:p-5 ${card}`}>
                <h2 className={`text-lg font-semibold ${textMain}`}>Scenario Operations</h2>
                <p className={`mt-2 text-sm ${textMuted}`}>
                  Seed built-in coverage once, then grow the catalog through hand-authored or AI-generated scenarios.
                </p>
                <div className="mt-4">
                  <button
                    onClick={seedDefaults}
                    className="cursor-pointer px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Seed Default Scenarios
                  </button>
                </div>

                <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <form onSubmit={createPack} className="rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                    <h3 className={`font-semibold ${textMain}`}>Create Pack</h3>
                    <input
                      value={packForm.slug}
                      onChange={(event) => setPackForm((current) => ({ ...current, slug: event.target.value }))}
                      placeholder="pack-slug"
                      className={formControl}
                    />
                    <input
                      value={packForm.name}
                      onChange={(event) => setPackForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Pack name"
                      className={formControl}
                    />
                    <textarea
                      value={packForm.description}
                      onChange={(event) => setPackForm((current) => ({ ...current, description: event.target.value }))}
                      placeholder="Description"
                      className={`${formControl} min-h-[90px]`}
                    />
                    <button className="cursor-pointer px-4 py-2 rounded-lg bg-gray-900 text-white">Save Pack</button>
                  </form>

                  <form onSubmit={createScenarioEntry} className="rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                    <h3 className={`font-semibold ${textMain}`}>Create Scenario</h3>
                    <select
                      value={scenarioForm.packId}
                      onChange={(event) => setScenarioForm((current) => ({ ...current, packId: event.target.value }))}
                      className={selectControl(Boolean(scenarioForm.packId))}
                    >
                      <option value="">Select pack</option>
                      {(dashboard?.admin ?? []).map((pack) => (
                        <option key={pack.id} value={pack.id}>
                          {pack.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={scenarioForm.slug}
                      onChange={(event) => setScenarioForm((current) => ({ ...current, slug: event.target.value }))}
                      placeholder="scenario-slug"
                      className={formControl}
                    />
                    <select
                      value={scenarioForm.topic}
                      onChange={(event) => setScenarioForm((current) => ({ ...current, topic: event.target.value }))}
                      className={selectControl(true)}
                    >
                      {TOPIC_OPTIONS.map((topic) => (
                        <option key={topic} value={topic}>
                          {topic}
                        </option>
                      ))}
                    </select>
                    <select
                      value={scenarioForm.difficulty}
                      onChange={(event) =>
                        setScenarioForm((current) => ({ ...current, difficulty: event.target.value as Difficulty }))
                      }
                      className={selectControl(true)}
                    >
                      {DIFFICULTY_OPTIONS.map((difficulty) => (
                        <option key={difficulty} value={difficulty}>
                          {difficulty}
                        </option>
                      ))}
                    </select>
                    <textarea
                      value={scenarioForm.prompt}
                      onChange={(event) => setScenarioForm((current) => ({ ...current, prompt: event.target.value }))}
                      placeholder="Scenario prompt"
                      className={`${formControl} min-h-[110px]`}
                    />
                    <button className="cursor-pointer px-4 py-2 rounded-lg bg-gray-900 text-white">Save Scenario</button>
                  </form>
                </div>

                <form onSubmit={generateAiScenarios} className="mt-4 rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                  <h3 className={`font-semibold ${textMain}`}>Generate AI Scenarios</h3>
                  <p className={`text-sm ${textMuted}`}>
                    Generate broader topic coverage, but persist the results into a pack so gameplay, stats, and filters stay consistent.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <select
                      value={aiScenarioForm.packId}
                      onChange={(event) => setAiScenarioForm((current) => ({ ...current, packId: event.target.value }))}
                      className={selectControl(Boolean(aiScenarioForm.packId))}
                    >
                      <option value="">Select pack</option>
                      {(dashboard?.admin ?? []).map((pack) => (
                        <option key={pack.id} value={pack.id}>
                          {pack.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={aiScenarioForm.count}
                      onChange={(event) =>
                        setAiScenarioForm((current) => ({ ...current, count: Number(event.target.value || 1) }))
                      }
                      className={formControl}
                    />
                    <select
                      value={aiScenarioForm.difficulty}
                      onChange={(event) =>
                        setAiScenarioForm((current) => ({
                          ...current,
                          difficulty: event.target.value as Difficulty | "mixed",
                        }))
                      }
                      className={selectControl(true)}
                    >
                      <option value="mixed">Mixed</option>
                      {DIFFICULTY_OPTIONS.map((difficulty) => (
                        <option key={difficulty} value={difficulty}>
                          {difficulty}
                        </option>
                      ))}
                    </select>
                    <button className="cursor-pointer px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                      Generate Batch
                    </button>
                  </div>
                  <input
                    value={aiScenarioForm.theme}
                    onChange={(event) => setAiScenarioForm((current) => ({ ...current, theme: event.target.value }))}
                    placeholder="Optional theme, e.g. realtime systems, infra, fintech, marketplaces"
                    className={formControl}
                  />
                </form>

                <form onSubmit={validatePrompts} className="mt-4 rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                  <h3 className={`font-semibold ${textMain}`}>Validate Live Prompt Output</h3>
                  <p className={`text-sm ${textMuted}`}>
                    Run a small live sample through the round-generation prompt and flag inconsistent outputs before they reach players.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={validationForm.count}
                      onChange={(event) =>
                        setValidationForm((current) => ({ ...current, count: Number(event.target.value || 1) }))
                      }
                      className={formControl}
                    />
                    <select
                      value={validationForm.difficulty}
                      onChange={(event) =>
                        setValidationForm((current) => ({
                          ...current,
                          difficulty: event.target.value as Difficulty | "any",
                        }))
                      }
                      className={selectControl(validationForm.difficulty !== "any")}
                    >
                      <option value="any">Any difficulty</option>
                      {DIFFICULTY_OPTIONS.map((difficulty) => (
                        <option key={difficulty} value={difficulty}>
                          {difficulty}
                        </option>
                      ))}
                    </select>
                    <input
                      value={validationForm.topic}
                      onChange={(event) => setValidationForm((current) => ({ ...current, topic: event.target.value }))}
                      placeholder="Optional topic"
                      className={formControl}
                    />
                    <button className="cursor-pointer px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50" disabled={validationBusy}>
                      {validationBusy ? "Validating..." : "Run Validation"}
                    </button>
                  </div>

                  {validationResults.length > 0 ? (
                    <div className="space-y-3 pt-2">
                      {validationResults.map((result) => (
                        <div key={result.scenario.id} className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className={`font-medium ${textMain}`}>{result.scenario.topic}</p>
                              <p className={`mt-1 text-sm ${textMuted}`}>{result.scenario.difficulty}</p>
                              <p className={`mt-2 text-sm ${textSub}`}>{result.scenario.prompt}</p>
                            </div>
                            <span
                              className={[
                                "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                                result.issues.length === 0
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                              ].join(" ")}
                            >
                              {result.issues.length === 0 ? "Passed" : `${result.issues.length} issue${result.issues.length === 1 ? "" : "s"}`}
                            </span>
                          </div>

                          <div className="mt-3 grid gap-3 lg:grid-cols-2">
                            <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                              <p className={`text-xs uppercase tracking-wide ${textMuted}`}>Generated Answer</p>
                              <p className={`mt-2 text-sm ${textSub}`}>
                                Kind: <span className={textMain}>{result.generated.kind}</span>
                              </p>
                              <p className={`mt-1 text-sm ${textSub}`}>
                                Bucket: <span className={textMain}>{result.generated.missing_bucket}</span>
                              </p>
                              <p className={`mt-1 text-sm ${textSub}`}>
                                Hidden issue: <span className={textMain}>{result.generated.hidden_issue || "(empty)"}</span>
                              </p>
                            </div>
                            <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                              <p className={`text-xs uppercase tracking-wide ${textMuted}`}>Validation Notes</p>
                              {result.issues.length > 0 ? (
                                <ul className={`mt-2 list-disc pl-5 text-sm ${textSub}`}>
                                  {result.issues.map((issue) => (
                                    <li key={issue}>{issue}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p className={`mt-2 text-sm ${textSub}`}>No contract issues found in this sample.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </form>
              </section>
            </div>

            <div className="space-y-6">
              <section className={`rounded-xl p-4 sm:p-5 ${card}`}>
                <h2 className={`text-lg font-semibold ${textMain}`}>Scenario Packs</h2>
                <div className="mt-4 space-y-4">
                  {packsLoading && !(dashboard?.admin?.length) ? (
                    <div className="space-y-3">
                      <Skeleton className="h-24 w-full rounded-lg" />
                      <Skeleton className="h-24 w-full rounded-lg" />
                    </div>
                  ) : null}
                  {(dashboard?.admin ?? []).map((pack) => (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => selectPack(pack.id)}
                      className={[
                        "w-full rounded-lg border p-4 text-left transition-colors",
                        selectedPackId === pack.id
                          ? "border-blue-400 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30"
                          : "border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-950",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className={`font-semibold ${textMain}`}>{pack.name}</h3>
                          <p className={`mt-1 text-sm ${textMuted}`}>{pack.slug}</p>
                        </div>
                        <span className={`text-sm ${textMuted}`}>{pack.scenarioCount} scenarios</span>
                      </div>
                      {pack.description ? <p className={`mt-3 text-sm ${textSub}`}>{pack.description}</p> : null}
                    </button>
                  ))}

                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className={`font-semibold ${textMain}`}>
                          {selectedPackDetails?.name ?? "Selected pack"}
                        </h3>
                        <p className={`mt-1 text-sm ${textMuted}`}>
                          {selectedPackDetails?.slug ?? "Choose a pack to inspect its scenarios."}
                        </p>
                      </div>
                      {selectedPackDetails ? (
                        <span className={`text-sm ${textMuted}`}>{selectedPackDetails.scenarioPagination.total} scenarios</span>
                      ) : null}
                    </div>
                    {selectedPackDetails?.description ? (
                      <p className={`mt-3 text-sm ${textSub}`}>{selectedPackDetails.description}</p>
                    ) : null}

                    {packDetailsLoading ? (
                      <div className="mt-4 space-y-3">
                        <Skeleton className="h-20 w-full rounded-lg" />
                        <Skeleton className="h-20 w-full rounded-lg" />
                      </div>
                    ) : selectedPackDetails ? (
                      <div className="mt-4 space-y-4">
                        <form onSubmit={updatePack} className="rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                          <h4 className={`font-semibold ${textMain}`}>Edit Pack</h4>
                          <input
                            value={packEditForm.slug}
                            onChange={(event) => setPackEditForm((current) => ({ ...current, slug: event.target.value }))}
                            placeholder="pack-slug"
                            className={formControl}
                          />
                          <input
                            value={packEditForm.name}
                            onChange={(event) => setPackEditForm((current) => ({ ...current, name: event.target.value }))}
                            placeholder="Pack name"
                            className={formControl}
                          />
                          <textarea
                            value={packEditForm.description}
                            onChange={(event) => setPackEditForm((current) => ({ ...current, description: event.target.value }))}
                            placeholder="Description"
                            className={`${formControl} min-h-[90px]`}
                          />
                          <button className="cursor-pointer px-4 py-2 rounded-lg bg-gray-900 text-white">Update Pack</button>
                        </form>

                        <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                          <h4 className={`font-semibold ${textMain}`}>Edit Scenario</h4>
                          <form onSubmit={submitScenarioSearch} className="space-y-3">
                            <div className="flex flex-col gap-3 sm:flex-row">
                              <input
                                value={scenarioSearchInput}
                                onChange={(event) => setScenarioSearchInput(event.target.value)}
                                placeholder="Filter scenarios by topic"
                                className={formControl}
                              />
                              <button className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 sm:w-auto">
                                Apply
                              </button>
                              {scenarioQuery ? (
                                <button
                                  type="button"
                                  onClick={clearScenarioSearch}
                                  className="cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-gray-900 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900 sm:w-auto"
                                >
                                  Clear
                                </button>
                              ) : null}
                            </div>
                          </form>
                          <p className={`text-sm ${textMuted}`}>
                            Loading {selectedPackDetails.scenarios.length} scenario{selectedPackDetails.scenarios.length === 1 ? "" : "s"} per page.
                            {selectedPackDetails.scenarioPagination.query ? ` Filter: "${selectedPackDetails.scenarioPagination.query}".` : ""}
                          </p>
                          <select
                            value={selectedScenarioId}
                            onChange={(event) => setSelectedScenarioId(event.target.value)}
                            className={selectControl(Boolean(selectedScenarioId))}
                          >
                            <option value="">Select scenario</option>
                            {selectedPackDetails.scenarios.map((scenario) => (
                              <option key={scenario.id} value={scenario.id}>
                                {scenario.topic} - {scenario.difficulty}
                              </option>
                            ))}
                          </select>

                          {selectedScenarioId ? (
                            <form onSubmit={updateScenarioEntry} className="space-y-3">
                              <input
                                value={scenarioEditForm.slug}
                                onChange={(event) =>
                                  setScenarioEditForm((current) => ({ ...current, slug: event.target.value }))
                                }
                                placeholder="scenario-slug"
                                className={formControl}
                              />
                              <select
                                value={scenarioEditForm.topic}
                                onChange={(event) =>
                                  setScenarioEditForm((current) => ({ ...current, topic: event.target.value }))
                                }
                                className={selectControl(true)}
                              >
                                {TOPIC_OPTIONS.map((topic) => (
                                  <option key={topic} value={topic}>
                                    {topic}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={scenarioEditForm.difficulty}
                                onChange={(event) =>
                                  setScenarioEditForm((current) => ({
                                    ...current,
                                    difficulty: event.target.value as Difficulty,
                                  }))
                                }
                                className={selectControl(true)}
                              >
                                {DIFFICULTY_OPTIONS.map((difficulty) => (
                                  <option key={difficulty} value={difficulty}>
                                    {difficulty}
                                  </option>
                                ))}
                              </select>
                              <textarea
                                value={scenarioEditForm.prompt}
                                onChange={(event) =>
                                  setScenarioEditForm((current) => ({ ...current, prompt: event.target.value }))
                                }
                                placeholder="Scenario prompt"
                                className={`${formControl} min-h-[110px]`}
                              />
                              <button className="cursor-pointer px-4 py-2 rounded-lg bg-gray-900 text-white">
                                Update Scenario
                              </button>
                            </form>
                          ) : (
                            <p className={`text-sm ${textMuted}`}>Choose a scenario from this pack to edit it.</p>
                          )}
                        </div>

                        {selectedPackDetails.scenarios.length > 0 ? (
                          selectedPackDetails.scenarios.map((scenario) => (
                            <div key={scenario.id} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className={`font-medium ${textMain}`}>{scenario.topic}</span>
                                <span className={`text-xs ${textMuted}`}>{scenario.difficulty}</span>
                              </div>
                              <p className={`mt-2 text-sm ${textSub}`}>{scenario.prompt}</p>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">
                            No scenarios matched this filter.
                          </div>
                        )}
                        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 dark:border-gray-800 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <p className={`text-sm ${textMuted}`}>
                            Page {selectedPackDetails.scenarioPagination.page} of {selectedPackDetails.scenarioPagination.totalPages}. Showing up to {selectedPackDetails.scenarioPagination.pageSize} scenarios at a time.
                          </p>
                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setScenarioPage((current) => Math.max(1, current - 1));
                                setSelectedScenarioId("");
                              }}
                              disabled={selectedPackDetails.scenarioPagination.page <= 1}
                              className="cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900"
                            >
                              Previous
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setScenarioPage((current) => current + 1);
                                setSelectedScenarioId("");
                              }}
                              disabled={!selectedPackDetails.scenarioPagination.hasMore}
                              className="cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className={`mt-4 text-sm ${textMuted}`}>Pick a scenario pack to view its scenario list.</p>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
