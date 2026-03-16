import Link from "next/link";
import { ParentRunIndex } from "@/app/components/parent-run-index";
import { fetchParentRunsForIndex } from "@/lib/emulated-runs-data";

export default async function Home() {
  const parentRuns = await fetchParentRunsForIndex();

  return (
    <main className="space-atmosphere relative min-h-screen overflow-hidden p-5 sm:p-10">
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-4 py-3 sm:py-8">
        <div className="flex justify-end">
          <Link
            href="/aggregate-graphs"
            className="inline-flex items-center rounded-xl border border-rose-300/80 bg-[#fff5fb] px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-400 hover:bg-rose-50 dark:border-slate-500 dark:bg-slate-800/85 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700/90"
          >
            aggregate graphs
          </Link>
        </div>
        <div className="flex w-full items-start justify-center">
        {parentRuns.length > 0 ? (
          <ParentRunIndex parentRuns={parentRuns} />
        ) : (
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
        )}
        </div>
      </div>
    </main>
  );
}
