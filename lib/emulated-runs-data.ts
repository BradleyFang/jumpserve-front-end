import type {
  EmulatedParentRun,
  EmulatedPerSecondStat,
  EmulatedRun,
} from "@/app/components/emulated-runs-dashboard";
import { createClient } from "@/lib/supabase/server";

type NumericLike = string | number | null;
export type ParentRunIndexItem = EmulatedParentRun & {
  clientCount: number;
  clientSummaryLine: string;
  ccaLabels: string[];
  delayLabels: string[];
};

function toNumber(value: NumericLike) {
  if (value === null) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchLatestParentRunId() {
  const supabase = await createClient();

  const { data: parentRunsData, error: parentRunsError } = await supabase
    .from("emulated_parent_runs")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1);

  if (parentRunsError) {
    throw new Error(
      `Failed to load emulated_parent_runs: ${parentRunsError.message}`,
    );
  }

  const latestParentRunId = parentRunsData?.[0]?.id;
  if (typeof latestParentRunId === "number") {
    return latestParentRunId;
  }

  const { data: runsData, error: runsError } = await supabase
    .from("emulated_runs")
    .select("emulated_parent_run_id")
    .not("emulated_parent_run_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (runsError) {
    throw new Error(`Failed to load emulated_runs: ${runsError.message}`);
  }

  const fallbackParentRunId = runsData?.[0]?.emulated_parent_run_id;
  if (typeof fallbackParentRunId === "number") {
    return fallbackParentRunId;
  }

  return null;
}

export async function fetchParentRunsForIndex(): Promise<ParentRunIndexItem[]> {
  const supabase = await createClient();
  const batchSize = 1000;
  let from = 0;

  type RawParentRun = {
    id: number;
    created_at: string;
  };

  const rows: RawParentRun[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("emulated_parent_runs")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + batchSize - 1);

    if (error) {
      throw new Error(
        `Failed to load emulated_parent_runs: ${error.message}`,
      );
    }

    const batch = ((data ?? []) as RawParentRun[]).map((row) => ({
      id: row.id,
      created_at: row.created_at,
    }));

    rows.push(...batch);

    if (batch.length < batchSize) {
      break;
    }

    from += batchSize;
  }

  const clientSummariesByParentRunId = new Map<
    number,
    Map<number, { runId: number; summary: string }>
  >();
  const ccasByParentRunId = new Map<number, Set<string>>();
  const delaysByParentRunId = new Map<number, Set<string>>();
  const parentRunIds = rows.map((row) => row.id);
  const parentRunIdBatchSize = 200;

  for (let index = 0; index < parentRunIds.length; index += parentRunIdBatchSize) {
    const parentRunIdBatch = parentRunIds.slice(
      index,
      index + parentRunIdBatchSize,
    );
    const { data: runsData, error: runsError } = await supabase
      .from("emulated_runs")
      .select(
        "id, emulated_parent_run_id, client_number, delay_added, congestion_control_algorithm_id, congestion_control_algorithms(name)",
      )
      .in("emulated_parent_run_id", parentRunIdBatch)
      .not("client_number", "is", null);

    if (runsError) {
      throw new Error(`Failed to load emulated_runs: ${runsError.message}`);
    }

    type RawRunForIndex = {
      id: number;
      emulated_parent_run_id: number | null;
      client_number: number | null;
      delay_added: number | null;
      congestion_control_algorithm_id: number | null;
      congestion_control_algorithms:
        | { name: string | null }
        | Array<{ name: string | null }>
        | null;
    };

    for (const run of (runsData ?? []) as RawRunForIndex[]) {
      if (
        run.emulated_parent_run_id === null ||
        run.client_number === null
      ) {
        continue;
      }

      let congestionControlAlgorithmName: string | null = null;
      if (Array.isArray(run.congestion_control_algorithms)) {
        congestionControlAlgorithmName =
          run.congestion_control_algorithms[0]?.name ?? null;
      } else if (run.congestion_control_algorithms) {
        congestionControlAlgorithmName = run.congestion_control_algorithms.name;
      }

      const ccaLabel =
        congestionControlAlgorithmName ??
        (run.congestion_control_algorithm_id !== null
          ? `id ${run.congestion_control_algorithm_id}`
          : "n/a");
      const delayLabel = run.delay_added !== null ? `${run.delay_added}ms` : "n/a";
      const summary = `${ccaLabel} ${delayLabel}`;
      const currentCcas = ccasByParentRunId.get(run.emulated_parent_run_id) ?? new Set();
      currentCcas.add(ccaLabel);
      ccasByParentRunId.set(run.emulated_parent_run_id, currentCcas);
      const currentDelays =
        delaysByParentRunId.get(run.emulated_parent_run_id) ?? new Set();
      currentDelays.add(delayLabel);
      delaysByParentRunId.set(run.emulated_parent_run_id, currentDelays);

      const currentClientSummaries =
        clientSummariesByParentRunId.get(run.emulated_parent_run_id) ?? new Map();
      const existingSummary = currentClientSummaries.get(run.client_number);
      if (!existingSummary || run.id > existingSummary.runId) {
        currentClientSummaries.set(run.client_number, {
          runId: run.id,
          summary,
        });
      }

      clientSummariesByParentRunId.set(
        run.emulated_parent_run_id,
        currentClientSummaries,
      );
    }
  }

  return rows.map((row) => {
    const clientSummaries =
      clientSummariesByParentRunId.get(row.id) ?? new Map();
    const orderedClientSummaries = Array.from(clientSummaries.entries()).sort(
      (a, b) => a[0] - b[0],
    );
    const orderedCcas = Array.from(ccasByParentRunId.get(row.id) ?? []).sort(
      (a, b) => a.localeCompare(b),
    );
    const orderedDelays = Array.from(delaysByParentRunId.get(row.id) ?? []).sort(
      (a, b) => a.localeCompare(b, undefined, { numeric: true }),
    );

    return {
      id: row.id,
      createdAt: row.created_at,
      clientCount: orderedClientSummaries.length,
      ccaLabels: orderedCcas,
      delayLabels: orderedDelays,
      clientSummaryLine:
        orderedClientSummaries.length > 0
          ? orderedClientSummaries
              .map(([, record]) => record.summary)
              .join(" | ")
          : "No client runs",
    };
  });
}

export async function fetchEmulatedRunsDashboardData(): Promise<{
  parentRuns: EmulatedParentRun[];
  runs: EmulatedRun[];
  stats: EmulatedPerSecondStat[];
}> {
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

  return {
    parentRuns: mergedParentRuns,
    runs,
    stats,
  };
}
