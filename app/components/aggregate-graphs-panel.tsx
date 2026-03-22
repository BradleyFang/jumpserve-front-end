"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { AggregateDelayGraphPoint } from "@/lib/emulated-runs-data";

const CHART_WIDTH = 1120;
const CHART_HEIGHT = 440;
const CHART_PADDING = {
  top: 28,
  right: 28,
  bottom: 68,
  left: 78,
};
const POINT_RADIUS = 4.2;
const HOVER_RADIUS = 14;
const TOOLTIP_WIDTH = 226;
const SERIES_COLORS = ["#0d9488", "#dc2626", "#4f46e5", "#ca8a04"];
const CLIENT_POINT_COLORS: Record<number, string> = {
  1: "#0f766e",
  2: "#b91c1c",
};

type FlowPoint = AggregateDelayGraphPoint & {
  flowCompletionTimeMs: number;
};

type ClientSeries = {
  clientNumber: number;
  color: string;
  label: string;
};

type ScatterHoverPoint = {
  clientNumber: number;
  color: string;
  parentRunId: number;
  delayAddedMs: number;
  flowCompletionTimeMs: number;
  x: number;
  y: number;
};

type BoxPlotHoverStat = {
  clientNumber: number;
  color: string;
  delayAddedMs: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  count: number;
  x: number;
  y: number;
};

type EcdfHoverPoint = {
  clientNumber: number;
  color: string;
  parentRunId: number;
  delayAddedMs: number;
  flowCompletionTimeMs: number;
  percentile: number;
  x: number;
  y: number;
};

type ParentRunConnectionHoverPoint = {
  clientNumber: number;
  parentRunId: number;
  delayAddedMs: number;
  otherClientDelayMs: number | null;
  flowCompletionTimeMs: number;
  x: number;
  y: number;
  pointColor: string;
  lineColor: string;
};

type ZoomDomain = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  startDomain: ZoomDomain;
};

type BoxPlotStat = {
  delayAddedMs: number;
  clientNumber: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  count: number;
};

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

function formatFlowCompletionTimeLabel(value: number) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  if (value >= 1000) {
    return `${formatAxisValue(value / 1000)} s`;
  }

  return `${formatAxisValue(value)} ms`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildLinearTicks(maxValue: number, tickCount = 6) {
  const safeMax = Math.max(maxValue, 1);
  return Array.from({ length: tickCount }, (_, index) => {
    const fraction = index / Math.max(tickCount - 1, 1);
    return roundToHundredth(safeMax * fraction);
  });
}

function buildLinearTicksForDomain(
  minValue: number,
  maxValue: number,
  tickCount = 6,
) {
  const safeMin = Number.isFinite(minValue) ? minValue : 0;
  const safeMax = Number.isFinite(maxValue) ? maxValue : 1;
  const range = safeMax - safeMin;

  if (Math.abs(range) < 0.000001) {
    return [roundToHundredth(safeMin)];
  }

  return Array.from({ length: tickCount }, (_, index) => {
    const fraction = index / Math.max(tickCount - 1, 1);
    return roundToHundredth(safeMin + range * fraction);
  });
}

function getChartInnerWidth() {
  return CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
}

function getChartInnerHeight() {
  return CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
}

function scaleChartX(value: number, maxValue: number) {
  return (
    CHART_PADDING.left +
    (value / Math.max(maxValue, 1)) * getChartInnerWidth()
  );
}

function scaleChartY(value: number, maxValue: number) {
  return (
    CHART_HEIGHT -
    CHART_PADDING.bottom -
    (value / Math.max(maxValue, 1)) * getChartInnerHeight()
  );
}

function scaleChartXWithinDomain(
  value: number,
  minValue: number,
  maxValue: number,
) {
  return (
    CHART_PADDING.left +
    ((value - minValue) / Math.max(maxValue - minValue, 0.000001)) *
      getChartInnerWidth()
  );
}

function scaleChartYWithinDomain(
  value: number,
  minValue: number,
  maxValue: number,
) {
  return (
    CHART_HEIGHT -
    CHART_PADDING.bottom -
    ((value - minValue) / Math.max(maxValue - minValue, 0.000001)) *
      getChartInnerHeight()
  );
}

function invertChartXPosition(
  x: number,
  minValue: number,
  maxValue: number,
) {
  return (
    minValue +
    ((x - CHART_PADDING.left) / getChartInnerWidth()) * (maxValue - minValue)
  );
}

function invertChartYPosition(
  y: number,
  minValue: number,
  maxValue: number,
) {
  return (
    minValue +
    ((CHART_HEIGHT - CHART_PADDING.bottom - y) / getChartInnerHeight()) *
      (maxValue - minValue)
  );
}

function clampChartPlotX(value: number) {
  return clamp(value, CHART_PADDING.left, CHART_WIDTH - CHART_PADDING.right);
}

function clampChartPlotY(value: number) {
  return clamp(value, CHART_PADDING.top, CHART_HEIGHT - CHART_PADDING.bottom);
}

function quantile(sortedValues: number[], fraction: number) {
  if (sortedValues.length === 0) {
    return 0;
  }

  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const position = (sortedValues.length - 1) * fraction;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];

  if (lowerIndex === upperIndex) {
    return lower;
  }

  return lower + (upper - lower) * (position - lowerIndex);
}

function buildScatterTooltipPosition(point: { x: number; y: number }, height: number) {
  return {
    x: clamp(
      point.x + 14,
      CHART_PADDING.left,
      CHART_WIDTH - CHART_PADDING.right - TOOLTIP_WIDTH,
    ),
    y: clamp(
      point.y - height - 14,
      CHART_PADDING.top,
      CHART_HEIGHT - CHART_PADDING.bottom - height,
    ),
  };
}

function renderYAxisTicks(maxValue: number, formatLabel: (value: number) => string) {
  const ticks = buildLinearTicks(maxValue);

  return ticks.map((tick) => {
    const y = scaleChartY(tick, maxValue);

    return (
      <g key={`y-${tick}`}>
        <line
          x1={CHART_PADDING.left}
          x2={CHART_WIDTH - CHART_PADDING.right}
          y1={y}
          y2={y}
          stroke="currentColor"
          strokeDasharray="4 6"
          strokeWidth={1}
          opacity={0.45}
        />
        <line
          x1={CHART_PADDING.left - 5}
          x2={CHART_PADDING.left}
          y1={y}
          y2={y}
          stroke="currentColor"
          strokeWidth={1}
        />
        <text
          x={CHART_PADDING.left - 10}
          y={y + 3}
          textAnchor="end"
          className="fill-slate-500 text-[10px] dark:fill-slate-400"
        >
          {formatLabel(tick)}
        </text>
      </g>
    );
  });
}

function renderYAxisTicksForDomain(
  minValue: number,
  maxValue: number,
  formatLabel: (value: number) => string,
  options?: {
    textClassName?: string;
    tickStrokeWidth?: number;
    gridStrokeWidth?: number;
  },
) {
  const ticks = buildLinearTicksForDomain(minValue, maxValue);
  const textClassName =
    options?.textClassName ?? "fill-slate-500 text-[10px] dark:fill-slate-400";
  const tickStrokeWidth = options?.tickStrokeWidth ?? 1;
  const gridStrokeWidth = options?.gridStrokeWidth ?? 1;

  return ticks.map((tick) => {
    const y = scaleChartYWithinDomain(tick, minValue, maxValue);

    return (
      <g key={`y-domain-${tick}`}>
        <line
          x1={CHART_PADDING.left}
          x2={CHART_WIDTH - CHART_PADDING.right}
          y1={y}
          y2={y}
          stroke="currentColor"
          strokeDasharray="4 6"
          strokeWidth={gridStrokeWidth}
          opacity={0.45}
        />
        <line
          x1={CHART_PADDING.left - 5}
          x2={CHART_PADDING.left}
          y1={y}
          y2={y}
          stroke="currentColor"
          strokeWidth={tickStrokeWidth}
        />
        <text
          x={CHART_PADDING.left - 10}
          y={y + 3}
          textAnchor="end"
          className={textClassName}
        >
          {formatLabel(tick)}
        </text>
      </g>
    );
  });
}

function renderXAxisTicks(
  maxValue: number,
  formatLabel: (value: number) => string,
) {
  const ticks = buildLinearTicks(maxValue, 7);

  return ticks.map((tick) => {
    const x = scaleChartX(tick, maxValue);

    return (
      <g key={`x-${tick}`}>
        <line
          x1={x}
          x2={x}
          y1={CHART_HEIGHT - CHART_PADDING.bottom}
          y2={CHART_HEIGHT - CHART_PADDING.bottom + 5}
          stroke="currentColor"
          strokeWidth={1}
        />
        <text
          x={x}
          y={CHART_HEIGHT - CHART_PADDING.bottom + 21}
          textAnchor="middle"
          className="fill-slate-500 text-[10px] dark:fill-slate-400"
        >
          {formatLabel(tick)}
        </text>
      </g>
    );
  });
}

function renderXAxisTicksForDomain(
  minValue: number,
  maxValue: number,
  formatLabel: (value: number) => string,
  options?: {
    textClassName?: string;
    tickStrokeWidth?: number;
  },
) {
  const ticks = buildLinearTicksForDomain(minValue, maxValue, 7);
  const textClassName =
    options?.textClassName ?? "fill-slate-500 text-[10px] dark:fill-slate-400";
  const tickStrokeWidth = options?.tickStrokeWidth ?? 1;

  return ticks.map((tick) => {
    const x = scaleChartXWithinDomain(tick, minValue, maxValue);

    return (
      <g key={`x-domain-${tick}`}>
        <line
          x1={x}
          x2={x}
          y1={CHART_HEIGHT - CHART_PADDING.bottom}
          y2={CHART_HEIGHT - CHART_PADDING.bottom + 5}
          stroke="currentColor"
          strokeWidth={tickStrokeWidth}
        />
        <text
          x={x}
          y={CHART_HEIGHT - CHART_PADDING.bottom + 21}
          textAnchor="middle"
          className={textClassName}
        >
          {formatLabel(tick)}
        </text>
      </g>
    );
  });
}

