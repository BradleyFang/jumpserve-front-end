import Link from "next/link";
import { ParentRunIndex } from "@/app/components/parent-run-index";
import { fetchParentRunsForIndexPage } from "@/lib/emulated-runs-data";

export async function TestLookupHome() {
  const parentRunPage = await fetchParentRunsForIndexPage({
    page: 1,
    pageSize: 10,
  });

  return (
    <main
      className="space-atmosphere relative min-h-screen overflow-hidden p-5 sm:p-10"
      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
    >
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-4 py-3 sm:py-8">
        <div className="flex w-full items-start justify-center">
          {parentRunPage.parentRuns.length > 0 ? (
            <ParentRunIndex initialPage={parentRunPage} />
          ) : (
            <section className="relative w-full max-w-4xl rounded-3xl border border-rose-200/70 bg-[#fff8fc]/95 p-10 text-center shadow-xl dark:border-slate-600 dark:bg-slate-800/82">
              <Link
                href="/"
                aria-label="Go to home"
                className="absolute top-6 right-6 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-300/80 bg-[#fff5fb] text-slate-700 shadow-sm transition hover:border-rose-400 hover:bg-rose-50 dark:border-slate-500 dark:bg-slate-800/85 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700/90"
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
