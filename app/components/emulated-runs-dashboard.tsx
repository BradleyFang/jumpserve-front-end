"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

export type EmulatedParentRun = {
  id: number;
  createdAt: string | null;
  snapshotLengthSeconds: number | null;
};

export type EmulatedRun = {
  id: number;
  createdAt: string;
  parentRunId: number | null;
  clientNumber: number | null;
  delayAddedMs: number | null;
  clientStartDelayMs: number | null;
  clientFileSizeMegabytes: number | null;
  congestionControlAlgorithmId: number | null;
  congestionControlAlgorithmName: string | null;
};

export type EmulatedPerSecondStat = {
  id: number;
  emulatedRunId: number;
  snapshotIndex: number | null;
  elapsedSeconds: number | null;
  megabitsPerSecond: number | null;
  roundTripTimeMs: number | null;
  bottleneckQueuingDelayMs: number | null;
  inFlightPackets: number | null;
  congestionWindowBytes: number | null;
};

type MetricSpec = {
  id: string;
  title: string;
  unit: string;
  accessor: (point: EmulatedPerSecondStat) => number | null;
};

type ChartSeries = {
  runId: number;
  shortLabel: string;
  label: string;
  clientSummary: string;
  color: string;
  data: EmulatedPerSecondStat[];
};

type HoveredChartPoint = {
  runId: number;
  runSummary: string;
  color: string;
  x: number;
  y: number;
  xValue: number;
  yValue: number;
};

type HoveredSliceValue = {
  runId: number;
  shortLabel: string;
  color: string;
  yValue: number;
  pointX: number;
  pointY: number;
};

type HoveredSlice = {
  x: number;
  xValue: number;
  values: HoveredSliceValue[];
};

const METRICS: MetricSpec[] = [
  {
    id: "mbps",
    title: "Throughput",
    unit: "Mbps",
    accessor: (point) => point.megabitsPerSecond,
  },
  {
    id: "rtt",
    title: "Round-trip Time",
    unit: "ms",
    accessor: (point) => point.roundTripTimeMs,
  },
  {
    id: "queue",
    title: "Queueing Delay",
    unit: "ms",
    accessor: (point) => point.bottleneckQueuingDelayMs,
  },
];

const SERIES_COLORS = [
  "#0d9488",
  "#dc2626",
  "#4f46e5",
  "#ca8a04",
  "#7c3aed",
  "#0f766e",
  "#db2777",
  "#0369a1",
];

const THROUGHPUT_AXIS_MAX_MBPS = 120;
const THROUGHPUT_AXIS_TICK_STEP_MBPS = 40;
const THROUGHPUT_SUM_SERIES_ID = -1;
const X_AXIS_REFERENCE_POINT_COUNT = 8;

function formatClientSummary(run: EmulatedRun | null) {
  if (!run) {
    return "n/a";
  }

  const ccaLabel =
    run.congestionControlAlgorithmName ??
    (run.congestionControlAlgorithmId !== null
      ? `id ${run.congestionControlAlgorithmId}`
      : "n/a");
  const delayLabel =
    run.delayAddedMs !== null ? `${run.delayAddedMs}ms` : "n/a";
  const clientStartDelayLabel =
    run.clientStartDelayMs !== null ? `${run.clientStartDelayMs}ms start` : "n/a start";
  const clientFileSizeLabel =
    run.clientFileSizeMegabytes !== null
      ? `${run.clientFileSizeMegabytes}MB`
      : "n/a size";

  return `${ccaLabel}, ${delayLabel}, ${clientStartDelayLabel}, ${clientFileSizeLabel}`;
}

function trimTrailingZeros(value: string) {
  if (!value.includes(".")) {
    return value;
  }
  return value.replace(/\.?0+$/, "");
}

function formatScaleValue(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 100) {
    return trimTrailingZeros(value.toFixed(0));
  }
  if (absolute >= 10) {
    return trimTrailingZeros(value.toFixed(1));
  }
  if (absolute >= 1) {
    return trimTrailingZeros(value.toFixed(2));
  }
  return trimTrailingZeros(value.toFixed(3));
}

function formatSecondsValue(value: number) {
  return value.toFixed(2);
}

function roundToHundredth(value: number) {
  return Number(value.toFixed(2));
}

function getPointXSeconds(point: EmulatedPerSecondStat, index: number) {
  if (point.elapsedSeconds !== null && Number.isFinite(point.elapsedSeconds)) {
    return roundToHundredth(point.elapsedSeconds);
  }

  if (point.snapshotIndex !== null) {
    return roundToHundredth(point.snapshotIndex);
  }

  return roundToHundredth(index);
}

function getNiceStep(rawStep: number) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / magnitude;

  if (fraction <= 1) {
    return magnitude;
  }
  if (fraction <= 2) {
    return 2 * magnitude;
  }
  if (fraction <= 5) {
    return 5 * magnitude;
  }
  return 10 * magnitude;
}

function buildNiceYTicks(minValue: number, maxValue: number, count = 6) {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return { min: 0, max: 1, ticks: [0, 1] };
  }

  if (minValue === maxValue) {
    const delta = minValue === 0 ? 1 : Math.abs(minValue) * 0.2;
    minValue -= delta;
    maxValue += delta;
  }

  const rawStep = (maxValue - minValue) / Math.max(count - 1, 1);
  const step = getNiceStep(rawStep);
  const niceMin = Math.floor(minValue / step) * step;
  const niceMax = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];

  for (let value = niceMin; value <= niceMax + step * 0.5; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }

  return { min: niceMin, max: niceMax, ticks };
}

