import { ParentRunIndex } from "@/app/components/parent-run-index";
import { fetchParentRunsForIndex } from "@/lib/emulated-runs-data";

export default async function Home() {
  const parentRuns = await fetchParentRunsForIndex();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_12%_14%,#f7ddcb_0%,transparent_54%),radial-gradient(circle_at_84%_18%,#f9dcc8_0%,transparent_47%),radial-gradient(circle_at_68%_84%,#f6e5d7_0%,transparent_44%),#f2f1f0] p-5 dark:bg-[radial-gradient(circle_at_10%_12%,#0f766e_0%,transparent_38%),radial-gradient(circle_at_82%_20%,#854d0e_0%,transparent_35%),radial-gradient(circle_at_70%_88%,#1d4ed8_0%,transparent_35%),#020617] sm:p-10">
      <div className="mx-auto flex w-full items-start justify-center py-3 sm:py-8">
        {parentRuns.length > 0 ? (
          <ParentRunIndex parentRuns={parentRuns} />
        ) : (
          <section className="w-full max-w-4xl rounded-3xl border border-rose-200/70 bg-[#fff8fc]/95 p-10 text-center shadow-xl dark:border-slate-700 dark:bg-slate-900/85">
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
