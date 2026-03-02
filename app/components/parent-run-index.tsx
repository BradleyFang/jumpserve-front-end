"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ParentRunIndexItem } from "@/lib/emulated-runs-data";

function formatCreatedAt(value: string | null) {
  if (!value) {
    return "Unknown timestamp";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function ParentRunIndex({
  parentRuns,
}: {
  parentRuns: ParentRunIndexItem[];
}) {
  const [runSearchQuery, setRunSearchQuery] = useState("");
  const [clientCountQuery, setClientCountQuery] = useState("");
  const [selectedCcaLabels, setSelectedCcaLabels] = useState<string[]>([]);
  const [selectedDelayLabels, setSelectedDelayLabels] = useState<string[]>([]);
  const normalizedRunSearchQuery = runSearchQuery.trim().toLowerCase();
  const normalizedClientCountQuery = clientCountQuery.trim();
  const activeFilterCount =
    (normalizedRunSearchQuery.length > 0 ? 1 : 0) +
    (normalizedClientCountQuery.length > 0 ? 1 : 0) +
    selectedCcaLabels.length +
    selectedDelayLabels.length;
  const availableCcaLabels = useMemo(
    () =>
      Array.from(new Set(parentRuns.flatMap((parentRun) => parentRun.ccaLabels)))
        .sort((a, b) => a.localeCompare(b)),
    [parentRuns],
  );
  const availableDelayLabels = useMemo(
    () => Array.from({ length: 21 }, (_, index) => `${index * 5}ms`),
    [],
  );

  const filteredParentRuns = useMemo(() => {
    const parsedClientCount = Number(normalizedClientCountQuery);
    const hasClientCountFilter = normalizedClientCountQuery.length > 0;
    const hasCcaFilter = selectedCcaLabels.length > 0;
    const hasDelayFilter = selectedDelayLabels.length > 0;

    if (
      hasClientCountFilter &&
      (!Number.isFinite(parsedClientCount) ||
        !Number.isInteger(parsedClientCount) ||
        parsedClientCount < 0)
    ) {
      return [];
    }

    return parentRuns.filter((parentRun) => {
      if (hasClientCountFilter && parentRun.clientCount !== parsedClientCount) {
        return false;
      }
      if (
        hasCcaFilter &&
        !selectedCcaLabels.some((selectedCca) =>
          parentRun.ccaLabels.includes(selectedCca),
        )
      ) {
        return false;
      }
      if (
        hasDelayFilter &&
        !selectedDelayLabels.some((selectedDelay) =>
          parentRun.delayLabels.includes(selectedDelay),
        )
      ) {
        return false;
      }

      if (!normalizedRunSearchQuery) {
        return true;
      }

      return String(parentRun.id).includes(normalizedRunSearchQuery);
    });
  }, [
    normalizedClientCountQuery,
    normalizedRunSearchQuery,
    parentRuns,
    selectedCcaLabels,
    selectedDelayLabels,
  ]);

  return (
    <section className="w-full max-w-7xl">
      <div className="grid gap-7 lg:grid-cols-[300px_minmax(0,1fr)]">
        <article className="relative h-fit overflow-hidden rounded-3xl border border-rose-200/80 bg-[linear-gradient(165deg,rgba(255,250,253,0.98)_0%,rgba(255,241,248,0.96)_100%)] p-5 shadow-[0_20px_45px_rgba(190,24,93,0.12)] backdrop-blur-sm dark:border-slate-600/70 dark:bg-[linear-gradient(165deg,rgba(30,41,59,0.9)_0%,rgba(51,65,85,0.82)_100%)] dark:shadow-none lg:sticky lg:top-6">
          <div className="pointer-events-none absolute -right-7 -top-7 h-28 w-28 rounded-full bg-rose-200/60 blur-2xl dark:bg-teal-500/25" />
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-200">
                Filters
              </p>
              <span className="rounded-full border border-rose-300/80 bg-rose-50/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-700 dark:border-slate-500 dark:bg-slate-800/75 dark:text-slate-100">
                {activeFilterCount} active
              </span>
            </div>
          </div>
          <div className="mt-4">
            <label
              htmlFor="parent-run-search"
              className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300"
            >
              Parent run ID search
            </label>
            <input
              id="parent-run-search"
              type="text"
              value={runSearchQuery}
              onChange={(event) => setRunSearchQuery(event.target.value)}
              placeholder="e.g. 1042"
              className="mt-2 w-full rounded-2xl border border-rose-300/80 bg-white/80 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:border-slate-500 dark:bg-slate-900/75 dark:text-slate-100 dark:focus:ring-teal-700/60"
            />
          </div>
          <div className="mt-4">
            <label
              htmlFor="client-count-search"
              className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300"
            >
              Number of clients
            </label>
            <input
              id="client-count-search"
              type="text"
              value={clientCountQuery}
              onChange={(event) => setClientCountQuery(event.target.value)}
              placeholder="e.g. 2"
              inputMode="numeric"
              className="mt-2 w-full rounded-2xl border border-rose-300/80 bg-white/80 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:border-slate-500 dark:bg-slate-900/75 dark:text-slate-100 dark:focus:ring-teal-700/60"
            />
          </div>
          <div className="mt-4">
            <p className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
              CCA
            </p>
            <details className="group mt-2">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-rose-300/80 bg-white/80 px-3 py-2 text-xs uppercase tracking-[0.12em] text-slate-700 transition hover:border-rose-400 dark:border-slate-500 dark:bg-slate-900/75 dark:text-slate-100">
                <span className="truncate pr-2">
                  {selectedCcaLabels.length > 0
                    ? selectedCcaLabels.join(", ")
                    : "Choose CCA"}
                </span>
                <span className="text-[10px] text-slate-500 transition group-open:rotate-180 dark:text-slate-300">
                  v
                </span>
              </summary>
              <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-2xl border border-rose-300/80 bg-white/80 p-2.5 dark:border-slate-500 dark:bg-slate-900/75">
                {availableCcaLabels.length > 0 ? (
                  availableCcaLabels.map((ccaLabel) => (
                    <label
                      key={ccaLabel}
                      className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-xs text-slate-700 transition hover:bg-rose-50/90 dark:text-slate-100 dark:hover:bg-slate-700/60"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCcaLabels.includes(ccaLabel)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedCcaLabels((current) =>
                              current.includes(ccaLabel)
                                ? current
                                : [...current, ccaLabel],
                            );
                            return;
                          }
                          setSelectedCcaLabels((current) =>
                            current.filter((value) => value !== ccaLabel),
                          );
                        }}
                        className="h-3.5 w-3.5 rounded border-rose-400 text-teal-700 focus:ring-teal-500 dark:border-slate-400"
                      />
                      <span className="truncate">{ccaLabel}</span>
                    </label>
                  ))
                ) : (
                  <p className="px-1.5 py-1 text-xs text-slate-500 dark:text-slate-300">
                    No CCA values found.
                  </p>
                )}
              </div>
            </details>
          </div>
          <div className="mt-4">
            <p className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
              Delay
            </p>
            <details className="group mt-2">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-rose-300/80 bg-white/80 px-3 py-2 text-xs uppercase tracking-[0.12em] text-slate-700 transition hover:border-rose-400 dark:border-slate-500 dark:bg-slate-900/75 dark:text-slate-100">
                <span className="truncate pr-2">
                  {selectedDelayLabels.length > 0
                    ? selectedDelayLabels.join(", ")
                    : "Choose delay"}
                </span>
                <span className="text-[10px] text-slate-500 transition group-open:rotate-180 dark:text-slate-300">
                  v
                </span>
              </summary>
              <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-2xl border border-rose-300/80 bg-white/80 p-2.5 dark:border-slate-500 dark:bg-slate-900/75">
                {availableDelayLabels.length > 0 ? (
                  availableDelayLabels.map((delayLabel) => (
                    <label
                      key={delayLabel}
                      className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-xs text-slate-700 transition hover:bg-rose-50/90 dark:text-slate-100 dark:hover:bg-slate-700/60"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDelayLabels.includes(delayLabel)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedDelayLabels((current) =>
                              current.includes(delayLabel)
                                ? current
                                : [...current, delayLabel],
                            );
                            return;
                          }
                          setSelectedDelayLabels((current) =>
                            current.filter((value) => value !== delayLabel),
                          );
                        }}
                        className="h-3.5 w-3.5 rounded border-rose-400 text-teal-700 focus:ring-teal-500 dark:border-slate-400"
                      />
                      <span className="truncate">{delayLabel}</span>
                    </label>
                  ))
                ) : (
                  <p className="px-1.5 py-1 text-xs text-slate-500 dark:text-slate-300">
                    No delay values found.
                  </p>
                )}
              </div>
            </details>
          </div>
          <button
            type="button"
            onClick={() => {
              setRunSearchQuery("");
              setClientCountQuery("");
              setSelectedCcaLabels([]);
              setSelectedDelayLabels([]);
            }}
            className="mt-4 w-full rounded-xl border border-rose-300/80 bg-white/90 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:border-rose-400 hover:bg-rose-50 dark:border-slate-500 dark:bg-slate-800/75 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700/85"
          >
            Clear filters
          </button>
        </article>

        <article className="rounded-3xl border border-rose-200/70 bg-[linear-gradient(165deg,rgba(255,250,253,0.98)_0%,rgba(255,245,250,0.97)_100%)] p-6 shadow-[0_22px_50px_rgba(15,23,42,0.12)] backdrop-blur-sm dark:border-slate-600/70 dark:bg-[linear-gradient(165deg,rgba(30,41,59,0.91)_0%,rgba(51,65,85,0.83)_100%)] dark:shadow-none sm:p-8">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-teal-700">
            Jumpserve
          </p>
          <h1 className="mt-2 text-center text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
            Parent Runs
          </h1>
          <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-200">
            Search and open a parent run.
          </p>
          <p className="mt-5 text-center text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
            Showing {filteredParentRuns.length} of {parentRuns.length} parent runs
          </p>

          <div className="mx-auto mt-4 max-h-[65vh] w-full max-w-4xl space-y-3 overflow-y-auto px-1">
            {filteredParentRuns.length > 0 ? (
              filteredParentRuns.map((parentRun) => (
                <Link
                  key={parentRun.id}
                  href={`/parent-run/${parentRun.id}`}
                  className="group block cursor-pointer rounded-3xl border border-rose-200/80 bg-[linear-gradient(165deg,#fff7fb_0%,#fff0f7_100%)] px-6 py-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-[0_14px_28px_rgba(190,24,93,0.16)] dark:border-slate-600 dark:bg-[linear-gradient(165deg,rgba(51,65,85,0.78)_0%,rgba(71,85,105,0.72)_100%)] dark:hover:border-slate-400 dark:hover:shadow-none"
                >
                  <span className="block text-sm uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
                    {parentRun.clientCount} client{parentRun.clientCount === 1 ? "" : "s"}
                  </span>
                  <span className="mt-2 block text-base font-medium text-slate-800 dark:text-slate-100">
                    {parentRun.clientSummaryLine}
                  </span>
                  <span className="mt-2.5 block text-sm uppercase tracking-[0.16em] text-slate-500 transition group-hover:text-rose-700 dark:text-slate-200 dark:group-hover:text-white">
                    Parent #{parentRun.id}
                  </span>
                  <span className="mt-1.5 block text-xs text-slate-500 dark:text-slate-200">
                    {formatCreatedAt(parentRun.createdAt)}
                  </span>
                </Link>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-rose-300/80 bg-[#fff5fb] px-4 py-8 text-center text-sm text-slate-600 dark:border-slate-500 dark:bg-slate-700/45 dark:text-slate-200">
                No parent runs matched your filters.
              </div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
