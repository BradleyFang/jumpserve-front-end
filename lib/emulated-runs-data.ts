import type {
  EmulatedParentRun,
  EmulatedPerSecondStat,
  EmulatedRun,
} from "@/app/components/emulated-runs-dashboard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { createClient, createStaticClient } from "@/lib/supabase/server";

type NumericLike = string | number | null;
export type ParentRunIndexItem = EmulatedParentRun & {
  clientCount: number;
  clientSummaryLine: string;
  ccaLabels: string[];
  delayLabels: string[];
  clientStartDelayMsValues: number[];
  clientFileSizeMegabytesValues: number[];
  totalClientFileSizeMegabytes: number | null;
  bottleneckRateMegabit: number | null;
  queueBufferSizeKilobyte: number | null;
};

function toNumber(value: NumericLike) {
  if (value === null) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchAllEmulatedPerSecondStats(
  supabase: SupabaseClient,
  runIds: number[],
) {
  const stats: EmulatedPerSecondStat[] = [];
  const runIdBatchSize = 25;
  const statsBatchSize = 1000;

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

  for (let index = 0; index < runIds.length; index += runIdBatchSize) {
    const runIdBatch = runIds.slice(index, index + runIdBatchSize);
    let from = 0;

    while (true) {
      const { data: statsData, error: statsError } = await supabase
        .from("emulated_per_second_stats")
        .select(
          "id, emulated_run_id, snapshot_index, elapsed_seconds, megabits_per_second, round_trip_time_ms, bottleneck_queuing_delay_ms, in_flight_packets, congestion_window_bytes",
        )
        .in("emulated_run_id", runIdBatch)
        .order("emulated_run_id", { ascending: true })
        .order("snapshot_index", { ascending: true })
        .range(from, from + statsBatchSize - 1);

      if (statsError) {
        throw new Error(
          `Failed to load emulated_per_second_stats: ${statsError.message}`,
        );
      }

      const batch = ((statsData ?? []) as RawStat[]).map((stat) => ({
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

      stats.push(...batch);

      if (batch.length < statsBatchSize) {
        break;
      }

      from += statsBatchSize;
    }
  }

  return stats;
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
    snapshot_length_seconds: NumericLike;
    bottleneck_rate_megabit: NumericLike;
    queue_buffer_size_kilobyte: NumericLike;
  };

  const rows: RawParentRun[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("emulated_parent_runs")
      .select(
        "id, created_at, snapshot_length_seconds, bottleneck_rate_megabit, queue_buffer_size_kilobyte",
      )
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
      snapshot_length_seconds: row.snapshot_length_seconds,
      bottleneck_rate_megabit: row.bottleneck_rate_megabit,
      queue_buffer_size_kilobyte: row.queue_buffer_size_kilobyte,
    }));

    rows.push(...batch);

    if (batch.length < batchSize) {
      break;
    }

    from += batchSize;
  }

  const clientSummariesByParentRunId = new Map<
    number,
    Map<
      number,
      { runId: number; summary: string; clientFileSizeMegabytes: number | null }
    >
  >();
  const ccasByParentRunId = new Map<number, Set<string>>();
  const delaysByParentRunId = new Map<number, Set<string>>();
  const clientStartDelaysByParentRunId = new Map<number, Set<number>>();
  const clientFileSizesByParentRunId = new Map<number, Set<number>>();
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
        "id, emulated_parent_run_id, client_number, delay_added, congestion_control_algorithm_id, client_file_size_megabytes, client_start_delay_ms, congestion_control_algorithms(name)",
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
      client_file_size_megabytes: number | null;
      client_start_delay_ms: number | null;
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
      if (run.client_start_delay_ms !== null) {
        const currentClientStartDelays =
          clientStartDelaysByParentRunId.get(run.emulated_parent_run_id) ??
          new Set();
        currentClientStartDelays.add(run.client_start_delay_ms);
        clientStartDelaysByParentRunId.set(
          run.emulated_parent_run_id,
          currentClientStartDelays,
        );
      }
      if (run.client_file_size_megabytes !== null) {
        const currentClientFileSizes =
          clientFileSizesByParentRunId.get(run.emulated_parent_run_id) ??
          new Set();
        currentClientFileSizes.add(run.client_file_size_megabytes);
        clientFileSizesByParentRunId.set(
          run.emulated_parent_run_id,
          currentClientFileSizes,
        );
      }

      const currentClientSummaries =
        clientSummariesByParentRunId.get(run.emulated_parent_run_id) ?? new Map();
      const existingSummary = currentClientSummaries.get(run.client_number);
      if (!existingSummary || run.id > existingSummary.runId) {
        currentClientSummaries.set(run.client_number, {
          runId: run.id,
          summary,
          clientFileSizeMegabytes: run.client_file_size_megabytes,
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
    const totalClientFileSizeMegabytes = orderedClientSummaries.reduce<number | null>(
      (total, [, record]) => {
        if (record.clientFileSizeMegabytes === null) {
          return total;
        }

        return (total ?? 0) + record.clientFileSizeMegabytes;
      },
      null,
    );
    const orderedCcas = Array.from(ccasByParentRunId.get(row.id) ?? []).sort(
      (a, b) => a.localeCompare(b),
    );
    const orderedDelays = Array.from(delaysByParentRunId.get(row.id) ?? []).sort(
      (a, b) => a.localeCompare(b, undefined, { numeric: true }),
    );
    const orderedClientStartDelays = Array.from(
      clientStartDelaysByParentRunId.get(row.id) ?? [],
    ).sort((a, b) => a - b);
    const orderedClientFileSizes = Array.from(
      clientFileSizesByParentRunId.get(row.id) ?? [],
    ).sort((a, b) => a - b);

    return {
      id: row.id,
      createdAt: row.created_at,
      snapshotLengthSeconds: toNumber(row.snapshot_length_seconds),
      bottleneckRateMegabit: toNumber(row.bottleneck_rate_megabit),
      queueBufferSizeKilobyte: toNumber(row.queue_buffer_size_kilobyte),
      clientCount: orderedClientSummaries.length,
      ccaLabels: orderedCcas,
      delayLabels: orderedDelays,
      clientStartDelayMsValues: orderedClientStartDelays,
      clientFileSizeMegabytesValues: orderedClientFileSizes,
      totalClientFileSizeMegabytes,
      clientSummaryLine:
        orderedClientSummaries.length > 0
          ? orderedClientSummaries
              .map(([, record]) => record.summary)
              .join(" | ")
          : "No client runs",
    };
  });
}

export async function fetchParentRunSummary(
  parentRunId: number,
): Promise<ParentRunIndexItem | null> {
  const supabase = await createClient();

  const { data: parentRunData, error: parentRunError } = await supabase
    .from("emulated_parent_runs")
    .select(
      "id, created_at, snapshot_length_seconds, bottleneck_rate_megabit, queue_buffer_size_kilobyte",
    )
    .eq("id", parentRunId)
    .maybeSingle();

  if (parentRunError) {
    throw new Error(
      `Failed to load emulated_parent_runs: ${parentRunError.message}`,
    );
  }

  type RawParentRun = {
    id: number;
    created_at: string;
    snapshot_length_seconds: NumericLike;
    bottleneck_rate_megabit: NumericLike;
    queue_buffer_size_kilobyte: NumericLike;
  };

  if (!parentRunData) {
    return null;
  }

  const { data: runsData, error: runsError } = await supabase
    .from("emulated_runs")
    .select(
      "id, client_number, delay_added, client_start_delay_ms, client_file_size_megabytes, congestion_control_algorithm_id, congestion_control_algorithms(name)",
    )
    .eq("emulated_parent_run_id", parentRunId)
    .not("client_number", "is", null);

  if (runsError) {
    throw new Error(`Failed to load emulated_runs: ${runsError.message}`);
  }

  type RawRunForSummary = {
    id: number;
    client_number: number | null;
    delay_added: number | null;
    client_start_delay_ms: number | null;
    client_file_size_megabytes: number | null;
    congestion_control_algorithm_id: number | null;
    congestion_control_algorithms:
      | { name: string | null }
      | Array<{ name: string | null }>
      | null;
  };

  const clientSummaries = new Map<
    number,
    { runId: number; summary: string; clientFileSizeMegabytes: number | null }
  >();
  const ccas = new Set<string>();
  const delays = new Set<string>();
  const clientStartDelays = new Set<number>();
  const clientFileSizes = new Set<number>();

  for (const run of (runsData ?? []) as RawRunForSummary[]) {
    if (run.client_number === null) {
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

    ccas.add(ccaLabel);
    delays.add(delayLabel);

    if (run.client_start_delay_ms !== null) {
      clientStartDelays.add(run.client_start_delay_ms);
    }

    if (run.client_file_size_megabytes !== null) {
      clientFileSizes.add(run.client_file_size_megabytes);
    }

    const existingSummary = clientSummaries.get(run.client_number);
    if (!existingSummary || run.id > existingSummary.runId) {
      clientSummaries.set(run.client_number, {
        runId: run.id,
        summary,
        clientFileSizeMegabytes: run.client_file_size_megabytes,
      });
    }
  }

  const orderedClientSummaries = Array.from(clientSummaries.entries()).sort(
    (a, b) => a[0] - b[0],
  );
  const totalClientFileSizeMegabytes = orderedClientSummaries.reduce<number | null>(
    (total, [, record]) => {
      if (record.clientFileSizeMegabytes === null) {
        return total;
      }

      return (total ?? 0) + record.clientFileSizeMegabytes;
    },
    null,
  );

  const parentRun = parentRunData as RawParentRun;

  return {
    id: parentRun.id,
    createdAt: parentRun.created_at,
    snapshotLengthSeconds: toNumber(parentRun.snapshot_length_seconds),
    bottleneckRateMegabit: toNumber(parentRun.bottleneck_rate_megabit),
    queueBufferSizeKilobyte: toNumber(parentRun.queue_buffer_size_kilobyte),
    clientCount: orderedClientSummaries.length,
    ccaLabels: Array.from(ccas).sort((a, b) => a.localeCompare(b)),
    delayLabels: Array.from(delays).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    ),
    clientStartDelayMsValues: Array.from(clientStartDelays).sort(
      (a, b) => a - b,
    ),
    clientFileSizeMegabytesValues: Array.from(clientFileSizes).sort(
      (a, b) => a - b,
    ),
    totalClientFileSizeMegabytes,
    clientSummaryLine:
      orderedClientSummaries.length > 0
        ? orderedClientSummaries
            .map(([, record]) => record.summary)
            .join(" | ")
        : "No client runs",
  };
}

async function fetchEmulatedRunsDashboardDataWithClient(
  supabase: SupabaseClient,
  selectedParentRunId?: number,
): Promise<{
  parentRuns: EmulatedParentRun[];
  runs: EmulatedRun[];
  stats: EmulatedPerSecondStat[];
}> {
  let parentRunsQuery = supabase
    .from("emulated_parent_runs")
    .select("id, created_at, snapshot_length_seconds")
    .order("created_at", { ascending: false });

  if (typeof selectedParentRunId === "number") {
    parentRunsQuery = parentRunsQuery.eq("id", selectedParentRunId);
  } else {
    parentRunsQuery = parentRunsQuery.limit(100);
  }

  const { data: parentRunsData, error: parentRunsError } = await parentRunsQuery;

  if (parentRunsError) {
    throw new Error(
      `Failed to load emulated_parent_runs: ${parentRunsError.message}`,
    );
  }

  type RawParentRun = {
    id: number;
    created_at: string;
    snapshot_length_seconds: NumericLike;
  };

  const parentRuns: EmulatedParentRun[] = ((parentRunsData ?? []) as RawParentRun[])
    .map((parentRun) => ({
      id: parentRun.id,
      createdAt: parentRun.created_at,
      snapshotLengthSeconds: toNumber(parentRun.snapshot_length_seconds),
    }));

  let runsQuery = supabase
    .from("emulated_runs")
    .select(
      "id, created_at, emulated_parent_run_id, client_number, delay_added, client_start_delay_ms, client_file_size_megabytes, congestion_control_algorithm_id, congestion_control_algorithms(name)",
    )
    .not("emulated_parent_run_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(400);

  if (typeof selectedParentRunId === "number") {
    runsQuery = runsQuery.eq("emulated_parent_run_id", selectedParentRunId);
  } else if (parentRuns.length > 0) {
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
    client_start_delay_ms: number | null;
    client_file_size_megabytes: number | null;
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
      clientStartDelayMs: run.client_start_delay_ms,
      clientFileSizeMegabytes: run.client_file_size_megabytes,
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
        snapshotLengthSeconds: null,
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
    stats = await fetchAllEmulatedPerSecondStats(supabase, runIds);
  }

  return {
    parentRuns: mergedParentRuns,
    runs,
    stats,
  };
}

export async function fetchEmulatedRunsDashboardData(
  selectedParentRunId?: number,
): Promise<{
  parentRuns: EmulatedParentRun[];
  runs: EmulatedRun[];
  stats: EmulatedPerSecondStat[];
}> {
  const supabase = await createClient();
  return fetchEmulatedRunsDashboardDataWithClient(supabase, selectedParentRunId);
}

export async function fetchParentRunShellData(parentRunId: number): Promise<{
  parentRun: EmulatedParentRun | null;
  runs: EmulatedRun[];
}> {
  const supabase = await createClient();

  const { data: parentRunData, error: parentRunError } = await supabase
    .from("emulated_parent_runs")
    .select("id, created_at, snapshot_length_seconds")
    .eq("id", parentRunId)
    .maybeSingle();

  if (parentRunError) {
    throw new Error(
      `Failed to load emulated_parent_runs: ${parentRunError.message}`,
    );
  }

  type RawParentRun = {
    id: number;
    created_at: string;
    snapshot_length_seconds: NumericLike;
  };

  const parentRun = parentRunData
    ? {
        id: (parentRunData as RawParentRun).id,
        createdAt: (parentRunData as RawParentRun).created_at,
        snapshotLengthSeconds: toNumber(
          (parentRunData as RawParentRun).snapshot_length_seconds,
        ),
      }
    : null;

  const { data: runsData, error: runsError } = await supabase
    .from("emulated_runs")
    .select(
      "id, created_at, emulated_parent_run_id, client_number, delay_added, client_start_delay_ms, client_file_size_megabytes, congestion_control_algorithm_id, congestion_control_algorithms(name)",
    )
    .eq("emulated_parent_run_id", parentRunId)
    .order("created_at", { ascending: false });

  if (runsError) {
    throw new Error(`Failed to load emulated_runs: ${runsError.message}`);
  }

  type RawRun = {
    id: number;
    created_at: string;
    emulated_parent_run_id: number | null;
    client_number: number | null;
    delay_added: number | null;
    client_start_delay_ms: number | null;
    client_file_size_megabytes: number | null;
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
      clientStartDelayMs: run.client_start_delay_ms,
      clientFileSizeMegabytes: run.client_file_size_megabytes,
      congestionControlAlgorithmId: run.congestion_control_algorithm_id,
      congestionControlAlgorithmName,
    };
  });

  return { parentRun, runs };
}

const getCachedParentRunDashboardData = unstable_cache(
  async (parentRunId: number) => {
    const supabase = createStaticClient();
    return fetchEmulatedRunsDashboardDataWithClient(supabase, parentRunId);
  },
  ["parent-run-dashboard"],
  { revalidate: 30 },
);

export async function fetchCachedParentRunDashboardData(parentRunId: number) {
  return getCachedParentRunDashboardData(parentRunId);
}
