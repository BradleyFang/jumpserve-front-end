import { EmulatedRunChartsPanel } from "@/app/components/emulated-runs-dashboard";
import { fetchCachedParentRunDashboardData } from "@/lib/emulated-runs-data";

export async function ParentRunCharts({
  parentRunId,
}: {
  parentRunId: number;
}) {
  const { parentRuns, runs, stats } =
    await fetchCachedParentRunDashboardData(parentRunId);

  return (
    <EmulatedRunChartsPanel
      parentRuns={parentRuns}
      runs={runs}
      stats={stats}
      initialSelectedParentRunId={parentRunId}
    />
  );
}
