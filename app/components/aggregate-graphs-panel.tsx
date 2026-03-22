"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AggregateDelayGraphPoint } from "@/lib/emulated-runs-data";

const CHART_WIDTH = 1120;
const CHART_HEIGHT = 520;
const PADDING = {
  top: 28,
  right: 28,
  bottom: 72,
  left: 72,
};
const POINT_RADIUS = 4.1;
const HOVER_TARGET_RADIUS = 13;
const TOOLTIP_WIDTH = 184;
const TOOLTIP_HEIGHT = 90;

type XAxisOption = "throughput" | "flow-completion-time";
type ClientCountOption = 2 | 3;
type HoveredAggregatePoint = {
  parentRunId: number;
  clientNumber: number;
  color: string;
  label: string;
  runCount: number;
  x: number;
  y: number;
  xValue: number;
  yValue: number;
};

const SERIES_COLORS = ["#0d9488", "#dc2626", "#4f46e5"];

function roundToHundredth(value: number) {
  return Number(value.toFixed(2));
}

function trimTrailingZeros(value: string) {
  if (!value.includes(".")) {
    return value;
  }

  return value.replace(/\.?0+$/, "");
}

function formatAxisValue(value: number) {
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatFlowCompletionTimeLabel(value: number) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  if (value >= 1000) {
    return `${formatAxisValue(value / 1000)} s`;
  }

  return `${formatAxisValue(value)} ms`;
}

function toSvgX(x: number) {
  return PADDING.left + x * (CHART_WIDTH - PADDING.left - PADDING.right);
}

function toSvgY(y: number) {
  return (
    CHART_HEIGHT -
    PADDING.bottom -
    y * (CHART_HEIGHT - PADDING.top - PADDING.bottom)
  );
}