function buildReferenceXTicks(maxValue: number, referencePointCount = 8) {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return [0];
  }

  const step = maxValue / referencePointCount;
  const ticks = Array.from(
    { length: referencePointCount + 1 },
    (_, index) => roundToHundredth(step * index),
  );

  return Array.from(new Set(ticks));
}

function useChartPanelData({
  parentRuns,
  runs,
  stats,
  initialSelectedParentRunId = null,
}: {
  parentRuns: EmulatedParentRun[];
  runs: EmulatedRun[];
  stats: EmulatedPerSecondStat[];
  initialSelectedParentRunId?: number | null;
}) {
  const defaultSelectedParentRunId =
    initialSelectedParentRunId !== null &&
    parentRuns.some((parentRun) => parentRun.id === initialSelectedParentRunId)
      ? initialSelectedParentRunId
      : (parentRuns[0]?.id ?? null);
  const selectedParentRunId = defaultSelectedParentRunId;

  const runsByParent = useMemo(() => {
    const grouped = new Map<number, EmulatedRun[]>();

    for (const run of runs) {
      if (run.parentRunId === null) {
        continue;
      }

      const list = grouped.get(run.parentRunId);
      if (list) {
        list.push(run);
      } else {
        grouped.set(run.parentRunId, [run]);
      }
    }

    for (const value of grouped.values()) {
      value.sort((a, b) => a.id - b.id);
    }

    return grouped;
  }, [runs]);

  const statsByRun = useMemo(() => {
    const grouped = new Map<number, EmulatedPerSecondStat[]>();

    for (const stat of stats) {
      const list = grouped.get(stat.emulatedRunId);
      if (list) {
        list.push(stat);
      } else {
        grouped.set(stat.emulatedRunId, [stat]);
      }
    }

    for (const value of grouped.values()) {
      value.sort((a, b) => {
        const aIndex = a.snapshotIndex ?? Number.MAX_SAFE_INTEGER;
        const bIndex = b.snapshotIndex ?? Number.MAX_SAFE_INTEGER;
        if (aIndex === bIndex) {
          const aElapsed = a.elapsedSeconds ?? Number.MAX_SAFE_INTEGER;
          const bElapsed = b.elapsedSeconds ?? Number.MAX_SAFE_INTEGER;
          return aElapsed - bElapsed;
        }
        return aIndex - bIndex;
      });
    }

    return grouped;
  }, [stats]);

  const selectedParentRun =
    parentRuns.find((parentRun) => parentRun.id === selectedParentRunId) ?? null;
  const selectedRuns = selectedParentRunId
    ? (runsByParent.get(selectedParentRunId) ?? [])
    : [];

  const chartSeries: ChartSeries[] = selectedRuns.map((run, index) => {
    const ccaLabel =
      run.congestionControlAlgorithmName ??
      (run.congestionControlAlgorithmId !== null
        ? `id ${run.congestionControlAlgorithmId}`
        : "n/a");
    const delayLabel = run.delayAddedMs !== null ? `${run.delayAddedMs}ms` : "n/a";
    const clientStartDelayLabel =
      run.clientStartDelayMs !== null ? `${run.clientStartDelayMs}ms start` : "n/a start";
    const clientFileSizeLabel =
      run.clientFileSizeMegabytes !== null
        ? `${run.clientFileSizeMegabytes}MB`
        : "n/a size";
    const legendLabel = `${ccaLabel} ${delayLabel} ${clientStartDelayLabel} ${clientFileSizeLabel}`;

    return {
      runId: run.id,
      shortLabel: legendLabel,
      label: legendLabel,
      clientSummary: formatClientSummary(run),
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      data: statsByRun.get(run.id) ?? [],
    };
  });

  const totalSampleCount = chartSeries.reduce(
    (total, series) => total + series.data.length,
    0,
  );

  return {
    selectedParentRun,
    selectedRuns,
    chartSeries,
    totalSampleCount,
  };
}