function renderChartAxes({
  xAxisLabel,
  yAxisLabel,
  xTicks,
  yTicks,
  axisLineStrokeWidth = 1.15,
  axisLabelClassName = "fill-slate-500 text-[12px] dark:fill-slate-400",
}: {
  xAxisLabel: string;
  yAxisLabel: string;
  xTicks: React.ReactNode;
  yTicks: React.ReactNode;
  axisLineStrokeWidth?: number;
  axisLabelClassName?: string;
}) {
  return (
    <>
      <line
        x1={CHART_PADDING.left}
        x2={CHART_PADDING.left}
        y1={CHART_PADDING.top}
        y2={CHART_HEIGHT - CHART_PADDING.bottom}
        stroke="currentColor"
        strokeWidth={axisLineStrokeWidth}
      />
      <line
        x1={CHART_PADDING.left}
        x2={CHART_WIDTH - CHART_PADDING.right}
        y1={CHART_HEIGHT - CHART_PADDING.bottom}
        y2={CHART_HEIGHT - CHART_PADDING.bottom}
        stroke="currentColor"
        strokeWidth={axisLineStrokeWidth}
      />
      {xTicks}
      {yTicks}
      <text
        x={CHART_PADDING.left + getChartInnerWidth() / 2}
        y={CHART_HEIGHT - 18}
        textAnchor="middle"
        className={axisLabelClassName}
      >
        {xAxisLabel}
      </text>
      <text
        x={22}
        y={CHART_PADDING.top + getChartInnerHeight() / 2}
        transform={`rotate(-90 22 ${CHART_PADDING.top + getChartInnerHeight() / 2})`}
        textAnchor="middle"
        className={axisLabelClassName}
      >
        {yAxisLabel}
      </text>
    </>
  );
}

