import Link from "next/link";
import { Suspense } from "react";
import { ParentRunCharts } from "@/app/parent-run/[id]/parent-run-charts";
import { fetchParentRunSummary } from "@/lib/emulated-runs-data";
import { notFound } from "next/navigation";

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

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatValueList(values: number[], suffix: string) {
  if (values.length === 0) {
    return "None";
  }

  return values.map((value) => `${formatNumber(value)} ${suffix}`).join(", ");
}

export default async function ParentRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const parentRunId = Number(id);

  if (!Number.isInteger(parentRunId)) {
    notFound();
  }

  const parentRun = await fetchParentRunSummary(parentRunId);

  if (!parentRun) {
    return (
      <main className="space-atmosphere relative min-h-screen overflow-hidden p-5 sm:p-10">
        <div className="relative z-10 mx-auto flex w-full items-start justify-center py-3 sm:py-8">
          <section className="w-full max-w-4xl rounded-3xl border border-rose-200/70 bg-[#fff8fc]/95 p-10 text-center shadow-xl dark:border-slate-600 dark:bg-slate-800/82">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-700">
              Jumpserve
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">
              No parent run data found
            </h1>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              No rows were returned from <code>emulated_parent_runs</code>.
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="space-atmosphere relative box-border h-dvh overflow-hidden p-4 sm:p-6">
      <div className="relative z-10 mx-auto flex h-full w-full items-start justify-center py-1 sm:py-3">
        <section className="w-full max-w-6xl rounded-3xl border border-rose-200/70 bg-[#fff8fc]/95 p-6 shadow-2xl backdrop-blur-sm dark:border-slate-600/70 dark:bg-slate-800/78 sm:p-8">
          <div className="mb-8 border-b border-rose-200/80 pb-6 dark:border-slate-600">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-700">
                  Jumpserve
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
                  Emulated Run Explorer
                </h1>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Compare all child <code>emulated_runs</code>{" "}
                  on shared charts from <code>emulated_per_second_stats</code>.
                </p>
              </div>
              <Link
                href="/"
                aria-label="Go to home"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-300/80 bg-[#fff5fb] text-slate-700 shadow-sm transition hover:border-rose-400 hover:bg-rose-50 dark:border-slate-500 dark:bg-slate-800/85 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700/90"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 10.5 12 3l9 7.5" />
                  <path d="M6 10v10h12V10" />
                  <path d="M10 20v-6h4v6" />
                </svg>
              </Link>
            </div>
          </div>
          <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,2.4fr)_repeat(4,minmax(0,1fr))]">
            <article className="rounded-2xl border border-rose-200/80 bg-[#fff3f8] p-4 dark:border-slate-600 dark:bg-slate-800/55">
              <div className="flex flex-col gap-1 text-sm text-slate-500 dark:text-slate-300">
                <span className="uppercase tracking-[0.18em]">
                  {parentRun.clientCount} client{parentRun.clientCount === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-2 text-base font-medium text-slate-800 dark:text-slate-100">
                {parentRun.clientSummaryLine}
              </p>
              <p className="mt-2.5 text-sm uppercase tracking-[0.16em] text-slate-500 dark:text-slate-200">
                Parent #{parentRun.id}
              </p>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-200">
                {formatCreatedAt(parentRun.createdAt)}
              </p>
            </article>
            <SummaryCard
              label="Total File Size"
              value={
                parentRun.totalClientFileSizeMegabytes === null
                  ? "None"
                  : `${formatNumber(parentRun.totalClientFileSizeMegabytes)} MB`
              }
            />
            <SummaryCard
              label="Client Start Delay"
              value={formatValueList(parentRun.clientStartDelayMsValues, "ms")}
            />
            <SummaryCard
              label="Queue Buffer Size"
              value={
                parentRun.queueBufferSizeKilobyte === null
                  ? "None"
                  : `${formatNumber(parentRun.queueBufferSizeKilobyte)} kbytes`
              }
            />
            <SummaryCard
              label="Bottleneck Rate"
              value={
                parentRun.bottleneckRateMegabit === null
                  ? "None"
                  : `${formatNumber(parentRun.bottleneckRateMegabit)} mbit`
              }
            />
          </div>
          <Suspense fallback={<ChartsLoadingFallback />}>
            <ParentRunCharts parentRunId={parentRunId} />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-2xl border border-rose-200/80 bg-[#fff3f8] p-4 dark:border-slate-600 dark:bg-slate-800/55">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100">
        {value}
      </p>
    </article>
  );
}

function ChartsLoadingFallback() {
  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        Loading chart data...
      </p>
      <div className="grid gap-5 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-[320px] animate-pulse rounded-2xl border border-rose-200/80 bg-[#fff3f8] dark:border-slate-600 dark:bg-slate-800/55"
          />
        ))}
      </div>
    </div>
  );
}
