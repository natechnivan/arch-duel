"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Skeleton } from "@/app/components/Skeleton";

type HistoryItem = {
  attemptId: string;
  topic: string;
  difficulty: string;
  prompt: string;
  shortVerdict: string;
  scoreDelta: number;
  correct: boolean;
  createdAt: string;
};

type HistoryResponse = {
  items: HistoryItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export default function HistoryPage() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/history?page=${page}`, { cache: "no-store" });
        const payload = await res.json();

        if (!res.ok) {
          throw new Error(payload.detail || payload.error || "Failed to load history.");
        }

        if (!cancelled) {
          setData(payload);
        }
      } catch (nextError: any) {
        if (!cancelled) {
          setData(null);
          setError(String(nextError?.message ?? nextError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">History</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Attempt history</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-300">
              Review older rounds without overloading the main dashboard. This page stays paginated as your attempt count grows.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-slate-100 transition hover:bg-slate-900"
          >
            Back to dashboard
          </Link>
        </div>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4 text-sm text-amber-200">
              {error === "unauthorized" ? "Log in to view your saved history." : error}
            </div>
          ) : data && data.items.length > 0 ? (
            <>
              <div className="flex flex-col gap-2 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Showing {(data.page - 1) * data.pageSize + 1}-{Math.min(data.page * data.pageSize, data.total)} of {data.total} attempts
                </span>
                <span>Page {data.page} of {data.totalPages}</span>
              </div>

              <div className="mt-4 space-y-3">
                {data.items.map((item) => (
                  <article key={item.attemptId} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-base font-semibold text-white">{item.topic}</p>
                        <p className="mt-2 text-sm text-slate-300">{item.prompt}</p>
                      </div>
                      <span
                        className={[
                          "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                          item.correct ? "bg-emerald-950/50 text-emerald-300" : "bg-amber-950/50 text-amber-300",
                        ].join(" ")}
                      >
                        {item.correct ? "Correct" : "Missed"}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-400">
                      <span>{item.difficulty}</span>
                      <span>Score {item.scoreDelta >= 0 ? "+" : ""}{item.scoreDelta}</span>
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                    </div>

                    <p className="mt-3 text-sm text-slate-300">{item.shortVerdict}</p>
                  </article>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={data.page <= 1}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!data.hasMore}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
              No history yet. Finish a few rounds and your timeline will show up here.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
