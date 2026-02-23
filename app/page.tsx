import { createClient } from "@/lib/supabase/server";
import {
  EmulatedRunsDashboard,
  type EmulatedParentRun,
  type EmulatedPerSecondStat,
  type EmulatedRun,
} from "@/app/components/emulated-runs-dashboard";

export default async function Home() {
  const supabase = await createClient();

  const { data: parentRunsData, error: parentRunsError } = await supabase
    .from("emulated_parent_runs")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (parentRunsError) {
    throw new Error(
      `Failed to load emulated_parent_runs: ${parentRunsError.message}`,
    );
  }

  type RawParentRun = {
    id: number;
    created_at: string;
  };

  const parentRuns: EmulatedParentRun[] = ((parentRunsData ?? []) as RawParentRun[])
    .map((parentRun) => ({
      id: parentRun.id,
      createdAt: parentRun.created_at,
    }));

  let runsQuery = supabase
    .from("emulated_runs")
    .select(
      "id, created_at, emulated_parent_run_id, client_number, delay_added, congestion_control_algorithm_id, congestion_control_algorithms(name)",
    )
    .not("emulated_parent_run_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(400);

  if (parentRuns.length > 0) {
    runsQuery = runsQuery.in(
      "emulated_parent_run_id",
      parentRuns.map((parentRun) => parentRun.id),
    );
  }

  const { data: runsData, error: runsError } = await runsQuery;

  if (runsError) {
    throw new Error(`Failed to load emulated_runs: ${runsError.message}`);
  }

  type RawRun = {
    id: number;
    created_at: string;
    emulated_parent_run_id: number | null;
    client_number: number | null;
    delay_added: number | null;
    congestion_control_algorithm_id: number | null;
    congestion_control_algorithms:
      | { name: string | null }
      | Array<{ name: string | null }>
      | null;
  };

  const runs: EmulatedRun[] = ((runsData ?? []) as RawRun[]).map((run) => {
    let congestionControlAlgorithmName: string | null = null;
    if (Array.isArray(run.congestion_control_algorithms)) {
      congestionControlAlgorithmName =
        run.congestion_control_algorithms[0]?.name ?? null;
    } else if (run.congestion_control_algorithms) {
      congestionControlAlgorithmName = run.congestion_control_algorithms.name;
    }

    return {
      id: run.id,
      createdAt: run.created_at,
      parentRunId: run.emulated_parent_run_id,
      clientNumber: run.client_number,
      delayAddedMs: run.delay_added,
      congestionControlAlgorithmId: run.congestion_control_algorithm_id,
      congestionControlAlgorithmName,
    };
  });

  const parentRunLookup = new Map<number, EmulatedParentRun>();

  for (const parentRun of parentRuns) {
    parentRunLookup.set(parentRun.id, parentRun);
  }

  for (const run of runs) {
    if (
      run.parentRunId !== null &&
      !parentRunLookup.has(run.parentRunId)
    ) {
      parentRunLookup.set(run.parentRunId, {
        id: run.parentRunId,
        createdAt: null,
      });
    }
  }

  const mergedParentRuns = Array.from(parentRunLookup.values()).sort((a, b) => {
    if (a.createdAt && b.createdAt) {
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    }
    if (a.createdAt) {
      return -1;
    }
    if (b.createdAt) {
      return 1;
    }
    return b.id - a.id;
  });

  const runIds = runs.map((run) => run.id);

  let stats: EmulatedPerSecondStat[] = [];

  if (runIds.length > 0) {
    const { data: statsData, error: statsError } = await supabase
      .from("emulated_per_second_stats")
      .select(
        "id, emulated_run_id, snapshot_index, elapsed_seconds, megabits_per_second, round_trip_time_ms, bottleneck_queuing_delay_ms, in_flight_packets, congestion_window_bytes",
      )
      .in("emulated_run_id", runIds)
      .order("snapshot_index", { ascending: true });

    if (statsError) {
      throw new Error(
        `Failed to load emulated_per_second_stats: ${statsError.message}`,
      );
    }

    type NumericLike = string | number | null;
    type RawStat = {
      id: number;
      emulated_run_id: number;
      snapshot_index: number | null;
      elapsed_seconds: NumericLike;
      megabits_per_second: NumericLike;
      round_trip_time_ms: NumericLike;
      bottleneck_queuing_delay_ms: NumericLike;
      in_flight_packets: number | null;
      congestion_window_bytes: NumericLike;
    };

    const toNumber = (value: NumericLike) => {
      if (value === null) {
        return null;
      }

      const parsed = typeof value === "number" ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    stats = ((statsData ?? []) as RawStat[]).map((stat) => ({
      id: stat.id,
      emulatedRunId: stat.emulated_run_id,
      snapshotIndex: stat.snapshot_index,
      elapsedSeconds: toNumber(stat.elapsed_seconds),
      megabitsPerSecond: toNumber(stat.megabits_per_second),
      roundTripTimeMs: toNumber(stat.round_trip_time_ms),
      bottleneckQueuingDelayMs: toNumber(stat.bottleneck_queuing_delay_ms),
      inFlightPackets: stat.in_flight_packets,
      congestionWindowBytes: toNumber(stat.congestion_window_bytes),
    }));
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_12%_14%,#f6d8ea_0%,transparent_54%),radial-gradient(circle_at_84%_18%,#f9d4e3_0%,transparent_47%),radial-gradient(circle_at_68%_84%,#f3dff0_0%,transparent_44%),#fff4f8] p-5 dark:bg-[radial-gradient(circle_at_10%_12%,#0f766e_0%,transparent_38%),radial-gradient(circle_at_82%_20%,#854d0e_0%,transparent_35%),radial-gradient(circle_at_70%_88%,#1d4ed8_0%,transparent_35%),#020617] sm:p-10">
      <div className="mx-auto flex w-full items-start justify-center py-3 sm:py-8">
        {mergedParentRuns.length > 0 ? (
          <EmulatedRunsDashboard
            parentRuns={mergedParentRuns}
            runs={runs}
            stats={stats}
          />
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