function buildLinePath(points: Array<{ x: number; y: number }>) {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${toSvgX(point.x)} ${toSvgY(point.y)}`;
    })
    .join(" ");
}

function buildAreaPath(points: Array<{ x: number; y: number }>) {
  const linePath = buildLinePath(points);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];

  return `${linePath} L${toSvgX(lastPoint.x)} ${CHART_HEIGHT - PADDING.bottom} L${toSvgX(firstPoint.x)} ${CHART_HEIGHT - PADDING.bottom} Z`;
}

export function AggregateGraphsPanel({
  data,
}: {
  data: AggregateDelayGraphPoint[];
}) {
  const [selectedClientCount, setSelectedClientCount] =
    useState<ClientCountOption>(2);
  const [selectedXAxis, setSelectedXAxis] =
    useState<XAxisOption>("flow-completion-time");
  const [hiddenClientNumbers, setHiddenClientNumbers] = useState<number[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<HoveredAggregatePoint | null>(
    null,
  );
  const isThroughputView = selectedXAxis === "throughput";
  const filteredData = useMemo(
    () =>
      data.filter((point) => point.numberOfClients === selectedClientCount),
    [data, selectedClientCount],
  );

  const chartData = useMemo(() => {
    if (selectedXAxis === "throughput") {
      return {
        plottedSeries: [],
        maxX: 1,
        maxY: Math.max(...filteredData.map((point) => point.delayAddedMs), 1),
      };
    }

    const rawSeriesMap = new Map<
      number,
      Array<{ parentRunId: number; xValue: number; yValue: number; runCount: number }>
    >();

    for (const point of filteredData) {
      const xValue = point.flowCompletionTimeMs;

      if (
        xValue === null ||
        !Number.isFinite(xValue) ||
        !Number.isFinite(point.delayAddedMs)
      ) {
        continue;
      }

      const seriesPoints = rawSeriesMap.get(point.clientNumber) ?? [];
      seriesPoints.push({
        parentRunId: point.parentRunId,
        xValue,
        yValue: point.delayAddedMs,
        runCount: point.runCount,
      });
      rawSeriesMap.set(point.clientNumber, seriesPoints);
    }

    const rawSeries = Array.from(rawSeriesMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([clientNumber, points], index) => ({
        clientNumber,
        color: SERIES_COLORS[index % SERIES_COLORS.length],
        label: `Client ${clientNumber}`,
        points: points.sort((a, b) => a.yValue - b.yValue),
      }));

    const allPoints = rawSeries.flatMap((series) => series.points);

    if (allPoints.length === 0) {
      return {
        plottedSeries: rawSeries.map((series) => ({
          ...series,
          plottedPoints: [],
          path: null,
        })),
        maxX: 1,
        maxY: 1,
      };
    }

    const maxX = Math.max(...allPoints.map((point) => point.xValue), 1);
    const maxY = Math.max(...allPoints.map((point) => point.yValue), 1);

    return {
      plottedSeries: rawSeries.map((series) => {
        const plottedPoints = series.points.map((point) => ({
          ...point,
          x: roundToHundredth(point.xValue / maxX),
          y: roundToHundredth(point.yValue / maxY),
        }));

        return {
          ...series,
          plottedPoints,
          path:
            plottedPoints.length > 1 ? buildLinePath(plottedPoints) : null,
        };
      }),
      maxX,
      maxY,
    };
  }, [filteredData, selectedXAxis]);

  const { plottedSeries, maxX, maxY } = chartData;
  const visibleSeries = plottedSeries.filter(
    (series) => !hiddenClientNumbers.includes(series.clientNumber),
  );

  const guideLines = Array.from({ length: 6 }, (_, index) => {
    const fraction = index / 5;
    return (
      CHART_HEIGHT -
      PADDING.bottom -
      fraction * (CHART_HEIGHT - PADDING.top - PADDING.bottom)
    );
  });

  const verticalGuides = Array.from({ length: 7 }, (_, index) => {
    const fraction = index / 6;
    return PADDING.left + fraction * (CHART_WIDTH - PADDING.left - PADDING.right);
  });
  const xTicks = Array.from({ length: 7 }, (_, index) => {
    const fraction = index / 6;
    return {
      value: roundToHundredth(maxX * fraction),
      x:
        PADDING.left +
        fraction * (CHART_WIDTH - PADDING.left - PADDING.right),
    };
  });
  const yTicks = Array.from({ length: 6 }, (_, index) => {
    const fraction = index / 5;
    return {
      value: roundToHundredth(maxY * fraction),
      y:
        CHART_HEIGHT -
        PADDING.bottom -
        fraction * (CHART_HEIGHT - PADDING.top - PADDING.bottom),
    };
  });

  const xAxisLabel =
    selectedXAxis === "throughput"
      ? "Throughput (Mbps)"
      : "Flow Completion Time";
  const xAxisUnit = selectedXAxis === "throughput" ? "Mbps" : "ms";
  const yAxisLabel = "Added Delay (ms)";
  const totalRuns = filteredData.reduce((sum, point) => sum + point.runCount, 0);
  const hasVisibleSeries = visibleSeries.length > 0;
  const activeHoveredPoint =
    hoveredPoint && !isThroughputView
      ? visibleSeries.some(
          (series) => series.clientNumber === hoveredPoint.clientNumber,
        )
        ? hoveredPoint
        : null
      : null;
  const tooltipPosition = activeHoveredPoint
    ? {
        x: clamp(
          activeHoveredPoint.x + 14,
          PADDING.left,
          CHART_WIDTH - PADDING.right - TOOLTIP_WIDTH,
        ),
        y: clamp(
          activeHoveredPoint.y - TOOLTIP_HEIGHT - 14,
          PADDING.top,
          CHART_HEIGHT - PADDING.bottom - TOOLTIP_HEIGHT,
        ),
      }
    : null;

  return (
    <main className="space-atmosphere relative min-h-screen overflow-hidden p-5 sm:p-10">
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-7xl items-center justify-center py-3 sm:py-8">
        <section className="w-full rounded-[2rem] border border-rose-200/70 bg-[#fff8fc]/95 p-6 shadow-2xl dark:border-slate-600 dark:bg-slate-800/82 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-700">
                Jumpserve
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">
                Aggregate Graphs
              </h1>
            </div>
            <Link
              href="/"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-300/80 bg-[#fff5fb] text-slate-700 shadow-sm transition hover:border-rose-400 hover:bg-rose-50 dark:border-slate-500 dark:bg-slate-800/85 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700/90"
              aria-label="Go to home"
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

          <div className="mt-6 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="rounded-[1.75rem] border border-rose-200/80 bg-[#fff3f8] p-4 shadow-inner dark:border-slate-600 dark:bg-slate-900/60 sm:p-5">
              <div className="rounded-2xl border border-rose-200/80 bg-[#fff8fc] p-4 dark:border-slate-600 dark:bg-slate-800/55">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  Clients
                </p>
                <div
                  className="mt-3 flex flex-col gap-2"
                  role="radiogroup"
                  aria-label="Client count"
                >
                  <FilterOptionButton
                    label="Two Clients"
                    selected={selectedClientCount === 2}
                    onClick={() => setSelectedClientCount(2)}
                  />
                  <FilterOptionButton
                    label="Three Clients"
                    selected={selectedClientCount === 3}
                    onClick={() => setSelectedClientCount(3)}
                  />
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-rose-200/80 bg-[#fff8fc] p-4 dark:border-slate-600 dark:bg-slate-800/55">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  Y Axis
                </p>
                <div
                  className="mt-3 flex flex-col gap-2"
                  role="radiogroup"
                  aria-label="Y axis"
                >
                  <FilterOptionButton label="Added Delay" selected />
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-rose-200/80 bg-[#fff8fc] p-4 dark:border-slate-600 dark:bg-slate-800/55">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  X Axis
                </p>
                <div
                  className="mt-3 flex flex-col gap-2"
                  role="radiogroup"
                  aria-label="X axis"
                >
                  <FilterOptionButton
                    label="Throughput (Mbps)"
                    selected={selectedXAxis === "throughput"}
                    onClick={() => setSelectedXAxis("throughput")}
                  />
                  <FilterOptionButton
                    label="Flow Completion Time"
                    selected={selectedXAxis === "flow-completion-time"}
                    onClick={() => setSelectedXAxis("flow-completion-time")}
                  />
                </div>
              </div>
            </aside>

            <div className="rounded-[1.75rem] border border-rose-200/80 bg-[#fff3f8] p-4 shadow-inner dark:border-slate-600 dark:bg-slate-900/60 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    Aggregate View
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    Added Delay vs {xAxisLabel}
                  </h2>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-300">
                  {filteredData.length} plotted points across {totalRuns} runs
                </p>
              </div>

              <svg
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                className="h-[56vh] min-h-[420px] w-full overflow-visible rounded-[1.3rem] bg-[#fff2f8] text-slate-300 dark:bg-slate-900/65 dark:text-slate-600"
                role="img"
                aria-label="Aggregate graph overview"
                onMouseLeave={() => setHoveredPoint(null)}
              >
                <defs>
                  <linearGradient
                    id="aggregate-glow"
                    x1="0%"
                    x2="100%"
                    y1="0%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {guideLines.map((y) => (
                  <line
                    key={`h-${y}`}
                    x1={PADDING.left}
                    x2={CHART_WIDTH - PADDING.right}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    strokeDasharray="4 6"
                    strokeWidth={1}
                    opacity={0.5}
                  />
                ))}

                {verticalGuides.map((x) => (
                  <line
                    key={`v-${x}`}
                    x1={x}
                    x2={x}
                    y1={PADDING.top}
                    y2={CHART_HEIGHT - PADDING.bottom}
                    stroke="currentColor"
                    strokeDasharray="4 6"
                    strokeWidth={1}
                    opacity={0.38}
                  />
                ))}

                <line
                  x1={PADDING.left}
                  x2={PADDING.left}
                  y1={PADDING.top}
                  y2={CHART_HEIGHT - PADDING.bottom}
                  stroke="currentColor"
                  strokeWidth={1.15}
                />
                <line
                  x1={PADDING.left}
                  x2={CHART_WIDTH - PADDING.right}
                  y1={CHART_HEIGHT - PADDING.bottom}
                  y2={CHART_HEIGHT - PADDING.bottom}
                  stroke="currentColor"
                  strokeWidth={1.15}
                />

                {xTicks.map((tick) => (
                  <g key={`x-tick-${tick.x}`}>
                    <line
                      x1={tick.x}
                      x2={tick.x}
                      y1={CHART_HEIGHT - PADDING.bottom}
                      y2={CHART_HEIGHT - PADDING.bottom + 5}
                      stroke="currentColor"
                      strokeWidth={1}
                    />
                    <text
                      x={tick.x}
                      y={CHART_HEIGHT - PADDING.bottom + 21}
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px] dark:fill-slate-400"
                    >
                      {formatAxisValue(tick.value)}
                    </text>
                  </g>
                ))}

                {yTicks.map((tick) => (
                  <g key={`y-tick-${tick.y}`}>
                    <line
                      x1={PADDING.left - 5}
                      x2={PADDING.left}
                      y1={tick.y}
                      y2={tick.y}
                      stroke="currentColor"
                      strokeWidth={1}
                    />
                    <text
                      x={PADDING.left - 10}
                      y={tick.y + 3}
                      textAnchor="end"
                      className="fill-slate-500 text-[10px] dark:fill-slate-400"
                    >
                      {formatAxisValue(tick.value)}
                    </text>
                  </g>
                ))}

                {visibleSeries.map((series) => (
                  <g key={series.clientNumber}>
                    {series.plottedPoints.length > 1 ? (
                      <path
                        d={buildAreaPath(series.plottedPoints)}
                        fill={series.color}
                        opacity={0.08}
                      />
                    ) : null}
                    {series.path ? (
                      <path
                        d={series.path}
                        fill="none"
                        stroke={series.color}
                        strokeWidth={3.2}
                        strokeLinecap="round"
                        style={{
                          filter: "drop-shadow(0 0 4px rgba(15, 23, 42, 0.18))",
                        }}
                      />
                    ) : null}
                    {series.plottedPoints.map((point, index) => (
                      <g
                        key={`${series.clientNumber}-${point.xValue}-${point.yValue}-${index}`}
                      >
                        <circle
                          cx={toSvgX(point.x)}
                          cy={toSvgY(point.y)}
                          r={POINT_RADIUS}
                          fill={series.color}
                          stroke="url(#aggregate-glow)"
                          strokeWidth={1.4}
                        />
                        <circle
                          cx={toSvgX(point.x)}
                          cy={toSvgY(point.y)}
                          r={HOVER_TARGET_RADIUS}
                          fill="transparent"
                          onMouseEnter={() =>
                            setHoveredPoint({
                              clientNumber: series.clientNumber,
                              parentRunId: point.parentRunId,
                              color: series.color,
                              label: series.label,
                              runCount: point.runCount,
                              x: toSvgX(point.x),
                              y: toSvgY(point.y),
                              xValue: point.xValue,
                              yValue: point.yValue,
                            })
                          }
                          onFocus={() =>
                            setHoveredPoint({
                              clientNumber: series.clientNumber,
                              parentRunId: point.parentRunId,
                              color: series.color,
                              label: series.label,
                              runCount: point.runCount,
                              x: toSvgX(point.x),
                              y: toSvgY(point.y),
                              xValue: point.xValue,
                              yValue: point.yValue,
                            })
                          }
                          tabIndex={0}
                          aria-label={`${series.label}, parent run ${point.parentRunId}, flow completion time ${formatFlowCompletionTimeLabel(point.xValue)}, added delay ${formatAxisValue(point.yValue)} ms`}
                        />
                      </g>
                    ))}
                  </g>
                ))}

                {activeHoveredPoint && tooltipPosition ? (
                  <g pointerEvents="none">
                    <line
                      x1={activeHoveredPoint.x}
                      x2={tooltipPosition.x}
                      y1={activeHoveredPoint.y}
                      y2={tooltipPosition.y + TOOLTIP_HEIGHT / 2}
                      stroke={activeHoveredPoint.color}
                      strokeWidth={1.4}
                      opacity={0.7}
                      strokeDasharray="3 4"
                    />
                    <circle
                      cx={activeHoveredPoint.x}
                      cy={activeHoveredPoint.y}
                      r={7.2}
                      fill={activeHoveredPoint.color}
                      opacity={0.18}
                    />
                    <circle
                      cx={activeHoveredPoint.x}
                      cy={activeHoveredPoint.y}
                      r={POINT_RADIUS + 1.8}
                      fill={activeHoveredPoint.color}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                    <rect
                      x={tooltipPosition.x}
                      y={tooltipPosition.y}
                      width={TOOLTIP_WIDTH}
                      height={TOOLTIP_HEIGHT}
                      rx={14}
                      fill="rgba(15, 23, 42, 0.94)"
                      stroke={activeHoveredPoint.color}
                      strokeWidth={1.2}
                    />
                    <text
                      x={tooltipPosition.x + 14}
                      y={tooltipPosition.y + 20}
                      className="fill-white text-[11px] font-semibold"
                    >
                      {activeHoveredPoint.label}
                    </text>
                    <text
                      x={tooltipPosition.x + 14}
                      y={tooltipPosition.y + 38}
                      className="fill-slate-200 text-[10px]"
                    >
                      {`(${formatFlowCompletionTimeLabel(activeHoveredPoint.xValue)}, ${formatAxisValue(activeHoveredPoint.yValue)} ms)`}
                    </text>
                    <text
                      x={tooltipPosition.x + 14}
                      y={tooltipPosition.y + 55}
                      className="fill-slate-300 text-[10px]"
                    >
                      {`Parent run: #${activeHoveredPoint.parentRunId}`}
                    </text>
                    <text
                      x={tooltipPosition.x + 14}
                      y={tooltipPosition.y + 68}
                      className="fill-slate-300 text-[10px]"
                    >
                      {`Flow completion: ${formatFlowCompletionTimeLabel(activeHoveredPoint.xValue)}`}
                    </text>
                    <text
                      x={tooltipPosition.x + 14}
                      y={tooltipPosition.y + 81}
                      className="fill-slate-300 text-[10px]"
                    >
                      {`Added delay: ${formatAxisValue(activeHoveredPoint.yValue)} ms`}
                    </text>
                  </g>
                ) : null}

                {!hasVisibleSeries && !isThroughputView ? (
                  <text
                    x={CHART_WIDTH / 2}
                    y={CHART_HEIGHT / 2}
                    textAnchor="middle"
                    className="fill-slate-500 text-[13px] dark:fill-slate-400"
                  >
                    {plottedSeries.length === 0
                      ? "No run-level data available for this aggregate view."
                      : "All client series are hidden. Use the legend to show them again."}
                  </text>
                ) : null}

                <text
                  x={PADDING.left + (CHART_WIDTH - PADDING.left - PADDING.right) / 2}
                  y={CHART_HEIGHT - 18}
                  textAnchor="middle"
                  className="fill-slate-500 text-[12px] dark:fill-slate-400"
                >
                  {xAxisLabel} ({xAxisUnit})
                </text>
                <text
                  x={22}
                  y={PADDING.top + (CHART_HEIGHT - PADDING.top - PADDING.bottom) / 2}
                  transform={`rotate(-90 22 ${PADDING.top + (CHART_HEIGHT - PADDING.top - PADDING.bottom) / 2})`}
                  textAnchor="middle"
                  className="fill-slate-500 text-[12px] dark:fill-slate-400"
                >
                  {yAxisLabel}
                </text>
              </svg>

              {!isThroughputView ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {plottedSeries.map((series) => {
                    const isHidden = hiddenClientNumbers.includes(
                      series.clientNumber,
                    );

                    return (
                      <button
                        key={series.clientNumber}
                        type="button"
                        aria-pressed={!isHidden}
                        onClick={() =>
                          setHiddenClientNumbers((current) =>
                            current.includes(series.clientNumber)
                              ? current.filter(
                                  (clientNumber) =>
                                    clientNumber !== series.clientNumber,
                                )
                              : [...current, series.clientNumber],
                          )
                        }
                        className={`rounded-lg border bg-[#fff8fc] px-2.5 py-1 text-[11px] text-slate-700 transition dark:bg-slate-800/55 dark:text-slate-100 ${
                          isHidden
                            ? "border-rose-200/70 opacity-45 dark:border-slate-600/60"
                            : "border-rose-200/90 hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-sm dark:border-slate-600 dark:hover:border-slate-400 dark:hover:shadow-none"
                        }`}
                        title={`${series.label} | ${series.plottedPoints.length} delay points`}
                      >
                        <span
                          className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                          style={{ backgroundColor: series.color }}
                        />
                        <span className={isHidden ? "line-through" : undefined}>
                          {series.label} | {series.plottedPoints.length} points
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function FilterOptionButton({
  label,
  onClick,
  selected = false,
}: {
  label: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
        selected
          ? "border-rose-400 bg-rose-50 text-slate-900 shadow-sm dark:border-slate-400 dark:bg-slate-700/90 dark:text-slate-100"
          : "border-rose-200/80 bg-[#fff3f8] text-slate-700 hover:border-rose-300 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:border-slate-500"
      }`}
    >
      {label}
    </button>
  );
}