export function EmulatedRunChartsPanel({
  parentRuns,
  runs,
  stats,
  initialSelectedParentRunId = null,
}: {
  parentRuns: EmulatedParentRun[];
  runs: EmulatedRun[];
  stats: EmulatedPerSecondStat[];
  initialSelectedParentRunId?: number | null;
}) {
  const { selectedParentRun, selectedRuns, chartSeries, totalSampleCount } =
    useChartPanelData({
      parentRuns,
      runs,
      stats,
      initialSelectedParentRunId,
    });
  const [expandedMetricId, setExpandedMetricId] = useState<string | null>(null);
  const [hoveredMetricId, setHoveredMetricId] = useState<string | null>(null);

  const expandedMetric = expandedMetricId
    ? METRICS.find((metric) => metric.id === expandedMetricId) ?? null
    : null;

  useEffect(() => {
    if (!expandedMetric) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpandedMetricId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedMetric]);

  return (
    <>
      {selectedParentRun ? (
        <>
          {selectedRuns.length > 0 ? (
            <>
              <p className="mb-3 text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {totalSampleCount} total samples across selected child runs
              </p>
              <div
                className="grid gap-5 lg:grid-cols-3"
                onMouseLeave={() => setHoveredMetricId(null)}
              >
                {METRICS.map((metric) => (
                  <MetricChart
                    key={metric.id}
                    metricId={metric.id}
                    series={chartSeries}
                    title={metric.title}
                    unit={metric.unit}
                    accessor={metric.accessor}
                    onExpand={() => {
                      setHoveredMetricId(null);
                      setExpandedMetricId(metric.id);
                    }}
                    onCardHoverStart={() => setHoveredMetricId(metric.id)}
                    onCardHoverEnd={() =>
                      setHoveredMetricId((current) =>
                        current === metric.id ? null : current,
                      )
                    }
                    isActive={hoveredMetricId === metric.id}
                    isDimmed={
                      hoveredMetricId !== null && hoveredMetricId !== metric.id
                    }
                  />
                ))}
              </div>
            </>
          ) : (
            <EmptyState text="This parent run has no child rows in emulated_runs." />
          )}
        </>
      ) : (
        <EmptyState text="No parent run selected." />
      )}
      {expandedMetric ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setExpandedMetricId(null)}
        >
          <div
            className="max-h-[95vh] w-full max-w-7xl overflow-y-auto rounded-2xl border border-slate-600/70 bg-slate-800/92 p-3 shadow-2xl sm:p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-slate-100 sm:text-base">
                Expanded View: {expandedMetric.title}
              </h3>
              <button
                type="button"
                onClick={() => setExpandedMetricId(null)}
                className="rounded-lg border border-slate-500 bg-slate-700/90 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-600"
              >
                Close
              </button>
            </div>
            <MetricChart
              metricId={expandedMetric.id}
              series={chartSeries}
              title={expandedMetric.title}
              unit={expandedMetric.unit}
              accessor={expandedMetric.accessor}
              size="expanded"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

export function EmulatedRunsDashboard({
  parentRuns,
  runs,
  stats,
  initialSelectedParentRunId = null,
}: {
  parentRuns: EmulatedParentRun[];
  runs: EmulatedRun[];
  stats: EmulatedPerSecondStat[];
  initialSelectedParentRunId?: number | null;
}) {
  return (
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
      <EmulatedRunChartsPanel
        parentRuns={parentRuns}
        runs={runs}
        stats={stats}
        initialSelectedParentRunId={initialSelectedParentRunId}
      />
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-rose-300/80 bg-[#fff3f8] p-8 text-center text-sm text-slate-600 dark:border-slate-500 dark:bg-slate-700/45 dark:text-slate-200">
      {text}
    </div>
  );
}

function MetricChart({
  metricId,
  series,
  title,
  unit,
  accessor,
  onExpand,
  size = "default",
  onCardHoverStart,
  onCardHoverEnd,
  isActive = false,
  isDimmed = false,
}: {
  metricId: string;
  series: ChartSeries[];
  title: string;
  unit: string;
  accessor: (point: EmulatedPerSecondStat) => number | null;
  onExpand?: () => void;
  size?: "default" | "expanded";
  onCardHoverStart?: () => void;
  onCardHoverEnd?: () => void;
  isActive?: boolean;
  isDimmed?: boolean;
}) {
  const [hoveredRunId, setHoveredRunId] = useState<number | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<HoveredChartPoint | null>(
    null,
  );
  const [hoveredSlice, setHoveredSlice] = useState<HoveredSlice | null>(null);
  const [hoveredCursorX, setHoveredCursorX] = useState<number | null>(null);
  const [pinnedRunId, setPinnedRunId] = useState<number | null>(null);
  const [pinnedPoint, setPinnedPoint] = useState<HoveredChartPoint | null>(null);
  const isExpanded = size === "expanded";
  const areInlineChartInteractionsEnabled = isExpanded;
  const chartWidth = isExpanded ? 1200 : 460;
  const chartHeight = isExpanded ? 620 : 220;
  const leftPadding = isExpanded ? 78 : 56;
  const rightPadding = isExpanded ? 28 : 18;
  const topPadding = isExpanded ? 26 : 18;
  const bottomPadding = isExpanded ? 94 : 52;
  const plotWidth = chartWidth - leftPadding - rightPadding;
  const plotHeight = chartHeight - topPadding - bottomPadding;
  const cardShellClassName = `transition-opacity duration-[400ms] ${
    isDimmed ? "opacity-65" : "opacity-100"
  }`;
  const cardClassName = `rounded-2xl border border-rose-200/80 bg-[#fff8fc] p-4 shadow-sm transition-[border-color,box-shadow,transform] duration-[400ms] will-change-transform dark:border-slate-600 dark:bg-slate-800/55 ${
    isDimmed
      ? ""
      : `${isActive ? "-translate-y-3 scale-[1.02] border-rose-500 shadow-2xl dark:border-slate-400 dark:shadow-none" : ""} focus-within:-translate-y-3 focus-within:scale-[1.02] focus-within:border-rose-500 focus-within:shadow-2xl dark:focus-within:border-slate-400 dark:focus-within:shadow-none`
  }`;
  const activeRunId = pinnedRunId ?? hoveredRunId;
  const displayedPoint = pinnedPoint ?? hoveredPoint;

  useEffect(() => {
    if (pinnedRunId === null) {
      return;
    }

    const clearPinnedSelection = () => {
      setPinnedRunId(null);
      setPinnedPoint(null);
      setHoveredRunId(null);
      setHoveredPoint(null);
      setHoveredSlice(null);
    };

    document.addEventListener("pointerdown", clearPinnedSelection, true);
    return () =>
      document.removeEventListener("pointerdown", clearPinnedSelection, true);
  }, [pinnedRunId]);

  const normalizedSeries = series
    .map((runSeries) => {
      const points = runSeries.data
        .map((point, index) => {
          const xValue = getPointXSeconds(point, index);
          const yValue = accessor(point);
          if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) {
            return null;
          }
          return {
            xValue: xValue as number,
            yValue: yValue as number,
          };
        })
        .filter((point) => point !== null);

      return {
        ...runSeries,
        points: points as Array<{ xValue: number; yValue: number }>,
      };
    })
    .filter((runSeries) => runSeries.points.length > 0);

  if (normalizedSeries.length === 0) {
    return (
      <div
        className={cardShellClassName}
        onMouseEnter={() => onCardHoverStart?.()}
        onMouseLeave={() => {
          setHoveredRunId(null);
          setHoveredPoint(null);
          setHoveredSlice(null);
          onCardHoverEnd?.();
        }}
      >
        <article
          className={`${cardClassName} ${onExpand ? "cursor-pointer" : ""}`}
          onClick={onExpand}
        >
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            No points available for this metric.
          </p>
        </article>
      </div>
    );
  }

  const xValues = normalizedSeries.flatMap((runSeries) =>
    runSeries.points.map((point) => point.xValue),
  );
  const yValues = normalizedSeries.flatMap((runSeries) =>
    runSeries.points.map((point) => point.yValue),
  );

  const xMin = 0;
  const xMax = roundToHundredth(Math.max(...xValues, 0));
  const yMinRaw = Math.min(...yValues);
  const yMaxRaw = Math.max(...yValues);
  const yPadding = Math.max((yMaxRaw - yMinRaw) * 0.12, 0.001);
  const yScale =
    metricId === "mbps"
      ? {
          min: 0,
          max: THROUGHPUT_AXIS_MAX_MBPS,
          ticks: Array.from(
            {
              length:
                THROUGHPUT_AXIS_MAX_MBPS / THROUGHPUT_AXIS_TICK_STEP_MBPS + 1,
            },
            (_, index) => index * THROUGHPUT_AXIS_TICK_STEP_MBPS,
          ),
        }
      : buildNiceYTicks(0, Math.max(yMaxRaw + yPadding, 0.001));
  const yMin = yScale.min;
  const yMax = yScale.max;
  const yTicks = yScale.ticks;
  const xTicks = buildReferenceXTicks(xMax, X_AXIS_REFERENCE_POINT_COUNT);
  const xDenominator = xMax === xMin ? 1 : xMax - xMin;
  const yDenominator = yMax === yMin ? 1 : yMax - yMin;

  const seriesForRender = normalizedSeries.map((runSeries) => {
    const svgPoints = runSeries.points.map((point) => {
      const boundedXValue = Math.max(xMin, Math.min(xMax, point.xValue));
      const boundedYValue = Math.max(yMin, Math.min(yMax, point.yValue));
      return {
        xValue: point.xValue,
        yValue: point.yValue,
        x: leftPadding + ((boundedXValue - xMin) / xDenominator) * plotWidth,
        y:
          chartHeight -
          bottomPadding -
          ((boundedYValue - yMin) / yDenominator) * plotHeight,
      };
    });

    const path = svgPoints
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
      .join(" ");

    return {
      ...runSeries,
      svgPoints,
      path,
    };
  });
  const throughputSumForRender =
    metricId === "mbps"
      ? (() => {
          const sumByX = new Map<number, number>();
          for (const runSeries of normalizedSeries) {
            for (const point of runSeries.points) {
              const roundedX = roundToHundredth(point.xValue);
              const current = sumByX.get(roundedX) ?? 0;
              sumByX.set(roundedX, current + point.yValue);
            }
          }

          const points = Array.from(sumByX.entries())
            .map(([xValue, yValue]) => ({ xValue, yValue }))
            .sort((a, b) => a.xValue - b.xValue);

          if (points.length === 0) {
            return null;
          }

          const svgPoints = points.map((point) => {
            const boundedXValue = Math.max(xMin, Math.min(xMax, point.xValue));
            const boundedYValue = Math.max(yMin, Math.min(yMax, point.yValue));
            return {
              xValue: point.xValue,
              yValue: point.yValue,
              x: leftPadding + ((boundedXValue - xMin) / xDenominator) * plotWidth,
              y:
                chartHeight -
                bottomPadding -
                ((boundedYValue - yMin) / yDenominator) * plotHeight,
            };
          });

          const path = svgPoints
            .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
            .join(" ");

          return {
            runId: THROUGHPUT_SUM_SERIES_ID,
            label: "sum Mbps",
            shortLabel: "sum Mbps",
            clientSummary: "sum Mbps",
            color: "#eab308",
            data: [] as EmulatedPerSecondStat[],
            svgPoints,
            path,
          };
        })()
      : null;
  const interactiveSeriesForRender = throughputSumForRender
    ? [...seriesForRender, throughputSumForRender]
    : seriesForRender;

  const chartClassName = isExpanded
    ? "h-[70vh] w-full overflow-visible rounded-xl bg-[#fff2f8] text-slate-300 dark:bg-slate-900/65 dark:text-slate-600"
    : "h-44 w-full overflow-visible rounded-xl bg-[#fff2f8] text-slate-300 dark:bg-slate-900/65 dark:text-slate-600";
  const axisTickTextClass = isExpanded
    ? "fill-slate-500 text-[11px] dark:fill-slate-400"
    : "fill-slate-500 text-[9px] dark:fill-slate-400";
  const axisLabelTextClass = isExpanded
    ? "fill-slate-500 text-[12px] dark:fill-slate-400"
    : "fill-slate-500 text-[10px] dark:fill-slate-400";
  const hoverActivationRadius = 10;
  const hoverTargetStrokeWidth = isExpanded ? 24 : 18;
  const hoverTargetPointRadius = isExpanded ? 14 : 10;
  const pointDotRadius = isExpanded ? 2.8 : 2.2;
  const pointHitRadius = hoverActivationRadius;
  const tooltipWidth = isExpanded ? 140 : 116;
  const tooltipHeight = isExpanded ? 50 : 44;
  const sliceTooltipWidth = isExpanded ? 260 : 220;
  const sliceTooltipPaddingX = isExpanded ? 10 : 8;
  const sliceTooltipRowHeight = isExpanded ? 15 : 13;

  const toHoveredPoint = (
    runSeries: (typeof interactiveSeriesForRender)[number],
    point: {
      xValue: number;
      yValue: number;
      x: number;
      y: number;
    },
  ): HoveredChartPoint => ({
    runId: runSeries.runId,
    runSummary: runSeries.clientSummary,
    color: runSeries.color,
    x: point.x,
    y: point.y,
    xValue: point.xValue,
    yValue: point.yValue,
  });

  const setHoveredPointForRun = (
    runSeries: (typeof interactiveSeriesForRender)[number],
    point: {
      xValue: number;
      yValue: number;
      x: number;
      y: number;
    },
  ) => {
    setHoveredPoint((current) => {
      if (
        current?.runId === runSeries.runId &&
        current.xValue === point.xValue &&
        current.yValue === point.yValue
      ) {
        return current;
      }
      return toHoveredPoint(runSeries, point);
    });
  };

  const getClosestPointFromMouse = (
    runSeries: (typeof interactiveSeriesForRender)[number],
    clientX: number,
    clientY: number,
    svgElement: SVGSVGElement | null,
  ) => {
    if (runSeries.svgPoints.length === 0) {
      return null;
    }

    const position = getSvgPositionFromMouse(clientX, clientY, svgElement);
    if (!position) {
      return null;
    }

    const relativeX = position.x;
    return runSeries.svgPoints.reduce((closest, point) =>
      Math.abs(point.x - relativeX) < Math.abs(closest.x - relativeX)
        ? point
        : closest,
    );
  };

  const getSvgPositionFromMouse = (
    clientX: number,
    clientY: number,
    svgElement: SVGSVGElement | null,
  ) => {
    if (!svgElement) {
      return null;
    }

    const ctm = svgElement.getScreenCTM();
    if (!ctm) {
      return null;
    }

    const svgPoint = svgElement.createSVGPoint();
    svgPoint.x = clientX;
    svgPoint.y = clientY;

    const transformedPoint = svgPoint.matrixTransform(ctm.inverse());
    if (
      !Number.isFinite(transformedPoint.x) ||
      !Number.isFinite(transformedPoint.y)
    ) {
      return null;
    }

    if (
      transformedPoint.x < 0 ||
      transformedPoint.x > chartWidth ||
      transformedPoint.y < 0 ||
      transformedPoint.y > chartHeight
    ) {
      return null;
    }

    return {
      x: transformedPoint.x,
      y: transformedPoint.y,
    };
  };

  const getBoundedPlotPositionFromMouse = (
    clientX: number,
    clientY: number,
    svgElement: SVGSVGElement | null,
  ) => {
    const position = getSvgPositionFromMouse(clientX, clientY, svgElement);
    if (!position) {
      return null;
    }

    const minX = leftPadding;
    const maxX = chartWidth - rightPadding;
    const minY = topPadding;
    const maxY = chartHeight - bottomPadding;

    if (
      position.x < minX ||
      position.x > maxX ||
      position.y < minY ||
      position.y > maxY
    ) {
      return null;
    }

    return {
      x: Math.max(minX, Math.min(maxX, position.x)),
      y: Math.max(minY, Math.min(maxY, position.y)),
    };
  };

  const getHoveredSliceFromMouse = (
    clientX: number,
    clientY: number,
    svgElement: SVGSVGElement | null,
  ): HoveredSlice | null => {
    if (!svgElement || interactiveSeriesForRender.length === 0) {
      return null;
    }

    const boundedPosition = getBoundedPlotPositionFromMouse(
      clientX,
      clientY,
      svgElement,
    );
    if (!boundedPosition) {
      return null;
    }

    const boundedX = boundedPosition.x;
    const minX = leftPadding;
    const xValue = xMin + ((boundedX - minX) / Math.max(plotWidth, 1)) * xDenominator;
    const values: HoveredSliceValue[] = interactiveSeriesForRender.map(
      (runSeries) => {
      const nearestPoint = runSeries.svgPoints.reduce((closest, point) =>
        Math.abs(point.xValue - xValue) < Math.abs(closest.xValue - xValue)
          ? point
          : closest,
      );
      return {
        runId: runSeries.runId,
        shortLabel: runSeries.shortLabel,
        color: runSeries.color,
        yValue: nearestPoint.yValue,
        pointX: nearestPoint.x,
        pointY: nearestPoint.y,
      };
      },
    );

    return {
      x: boundedX,
      xValue,
      values,
    };
  };
  const crosshairX = hoveredSlice?.x ?? displayedPoint?.x ?? hoveredCursorX ?? null;
  const sliceTooltipHeight = hoveredSlice
    ? (isExpanded ? 26 : 22) +
      hoveredSlice.values.length * sliceTooltipRowHeight +
      2
    : 0;

  const chartSvg = (
    <svg
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      className={chartClassName}
      role="img"
      aria-label={`${title} over time`}
      onMouseMove={(event) => {
        if (!areInlineChartInteractionsEnabled) {
          return;
        }
        const boundedPosition = getBoundedPlotPositionFromMouse(
          event.clientX,
          event.clientY,
          event.currentTarget,
        );
        if (!boundedPosition) {
          setHoveredSlice(null);
          setHoveredCursorX(null);
          return;
        }
        setHoveredCursorX(boundedPosition.x);
        const nextSlice = getHoveredSliceFromMouse(
          event.clientX,
          event.clientY,
          event.currentTarget,
        );
        setHoveredSlice(nextSlice);
      }}
      onMouseLeave={() => {
        if (!areInlineChartInteractionsEnabled) {
          return;
        }
        setHoveredSlice(null);
        setHoveredCursorX(null);
      }}
    >
      {xTicks.map((tick) => {
        const x = leftPadding + ((tick - xMin) / xDenominator) * plotWidth;
        const labelY = chartHeight - bottomPadding + 14;
        return (
          <g key={`x-${tick}`}>
            <line
              x1={x}
              x2={x}
              y1={topPadding}
              y2={chartHeight - bottomPadding}
              stroke="currentColor"
              strokeDasharray="3 5"
              strokeWidth={0.9}
              opacity={0.45}
            />
            <line
              x1={x}
              x2={x}
              y1={chartHeight - bottomPadding}
              y2={chartHeight - bottomPadding + 4}
              stroke="currentColor"
              strokeWidth={1}
            />
            <text
              x={x}
              y={labelY}
              transform={`rotate(-45 ${x} ${labelY})`}
              textAnchor="end"
              className={axisTickTextClass}
            >
              {formatSecondsValue(tick)}
            </text>
          </g>
        );
      })}
      {yTicks.map((tick) => {
        const y =
          chartHeight -
          bottomPadding -
          ((tick - yMin) / yDenominator) * plotHeight;
        return (
          <g key={`y-${tick}`}>
            <line
              x1={leftPadding}
              x2={chartWidth - rightPadding}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <line
              x1={leftPadding - 4}
              x2={leftPadding}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeWidth={1}
            />
            <text
              x={leftPadding - 7}
              y={y + 3}
              textAnchor="end"
              className={axisTickTextClass}
            >
              {formatScaleValue(tick)}
            </text>
          </g>
        );
      })}
      <line
        x1={leftPadding}
        x2={leftPadding}
        y1={topPadding}
        y2={chartHeight - bottomPadding}
        stroke="currentColor"
        strokeWidth={1}
      />
      <line
        x1={leftPadding}
        x2={chartWidth - rightPadding}
        y1={chartHeight - bottomPadding}
        y2={chartHeight - bottomPadding}
        stroke="currentColor"
        strokeWidth={1}
      />
      {interactiveSeriesForRender.map((runSeries) => (
        <g key={runSeries.runId}>
          {runSeries.svgPoints.length >= 2 ? (
            <>
              <path
                d={runSeries.path}
                fill="none"
                stroke="transparent"
                strokeWidth={hoverTargetStrokeWidth}
                strokeLinecap="round"
                pointerEvents="none"
                onMouseEnter={() => {
                  if (!areInlineChartInteractionsEnabled) {
                    return;
                  }
                  if (pinnedRunId !== null) {
                    if (pinnedRunId === runSeries.runId) {
                      setHoveredRunId(runSeries.runId);
                    }
                    return;
                  }
                  setHoveredRunId(runSeries.runId);
                }}
                onMouseMove={(event) => {
                  if (!areInlineChartInteractionsEnabled) {
                    return;
                  }
                  if (pinnedRunId !== null) {
                    if (pinnedRunId !== runSeries.runId) {
                      return;
                    }
                    const closestPoint = getClosestPointFromMouse(
                      runSeries,
                      event.clientX,
                      event.clientY,
                      event.currentTarget.ownerSVGElement,
                    );
                    if (closestPoint) {
                      const pinned = toHoveredPoint(runSeries, closestPoint);
                      setPinnedPoint(pinned);
                      setHoveredRunId(runSeries.runId);
                      setHoveredPoint(pinned);
                    }
                    return;
                  }
                  setHoveredRunId(runSeries.runId);
                  const closestPoint = getClosestPointFromMouse(
                    runSeries,
                    event.clientX,
                    event.clientY,
                    event.currentTarget.ownerSVGElement,
                  );
                  if (closestPoint) {
                    setHoveredPointForRun(runSeries, closestPoint);
                  }
                }}
                onMouseLeave={() => {
                  if (!areInlineChartInteractionsEnabled) {
                    return;
                  }
                  setHoveredRunId(null);
                  setHoveredPoint(null);
                }}
                onClick={(event) => {
                  if (!areInlineChartInteractionsEnabled) {
                    return;
                  }
                  if (pinnedRunId !== null) {
                    return;
                  }
                  setPinnedRunId(runSeries.runId);
                  setHoveredRunId(runSeries.runId);
                  const closestPoint = getClosestPointFromMouse(
                    runSeries,
                    event.clientX,
                    event.clientY,
                    event.currentTarget.ownerSVGElement,
                  );
                  if (closestPoint) {
                    const pinned = toHoveredPoint(runSeries, closestPoint);
                    setPinnedPoint(pinned);
                    setHoveredPoint(pinned);
                  } else {
                    setPinnedPoint(null);
                  }
                }}
              />
              <path
                d={runSeries.path}
                fill="none"
                stroke={runSeries.color}
                pointerEvents="none"
                strokeWidth={
                  activeRunId === runSeries.runId
                    ? runSeries.runId === THROUGHPUT_SUM_SERIES_ID
                      ? 4.2
                      : 3.8
                    : activeRunId === null
                      ? runSeries.runId === THROUGHPUT_SUM_SERIES_ID
                        ? 2.8
                        : 2.2
                      : 1.6
                }
                strokeLinecap="round"
                opacity={
                  activeRunId === null || activeRunId === runSeries.runId
                    ? 1
                    : 0.28
                }
                style={{
                  transition: "stroke-width 140ms ease, opacity 140ms ease",
                  filter:
                    activeRunId === runSeries.runId
                      ? "drop-shadow(0 0 4px rgba(15, 23, 42, 0.24))"
                      : "none",
                }}
              />
            </>
          ) : null}
          {runSeries.svgPoints.length > 0 ? (
            <>
              {runSeries.svgPoints.map((point, index) => (
                <circle
                  key={`dot-${runSeries.runId}-${point.xValue}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={pointDotRadius}
                  fill={runSeries.color}
                  pointerEvents="none"
                  opacity={activeRunId === runSeries.runId ? 0.95 : 0}
                  style={{
                    transition: "opacity 120ms ease",
                  }}
                />
              ))}
              {runSeries.svgPoints.map((point, index) => (
                <circle
                  key={`hit-${runSeries.runId}-${point.xValue}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={pointHitRadius}
                  fill="transparent"
                  pointerEvents={areInlineChartInteractionsEnabled ? "all" : "none"}
                  onMouseEnter={() => {
                    if (!areInlineChartInteractionsEnabled) {
                      return;
                    }
                    if (pinnedRunId !== null) {
                      if (pinnedRunId === runSeries.runId) {
                        const pinned = toHoveredPoint(runSeries, point);
                        setPinnedPoint(pinned);
                        setHoveredRunId(runSeries.runId);
                        setHoveredPoint(pinned);
                      }
                      return;
                    }
                    setHoveredRunId(runSeries.runId);
                    setHoveredPointForRun(runSeries, point);
                  }}
                  onMouseMove={() => {
                    if (!areInlineChartInteractionsEnabled) {
                      return;
                    }
                    if (pinnedRunId !== null) {
                      if (pinnedRunId === runSeries.runId) {
                        const pinned = toHoveredPoint(runSeries, point);
                        setPinnedPoint(pinned);
                        setHoveredRunId(runSeries.runId);
                        setHoveredPoint(pinned);
                      }
                      return;
                    }
                    setHoveredRunId(runSeries.runId);
                    setHoveredPointForRun(runSeries, point);
                  }}
                  onMouseLeave={() => {
                    if (!areInlineChartInteractionsEnabled) {
                      return;
                    }
                    setHoveredRunId(null);
                    setHoveredPoint(null);
                  }}
                  onClick={() => {
                    if (!areInlineChartInteractionsEnabled) {
                      return;
                    }
                    if (pinnedRunId !== null) {
                      return;
                    }
                    const pinned = toHoveredPoint(runSeries, point);
                    setPinnedRunId(runSeries.runId);
                    setPinnedPoint(pinned);
                    setHoveredRunId(runSeries.runId);
                    setHoveredPoint(pinned);
                  }}
                />
              ))}
            </>
          ) : null}
          {displayedPoint && displayedPoint.runId === runSeries.runId ? (
            <>
              <circle
                cx={displayedPoint.x}
                cy={displayedPoint.y}
                r={hoverTargetPointRadius}
                fill="transparent"
                pointerEvents="none"
              />
              <circle
                cx={displayedPoint.x}
                cy={displayedPoint.y}
                r={isExpanded ? 5.2 : 4.4}
                fill={runSeries.color}
                pointerEvents="none"
                opacity={1}
                style={{
                  transition: "r 120ms ease",
                }}
              />
            </>
          ) : null}
        </g>
      ))}
      {areInlineChartInteractionsEnabled && crosshairX !== null ? (
        <g pointerEvents="none">
          <line
            x1={crosshairX}
            x2={crosshairX}
            y1={topPadding}
            y2={chartHeight - bottomPadding}
            stroke={hoveredSlice ? "#64748b" : displayedPoint?.color ?? "#64748b"}
            strokeWidth={1.2}
            strokeDasharray="4 4"
            opacity={0.55}
          />
          {hoveredSlice
            ? (() => {
                let tooltipX = crosshairX + 12;
                if (tooltipX + sliceTooltipWidth > chartWidth - rightPadding) {
                  tooltipX = crosshairX - sliceTooltipWidth - 12;
                }
                tooltipX = Math.max(
                  leftPadding + 4,
                  Math.min(
                    chartWidth - rightPadding - sliceTooltipWidth - 2,
                    tooltipX,
                  ),
                );

                let tooltipY = topPadding + 8;
                if (
                  tooltipY + sliceTooltipHeight >
                  chartHeight - bottomPadding - 4
                ) {
                  tooltipY = chartHeight - bottomPadding - sliceTooltipHeight - 4;
                }
                tooltipY = Math.max(topPadding + 4, tooltipY);

                const headerY = tooltipY + (isExpanded ? 15 : 13);
                const firstRowY = tooltipY + (isExpanded ? 30 : 25);

                return (
                  <>
                    <rect
                      x={tooltipX}
                      y={tooltipY}
                      width={sliceTooltipWidth}
                      height={sliceTooltipHeight}
                      rx={8}
                      fill="rgba(255, 250, 253, 0.96)"
                      stroke="#64748b"
                      strokeWidth={1.2}
                    />
                    <text
                      x={tooltipX + sliceTooltipPaddingX}
                      y={headerY}
                      className={
                        isExpanded
                          ? "fill-slate-900 text-[10px]"
                          : "fill-slate-900 text-[9px]"
                      }
                      fontWeight={700}
                    >
                      x (seconds): {formatSecondsValue(hoveredSlice.xValue)}
                    </text>
                    {hoveredSlice.values.map((value, index) => {
                      const rowY = firstRowY + index * sliceTooltipRowHeight;
                      return (
                        <g
                          key={`slice-value-${value.runId}`}
                          transform={`translate(${tooltipX + sliceTooltipPaddingX}, ${rowY})`}
                        >
                          <circle cx={4} cy={-4} r={2.6} fill={value.color} />
                          <text
                            x={10}
                            y={0}
                            className={
                              isExpanded
                                ? "fill-slate-700 text-[10px]"
                                : "fill-slate-700 text-[9px]"
                            }
                          >
                            {value.shortLabel}: {formatScaleValue(value.yValue)} {unit}
                          </text>
                        </g>
                      );
                    })}
                  </>
                );
              })()
            : displayedPoint
              ? (() => {
                  let tooltipX = crosshairX + 12;
                  if (tooltipX + tooltipWidth > chartWidth - rightPadding) {
                    tooltipX = crosshairX - tooltipWidth - 12;
                  }
                  tooltipX = Math.max(
                    leftPadding + 4,
                    Math.min(chartWidth - rightPadding - tooltipWidth - 2, tooltipX),
                  );

                  let tooltipY = displayedPoint.y - tooltipHeight - 12;
                  if (tooltipY < topPadding + 4) {
                    tooltipY = displayedPoint.y + 12;
                  }
                  tooltipY = Math.max(
                    topPadding + 4,
                    Math.min(
                      chartHeight - bottomPadding - tooltipHeight - 4,
                      tooltipY,
                    ),
                  );

                  return (
                    <>
                      <rect
                        x={tooltipX}
                        y={tooltipY}
                        width={tooltipWidth}
                        height={tooltipHeight}
                        rx={7}
                        fill="rgba(255, 250, 253, 0.96)"
                        stroke={displayedPoint.color}
                        strokeWidth={1.4}
                      />
                      <text
                        x={tooltipX + 10}
                        y={tooltipY + (isExpanded ? 15 : 14)}
                        className={isExpanded ? "fill-slate-900 text-[10px]" : "fill-slate-900 text-[9px]"}
                        fontWeight={700}
                      >
                        {displayedPoint.runSummary}
                      </text>
                      <text
                        x={tooltipX + 10}
                        y={tooltipY + (isExpanded ? 31 : 27)}
                        className={isExpanded ? "fill-slate-700 text-[10px]" : "fill-slate-700 text-[9px]"}
                      >
                        y ({unit}): {formatScaleValue(displayedPoint.yValue)}
                      </text>
                      <text
                        x={tooltipX + 10}
                        y={tooltipY + (isExpanded ? 43 : 38)}
                        className={isExpanded ? "fill-slate-700 text-[10px]" : "fill-slate-700 text-[9px]"}
                      >
                        x (seconds): {formatSecondsValue(displayedPoint.xValue)}
                      </text>
                    </>
                  );
                })()
              : null}
        </g>
      ) : null}
      <text
        x={leftPadding + plotWidth / 2}
        y={chartHeight - 4}
        textAnchor="middle"
        className={axisLabelTextClass}
      >
        elapsed seconds
      </text>
      <text
        x={14}
        y={topPadding + plotHeight / 2}
        transform={`rotate(-90 14 ${topPadding + plotHeight / 2})`}
        textAnchor="middle"
        className={axisLabelTextClass}
      >
        {unit}
      </text>
    </svg>
  );

  return (
    <div
      className={cardShellClassName}
      onMouseEnter={() => onCardHoverStart?.()}
      onMouseLeave={() => {
        setHoveredRunId(null);
        setHoveredPoint(null);
        setHoveredSlice(null);
        onCardHoverEnd?.();
      }}
    >
        <article
          className={`${cardClassName} ${onExpand ? "cursor-pointer" : ""}`}
          onClick={onExpand}
        >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          {onExpand ? (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Click chart to enlarge
            </span>
          ) : null}
        </div>
        <div
          className={
            onExpand
              ? "mt-3 rounded-xl"
              : "mt-3"
          }
        >
          {onExpand ? (
            <button
              type="button"
              onClick={onExpand}
              className="block w-full cursor-pointer rounded-xl text-left outline-none focus-visible:outline-none focus-visible:ring-0"
              aria-label={`Expand ${title} chart`}
            >
              {chartSvg}
            </button>
          ) : (
            chartSvg
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {interactiveSeriesForRender.map((runSeries) => (
            <div
              key={runSeries.runId}
              className={`group cursor-pointer rounded-lg border bg-[#fff3f8] px-2.5 py-1 text-[11px] text-slate-700 transition dark:bg-slate-700/45 dark:text-slate-100 ${
                activeRunId === null || activeRunId === runSeries.runId
                  ? "border-rose-200/90 hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-sm dark:border-slate-600 dark:hover:border-slate-400 dark:hover:shadow-none"
                  : "border-rose-200/70 opacity-60 dark:border-slate-600/60"
              }`}
              title={runSeries.label}
              onMouseEnter={() => {
                if (pinnedRunId !== null) {
                  return;
                }
                setHoveredRunId(runSeries.runId);
                setHoveredPoint(null);
              }}
              onMouseLeave={() => {
                if (pinnedRunId !== null) {
                  return;
                }
                setHoveredRunId(null);
                setHoveredPoint(null);
              }}
              onClick={() => {
                if (pinnedRunId !== null) {
                  return;
                }
                setPinnedRunId(runSeries.runId);
                setPinnedPoint(null);
                setHoveredRunId(runSeries.runId);
                setHoveredPoint(null);
              }}
            >
              <span
                className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle transition-transform duration-150 ${
                  activeRunId === runSeries.runId
                    ? "scale-150 shadow-[0_0_0_3px_rgba(15,23,42,0.08)] dark:shadow-[0_0_0_3px_rgba(148,163,184,0.22)]"
                    : "group-hover:scale-150 group-hover:shadow-[0_0_0_3px_rgba(15,23,42,0.08)] dark:group-hover:shadow-[0_0_0_3px_rgba(148,163,184,0.22)]"
                }`}
                style={{ backgroundColor: runSeries.color }}
              />
              {runSeries.shortLabel}
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
