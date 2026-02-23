"use client";

import { useEffect, useMemo, useState } from "react";

export type EmulatedParentRun = {
  id: number;
  createdAt: string | null;
};

export type EmulatedRun = {
  id: number;
  createdAt: string;
  parentRunId: number | null;
  clientNumber: number | null;
  delayAddedMs: number | null;
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
  color: string;
  data: EmulatedPerSecondStat[];
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

function formatTimestamp(value: string | null) {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }

  return date.toLocaleString();
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

export function EmulatedRunsDashboard({
  parentRuns,
  runs,
  stats,
}: {
  parentRuns: EmulatedParentRun[];
  runs: EmulatedRun[];
  stats: EmulatedPerSecondStat[];
}) {
  const [selectedParentRunId, setSelectedParentRunId] = useState<number | null>(
    parentRuns[0]?.id ?? null,
  );
  const [expandedMetricId, setExpandedMetricId] = useState<string | null>(null);

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

  const parentOptions = useMemo(
    () =>
      parentRuns.map((parentRun) => ({
        ...parentRun,
        childRunCount: runsByParent.get(parentRun.id)?.length ?? 0,
      })),
    [parentRuns, runsByParent],
  );

  const selectedParentRun =
    parentOptions.find((parentRun) => parentRun.id === selectedParentRunId) ??
    null;
  const selectedRuns = selectedParentRunId
    ? (runsByParent.get(selectedParentRunId) ?? [])
    : [];

  const chartSeries: ChartSeries[] = selectedRuns.map((run, index) => {
    const ccaLabel =
      run.congestionControlAlgorithmName ??
      (run.congestionControlAlgorithmId !== null
        ? `id ${run.congestionControlAlgorithmId}`
        : "n/a");

    return {
      runId: run.id,
      shortLabel: ccaLabel,
      label: ccaLabel,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      data: statsByRun.get(run.id) ?? [],
    };
  });

  const uniqueAlgorithms = Array.from(
    new Set(
      selectedRuns.map((run) =>
        run.congestionControlAlgorithmName
          ? run.congestionControlAlgorithmName
          : run.congestionControlAlgorithmId !== null
            ? `id ${run.congestionControlAlgorithmId}`
            : "n/a",
      ),
    ),
  ).join(", ");

  const totalSampleCount = chartSeries.reduce(
    (total, series) => total + series.data.length,
    0,
  );

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
      <section className="w-full max-w-6xl rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-2xl backdrop-blur-sm dark:border-slate-700/70 dark:bg-slate-900/80 sm:p-8">
      <div className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-700 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-700">
            Jumpserve
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
            Emulated Run Explorer
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Select a parent run and compare all child <code>emulated_runs</code>{" "}
            on shared charts from <code>emulated_per_second_stats</code>.
          </p>
        </div>
        <label className="flex w-full flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 sm:max-w-md">
          Select parent run
          <select
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-teal-700/60"
            value={selectedParentRunId ?? ""}
            onChange={(event) => {
              const nextValue = Number(event.currentTarget.value);
              setSelectedParentRunId(Number.isFinite(nextValue) ? nextValue : null);
            }}
          >
            {parentOptions.map((parentRun) => (
              <option key={parentRun.id} value={parentRun.id}>
                Parent #{parentRun.id} | {parentRun.childRunCount} child run
                {parentRun.childRunCount === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedParentRun ? (
        <>
          <dl className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetaItem label="Parent Run ID" value={String(selectedParentRun.id)} />
            <MetaItem
              label="Parent Created"
              value={formatTimestamp(selectedParentRun.createdAt)}
            />
            <MetaItem label="Child Runs" value={String(selectedRuns.length)} />
            <MetaItem
              label="Algorithms"
              value={uniqueAlgorithms.length > 0 ? uniqueAlgorithms : "n/a"}
            />
          </dl>

          {selectedRuns.length > 0 ? (
            <>
              <p className="mb-3 text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {totalSampleCount} total samples across selected child runs
              </p>
              <div className="grid gap-5 lg:grid-cols-3">
                {METRICS.map((metric) => (
                  <MetricChart
                    key={metric.id}
                    series={chartSeries}
                    title={metric.title}
                    unit={metric.unit}
                    accessor={metric.accessor}
                    onExpand={() => setExpandedMetricId(metric.id)}
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
      </section>
      {expandedMetric ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setExpandedMetricId(null)}
        >
          <div
            className="max-h-[95vh] w-full max-w-7xl overflow-y-auto rounded-2xl border border-slate-700/70 bg-slate-900/95 p-3 shadow-2xl sm:p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-slate-100 sm:text-base">
                Expanded View: {expandedMetric.title}
              </h3>
              <button
                type="button"
                onClick={() => setExpandedMetricId(null)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700"
              >
                Close
              </button>
            </div>
            <MetricChart
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

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
      <dt className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
        {value}
      </dd>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-300">
      {text}
    </div>
  );
}

function MetricChart({
  series,
  title,
  unit,
  accessor,
  onExpand,
  size = "default",
}: {
  series: ChartSeries[];
  title: string;
  unit: string;
  accessor: (point: EmulatedPerSecondStat) => number | null;
  onExpand?: () => void;
  size?: "default" | "expanded";
}) {
  const [hoveredRunId, setHoveredRunId] = useState<number | null>(null);
  const isExpanded = size === "expanded";
  const chartWidth = isExpanded ? 1200 : 460;
  const chartHeight = isExpanded ? 620 : 220;
  const leftPadding = isExpanded ? 78 : 56;
  const rightPadding = isExpanded ? 28 : 18;
  const topPadding = isExpanded ? 26 : 18;
  const bottomPadding = isExpanded ? 94 : 52;
  const plotWidth = chartWidth - leftPadding - rightPadding;
  const plotHeight = chartHeight - topPadding - bottomPadding;

  const normalizedSeries = series
    .map((runSeries) => {
      const points = runSeries.data
        .map((point, index) => {
          const xValue = point.elapsedSeconds ?? point.snapshotIndex ?? index;
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
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h2>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          No points available for this metric.
        </p>
      </article>
    );
  }

  const xValues = normalizedSeries.flatMap((runSeries) =>
    runSeries.points.map((point) => point.xValue),
  );
  const yValues = normalizedSeries.flatMap((runSeries) =>
    runSeries.points.map((point) => point.yValue),
  );

  const xMin = 0;
  const xMax = Math.max(...xValues, 0);
  const yMinRaw = Math.min(...yValues);
  const yMaxRaw = Math.max(...yValues);
  const yPadding = Math.max((yMaxRaw - yMinRaw) * 0.12, 0.001);
  const yScaleMax = Math.max(yMaxRaw + yPadding, 0.001);
  const yScale = buildNiceYTicks(0, yScaleMax);
  const yMin = yScale.min;
  const yMax = yScale.max;
  const yTicks = yScale.ticks;
  const xTickStart = Math.ceil(xMin);
  const xTickEnd = Math.floor(xMax);
  const xTicks =
    xTickStart <= xTickEnd
      ? Array.from(
          { length: xTickEnd - xTickStart + 1 },
          (_, index) => xTickStart + index,
        )
      : [Math.round(xMin)];
  const xDenominator = xMax === xMin ? 1 : xMax - xMin;
  const yDenominator = yMax === yMin ? 1 : yMax - yMin;

  const seriesForRender = normalizedSeries.map((runSeries) => {
    const svgPoints = runSeries.points.map((point) => ({
      yValue: point.yValue,
      x: (() => {
        const boundedXValue = Math.max(xMin, Math.min(xMax, point.xValue));
        return leftPadding + ((boundedXValue - xMin) / xDenominator) * plotWidth;
      })(),
      y: (() => {
        const boundedYValue = Math.max(yMin, Math.min(yMax, point.yValue));
        return (
          chartHeight -
          bottomPadding -
          ((boundedYValue - yMin) / yDenominator) * plotHeight
        );
      })(),
    }));

    const path = svgPoints
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
      .join(" ");
    const latestPoint = svgPoints[svgPoints.length - 1] ?? null;

    return {
      ...runSeries,
      svgPoints,
      path,
      latestPoint,
    };
  });

  const chartClassName = isExpanded
    ? "h-[70vh] w-full overflow-visible rounded-xl bg-slate-50 text-slate-300 dark:bg-slate-950/70 dark:text-slate-700"
    : "h-44 w-full overflow-visible rounded-xl bg-slate-50 text-slate-300 dark:bg-slate-950/70 dark:text-slate-700";
  const axisTickTextClass = isExpanded
    ? "fill-slate-500 text-[11px] dark:fill-slate-400"
    : "fill-slate-500 text-[9px] dark:fill-slate-400";
  const axisLabelTextClass = isExpanded
    ? "fill-slate-500 text-[12px] dark:fill-slate-400"
    : "fill-slate-500 text-[10px] dark:fill-slate-400";
  const hoverTargetStrokeWidth = isExpanded ? 24 : 18;
  const hoverTargetPointRadius = isExpanded ? 14 : 10;

  const chartSvg = (
    <svg
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      className={chartClassName}
      role="img"
      aria-label={`${title} over time`}
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
              {tick}
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
      {seriesForRender.map((runSeries) => (
        <g key={runSeries.runId}>
          {runSeries.svgPoints.length >= 2 ? (
            <>
              <path
                d={runSeries.path}
                fill="none"
                stroke="transparent"
                strokeWidth={hoverTargetStrokeWidth}
                strokeLinecap="round"
                pointerEvents="stroke"
                onMouseEnter={() => setHoveredRunId(runSeries.runId)}
                onMouseLeave={() => setHoveredRunId(null)}
              />
              <path
                d={runSeries.path}
                fill="none"
                stroke={runSeries.color}
                pointerEvents="none"
                strokeWidth={
                  hoveredRunId === runSeries.runId
                    ? 3.8
                    : hoveredRunId === null
                      ? 2.2
                      : 1.6
                }
                strokeLinecap="round"
                opacity={
                  hoveredRunId === null || hoveredRunId === runSeries.runId
                    ? 1
                    : 0.28
                }
                style={{
                  transition: "stroke-width 140ms ease, opacity 140ms ease",
                  filter:
                    hoveredRunId === runSeries.runId
                      ? "drop-shadow(0 0 4px rgba(15, 23, 42, 0.24))"
                      : "none",
                }}
              />
            </>
          ) : null}
          {runSeries.latestPoint ? (
            <>
              <circle
                cx={runSeries.latestPoint.x}
                cy={runSeries.latestPoint.y}
                r={hoverTargetPointRadius}
                fill="transparent"
                pointerEvents="all"
                onMouseEnter={() => setHoveredRunId(runSeries.runId)}
                onMouseLeave={() => setHoveredRunId(null)}
              />
              <circle
                cx={runSeries.latestPoint.x}
                cy={runSeries.latestPoint.y}
                r={hoveredRunId === runSeries.runId ? 4.2 : 3.2}
                fill={runSeries.color}
                pointerEvents="none"
                opacity={
                  hoveredRunId === null || hoveredRunId === runSeries.runId
                    ? 1
                    : 0.35
                }
                style={{
                  transition: "r 140ms ease, opacity 140ms ease",
                }}
              />
            </>
          ) : null}
        </g>
      ))}
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
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
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
            ? "mt-3 cursor-zoom-in rounded-xl focus-within:ring-2 focus-within:ring-teal-300/70"
            : "mt-3"
        }
      >
        {onExpand ? (
          <button
            type="button"
            onClick={onExpand}
            className="block w-full rounded-xl text-left outline-none"
            aria-label={`Expand ${title} chart`}
          >
            {chartSvg}
          </button>
        ) : (
          chartSvg
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {seriesForRender.map((runSeries) => (
          <div
            key={runSeries.runId}
            className={`group cursor-default rounded-lg border bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700 transition dark:bg-slate-800/40 dark:text-slate-200 ${
              hoveredRunId === null || hoveredRunId === runSeries.runId
                ? "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:hover:border-slate-500 dark:hover:shadow-none"
                : "border-slate-200/60 opacity-60 dark:border-slate-700/60"
            }`}
            title={runSeries.label}
            onMouseEnter={() => setHoveredRunId(runSeries.runId)}
            onMouseLeave={() => setHoveredRunId(null)}
          >
            <span
              className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle transition-transform duration-150 ${
                hoveredRunId === runSeries.runId
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
  );
}
