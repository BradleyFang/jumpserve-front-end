import { ParentRunIndex } from "@/app/components/parent-run-index";
import { fetchParentRunsForIndex } from "@/lib/emulated-runs-data";

export default async function Home() {
  const parentRuns = await fetchParentRunsForIndex();

  return (
    <main className="space-atmosphere relative min-h-screen overflow-hidden p-5 sm:p-10">
      <div className="relative z-10 mx-auto flex w-full items-start justify-center py-3 sm:py-8">
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
    </main>
  );
}