function ChartCard({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-[1.75rem] border border-rose-200/80 bg-[#fff3f8] p-4 shadow-inner dark:border-slate-600 dark:bg-slate-900/60 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
        </div>
        <p className="max-w-xl text-sm text-slate-500 dark:text-slate-300">
          {subtitle}
        </p>
      </div>
      {children}
    </article>
  );
}

function EmptyChartState({ text }: { text: string }) {
  return (
    <div className="flex h-[320px] items-center justify-center rounded-[1.3rem] border border-dashed border-rose-300/80 bg-[#fff2f8] text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-900/65 dark:text-slate-300">
      {text}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ScatterPlot({
  points,
  series,
}: {
  points: FlowPoint[];
  series: ClientSeries[];
}) {
  const [hoveredPoint, setHoveredPoint] = useState<ScatterHoverPoint | null>(null);

  const maxDelay = Math.max(...points.map((point) => point.delayAddedMs), 1);
  const maxFlowCompletion = Math.max(
    ...points.map((point) => point.flowCompletionTimeMs),
    1,
  );
  const clientOrder = series.map((entry) => entry.clientNumber);
  const tooltipHeight = 90;

  if (points.length === 0) {
    return <EmptyChartState text="No run-level flow completion data available." />;
  }

  const positionedPoints = points.map((point) => {
    const clientIndex = clientOrder.indexOf(point.clientNumber);
    const jitter =
      clientOrder.length > 1
        ? ((clientIndex - (clientOrder.length - 1) / 2) / clientOrder.length) * 18
        : 0;
    const x = scaleChartX(point.delayAddedMs, maxDelay) + jitter;
    const y = scaleChartY(point.flowCompletionTimeMs, maxFlowCompletion);
    const color =
      series.find((entry) => entry.clientNumber === point.clientNumber)?.color ??
      SERIES_COLORS[0];

    return {
      ...point,
      color,
      x,
      y,
    };
  });
  const tooltipPosition = hoveredPoint
    ? buildScatterTooltipPosition(hoveredPoint, tooltipHeight)
    : null;

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      className="h-[52vh] min-h-[380px] w-full overflow-visible rounded-[1.3rem] bg-[#fff2f8] text-slate-300 dark:bg-slate-900/65 dark:text-slate-600"
      role="img"
      aria-label="Run-level scatter plot of added delay versus flow completion time"
      onMouseLeave={() => setHoveredPoint(null)}
    >
      {renderChartAxes({
        xAxisLabel: "Added Delay (ms)",
        yAxisLabel: "Flow Completion Time",
        xTicks: renderXAxisTicks(maxDelay, (value) => formatAxisValue(value)),
        yTicks: renderYAxisTicks(maxFlowCompletion, (value) =>
          formatFlowCompletionTimeLabel(value),
        ),
      })}
      {positionedPoints.map((point) => (
        <g key={`${point.parentRunId}-${point.clientNumber}`}>
          <circle
            cx={point.x}
            cy={point.y}
            r={POINT_RADIUS}
            fill={point.color}
            opacity={0.92}
          />
          <circle
            cx={point.x}
            cy={point.y}
            r={HOVER_RADIUS}
            fill="transparent"
            tabIndex={0}
            aria-label={`Client ${point.clientNumber}, parent run ${point.parentRunId}, added delay ${formatAxisValue(point.delayAddedMs)} ms, flow completion time ${formatFlowCompletionTimeLabel(point.flowCompletionTimeMs)}`}
            onMouseEnter={() =>
              setHoveredPoint({
                clientNumber: point.clientNumber,
                color: point.color,
                parentRunId: point.parentRunId,
                delayAddedMs: point.delayAddedMs,
                flowCompletionTimeMs: point.flowCompletionTimeMs,
                x: point.x,
                y: point.y,
              })
            }
            onFocus={() =>
              setHoveredPoint({
                clientNumber: point.clientNumber,
                color: point.color,
                parentRunId: point.parentRunId,
                delayAddedMs: point.delayAddedMs,
                flowCompletionTimeMs: point.flowCompletionTimeMs,
                x: point.x,
                y: point.y,
              })
            }
          />
        </g>
      ))}
      {hoveredPoint && tooltipPosition ? (
        <g pointerEvents="none">
          <line
            x1={hoveredPoint.x}
            x2={tooltipPosition.x}
            y1={hoveredPoint.y}
            y2={tooltipPosition.y + tooltipHeight / 2}
            stroke={hoveredPoint.color}
            strokeWidth={1.4}
            opacity={0.7}
            strokeDasharray="3 4"
          />
          <rect
            x={tooltipPosition.x}
            y={tooltipPosition.y}
            width={TOOLTIP_WIDTH}
            height={tooltipHeight}
            rx={14}
            fill="rgba(15, 23, 42, 0.94)"
            stroke={hoveredPoint.color}
            strokeWidth={1.2}
          />
          <text
            x={tooltipPosition.x + 14}
            y={tooltipPosition.y + 20}
            className="fill-white text-[11px] font-semibold"
          >
            {`Client ${hoveredPoint.clientNumber}`}
          </text>
          <text
            x={tooltipPosition.x + 14}
            y={tooltipPosition.y + 38}
            className="fill-slate-200 text-[10px]"
          >
            {`Parent run: #${hoveredPoint.parentRunId}`}
          </text>
          <text
            x={tooltipPosition.x + 14}
            y={tooltipPosition.y + 56}
            className="fill-slate-300 text-[10px]"
          >
            {`Added delay: ${formatAxisValue(hoveredPoint.delayAddedMs)} ms`}
          </text>
          <text
            x={tooltipPosition.x + 14}
            y={tooltipPosition.y + 74}
            className="fill-slate-300 text-[10px]"
          >
            {`Flow completion: ${formatFlowCompletionTimeLabel(hoveredPoint.flowCompletionTimeMs)}`}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function ParentRunConnectionChart({
  points,
}: {
  points: FlowPoint[];
}) {
  const clipPathId = useId().replace(/:/g, "");
  const [hoveredPoint, setHoveredPoint] =
    useState<ParentRunConnectionHoverPoint | null>(null);
  const [zoomDomain, setZoomDomain] = useState<ZoomDomain | null>(null);
  const [panState, setPanState] = useState<PanState | null>(null);
  const clientNumbers = Array.from(
    new Set(points.map((point) => point.clientNumber)),
  ).sort((a, b) => a - b);
  const [selectedClientNumbers, setSelectedClientNumbers] = useState<number[]>(
    clientNumbers,
  );

  const visibleClientNumbers = selectedClientNumbers.filter((clientNumber) =>
    clientNumbers.includes(clientNumber),
  );
  const filteredPoints = points.filter((point) =>
    visibleClientNumbers.includes(point.clientNumber),
  );

  if (points.length === 0) {
    return (
      <EmptyChartState text="No run-level points are available for the connected client lines chart." />
    );
  }

  if (filteredPoints.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyChartState text="No client points are selected for the connected client lines chart." />
        <div className="flex flex-wrap justify-center gap-2">
          {clientNumbers.map((clientNumber) => {
            const isSelected = visibleClientNumbers.includes(clientNumber);

            return (
              <button
                key={clientNumber}
                type="button"
                onClick={() =>
                  setSelectedClientNumbers((current) =>
                    current.includes(clientNumber)
                      ? current.filter((value) => value !== clientNumber)
                      : [...current, clientNumber].sort((a, b) => a - b),
                  )
                }
                className={`rounded-xl border px-3 py-2 text-sm transition ${
                  isSelected
                    ? "border-rose-400 bg-rose-50 text-slate-900 dark:border-slate-400 dark:bg-slate-700/90 dark:text-slate-100"
                    : "border-rose-200/80 bg-white text-slate-700 hover:border-rose-300 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:border-slate-500"
                }`}
              >
                {`Client ${clientNumber}`}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const delays = Array.from(
    new Set(filteredPoints.map((point) => point.delayAddedMs)),
  ).sort((a, b) => a - b);
  const maxDelay = Math.max(...delays, 1);
  const maxFlowCompletion = Math.max(
    ...filteredPoints.map((point) => point.flowCompletionTimeMs),
    1,
  );
  const baseDomain = {
    xMin: 0,
    xMax: Math.max(maxDelay, 1),
    yMin: 0,
    yMax: Math.max(maxFlowCompletion, 1),
  };
  const activeDomain = zoomDomain
    ? {
        xMin: clamp(zoomDomain.xMin, baseDomain.xMin, baseDomain.xMax),
        xMax: clamp(zoomDomain.xMax, baseDomain.xMin, baseDomain.xMax),
        yMin: clamp(zoomDomain.yMin, baseDomain.yMin, baseDomain.yMax),
        yMax: clamp(zoomDomain.yMax, baseDomain.yMin, baseDomain.yMax),
      }
    : baseDomain;
  const parentRunIds = Array.from(
    new Set(filteredPoints.map((point) => point.parentRunId)),
  ).sort((a, b) => a - b);
  const connectedRuns = parentRunIds.map((parentRunId, index) => {
    const runPoints = filteredPoints
      .filter((point) => point.parentRunId === parentRunId)
      .sort((a, b) => {
        if (a.delayAddedMs !== b.delayAddedMs) {
          return a.delayAddedMs - b.delayAddedMs;
        }
        return a.clientNumber - b.clientNumber;
      })
      .map((point) => ({
        ...point,
        x: scaleChartXWithinDomain(
          point.delayAddedMs,
          activeDomain.xMin,
          activeDomain.xMax,
        ),
        y: scaleChartYWithinDomain(
          point.flowCompletionTimeMs,
          activeDomain.yMin,
          activeDomain.yMax,
        ),
      }));

    return {
      parentRunId,
      color: colorForParentRun(index, parentRunIds.length),
      points: runPoints,
      path:
        runPoints.length > 1
          ? runPoints
              .map(
                (point, pointIndex) =>
                  `${pointIndex === 0 ? "M" : "L"}${point.x} ${point.y}`,
              )
              .join(" ")
          : null,
    };
  });
  const tooltipHeight = 116;
  const tooltipPosition = hoveredPoint
    ? buildScatterTooltipPosition(hoveredPoint, tooltipHeight)
    : null;
  const isZoomed =
    activeDomain.xMin !== baseDomain.xMin ||
    activeDomain.xMax !== baseDomain.xMax ||
    activeDomain.yMin !== baseDomain.yMin ||
    activeDomain.yMax !== baseDomain.yMax;

  function getSvgPlotCoordinatesFromClient(
    clientX: number,
    clientY: number,
    currentTarget: SVGSVGElement,
    requireInsidePlot: boolean,
  ) {
    const bounds = currentTarget.getBoundingClientRect();
    const rawX = ((clientX - bounds.left) / bounds.width) * CHART_WIDTH;
    const rawY = ((clientY - bounds.top) / bounds.height) * CHART_HEIGHT;
    const isInsidePlot =
      rawX >= CHART_PADDING.left &&
      rawX <= CHART_WIDTH - CHART_PADDING.right &&
      rawY >= CHART_PADDING.top &&
      rawY <= CHART_HEIGHT - CHART_PADDING.bottom;

    if (requireInsidePlot && !isInsidePlot) {
      return null;
    }

    return {
      x: clampChartPlotX(rawX),
      y: clampChartPlotY(rawY),
    };
  }

  function getSvgPlotCoordinates(
    event: React.MouseEvent<SVGSVGElement> | React.PointerEvent<SVGSVGElement>,
    requireInsidePlot: boolean,
  ) {
    return getSvgPlotCoordinatesFromClient(
      event.clientX,
      event.clientY,
      event.currentTarget,
      requireInsidePlot,
    );
  }

  function handleDoubleClickZoom(event: React.MouseEvent<SVGSVGElement>) {
    const coordinates = getSvgPlotCoordinates(event, true);

    if (!coordinates) {
      return;
    }

    const centerX = invertChartXPosition(
      coordinates.x,
      activeDomain.xMin,
      activeDomain.xMax,
    );
    const centerY = invertChartYPosition(
      coordinates.y,
      activeDomain.yMin,
      activeDomain.yMax,
    );
    const nextXSpan = Math.max(
      (activeDomain.xMax - activeDomain.xMin) / 2,
      0.5,
    );
    const nextYSpan = Math.max(
      (activeDomain.yMax - activeDomain.yMin) / 2,
      10,
    );
    const nextXMin = clamp(
      centerX - nextXSpan / 2,
      baseDomain.xMin,
      baseDomain.xMax - nextXSpan,
    );
    const nextYMin = clamp(
      centerY - nextYSpan / 2,
      baseDomain.yMin,
      baseDomain.yMax - nextYSpan,
    );

    setZoomDomain({
      xMin: nextXMin,
      xMax: nextXMin + nextXSpan,
      yMin: nextYMin,
      yMax: nextYMin + nextYSpan,
    });
    setHoveredPoint(null);
  }

  function handleZoomOut() {
    if (!isZoomed) {
      return;
    }

    const currentXSpan = activeDomain.xMax - activeDomain.xMin;
    const currentYSpan = activeDomain.yMax - activeDomain.yMin;
    const nextXSpan = Math.min(
      baseDomain.xMax - baseDomain.xMin,
      currentXSpan * 2,
    );
    const nextYSpan = Math.min(
      baseDomain.yMax - baseDomain.yMin,
      currentYSpan * 2,
    );
    const centerX = (activeDomain.xMin + activeDomain.xMax) / 2;
    const centerY = (activeDomain.yMin + activeDomain.yMax) / 2;
    const nextXMin = clamp(
      centerX - nextXSpan / 2,
      baseDomain.xMin,
      baseDomain.xMax - nextXSpan,
    );
    const nextYMin = clamp(
      centerY - nextYSpan / 2,
      baseDomain.yMin,
      baseDomain.yMax - nextYSpan,
    );
    const nextDomain = {
      xMin: nextXMin,
      xMax: nextXMin + nextXSpan,
      yMin: nextYMin,
      yMax: nextYMin + nextYSpan,
    };

    if (
      nextDomain.xMin === baseDomain.xMin &&
      nextDomain.xMax === baseDomain.xMax &&
      nextDomain.yMin === baseDomain.yMin &&
      nextDomain.yMax === baseDomain.yMax
    ) {
      setZoomDomain(null);
      setHoveredPoint(null);
      return;
    }

    setZoomDomain(nextDomain);
    setHoveredPoint(null);
  }

  function handlePanStart(event: React.PointerEvent<SVGSVGElement>) {
    if (!isZoomed || event.button !== 0) {
      return;
    }

    const coordinates = getSvgPlotCoordinates(event, true);

    if (!coordinates) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setHoveredPoint(null);
    setPanState({
      pointerId: event.pointerId,
      startX: coordinates.x,
      startY: coordinates.y,
      startDomain: activeDomain,
    });
  }

  function handlePanMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }

    const coordinates = getSvgPlotCoordinates(event, false);

    if (!coordinates) {
      return;
    }

    const xSpan = panState.startDomain.xMax - panState.startDomain.xMin;
    const ySpan = panState.startDomain.yMax - panState.startDomain.yMin;
    const deltaX =
      ((coordinates.x - panState.startX) / getChartInnerWidth()) * xSpan;
    const deltaY =
      ((coordinates.y - panState.startY) / getChartInnerHeight()) * ySpan;
    const nextXMin = clamp(
      panState.startDomain.xMin - deltaX,
      baseDomain.xMin,
      baseDomain.xMax - xSpan,
    );
    const nextYMin = clamp(
      panState.startDomain.yMin + deltaY,
      baseDomain.yMin,
      baseDomain.yMax - ySpan,
    );

    setZoomDomain({
      xMin: nextXMin,
      xMax: nextXMin + xSpan,
      yMin: nextYMin,
      yMax: nextYMin + ySpan,
    });
  }

  function handlePanEnd(event: React.PointerEvent<SVGSVGElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (panState?.pointerId === event.pointerId) {
      setPanState(null);
    }
  }

  return (
    <div className="space-y-4">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className={`h-[48vh] min-h-[340px] w-full select-none overflow-visible rounded-[1.3rem] bg-[#fff2f8] text-slate-300 dark:bg-slate-900/65 dark:text-slate-600 ${
          isZoomed ? (panState ? "cursor-grabbing" : "cursor-grab") : ""
        }`}
        style={{ userSelect: "none" }}
        role="img"
        aria-label="Parent-run line chart connecting clients from the same run, with double-click zoom enabled"
        onMouseLeave={() => setHoveredPoint(null)}
        onDoubleClick={handleDoubleClickZoom}
        onPointerDown={handlePanStart}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanEnd}
        onPointerCancel={handlePanEnd}
      >
        <defs>
          <clipPath id={clipPathId}>
            <rect
              x={CHART_PADDING.left}
              y={CHART_PADDING.top}
              width={getChartInnerWidth()}
              height={getChartInnerHeight()}
            />
          </clipPath>
        </defs>
        {renderChartAxes({
          xAxisLabel: "Added Delay (ms)",
          yAxisLabel: "Flow Completion Time",
          axisLineStrokeWidth: 1.8,
          axisLabelClassName:
            "fill-slate-600 text-[15px] font-semibold dark:fill-slate-300",
          xTicks: renderXAxisTicksForDomain(
            activeDomain.xMin,
            activeDomain.xMax,
            (value) => formatAxisValue(value),
            {
              textClassName:
                "fill-slate-600 text-[12px] font-medium dark:fill-slate-300",
              tickStrokeWidth: 1.4,
            },
          ),
          yTicks: renderYAxisTicksForDomain(
            activeDomain.yMin,
            activeDomain.yMax,
            (value) => formatFlowCompletionTimeLabel(value),
            {
              textClassName:
                "fill-slate-600 text-[12px] font-medium dark:fill-slate-300",
              tickStrokeWidth: 1.4,
              gridStrokeWidth: 1.2,
            },
          ),
        })}
        <g clipPath={`url(#${clipPathId})`}>
          {connectedRuns.map((run) => (
            <g key={run.parentRunId}>
              {run.path ? (
                <path
                  d={run.path}
                  fill="none"
                  stroke={run.color}
                  strokeWidth={2.4}
                  opacity={0.9}
                />
              ) : null}
              {run.points.map((point) => (
                <g key={`${point.parentRunId}-${point.clientNumber}`}>
                  {hoveredPoint?.parentRunId === point.parentRunId &&
                  hoveredPoint.clientNumber === point.clientNumber ? (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={POINT_RADIUS + 4}
                      fill="transparent"
                      stroke={run.color}
                      strokeWidth={2}
                      opacity={0.85}
                    />
                  ) : null}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={POINT_RADIUS}
                    fill={colorForClientPoint(point.clientNumber)}
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={HOVER_RADIUS}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`Parent ${point.parentRunId}, client ${point.clientNumber}, delay ${formatAxisValue(point.delayAddedMs)} ms, flow completion time ${formatFlowCompletionTimeLabel(point.flowCompletionTimeMs)}`}
                    onMouseEnter={() => {
                      if (panState) {
                        return;
                      }

                      const otherClientPoint =
                        run.points.find(
                          (candidate) =>
                            candidate.clientNumber !== point.clientNumber,
                        ) ?? null;

                      setHoveredPoint({
                        clientNumber: point.clientNumber,
                        parentRunId: point.parentRunId,
                        delayAddedMs: point.delayAddedMs,
                        otherClientDelayMs: otherClientPoint?.delayAddedMs ?? null,
                        flowCompletionTimeMs: point.flowCompletionTimeMs,
                        x: point.x,
                        y: point.y,
                        pointColor: colorForClientPoint(point.clientNumber),
                        lineColor: run.color,
                      });
                    }}
                    onFocus={() => {
                      const otherClientPoint =
                        run.points.find(
                          (candidate) =>
                            candidate.clientNumber !== point.clientNumber,
                        ) ?? null;

                      setHoveredPoint({
                        clientNumber: point.clientNumber,
                        parentRunId: point.parentRunId,
                        delayAddedMs: point.delayAddedMs,
                        otherClientDelayMs: otherClientPoint?.delayAddedMs ?? null,
                        flowCompletionTimeMs: point.flowCompletionTimeMs,
                        x: point.x,
                        y: point.y,
                        pointColor: colorForClientPoint(point.clientNumber),
                        lineColor: run.color,
                      });
                    }}
                  />
                </g>
              ))}
            </g>
          ))}
        </g>
        {hoveredPoint && tooltipPosition ? (
          <g pointerEvents="none">
            <line
              x1={hoveredPoint.x}
              x2={tooltipPosition.x}
              y1={hoveredPoint.y}
              y2={tooltipPosition.y + tooltipHeight / 2}
              stroke={hoveredPoint.lineColor}
              strokeWidth={1.4}
              opacity={0.7}
              strokeDasharray="3 4"
            />
            <rect
              x={tooltipPosition.x}
              y={tooltipPosition.y}
              width={TOOLTIP_WIDTH}
              height={tooltipHeight}
              rx={14}
              fill="rgba(15, 23, 42, 0.94)"
              stroke={hoveredPoint.lineColor}
              strokeWidth={1.2}
            />
            <text
              x={tooltipPosition.x + 14}
              y={tooltipPosition.y + 25}
              className="fill-white text-[13px] font-semibold"
            >
              {`Client ${hoveredPoint.clientNumber}`}
            </text>
            <text
              x={tooltipPosition.x + 14}
              y={tooltipPosition.y + 50}
              className="fill-slate-200 text-[12px]"
            >
              {`Added delay: ${formatAxisValue(hoveredPoint.delayAddedMs)} ms`}
            </text>
            <text
              x={tooltipPosition.x + 14}
              y={tooltipPosition.y + 75}
              className="fill-slate-200 text-[12px]"
            >
              {`Other client delay: ${
                hoveredPoint.otherClientDelayMs === null
                  ? "n/a"
                  : `${formatAxisValue(hoveredPoint.otherClientDelayMs)} ms`
              }`}
            </text>
            <text
              x={tooltipPosition.x + 14}
              y={tooltipPosition.y + 100}
              className="fill-slate-200 text-[12px]"
            >
              {`Flow completion: ${formatFlowCompletionTimeLabel(hoveredPoint.flowCompletionTimeMs)}`}
            </text>
          </g>
        ) : null}
      </svg>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs text-slate-600 dark:text-slate-300">
          Double-click to zoom. Drag to pan while zoomed in.
        </span>
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={!isZoomed}
          className="rounded-xl border border-rose-200/80 bg-white px-3 py-2 text-sm text-slate-700 transition enabled:hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-200 dark:enabled:hover:border-slate-500"
        >
          Zoom out
        </button>
        <button
          type="button"
          onClick={() => {
            setZoomDomain(null);
            setHoveredPoint(null);
          }}
          disabled={!isZoomed}
          className="rounded-xl border border-rose-200/80 bg-white px-3 py-2 text-sm text-slate-700 transition enabled:hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-200 dark:enabled:hover:border-slate-500"
        >
          Reset zoom
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {clientNumbers.map((clientNumber) => {
          const isSelected = visibleClientNumbers.includes(clientNumber);

          return (
            <button
              key={clientNumber}
              type="button"
              onClick={() =>
                setSelectedClientNumbers((current) =>
                  current.includes(clientNumber)
                    ? current.filter((value) => value !== clientNumber)
                    : [...current, clientNumber].sort((a, b) => a - b),
                )
              }
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                isSelected
                  ? "border-rose-400 bg-rose-50 text-slate-900 dark:border-slate-400 dark:bg-slate-700/90 dark:text-slate-100"
                  : "border-rose-200/80 bg-white text-slate-700 hover:border-rose-300 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:border-slate-500"
              }`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: colorForClientPoint(clientNumber) }}
              />
              <span>{`Client ${clientNumber}`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function BoxPlot({
  points,
  series,
}: {
  points: FlowPoint[];
  series: ClientSeries[];
}) {
  const [hoveredStat, setHoveredStat] = useState<BoxPlotHoverStat | null>(null);

  const delays = Array.from(
    new Set(points.map((point) => point.delayAddedMs)),
  ).sort((a, b) => a - b);
  const stats = delays.flatMap((delayAddedMs) =>
    series
      .map((entry) => {
        const values = points
          .filter(
            (point) =>
              point.delayAddedMs === delayAddedMs &&
              point.clientNumber === entry.clientNumber,
          )
          .map((point) => point.flowCompletionTimeMs)
          .sort((a, b) => a - b);

        if (values.length === 0) {
          return null;
        }

        return {
          delayAddedMs,
          clientNumber: entry.clientNumber,
          min: values[0],
          q1: quantile(values, 0.25),
          median: quantile(values, 0.5),
          q3: quantile(values, 0.75),
          max: values[values.length - 1],
          count: values.length,
        } satisfies BoxPlotStat;
      })
      .filter((stat): stat is BoxPlotStat => stat !== null),
  );

  if (stats.length === 0 || delays.length === 0 || series.length === 0) {
    return <EmptyChartState text="No grouped data available for the box plot." />;
  }

  const maxFlowCompletion = Math.max(...stats.map((stat) => stat.max), 1);
  const groupWidth = getChartInnerWidth() / Math.max(delays.length, 1);
  const boxWidth = Math.min(24, groupWidth / Math.max(series.length + 1, 2));
  const tooltipHeight = 102;
  const positionedStats = stats.map((stat) => {
    const delayIndex = delays.indexOf(stat.delayAddedMs);
    const seriesIndex = series.findIndex(
      (entry) => entry.clientNumber === stat.clientNumber,
    );
    const groupCenter =
      CHART_PADDING.left + groupWidth * delayIndex + groupWidth / 2;
    const offset =
      (seriesIndex - (series.length - 1) / 2) * (boxWidth + 6);
    const centerX = groupCenter + offset;
    const color =
      series.find((entry) => entry.clientNumber === stat.clientNumber)?.color ??
      SERIES_COLORS[0];

    return {
      ...stat,
      color,
      centerX,
      minY: scaleChartY(stat.min, maxFlowCompletion),
      q1Y: scaleChartY(stat.q1, maxFlowCompletion),
      medianY: scaleChartY(stat.median, maxFlowCompletion),
      q3Y: scaleChartY(stat.q3, maxFlowCompletion),
      maxY: scaleChartY(stat.max, maxFlowCompletion),
    };
  });
  const tooltipPosition = hoveredStat
    ? buildScatterTooltipPosition(hoveredStat, tooltipHeight)
    : null;

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      className="h-[52vh] min-h-[380px] w-full overflow-visible rounded-[1.3rem] bg-[#fff2f8] text-slate-300 dark:bg-slate-900/65 dark:text-slate-600"
      role="img"
      aria-label="Box plot of flow completion time grouped by added delay"
      onMouseLeave={() => setHoveredStat(null)}
    >
      {renderChartAxes({
        xAxisLabel: "Added Delay (ms)",
        yAxisLabel: "Flow Completion Time",
        xTicks: delays.map((delayAddedMs, index) => {
          const x =
            CHART_PADDING.left + groupWidth * index + groupWidth / 2;

          return (
            <g key={`delay-${delayAddedMs}`}>
              <line
                x1={x}
                x2={x}
                y1={CHART_HEIGHT - CHART_PADDING.bottom}
                y2={CHART_HEIGHT - CHART_PADDING.bottom + 5}
                stroke="currentColor"
                strokeWidth={1}
              />
              <text
                x={x}
                y={CHART_HEIGHT - CHART_PADDING.bottom + 21}
                textAnchor="middle"
                className="fill-slate-500 text-[10px] dark:fill-slate-400"
              >
                {formatAxisValue(delayAddedMs)}
              </text>
            </g>
          );
        }),
        yTicks: renderYAxisTicks(maxFlowCompletion, (value) =>
          formatFlowCompletionTimeLabel(value),
        ),
      })}
      {positionedStats.map((stat) => (
        <g key={`${stat.delayAddedMs}-${stat.clientNumber}`}>
          <line
            x1={stat.centerX}
            x2={stat.centerX}
            y1={stat.maxY}
            y2={stat.q3Y}
            stroke={stat.color}
            strokeWidth={2}
          />
          <line
            x1={stat.centerX}
            x2={stat.centerX}
            y1={stat.q1Y}
            y2={stat.minY}
            stroke={stat.color}
            strokeWidth={2}
          />
          <line
            x1={stat.centerX - boxWidth / 2}
            x2={stat.centerX + boxWidth / 2}
            y1={stat.maxY}
            y2={stat.maxY}
            stroke={stat.color}
            strokeWidth={2}
          />
          <line
            x1={stat.centerX - boxWidth / 2}
            x2={stat.centerX + boxWidth / 2}
            y1={stat.minY}
            y2={stat.minY}
            stroke={stat.color}
            strokeWidth={2}
          />
          <rect
            x={stat.centerX - boxWidth / 2}
            y={stat.q3Y}
            width={boxWidth}
            height={Math.max(stat.q1Y - stat.q3Y, 1)}
            fill={stat.color}
            opacity={0.18}
            stroke={stat.color}
            strokeWidth={2}
            rx={6}
          />
          <line
            x1={stat.centerX - boxWidth / 2}
            x2={stat.centerX + boxWidth / 2}
            y1={stat.medianY}
            y2={stat.medianY}
            stroke={stat.color}
            strokeWidth={2.4}
          />
          <rect
            x={stat.centerX - boxWidth / 2 - 5}
            y={stat.q3Y - 8}
            width={boxWidth + 10}
            height={Math.max(stat.q1Y - stat.q3Y + 16, 24)}
            fill="transparent"
            tabIndex={0}
            aria-label={`Client ${stat.clientNumber}, added delay ${formatAxisValue(stat.delayAddedMs)} ms, median ${formatFlowCompletionTimeLabel(stat.median)}, count ${stat.count}`}
            onMouseEnter={() =>
              setHoveredStat({
                clientNumber: stat.clientNumber,
                color: stat.color,
                delayAddedMs: stat.delayAddedMs,
                min: stat.min,
                q1: stat.q1,
                median: stat.median,
                q3: stat.q3,
                max: stat.max,
                count: stat.count,
                x: stat.centerX,
                y: stat.q3Y,
              })
            }
            onFocus={() =>
              setHoveredStat({
                clientNumber: stat.clientNumber,
                color: stat.color,
                delayAddedMs: stat.delayAddedMs,
                min: stat.min,
                q1: stat.q1,
                median: stat.median,
                q3: stat.q3,
                max: stat.max,
                count: stat.count,
                x: stat.centerX,
                y: stat.q3Y,
              })
            }
          />
        </g>
      ))}
      {hoveredStat && tooltipPosition ? (
        <g pointerEvents="none">
          <rect
            x={tooltipPosition.x}
            y={tooltipPosition.y}
            width={TOOLTIP_WIDTH}
            height={tooltipHeight}
            rx={14}
            fill="rgba(15, 23, 42, 0.94)"
            stroke={hoveredStat.color}
            strokeWidth={1.2}
          />
          <text
            x={tooltipPosition.x + 14}
            y={tooltipPosition.y + 20}
            className="fill-white text-[11px] font-semibold"
          >
            {`Client ${hoveredStat.clientNumber}`}
          </text>
          <text
            x={tooltipPosition.x + 14}
            y={tooltipPosition.y + 38}
            className="fill-slate-200 text-[10px]"
          >
            {`Delay: ${formatAxisValue(hoveredStat.delayAddedMs)} ms | Runs: ${hoveredStat.count}`}
          </text>
          <text
            x={tooltipPosition.x + 14}
            y={tooltipPosition.y + 56}
            className="fill-slate-300 text-[10px]"
          >
            {`Median: ${formatFlowCompletionTimeLabel(hoveredStat.median)}`}
          </text>
          <text
            x={tooltipPosition.x + 14}
            y={tooltipPosition.y + 74}
            className="fill-slate-300 text-[10px]"
          >
            {`Q1-Q3: ${formatFlowCompletionTimeLabel(hoveredStat.q1)} to ${formatFlowCompletionTimeLabel(hoveredStat.q3)}`}
          </text>
          <text
            x={tooltipPosition.x + 14}
            y={tooltipPosition.y + 92}
            className="fill-slate-300 text-[10px]"
          >
            {`Min-Max: ${formatFlowCompletionTimeLabel(hoveredStat.min)} to ${formatFlowCompletionTimeLabel(hoveredStat.max)}`}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function buildEcdfPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return null;
  }

  const startX = CHART_PADDING.left;
  const startY = scaleChartY(0, 100);
  const commands = [`M${startX} ${startY}`];
  let currentY = startY;

  for (const point of points) {
    commands.push(`L${point.x} ${currentY}`);
    commands.push(`L${point.x} ${point.y}`);
    currentY = point.y;
  }

  return commands.join(" ");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function EcdfChart({
  points,
  series,
}: {
  points: FlowPoint[];
  series: ClientSeries[];
}) {
  const [hoveredPoint, setHoveredPoint] = useState<EcdfHoverPoint | null>(null);

  if (points.length === 0) {
    return <EmptyChartState text="No run-level data available for the ECDF chart." />;
  }

  const maxFlowCompletion = Math.max(
    ...points.map((point) => point.flowCompletionTimeMs),
    1,
  );
  const ecdfSeries = series
    .map((entry) => {
      const values = points
        .filter((point) => point.clientNumber === entry.clientNumber)
        .slice()
        .sort((left, right) => left.flowCompletionTimeMs - right.flowCompletionTimeMs);

      const plottedPoints = values.map((point, index) => {
        const percentile = ((index + 1) / values.length) * 100;

        return {
          ...point,
          percentile,
          x: scaleChartX(point.flowCompletionTimeMs, maxFlowCompletion),
          y: scaleChartY(percentile, 100),
        };
      });

      return {
        ...entry,
        plottedPoints,
        path: buildEcdfPath(plottedPoints),
      };
    })
    .filter((entry) => entry.plottedPoints.length > 0);
  const tooltipHeight = 106;
  const tooltipPosition = hoveredPoint
    ? buildScatterTooltipPosition(hoveredPoint, tooltipHeight)
    : null;

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      className="h-[52vh] min-h-[380px] w-full overflow-visible rounded-[1.3rem] bg-[#fff2f8] text-slate-300 dark:bg-slate-900/65 dark:text-slate-600"
      role="img"
      aria-label="Empirical cumulative distribution of flow completion time"
      onMouseLeave={() => setHoveredPoint(null)}
    >
      {renderChartAxes({
        xAxisLabel: "Flow Completion Time",
        yAxisLabel: "Runs Completed (%)",
        xTicks: renderXAxisTicks(maxFlowCompletion, (value) =>
          formatFlowCompletionTimeLabel(value),
        ),
        yTicks: renderYAxisTicks(100, (value) => `${formatAxisValue(value)}%`),
      })}
      {ecdfSeries.map((entry) => (
        <g key={entry.clientNumber}>
          {entry.path ? (
            <path
              d={entry.path}
              fill="none"
              stroke={entry.color}
              strokeWidth={3}
              strokeLinecap="round"
            />
          ) : null}
          {entry.plottedPoints.map((point) => (
            <g key={`${point.parentRunId}-${point.clientNumber}`}>
              <circle
                cx={point.x}
                cy={point.y}
                r={POINT_RADIUS - 0.8}
                fill={entry.color}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r={HOVER_RADIUS}
                fill="transparent"
                tabIndex={0}
                aria-label={`Client ${point.clientNumber}, parent run ${point.parentRunId}, flow completion time ${formatFlowCompletionTimeLabel(point.flowCompletionTimeMs)}, percentile ${formatAxisValue(point.percentile)} percent`}
                onMouseEnter={() =>
                  setHoveredPoint({
                    clientNumber: point.clientNumber,
                    color: entry.color,
                    parentRunId: point.parentRunId,
                    delayAddedMs: point.delayAddedMs,
                    flowCompletionTimeMs: point.flowCompletionTimeMs,
                    percentile: point.percentile,
                    x: point.x,
                    y: point.y,
                  })
                }
                onFocus={() =>
                  setHoveredPoint({
                    clientNumber: point.clientNumber,
                    color: entry.color,
                    parentRunId: point.parentRunId,
                    delayAddedMs: point.delayAddedMs,
                    flowCompletionTimeMs: point.flowCompletionTimeMs,
                    percentile: point.percentile,
                    x: point.x,
                    y: point.y,
                  })
                }
              />
            </g>
          ))}
        </g>
      ))}
      {hoveredPoint && tooltipPosition ? (
        <g pointerEvents="none">
          <rect
            x={tooltipPosition.x}
            y={tooltipPosition.y}
            width={TOOLTIP_WIDTH}
            height={tooltipHeight}
            rx={14}
            fill="rgba(15, 23, 42, 0.94)"
            stroke={hoveredPoint.color}
            strokeWidth={1.2}
          />
          <text
            x={tooltipPosition.x + 14}
            y={tooltipPosition.y + 20}
            className="fill-white text-[11px] font-semibold"
          >
            {`Client ${hoveredPoint.clientNumber}`}
          </text>
          <text
            x={tooltipPosition.x + 14}
            y={tooltipPosition.y + 38}
            className="fill-slate-200 text-[10px]"
          >
            {`Parent run: #${hoveredPoint.parentRunId}`}
          </text>
          <text
            x={tooltipPosition.x + 14}
            y={tooltipPosition.y + 56}
            className="fill-slate-300 text-[10px]"
          >
            {`Flow completion: ${formatFlowCompletionTimeLabel(hoveredPoint.flowCompletionTimeMs)}`}
          </text>
          <text
            x={tooltipPosition.x + 14}
            y={tooltipPosition.y + 74}
            className="fill-slate-300 text-[10px]"
          >
            {`Percentile: ${formatAxisValue(hoveredPoint.percentile)}%`}
          </text>
          <text
            x={tooltipPosition.x + 14}
            y={tooltipPosition.y + 92}
            className="fill-slate-300 text-[10px]"
          >
            {`Added delay: ${formatAxisValue(hoveredPoint.delayAddedMs)} ms`}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function buildHistogram(
  values: number[],
  {
    binCount,
    maxValue,
  }: {
    binCount: number;
    maxValue: number;
  },
) {
  const safeMax = Math.max(maxValue, 1);
  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: (safeMax / binCount) * index,
    end: (safeMax / binCount) * (index + 1),
    count: 0,
  }));

  for (const value of values) {
    const normalized = clamp(value / safeMax, 0, 0.999999);
    const index = Math.floor(normalized * binCount);
    bins[index].count += 1;
  }

  return bins.map((bin, index) => ({
    ...bin,
    index,
    mid: (bin.start + bin.end) / 2,
  }));
}

function interpolateColor(start: [number, number, number], end: [number, number, number], factor: number) {
  const clampedFactor = clamp(factor, 0, 1);
  const mix = (left: number, right: number) =>
    Math.round(left + (right - left) * clampedFactor);

  return `rgb(${mix(start[0], end[0])}, ${mix(start[1], end[1])}, ${mix(
    start[2],
    end[2],
  )})`;
}

function colorForParentRun(index: number, total: number) {
  const hue = Math.round((index / Math.max(total, 1)) * 360);
  return `hsl(${hue} 72% 46%)`;
}

function colorForClientPoint(clientNumber: number) {
  return CLIENT_POINT_COLORS[clientNumber] ?? "#334155";
}

function formatPercentileLabel(percentileKey: "p50" | "p90" | "max") {
  switch (percentileKey) {
    case "p50":
      return "p50";
    case "p90":
      return "p90";
    case "max":
      return "max";
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function RidgelinePlot({
  points,
  series,
}: {
  points: FlowPoint[];
  series: ClientSeries[];
}) {
  const delays = Array.from(
    new Set(points.map((point) => point.delayAddedMs)),
  ).sort((a, b) => a - b);

  if (points.length === 0 || delays.length === 0 || series.length === 0) {
    return <EmptyChartState text="No run-level data available for the ridgeline plot." />;
  }

  const ridgeRows = delays.flatMap((delayAddedMs) =>
    series
      .map((entry) => {
        const values = points
          .filter(
            (point) =>
              point.delayAddedMs === delayAddedMs &&
              point.clientNumber === entry.clientNumber,
          )
          .map((point) => point.flowCompletionTimeMs);

        if (values.length === 0) {
          return null;
        }

        return {
          delayAddedMs,
          clientNumber: entry.clientNumber,
          color: entry.color,
          values,
        };
      })
      .filter(
        (
          ridge,
        ): ridge is {
          delayAddedMs: number;
          clientNumber: number;
          color: string;
          values: number[];
        } => ridge !== null,
      ),
  );

  if (ridgeRows.length === 0) {
    return <EmptyChartState text="No client-separated ridgeline data is available." />;
  }

  const chartHeight = Math.max(420, ridgeRows.length * 38 + 108);
  const ridgePadding = { top: 28, right: 28, bottom: 52, left: 78 };
  const innerWidth = CHART_WIDTH - ridgePadding.left - ridgePadding.right;
  const maxFlowCompletion = Math.max(
    ...points.map((point) => point.flowCompletionTimeMs),
    1,
  );
  const spacing = ridgeRows.length > 1
    ? (chartHeight - ridgePadding.top - ridgePadding.bottom) / (ridgeRows.length - 1)
    : 0;

  const ridges = ridgeRows.map((ridgeRow, index) => {
    const histogram = buildHistogram(ridgeRow.values, {
      binCount: 18,
      maxValue: maxFlowCompletion,
    });
    const maxCount = Math.max(...histogram.map((bin) => bin.count), 1);
    const baselineY = ridgePadding.top + spacing * index;
    const amplitude = Math.min(16, spacing > 0 ? spacing * 0.6 : 16);

    const topPoints = histogram.map((bin) => ({
      x:
        ridgePadding.left +
        (bin.mid / Math.max(maxFlowCompletion, 1)) * innerWidth,
      y: baselineY - (bin.count / maxCount) * amplitude,
    }));
    const path = [
      `M${ridgePadding.left} ${baselineY}`,
      ...topPoints.map((point) => `L${point.x} ${point.y}`),
      `L${ridgePadding.left + innerWidth} ${baselineY}`,
      "Z",
    ].join(" ");

    return {
      delayAddedMs: ridgeRow.delayAddedMs,
      clientNumber: ridgeRow.clientNumber,
      baselineY,
      color: ridgeRow.color,
      path,
    };
  });

  const xTicks = buildLinearTicks(maxFlowCompletion, 7);

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${chartHeight}`}
      className="w-full overflow-visible rounded-[1.3rem] bg-[#fff2f8] text-slate-300 dark:bg-slate-900/65 dark:text-slate-600"
      role="img"
        aria-label="Ridgeline plot of flow completion distributions by added delay and client"
    >
      <line
        x1={ridgePadding.left}
        x2={ridgePadding.left}
        y1={ridgePadding.top}
        y2={chartHeight - ridgePadding.bottom}
        stroke="currentColor"
        strokeWidth={1.15}
      />
      <line
        x1={ridgePadding.left}
        x2={CHART_WIDTH - ridgePadding.right}
        y1={chartHeight - ridgePadding.bottom}
        y2={chartHeight - ridgePadding.bottom}
        stroke="currentColor"
        strokeWidth={1.15}
      />
      {ridges.map((ridge) => (
        <g key={`${ridge.delayAddedMs}-${ridge.clientNumber}`}>
          <line
            x1={ridgePadding.left}
            x2={CHART_WIDTH - ridgePadding.right}
            y1={ridge.baselineY}
            y2={ridge.baselineY}
            stroke="currentColor"
            strokeDasharray="4 6"
            strokeWidth={1}
            opacity={0.28}
          />
          <path d={ridge.path} fill={ridge.color} opacity={0.45} />
          <text
            x={ridgePadding.left - 10}
            y={ridge.baselineY + 3}
            textAnchor="end"
            className="fill-slate-500 text-[10px] dark:fill-slate-400"
          >
            {`${formatAxisValue(ridge.delayAddedMs)} | C${ridge.clientNumber}`}
          </text>
        </g>
      ))}
      {xTicks.map((tick) => {
        const x =
          ridgePadding.left +
          (tick / Math.max(maxFlowCompletion, 1)) * innerWidth;

        return (
          <g key={`ridge-x-${tick}`}>
            <line
              x1={x}
              x2={x}
              y1={chartHeight - ridgePadding.bottom}
              y2={chartHeight - ridgePadding.bottom + 5}
              stroke="currentColor"
              strokeWidth={1}
            />
            <text
              x={x}
              y={chartHeight - ridgePadding.bottom + 21}
              textAnchor="middle"
              className="fill-slate-500 text-[10px] dark:fill-slate-400"
            >
              {formatFlowCompletionTimeLabel(tick)}
            </text>
          </g>
        );
      })}
      <text
        x={ridgePadding.left + innerWidth / 2}
        y={chartHeight - 14}
        textAnchor="middle"
        className="fill-slate-500 text-[12px] dark:fill-slate-400"
      >
        Flow Completion Time
      </text>
      <text
        x={22}
        y={ridgePadding.top + (chartHeight - ridgePadding.top - ridgePadding.bottom) / 2}
        transform={`rotate(-90 22 ${ridgePadding.top + (chartHeight - ridgePadding.top - ridgePadding.bottom) / 2})`}
        textAnchor="middle"
        className="fill-slate-500 text-[12px] dark:fill-slate-400"
      >
        Delay / Client
      </text>
    </svg>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ViolinPlot({
  points,
  series,
}: {
  points: FlowPoint[];
  series: ClientSeries[];
}) {
  const delays = Array.from(
    new Set(points.map((point) => point.delayAddedMs)),
  ).sort((a, b) => a - b);

  if (points.length === 0 || delays.length === 0 || series.length === 0) {
    return <EmptyChartState text="No grouped data available for the violin plot." />;
  }

  const maxFlowCompletion = Math.max(
    ...points.map((point) => point.flowCompletionTimeMs),
    1,
  );
  const groupWidth = getChartInnerWidth() / Math.max(delays.length, 1);
  const violinMaxWidth = Math.min(20, groupWidth / Math.max(series.length + 1, 2));
  const violins = delays.flatMap((delayAddedMs, delayIndex) =>
    series.map((entry, seriesIndex) => {
      const values = points
        .filter(
          (point) =>
            point.delayAddedMs === delayAddedMs &&
            point.clientNumber === entry.clientNumber,
        )
        .map((point) => point.flowCompletionTimeMs);

      if (values.length === 0) {
        return null;
      }

      const histogram = buildHistogram(values, {
        binCount: 16,
        maxValue: maxFlowCompletion,
      });
      const maxCount = Math.max(...histogram.map((bin) => bin.count), 1);
      const centerX =
        CHART_PADDING.left +
        groupWidth * delayIndex +
        groupWidth / 2 +
        (seriesIndex - (series.length - 1) / 2) * (violinMaxWidth * 2 + 6);
      const leftSide = histogram.map((bin) => {
        const width = (bin.count / maxCount) * violinMaxWidth;
        const y = scaleChartY(bin.mid, maxFlowCompletion);

        return { x: centerX - width, y };
      });
      const rightSide = histogram
        .slice()
        .reverse()
        .map((bin) => {
          const width = (bin.count / maxCount) * violinMaxWidth;
          const y = scaleChartY(bin.mid, maxFlowCompletion);

          return { x: centerX + width, y };
        });
      const path = [
        `M${leftSide[0].x} ${leftSide[0].y}`,
        ...leftSide.slice(1).map((point) => `L${point.x} ${point.y}`),
        ...rightSide.map((point) => `L${point.x} ${point.y}`),
        "Z",
      ].join(" ");
      const median = quantile(values.slice().sort((a, b) => a - b), 0.5);

      return {
        key: `${delayAddedMs}-${entry.clientNumber}`,
        path,
        centerX,
        color: entry.color,
        medianY: scaleChartY(median, maxFlowCompletion),
      };
    }).filter((violin): violin is NonNullable<typeof violin> => violin !== null),
  );

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      className="h-[52vh] min-h-[380px] w-full overflow-visible rounded-[1.3rem] bg-[#fff2f8] text-slate-300 dark:bg-slate-900/65 dark:text-slate-600"
      role="img"
      aria-label="Violin plot of flow completion time by delay and client"
    >
      {renderChartAxes({
        xAxisLabel: "Added Delay (ms)",
        yAxisLabel: "Flow Completion Time",
        xTicks: delays.map((delayAddedMs, index) => {
          const x =
            CHART_PADDING.left +
            (getChartInnerWidth() / Math.max(delays.length, 1)) * index +
            (getChartInnerWidth() / Math.max(delays.length, 1)) / 2;

          return (
            <g key={`violin-${delayAddedMs}`}>
              <line
                x1={x}
                x2={x}
                y1={CHART_HEIGHT - CHART_PADDING.bottom}
                y2={CHART_HEIGHT - CHART_PADDING.bottom + 5}
                stroke="currentColor"
                strokeWidth={1}
              />
              <text
                x={x}
                y={CHART_HEIGHT - CHART_PADDING.bottom + 21}
                textAnchor="middle"
                className="fill-slate-500 text-[10px] dark:fill-slate-400"
              >
                {formatAxisValue(delayAddedMs)}
              </text>
            </g>
          );
        }),
        yTicks: renderYAxisTicks(maxFlowCompletion, (value) =>
          formatFlowCompletionTimeLabel(value),
        ),
      })}
      {violins.map((violin) => (
        <g key={violin.key}>
          <path d={violin.path} fill={violin.color} opacity={0.22} stroke={violin.color} strokeWidth={1.5} />
          <line
            x1={violin.centerX - 10}
            x2={violin.centerX + 10}
            y1={violin.medianY}
            y2={violin.medianY}
            stroke={violin.color}
            strokeWidth={2.2}
          />
        </g>
      ))}
    </svg>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DensityGridChart({
  points,
  series,
}: {
  points: FlowPoint[];
  series: ClientSeries[];
}) {
  const delays = Array.from(
    new Set(points.map((point) => point.delayAddedMs)),
  ).sort((a, b) => a - b);

  if (points.length === 0 || delays.length === 0 || series.length === 0) {
    return <EmptyChartState text="No run-level data available for the density grid." />;
  }

  const maxFlowCompletion = Math.max(
    ...points.map((point) => point.flowCompletionTimeMs),
    1,
  );
  const rowCount = 14;
  const groupWidth = getChartInnerWidth() / Math.max(delays.length, 1);
  const clientStripWidth = groupWidth / Math.max(series.length, 1);
  const rowHeight = getChartInnerHeight() / rowCount;
  const counts = new Map<string, number>();
  let maxCount = 1;

  for (const point of points) {
    const rowIndex = Math.min(
      rowCount - 1,
      Math.floor((point.flowCompletionTimeMs / Math.max(maxFlowCompletion, 1)) * rowCount),
    );
    const key = `${point.delayAddedMs}:${point.clientNumber}:${rowIndex}`;
    const nextCount = (counts.get(key) ?? 0) + 1;
    counts.set(key, nextCount);
    maxCount = Math.max(maxCount, nextCount);
  }

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      className="h-[52vh] min-h-[380px] w-full overflow-visible rounded-[1.3rem] bg-[#fff2f8] text-slate-300 dark:bg-slate-900/65 dark:text-slate-600"
      role="img"
        aria-label="Density grid of flow completion time by added delay and client"
    >
      {renderChartAxes({
        xAxisLabel: "Added Delay (ms)",
        yAxisLabel: "Flow Completion Time",
        xTicks: delays.map((delayAddedMs, index) => {
          const x = CHART_PADDING.left + groupWidth * index + groupWidth / 2;

          return (
            <g key={`density-x-${delayAddedMs}`}>
              <line
                x1={x}
                x2={x}
                y1={CHART_HEIGHT - CHART_PADDING.bottom}
                y2={CHART_HEIGHT - CHART_PADDING.bottom + 5}
                stroke="currentColor"
                strokeWidth={1}
              />
              <text
                x={x}
                y={CHART_HEIGHT - CHART_PADDING.bottom + 21}
                textAnchor="middle"
                className="fill-slate-500 text-[10px] dark:fill-slate-400"
              >
                {formatAxisValue(delayAddedMs)}
              </text>
            </g>
          );
        }),
        yTicks: renderYAxisTicks(maxFlowCompletion, (value) =>
          formatFlowCompletionTimeLabel(value),
        ),
      })}
      {delays.flatMap((delayAddedMs, delayIndex) =>
        series.flatMap((entry, seriesIndex) =>
          Array.from({ length: rowCount }, (_, rowIndex) => {
            const count =
              counts.get(`${delayAddedMs}:${entry.clientNumber}:${rowIndex}`) ?? 0;
            const intensity = count / maxCount;

            return (
              <rect
                key={`${delayAddedMs}-${entry.clientNumber}-${rowIndex}`}
                x={
                  CHART_PADDING.left +
                  groupWidth * delayIndex +
                  clientStripWidth * seriesIndex +
                  2
                }
                y={CHART_PADDING.top + rowHeight * (rowCount - rowIndex - 1) + 2}
                width={Math.max(clientStripWidth - 4, 1)}
                height={Math.max(rowHeight - 4, 1)}
                rx={4}
                fill={entry.color}
                opacity={count === 0 ? 0.08 : 0.18 + intensity * 0.74}
              />
            );
          }),
        ),
      )}
    </svg>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function MedianSlopeChart({
  points,
  series,
  fromDelay,
  toDelay,
}: {
  points: FlowPoint[];
  series: ClientSeries[];
  fromDelay: number;
  toDelay: number;
}) {
  const slopeData = series
    .map((entry) => {
      const fromValues = points
        .filter(
          (point) =>
            point.clientNumber === entry.clientNumber &&
            point.delayAddedMs === fromDelay,
        )
        .map((point) => point.flowCompletionTimeMs)
        .sort((a, b) => a - b);
      const toValues = points
        .filter(
          (point) =>
            point.clientNumber === entry.clientNumber &&
            point.delayAddedMs === toDelay,
        )
        .map((point) => point.flowCompletionTimeMs)
        .sort((a, b) => a - b);

      if (fromValues.length === 0 || toValues.length === 0) {
        return null;
      }

      return {
        ...entry,
        fromMedian: quantile(fromValues, 0.5),
        toMedian: quantile(toValues, 0.5),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (slopeData.length === 0) {
    return <EmptyChartState text="No paired delay buckets available for the slope chart." />;
  }

  const maxFlowCompletion = Math.max(
    ...slopeData.flatMap((entry) => [entry.fromMedian, entry.toMedian]),
    1,
  );
  const leftX = CHART_PADDING.left + getChartInnerWidth() * 0.22;
  const rightX = CHART_PADDING.left + getChartInnerWidth() * 0.78;

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      className="h-[48vh] min-h-[340px] w-full overflow-visible rounded-[1.3rem] bg-[#fff2f8] text-slate-300 dark:bg-slate-900/65 dark:text-slate-600"
      role="img"
      aria-label="Slope chart comparing median flow completion time between two delay levels"
    >
      {renderChartAxes({
        xAxisLabel: "Selected Delay Buckets",
        yAxisLabel: "Median Flow Completion Time",
        xTicks: (
          <>
            {[{ label: formatAxisValue(fromDelay), x: leftX }, { label: formatAxisValue(toDelay), x: rightX }].map((tick) => (
              <g key={tick.label}>
                <line
                  x1={tick.x}
                  x2={tick.x}
                  y1={CHART_HEIGHT - CHART_PADDING.bottom}
                  y2={CHART_HEIGHT - CHART_PADDING.bottom + 5}
                  stroke="currentColor"
                  strokeWidth={1}
                />
                <text
                  x={tick.x}
                  y={CHART_HEIGHT - CHART_PADDING.bottom + 21}
                  textAnchor="middle"
                  className="fill-slate-500 text-[10px] dark:fill-slate-400"
                >
                  {tick.label}
                </text>
              </g>
            ))}
          </>
        ),
        yTicks: renderYAxisTicks(maxFlowCompletion, (value) =>
          formatFlowCompletionTimeLabel(value),
        ),
      })}
      {slopeData.map((entry) => {
        const fromY = scaleChartY(entry.fromMedian, maxFlowCompletion);
        const toY = scaleChartY(entry.toMedian, maxFlowCompletion);

        return (
          <g key={entry.clientNumber}>
            <line
              x1={leftX}
              x2={rightX}
              y1={fromY}
              y2={toY}
              stroke={entry.color}
              strokeWidth={3}
              opacity={0.9}
            />
            <circle cx={leftX} cy={fromY} r={6} fill={entry.color} />
            <circle cx={rightX} cy={toY} r={6} fill={entry.color} />
            <text
              x={rightX + 10}
              y={toY + 4}
              className="fill-slate-600 text-[11px] dark:fill-slate-300"
            >
              {entry.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PercentileHeatmap({
  points,
  series,
  percentileKey,
}: {
  points: FlowPoint[];
  series: ClientSeries[];
  percentileKey: "p50" | "p90" | "max";
}) {
  const delays = Array.from(
    new Set(points.map((point) => point.delayAddedMs)),
  ).sort((a, b) => a - b);

  if (points.length === 0 || delays.length === 0 || series.length === 0) {
    return <EmptyChartState text="No grouped data available for the percentile heatmap." />;
  }

  const cellWidth = getChartInnerWidth() / Math.max(delays.length, 1);
  const cellHeight = getChartInnerHeight() / Math.max(series.length, 1);
  const stats = delays.flatMap((delayAddedMs) =>
    series.map((entry) => {
      const values = points
        .filter(
          (point) =>
            point.delayAddedMs === delayAddedMs &&
            point.clientNumber === entry.clientNumber,
        )
        .map((point) => point.flowCompletionTimeMs)
        .sort((a, b) => a - b);

      if (values.length === 0) {
        return null;
      }

      const value =
        percentileKey === "p50"
          ? quantile(values, 0.5)
          : percentileKey === "p90"
            ? quantile(values, 0.9)
            : values[values.length - 1];

      return {
        delayAddedMs,
        clientNumber: entry.clientNumber,
        value,
      };
    }).filter((stat): stat is NonNullable<typeof stat> => stat !== null),
  );
  const maxValue = Math.max(...stats.map((stat) => stat.value), 1);

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      className="h-[48vh] min-h-[340px] w-full overflow-visible rounded-[1.3rem] bg-[#fff2f8] text-slate-300 dark:bg-slate-900/65 dark:text-slate-600"
      role="img"
      aria-label="Heatmap of percentile flow completion time by delay and client"
    >
      {renderChartAxes({
        xAxisLabel: "Added Delay (ms)",
        yAxisLabel: `${formatPercentileLabel(percentileKey)} Flow Completion`,
        xTicks: delays.map((delayAddedMs, index) => {
          const x = CHART_PADDING.left + cellWidth * index + cellWidth / 2;

          return (
            <g key={`heat-x-${delayAddedMs}`}>
              <line
                x1={x}
                x2={x}
                y1={CHART_HEIGHT - CHART_PADDING.bottom}
                y2={CHART_HEIGHT - CHART_PADDING.bottom + 5}
                stroke="currentColor"
                strokeWidth={1}
              />
              <text
                x={x}
                y={CHART_HEIGHT - CHART_PADDING.bottom + 21}
                textAnchor="middle"
                className="fill-slate-500 text-[10px] dark:fill-slate-400"
              >
                {formatAxisValue(delayAddedMs)}
              </text>
            </g>
          );
        }),
        yTicks: series.map((entry, index) => {
          const y =
            CHART_PADDING.top + cellHeight * index + cellHeight / 2;

          return (
            <text
              key={`heat-y-${entry.clientNumber}`}
              x={CHART_PADDING.left - 10}
              y={y + 3}
              textAnchor="end"
              className="fill-slate-500 text-[10px] dark:fill-slate-400"
            >
              {entry.label}
            </text>
          );
        }),
      })}
      {stats.map((stat) => {
        const x = CHART_PADDING.left + cellWidth * delays.indexOf(stat.delayAddedMs);
        const y =
          CHART_PADDING.top +
          cellHeight *
            series.findIndex((entry) => entry.clientNumber === stat.clientNumber);
        const intensity = stat.value / maxValue;

        return (
          <g key={`${stat.delayAddedMs}-${stat.clientNumber}`}>
            <rect
              x={x + 3}
              y={y + 3}
              width={Math.max(cellWidth - 6, 1)}
              height={Math.max(cellHeight - 6, 1)}
              rx={6}
              fill={interpolateColor([255, 228, 240], [127, 29, 29], intensity)}
              opacity={0.92}
            />
            <text
              x={x + cellWidth / 2}
              y={y + cellHeight / 2 + 4}
              textAnchor="middle"
              className="fill-white text-[10px] font-medium"
            >
              {formatAxisValue(stat.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function AggregateGraphsPanel({
  data,
}: {
  data: AggregateDelayGraphPoint[];
}) {
  const availableClientCounts = useMemo(
    () =>
      Array.from(new Set(data.map((point) => point.numberOfClients))).sort(
        (a, b) => a - b,
      ),
    [data],
  );
  const [selectedClientCountState, setSelectedClientCount] = useState<number>(
    availableClientCounts[0] ?? 2,
  );
  const [hiddenClientNumbers, setHiddenClientNumbers] = useState<number[]>([]);
  const selectedClientCount = availableClientCounts.includes(
    selectedClientCountState,
  )
    ? selectedClientCountState
    : (availableClientCounts[0] ?? 2);

  const flowPoints = useMemo(
    () =>
      data
        .filter((point) => point.numberOfClients === selectedClientCount)
        .filter(
          (point): point is FlowPoint =>
            point.flowCompletionTimeMs !== null &&
            Number.isFinite(point.flowCompletionTimeMs),
        ),
    [data, selectedClientCount],
  );
  const clientSeries = useMemo(() => {
    const clientNumbers = Array.from(
      new Set(flowPoints.map((point) => point.clientNumber)),
    ).sort((a, b) => a - b);

    return clientNumbers.map((clientNumber, index) => ({
      clientNumber,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      label: `Client ${clientNumber}`,
    }));
  }, [flowPoints]);
  const visibleHiddenClientNumbers = useMemo(() => {
    const validClientNumbers = new Set(
      clientSeries.map((entry) => entry.clientNumber),
    );

    return hiddenClientNumbers.filter((clientNumber) =>
      validClientNumbers.has(clientNumber),
    );
  }, [clientSeries, hiddenClientNumbers]);

  const visiblePoints = flowPoints.filter(
    (point) => !visibleHiddenClientNumbers.includes(point.clientNumber),
  );
  const totalRuns = flowPoints.length;

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
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Focused view of connected client lines across aggregate runs.
              </p>
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
                  Number of Clients
                </p>
                <div
                  className="mt-3 flex flex-col gap-2"
                  role="radiogroup"
                  aria-label="Client count"
                >
                  {availableClientCounts.map((count) => (
                    <FilterOptionButton
                      key={count}
                      label={`${count} clients`}
                      selected={selectedClientCount === count}
                      onClick={() => setSelectedClientCount(count)}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-rose-200/80 bg-[#fff8fc] p-4 dark:border-slate-600 dark:bg-slate-800/55">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  Series Visibility
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {clientSeries.map((entry) => {
                    const isHidden = hiddenClientNumbers.includes(
                      entry.clientNumber,
                    ) && visibleHiddenClientNumbers.includes(entry.clientNumber);

                    return (
                      <button
                        key={entry.clientNumber}
                        type="button"
                        onClick={() =>
                          setHiddenClientNumbers((current) =>
                            current.includes(entry.clientNumber)
                              ? current.filter(
                                  (clientNumber) =>
                                    clientNumber !== entry.clientNumber,
                                )
                              : [...current, entry.clientNumber],
                          )
                        }
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
                          isHidden
                            ? "border-rose-200/70 bg-[#fff3f8] text-slate-500 opacity-60 dark:border-slate-600 dark:bg-slate-800/45 dark:text-slate-300"
                            : "border-rose-300/80 bg-white text-slate-800 hover:border-rose-400 dark:border-slate-500 dark:bg-slate-700/80 dark:text-slate-100 dark:hover:border-slate-400"
                        }`}
                      >
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className={isHidden ? "line-through" : undefined}>
                          {entry.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-rose-200/80 bg-[#fff8fc] p-4 dark:border-slate-600 dark:bg-slate-800/55">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  This View
                </p>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                  {flowPoints.length} plotted parent-run/client points across{" "}
                  {totalRuns} runs.
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Hidden clients apply to the connected client lines chart.
                </p>
              </div>
            </aside>

            <div className="space-y-6">
              <ChartCard
                eyebrow="Parent Runs"
                title="Connected Client Lines"
                subtitle="Every parent run is shown on one plot with added delay on the x axis. Each run gets its own color, and that run's client points are connected directly."
              >
                <ParentRunConnectionChart
                  points={visiblePoints}
                />
              </ChartCard>
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
