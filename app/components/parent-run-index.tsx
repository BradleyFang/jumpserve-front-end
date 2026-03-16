"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ParentRunIndexItem } from "@/lib/emulated-runs-data";

type ParentRunFilterState = {
  normalizedRunSearchQuery: string;
  selectedClientCounts: number[];
  selectedCcaLabels: string[];
  selectedAddedDelayRanges: number[];
  selectedClientStartDelayRanges: number[];
  selectedClientFileSizeRanges: number[];
  selectedBottleneckRateRanges: number[];
  selectedQueueBufferSizeRanges: number[];
};

const CLIENT_COUNT_OPTIONS = [2, 3, 4];
const FILTER_OPTION_PREVIEW_COUNT = 6;

type RangeBucket = {
  start: number;
  end: number;
  label: string;
};

type RangeBucketConfig = {
  addedDelayBuckets: RangeBucket[];
  clientStartDelayBuckets: RangeBucket[];
  clientFileSizeBuckets: RangeBucket[];
  bottleneckRateBuckets: RangeBucket[];
  queueBufferSizeBuckets: RangeBucket[];
};

type ParentRunSortColumn =
  | "run"
  | "elapsedSeconds"
  | "flowCompletionTime"
  | "totalFileSize"
  | "clientStartDelay"
  | "queueBufferSize"
  | "bottleneckRate";

type SortDirection = "asc" | "desc";

function formatCreatedAt(value: string | null) {
  if (!value) {
    return "Unknown timestamp";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function buildRangeBuckets(maxValue: number | null): RangeBucket[] {
  if (maxValue === null || !Number.isFinite(maxValue) || maxValue < 0) {
    return [];
  }

  const buckets: RangeBucket[] = [];
  let start = 0;

  while (start <= maxValue) {
    let bucketSize = 100;

    if (start < 30) {
      bucketSize = 5;
    } else if (start < 100) {
      bucketSize = 10;
    } else if (start < 200) {
      bucketSize = 25;
    } else if (start < 500) {
      bucketSize = 50;
    }

    const end = start + bucketSize;
    buckets.push({
      start,
      end,
      label: `${start}-${end - 1}`,
    });
    start = end;
  }

  return buckets;
}

function parseDelayLabelValue(delayLabel: string) {
  if (!delayLabel.endsWith("ms")) {
    return null;
  }

  const parsed = Number(delayLabel.slice(0, -2));
  return Number.isFinite(parsed) ? parsed : null;
}

function findRangeBucketForValue(
  value: number | null,
  buckets: RangeBucket[],
) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return (
    buckets.find((bucket) => value >= bucket.start && value < bucket.end) ?? null
  );
}

function matchesSelectedRangeBuckets(
  values: number[],
  selectedRangeStarts: number[],
  buckets: RangeBucket[],
) {
  if (selectedRangeStarts.length === 0) {
    return true;
  }

  if (values.length === 0) {
    return false;
  }

  return values.some((value) => {
    const bucket = findRangeBucketForValue(value, buckets);
    return bucket ? selectedRangeStarts.includes(bucket.start) : false;
  });
}

function formatSelectedRangeSummary(
  selectedRangeStarts: number[],
  bucketLookup: Map<number, RangeBucket>,
  unitLabel: string,
) {
  return selectedRangeStarts
    .slice()
    .sort((a, b) => a - b)
    .map((rangeStart) => {
      const bucket = bucketLookup.get(rangeStart);
      return bucket ? `${bucket.label} ${unitLabel}` : `${rangeStart} ${unitLabel}`;
    })
    .join(", ");
}

function toBucketsForValues(values: Array<number | null>) {
  const numericValues = values.filter((value): value is number => value !== null);
  const maxValue = numericValues.length > 0 ? Math.max(...numericValues) : null;

  return buildRangeBuckets(maxValue);
}

function buildBucketLookup(buckets: RangeBucket[]) {
  return new Map(buckets.map((bucket) => [bucket.start, bucket]));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatValueList(values: number[], unitLabel: string) {
  if (values.length === 0) {
    return "None";
  }

  return values.map((value) => `${formatNumber(value)} ${unitLabel}`).join(", ");
}

function formatFlowCompletionTime(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "None";
  }

  if (value >= 1000) {
    return `${formatNumber(value / 1000)} s`;
  }

  return `${formatNumber(value)} ms`;
}

function getAverageFlowCompletionTime(
  parentRun: ParentRunIndexItem,
) {
  const values = parentRun.clientFlowCompletionTimes
    .map((flow) => flow.flowCompletionTimeMs)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ListViewIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2.5" y="4" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="8.5" y="4" width="13" height="4" rx="1.2" fill="currentColor" />
      <rect x="2.5" y="10" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="8.5" y="10" width="13" height="4" rx="1.2" fill="currentColor" />
      <rect x="2.5" y="16" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="8.5" y="16" width="13" height="4" rx="1.2" fill="currentColor" />
    </svg>
  );
}

function GridViewIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {[
        [3, 3],
        [10, 3],
        [17, 3],
        [3, 10],
        [10, 10],
        [17, 10],
        [3, 17],
        [10, 17],
        [17, 17],
      ].map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="4"
          height="4"
          rx="0.9"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

function SortIndicator({
  isActive,
  direction,
}: {
  isActive: boolean;
  direction: SortDirection;
}) {
  return (
    <span
      className={`ml-2 inline-flex transition-transform ${
        direction === "asc" ? "rotate-180" : "rotate-0"
      } ${
        isActive ? "text-slate-700 dark:text-slate-100" : "text-slate-300 dark:text-slate-500"
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="h-3.5 w-3.5"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M4.5 7.5L10 12.5L15.5 7.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function parentRunMatchesFilters(
  parentRun: ParentRunIndexItem,
  {
    normalizedRunSearchQuery,
    selectedClientCounts,
    selectedCcaLabels,
    selectedAddedDelayRanges,
    selectedClientStartDelayRanges,
    selectedClientFileSizeRanges,
    selectedBottleneckRateRanges,
    selectedQueueBufferSizeRanges,
  }: ParentRunFilterState,
  {
    addedDelayBuckets,
    clientStartDelayBuckets,
    clientFileSizeBuckets,
    bottleneckRateBuckets,
    queueBufferSizeBuckets,
  }: RangeBucketConfig,
) {
  if (
    selectedClientCounts.length > 0 &&
    !selectedClientCounts.includes(parentRun.clientCount)
  ) {
    return false;
  }

  if (
    selectedCcaLabels.length > 0 &&
    !selectedCcaLabels.some((selectedCca) => parentRun.ccaLabels.includes(selectedCca))
  ) {
    return false;
  }

  const addedDelayValues = parentRun.delayLabels
    .map(parseDelayLabelValue)
    .filter((value): value is number => value !== null);

  if (
    !matchesSelectedRangeBuckets(
      addedDelayValues,
      selectedAddedDelayRanges,
      addedDelayBuckets,
    )
  ) {
    return false;
  }

  if (
    !matchesSelectedRangeBuckets(
      parentRun.clientStartDelayMsValues,
      selectedClientStartDelayRanges,
      clientStartDelayBuckets,
    )
  ) {
    return false;
  }

  if (
    !matchesSelectedRangeBuckets(
      parentRun.clientFileSizeMegabytesValues,
      selectedClientFileSizeRanges,
      clientFileSizeBuckets,
    )
  ) {
    return false;
  }

  if (
    !matchesSelectedRangeBuckets(
      parentRun.bottleneckRateMegabit === null
        ? []
        : [parentRun.bottleneckRateMegabit],
      selectedBottleneckRateRanges,
      bottleneckRateBuckets,
    )
  ) {
    return false;
  }

  if (
    !matchesSelectedRangeBuckets(
      parentRun.queueBufferSizeKilobyte === null
        ? []
        : [parentRun.queueBufferSizeKilobyte],
      selectedQueueBufferSizeRanges,
      queueBufferSizeBuckets,
    )
  ) {
    return false;
  }

  if (!normalizedRunSearchQuery) {
    return true;
  }

  return String(parentRun.id).includes(normalizedRunSearchQuery);
}

function filterParentRuns(
  parentRuns: ParentRunIndexItem[],
  filterState: ParentRunFilterState,
  bucketConfig: RangeBucketConfig,
) {
  return parentRuns.filter((parentRun) =>
    parentRunMatchesFilters(parentRun, filterState, bucketConfig),
  );
}

export function ParentRunIndex({
  parentRuns,
}: {
  parentRuns: ParentRunIndexItem[];
}) {
  const router = useRouter();
  const [runSearchQuery, setRunSearchQuery] = useState("");
  const [areExtraFiltersVisible, setAreExtraFiltersVisible] = useState(false);
  const [parentRunView, setParentRunView] = useState<"list" | "grid">("grid");
  const [parentRunSortColumn, setParentRunSortColumn] =
    useState<ParentRunSortColumn>("run");
  const [parentRunSortDirection, setParentRunSortDirection] =
    useState<SortDirection>("desc");
  const [expandedFilterOptionSections, setExpandedFilterOptionSections] =
    useState<string[]>([]);
  const [selectedClientCounts, setSelectedClientCounts] = useState<number[]>([]);
  const [selectedCcaLabels, setSelectedCcaLabels] = useState<string[]>([]);
  const [selectedAddedDelayRanges, setSelectedAddedDelayRanges] = useState<
    number[]
  >([]);
  const [selectedClientStartDelayRanges, setSelectedClientStartDelayRanges] =
    useState<number[]>([]);
  const [selectedClientFileSizeRanges, setSelectedClientFileSizeRanges] =
    useState<number[]>([]);
  const [selectedBottleneckRateRanges, setSelectedBottleneckRateRanges] =
    useState<number[]>([]);
  const [selectedQueueBufferSizeRanges, setSelectedQueueBufferSizeRanges] =
    useState<number[]>([]);
  const normalizedRunSearchQuery = runSearchQuery.trim().toLowerCase();
  const isFilterOptionSectionExpanded = (sectionId: string) =>
    expandedFilterOptionSections.includes(sectionId);
  const toggleFilterOptionSection = (sectionId: string) => {
    setExpandedFilterOptionSections((current) =>
      current.includes(sectionId)
        ? current.filter((value) => value !== sectionId)
        : [...current, sectionId],
    );
  };
  const activeFilterCount =
    (normalizedRunSearchQuery.length > 0 ? 1 : 0) +
    selectedClientCounts.length +
    selectedCcaLabels.length +
    selectedAddedDelayRanges.length +
    selectedClientStartDelayRanges.length +
    selectedClientFileSizeRanges.length +
    selectedBottleneckRateRanges.length +
    selectedQueueBufferSizeRanges.length;
  const availableCcaLabels = useMemo(
    () =>
      Array.from(new Set(parentRuns.flatMap((parentRun) => parentRun.ccaLabels)))
        .sort((a, b) => a.localeCompare(b)),
    [parentRuns],
  );
  const availableAddedDelayBuckets = useMemo(
    () =>
      toBucketsForValues(
        parentRuns.flatMap((parentRun) =>
          parentRun.delayLabels.map(parseDelayLabelValue),
        ),
      ),
    [parentRuns],
  );
  const availableClientStartDelayBuckets = useMemo(
    () =>
      toBucketsForValues(
        parentRuns.flatMap((parentRun) => parentRun.clientStartDelayMsValues),
      ),
    [parentRuns],
  );
  const availableClientFileSizeBuckets = useMemo(
    () =>
      toBucketsForValues(
        parentRuns.flatMap((parentRun) => parentRun.clientFileSizeMegabytesValues),
      ),
    [parentRuns],
  );
  const availableBottleneckRateBuckets = useMemo(
    () =>
      toBucketsForValues(
        parentRuns.map((parentRun) => parentRun.bottleneckRateMegabit),
      ),
    [parentRuns],
  );
  const availableQueueBufferSizeBuckets = useMemo(
    () =>
      toBucketsForValues(
        parentRuns.map((parentRun) => parentRun.queueBufferSizeKilobyte),
      ),
    [parentRuns],
  );
  const addedDelayBucketLookup = useMemo(
    () => buildBucketLookup(availableAddedDelayBuckets),
    [availableAddedDelayBuckets],
  );
  const clientStartDelayBucketLookup = useMemo(
    () => buildBucketLookup(availableClientStartDelayBuckets),
    [availableClientStartDelayBuckets],
  );
  const clientFileSizeBucketLookup = useMemo(
    () => buildBucketLookup(availableClientFileSizeBuckets),
    [availableClientFileSizeBuckets],
  );
  const bottleneckRateBucketLookup = useMemo(
    () => buildBucketLookup(availableBottleneckRateBuckets),
    [availableBottleneckRateBuckets],
  );
  const queueBufferSizeBucketLookup = useMemo(
    () => buildBucketLookup(availableQueueBufferSizeBuckets),
    [availableQueueBufferSizeBuckets],
  );
  const rangeBucketConfig = useMemo(
    () => ({
      addedDelayBuckets: availableAddedDelayBuckets,
      clientStartDelayBuckets: availableClientStartDelayBuckets,
      clientFileSizeBuckets: availableClientFileSizeBuckets,
      bottleneckRateBuckets: availableBottleneckRateBuckets,
      queueBufferSizeBuckets: availableQueueBufferSizeBuckets,
    }),
    [
      availableAddedDelayBuckets,
      availableClientStartDelayBuckets,
      availableClientFileSizeBuckets,
      availableBottleneckRateBuckets,
      availableQueueBufferSizeBuckets,
    ],
  );
  const baseFilterState = useMemo(
    () => ({
      normalizedRunSearchQuery,
      selectedClientCounts,
      selectedCcaLabels,
      selectedAddedDelayRanges,
      selectedClientStartDelayRanges,
      selectedClientFileSizeRanges,
      selectedBottleneckRateRanges,
      selectedQueueBufferSizeRanges,
    }),
    [
      normalizedRunSearchQuery,
      selectedClientCounts,
      selectedCcaLabels,
      selectedAddedDelayRanges,
      selectedClientStartDelayRanges,
      selectedClientFileSizeRanges,
      selectedBottleneckRateRanges,
      selectedQueueBufferSizeRanges,
    ],
  );

  const filteredParentRuns = useMemo(
    () => filterParentRuns(parentRuns, baseFilterState, rangeBucketConfig),
    [baseFilterState, parentRuns, rangeBucketConfig],
  );
  const sortedParentRuns = useMemo(() => {
    const getSortValue = (parentRun: ParentRunIndexItem) => {
      switch (parentRunSortColumn) {
        case "run":
          return parentRun.id;
        case "elapsedSeconds":
          return parentRun.chartDurationSeconds ?? -1;
        case "flowCompletionTime":
          return getAverageFlowCompletionTime(parentRun) ?? -1;
        case "totalFileSize":
          return parentRun.totalClientFileSizeMegabytes ?? -1;
        case "clientStartDelay":
          return parentRun.clientStartDelayMsValues[0] ?? -1;
        case "queueBufferSize":
          return parentRun.queueBufferSizeKilobyte ?? -1;
        case "bottleneckRate":
          return parentRun.bottleneckRateMegabit ?? -1;
      }
    };

    return [...filteredParentRuns].sort((left, right) => {
      const leftValue = getSortValue(left);
      const rightValue = getSortValue(right);
      const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;

      if (comparison !== 0) {
        return parentRunSortDirection === "asc" ? comparison : -comparison;
      }

      return right.id - left.id;
    });
  }, [filteredParentRuns, parentRunSortColumn, parentRunSortDirection]);
  const toggleParentRunSort = (column: ParentRunSortColumn) => {
    if (parentRunSortColumn === column) {
      setParentRunSortDirection((current) =>
        current === "asc" ? "desc" : "asc",
      );
      return;
    }

    setParentRunSortColumn(column);
    setParentRunSortDirection(column === "run" ? "desc" : "asc");
  };

  const clientCountOptionCounts = useMemo(
    () =>
      new Map(
        CLIENT_COUNT_OPTIONS.map((clientCount) => [
          clientCount,
          filterParentRuns(
            parentRuns,
            {
              ...baseFilterState,
              selectedClientCounts: [clientCount],
            },
            rangeBucketConfig,
          ).length,
        ]),
      ),
    [baseFilterState, parentRuns, rangeBucketConfig],
  );

  const ccaOptionCounts = useMemo(
    () =>
      new Map(
        availableCcaLabels.map((ccaLabel) => [
          ccaLabel,
          filterParentRuns(
            parentRuns,
            {
              ...baseFilterState,
              selectedCcaLabels: [ccaLabel],
            },
            rangeBucketConfig,
          ).length,
        ]),
      ),
    [availableCcaLabels, baseFilterState, parentRuns, rangeBucketConfig],
  );

  const addedDelayOptionCounts = useMemo(
    () =>
      new Map(
        availableAddedDelayBuckets.map((bucket) => [
          bucket.start,
          filterParentRuns(
            parentRuns,
            {
              ...baseFilterState,
              selectedAddedDelayRanges: [bucket.start],
            },
            rangeBucketConfig,
          ).length,
        ]),
      ),
    [availableAddedDelayBuckets, baseFilterState, parentRuns, rangeBucketConfig],
  );

  const clientStartDelayOptionCounts = useMemo(
    () =>
      new Map(
        availableClientStartDelayBuckets.map((bucket) => [
          bucket.start,
          filterParentRuns(
            parentRuns,
            {
              ...baseFilterState,
              selectedClientStartDelayRanges: [bucket.start],
            },
            rangeBucketConfig,
          ).length,
        ]),
      ),
    [
      availableClientStartDelayBuckets,
      baseFilterState,
      parentRuns,
      rangeBucketConfig,
    ],
  );

  const clientFileSizeOptionCounts = useMemo(
    () =>
      new Map(
        availableClientFileSizeBuckets.map((bucket) => [
          bucket.start,
          filterParentRuns(
            parentRuns,
            {
              ...baseFilterState,
              selectedClientFileSizeRanges: [bucket.start],
            },
            rangeBucketConfig,
          ).length,
        ]),
      ),
    [
      availableClientFileSizeBuckets,
      baseFilterState,
      parentRuns,
      rangeBucketConfig,
    ],
  );

  const bottleneckRateOptionCounts = useMemo(
    () =>
      new Map(
        availableBottleneckRateBuckets.map((bucket) => [
          bucket.start,
          filterParentRuns(
            parentRuns,
            {
              ...baseFilterState,
              selectedBottleneckRateRanges: [bucket.start],
            },
            rangeBucketConfig,
          ).length,
        ]),
      ),
    [
      availableBottleneckRateBuckets,
      baseFilterState,
      parentRuns,
      rangeBucketConfig,
    ],
  );

  const queueBufferSizeOptionCounts = useMemo(
    () =>
      new Map(
        availableQueueBufferSizeBuckets.map((bucket) => [
          bucket.start,
          filterParentRuns(
            parentRuns,
            {
              ...baseFilterState,
              selectedQueueBufferSizeRanges: [bucket.start],
            },
            rangeBucketConfig,
          ).length,
        ]),
      ),
    [
      availableQueueBufferSizeBuckets,
      baseFilterState,
      parentRuns,
      rangeBucketConfig,
    ],
  );

  return (
    <section className="w-full max-w-7xl">
      <div className="grid gap-7 lg:grid-cols-[300px_minmax(0,1fr)]">
        <article className="relative h-fit overflow-hidden rounded-3xl border border-rose-200/80 bg-[linear-gradient(165deg,rgba(255,250,253,0.98)_0%,rgba(255,241,248,0.96)_100%)] p-5 shadow-[0_20px_45px_rgba(190,24,93,0.12)] backdrop-blur-sm dark:border-slate-600/70 dark:bg-[linear-gradient(165deg,rgba(30,41,59,0.9)_0%,rgba(51,65,85,0.82)_100%)] dark:shadow-none lg:sticky lg:top-6">
          <div className="pointer-events-none absolute -right-7 -top-7 h-28 w-28 rounded-full bg-rose-200/60 blur-2xl dark:bg-teal-500/25" />
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-200">
                Filters
              </p>
              <span className="rounded-full border border-rose-300/80 bg-rose-50/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-700 dark:border-slate-500 dark:bg-slate-800/75 dark:text-slate-100">
                {activeFilterCount} active
              </span>
            </div>
          </div>
          <div className="mt-4">
            <label
              htmlFor="parent-run-search"
              className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300"
            >
              Parent run ID search
            </label>
            <input
              id="parent-run-search"
              type="text"
              value={runSearchQuery}
              onChange={(event) => setRunSearchQuery(event.target.value)}
              placeholder="e.g. 1042"
              className="mt-2 w-full rounded-2xl border border-rose-300/80 bg-white/80 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:border-slate-500 dark:bg-slate-900/75 dark:text-slate-100 dark:focus:ring-teal-700/60"
            />
          </div>
          <div className="mt-4">
            <p className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
              Number of clients
            </p>
            <details className="group mt-2">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-rose-300/80 bg-white/80 px-3 py-2 text-sm text-slate-700 transition hover:border-rose-400 dark:border-slate-500 dark:bg-slate-900/75 dark:text-slate-100">
                <span className="min-h-4 flex-1 truncate pr-2">
                  {selectedClientCounts.length > 0
                    ? selectedClientCounts
                        .slice()
                        .sort((a, b) => a - b)
                        .map((count) => `${count} clients`)
                        .join(", ")
                    : "(None selected)"}
                </span>
                <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-50 dark:bg-slate-800">
                  <span className="h-2.5 w-2.5 rotate-45 border-b-2 border-r-2 border-slate-500 transition group-open:rotate-[225deg] dark:border-slate-300" />
                </span>
              </summary>
              <div className="mt-2 space-y-1 rounded-2xl border border-rose-300/80 bg-white/80 p-2.5 dark:border-slate-500 dark:bg-slate-900/75">
                {CLIENT_COUNT_OPTIONS.map((clientCount) => (
                  <label
                    key={clientCount}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-xs text-slate-700 transition hover:bg-rose-50/90 dark:text-slate-100 dark:hover:bg-slate-700/60"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedClientCounts.includes(clientCount)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedClientCounts((current) =>
                              current.includes(clientCount)
                                ? current
                                : [...current, clientCount],
                            );
                            return;
                          }
                          setSelectedClientCounts((current) =>
                            current.filter((value) => value !== clientCount),
                          );
                        }}
                        className="h-3.5 w-3.5 rounded border-rose-400 text-teal-700 focus:ring-teal-500 dark:border-slate-400"
                      />
                      <span>{clientCount} clients</span>
                    </span>
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-rose-700 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200">
                      {clientCountOptionCounts.get(clientCount) ?? 0}
                    </span>
                  </label>
                ))}
              </div>
            </details>
          </div>
          <div className="mt-4">
            <p className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
              CCA
            </p>
            <details className="group mt-2">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-rose-300/80 bg-white/80 px-3 py-2 text-sm text-slate-700 transition hover:border-rose-400 dark:border-slate-500 dark:bg-slate-900/75 dark:text-slate-100">
                <span className="min-h-4 flex-1 truncate pr-2">
                  {selectedCcaLabels.length > 0
                    ? selectedCcaLabels.join(", ")
                    : "(None selected)"}
                </span>
                <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-50 dark:bg-slate-800">
                  <span className="h-2.5 w-2.5 rotate-45 border-b-2 border-r-2 border-slate-500 transition group-open:rotate-[225deg] dark:border-slate-300" />
                </span>
              </summary>
              <div className="mt-2 space-y-1 rounded-2xl border border-rose-300/80 bg-white/80 p-2.5 dark:border-slate-500 dark:bg-slate-900/75">
                {availableCcaLabels.length > 0 ? (
                  <>
                    {(isFilterOptionSectionExpanded("cca")
                      ? availableCcaLabels
                      : availableCcaLabels.slice(0, FILTER_OPTION_PREVIEW_COUNT)
                    ).map((ccaLabel) => (
                    <label
                      key={ccaLabel}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-xs text-slate-700 transition hover:bg-rose-50/90 dark:text-slate-100 dark:hover:bg-slate-700/60"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedCcaLabels.includes(ccaLabel)}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setSelectedCcaLabels((current) =>
                                current.includes(ccaLabel)
                                  ? current
                                  : [...current, ccaLabel],
                              );
                              return;
                            }
                            setSelectedCcaLabels((current) =>
                              current.filter((value) => value !== ccaLabel),
                            );
                          }}
                          className="h-3.5 w-3.5 rounded border-rose-400 text-teal-700 focus:ring-teal-500 dark:border-slate-400"
                        />
                        <span className="truncate">{ccaLabel}</span>
                      </span>
                      <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-rose-700 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200">
                        {ccaOptionCounts.get(ccaLabel) ?? 0}
                      </span>
                    </label>
                    ))}
                    {availableCcaLabels.length > FILTER_OPTION_PREVIEW_COUNT ? (
                      <button
                        type="button"
                        onClick={() => toggleFilterOptionSection("cca")}
                        className="w-full rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700"
                      >
                        {isFilterOptionSectionExpanded("cca")
                          ? "Show less"
                          : `Show more (${availableCcaLabels.length - FILTER_OPTION_PREVIEW_COUNT})`}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p className="px-1.5 py-1 text-xs text-slate-500 dark:text-slate-300">
                    No CCA values found.
                  </p>
                )}
              </div>
            </details>
          </div>
          <div className="mt-4">
            <p className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
              Added Delay
            </p>
            <details className="group mt-2">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-rose-300/80 bg-white/80 px-3 py-2 text-sm text-slate-700 transition hover:border-rose-400 dark:border-slate-500 dark:bg-slate-900/75 dark:text-slate-100">
                <span className="min-h-4 flex-1 truncate pr-2">
                  {selectedAddedDelayRanges.length > 0
                    ? formatSelectedRangeSummary(
                        selectedAddedDelayRanges,
                        addedDelayBucketLookup,
                        "ms",
                      )
                    : "(None selected)"}
                </span>
                <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-50 dark:bg-slate-800">
                  <span className="h-2.5 w-2.5 rotate-45 border-b-2 border-r-2 border-slate-500 transition group-open:rotate-[225deg] dark:border-slate-300" />
                </span>
              </summary>
              <div className="mt-2 space-y-1 rounded-2xl border border-rose-300/80 bg-white/80 p-2.5 dark:border-slate-500 dark:bg-slate-900/75">
                {availableAddedDelayBuckets.length > 0 ? (
                  <>
                    {(isFilterOptionSectionExpanded("delay")
                      ? availableAddedDelayBuckets
                      : availableAddedDelayBuckets.slice(0, FILTER_OPTION_PREVIEW_COUNT)
                    ).map((bucket) => (
                    <label
                      key={bucket.start}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-xs text-slate-700 transition hover:bg-rose-50/90 dark:text-slate-100 dark:hover:bg-slate-700/60"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedAddedDelayRanges.includes(bucket.start)}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setSelectedAddedDelayRanges((current) =>
                                current.includes(bucket.start)
                                  ? current
                                  : [...current, bucket.start],
                              );
                              return;
                            }
                            setSelectedAddedDelayRanges((current) =>
                              current.filter((value) => value !== bucket.start),
                            );
                          }}
                          className="h-3.5 w-3.5 rounded border-rose-400 text-teal-700 focus:ring-teal-500 dark:border-slate-400"
                        />
                        <span className="truncate">{bucket.label} ms</span>
                      </span>
                      <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-rose-700 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200">
                        {addedDelayOptionCounts.get(bucket.start) ?? 0}
                      </span>
                    </label>
                    ))}
                    {availableAddedDelayBuckets.length > FILTER_OPTION_PREVIEW_COUNT ? (
                      <button
                        type="button"
                        onClick={() => toggleFilterOptionSection("delay")}
                        className="w-full rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700"
                      >
                        {isFilterOptionSectionExpanded("delay")
                          ? "Show less"
                          : `Show more (${availableAddedDelayBuckets.length - FILTER_OPTION_PREVIEW_COUNT})`}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p className="px-1.5 py-1 text-xs text-slate-500 dark:text-slate-300">
                    No delay values found.
                  </p>
                )}
              </div>
            </details>
          </div>
          <div className="mt-4">
            <p className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
              Client File Size
            </p>
            <details className="group mt-2">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-rose-300/80 bg-white/80 px-3 py-2 text-sm text-slate-700 transition hover:border-rose-400 dark:border-slate-500 dark:bg-slate-900/75 dark:text-slate-100">
                <span className="min-h-4 flex-1 truncate pr-2">
                  {selectedClientFileSizeRanges.length > 0
                    ? formatSelectedRangeSummary(
                        selectedClientFileSizeRanges,
                        clientFileSizeBucketLookup,
                        "MB",
                      )
                    : "(None selected)"}
                </span>
                <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-50 dark:bg-slate-800">
                  <span className="h-2.5 w-2.5 rotate-45 border-b-2 border-r-2 border-slate-500 transition group-open:rotate-[225deg] dark:border-slate-300" />
                </span>
              </summary>
              <div className="mt-2 space-y-1 rounded-2xl border border-rose-300/80 bg-white/80 p-2.5 dark:border-slate-500 dark:bg-slate-900/75">
                {(isFilterOptionSectionExpanded("client-file-size")
                  ? availableClientFileSizeBuckets
                  : availableClientFileSizeBuckets.slice(0, FILTER_OPTION_PREVIEW_COUNT)
                ).map((bucket) => (
                  <label
                    key={bucket.start}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-xs text-slate-700 transition hover:bg-rose-50/90 dark:text-slate-100 dark:hover:bg-slate-700/60"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedClientFileSizeRanges.includes(bucket.start)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedClientFileSizeRanges((current) =>
                              current.includes(bucket.start)
                                ? current
                                : [...current, bucket.start],
                            );
                            return;
                          }
                          setSelectedClientFileSizeRanges((current) =>
                            current.filter((value) => value !== bucket.start),
                          );
                        }}
                        className="h-3.5 w-3.5 rounded border-rose-400 text-teal-700 focus:ring-teal-500 dark:border-slate-400"
                      />
                      <span className="truncate">
                        {bucket.label} MB
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-rose-700 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200">
                      {clientFileSizeOptionCounts.get(bucket.start) ?? 0}
                    </span>
                  </label>
                ))}
                {availableClientFileSizeBuckets.length > FILTER_OPTION_PREVIEW_COUNT ? (
                  <button
                    type="button"
                    onClick={() => toggleFilterOptionSection("client-file-size")}
                    className="w-full rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700"
                  >
                    {isFilterOptionSectionExpanded("client-file-size")
                      ? "Show less"
                      : `Show more (${availableClientFileSizeBuckets.length - FILTER_OPTION_PREVIEW_COUNT})`}
                  </button>
                ) : null}
              </div>
            </details>
          </div>
          <button
            type="button"
            onClick={() => setAreExtraFiltersVisible((current) => !current)}
            className="mt-4 inline-flex w-auto rounded-lg border border-rose-300/80 bg-white/90 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:border-rose-400 hover:bg-rose-50 dark:border-slate-500 dark:bg-slate-800/75 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700/85"
          >
            {areExtraFiltersVisible ? "Show less" : "Show more filters"}
          </button>
          {areExtraFiltersVisible ? (
            <>
              <div className="mt-4">
                <p className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
                  Client Start Delay
                </p>
                <details className="group mt-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-rose-300/80 bg-white/80 px-3 py-2 text-sm text-slate-700 transition hover:border-rose-400 dark:border-slate-500 dark:bg-slate-900/75 dark:text-slate-100">
                    <span className="min-h-4 flex-1 truncate pr-2">
                      {selectedClientStartDelayRanges.length > 0
                        ? formatSelectedRangeSummary(
                            selectedClientStartDelayRanges,
                            clientStartDelayBucketLookup,
                            "ms",
                          )
                        : "(None selected)"}
                    </span>
                    <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-50 dark:bg-slate-800">
                      <span className="h-2.5 w-2.5 rotate-45 border-b-2 border-r-2 border-slate-500 transition group-open:rotate-[225deg] dark:border-slate-300" />
                    </span>
                  </summary>
                  <div className="mt-2 space-y-1 rounded-2xl border border-rose-300/80 bg-white/80 p-2.5 dark:border-slate-500 dark:bg-slate-900/75">
                    {(isFilterOptionSectionExpanded("client-start-delay")
                      ? availableClientStartDelayBuckets
                      : availableClientStartDelayBuckets.slice(0, FILTER_OPTION_PREVIEW_COUNT)
                    ).map((bucket) => (
                      <label
                        key={bucket.start}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-xs text-slate-700 transition hover:bg-rose-50/90 dark:text-slate-100 dark:hover:bg-slate-700/60"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedClientStartDelayRanges.includes(bucket.start)}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setSelectedClientStartDelayRanges((current) =>
                                  current.includes(bucket.start)
                                    ? current
                                    : [...current, bucket.start],
                                );
                                return;
                              }
                              setSelectedClientStartDelayRanges((current) =>
                                current.filter((value) => value !== bucket.start),
                              );
                            }}
                            className="h-3.5 w-3.5 rounded border-rose-400 text-teal-700 focus:ring-teal-500 dark:border-slate-400"
                          />
                          <span className="truncate">{bucket.label} ms</span>
                        </span>
                        <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-rose-700 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200">
                          {clientStartDelayOptionCounts.get(bucket.start) ?? 0}
                        </span>
                      </label>
                    ))}
                    {availableClientStartDelayBuckets.length > FILTER_OPTION_PREVIEW_COUNT ? (
                      <button
                        type="button"
                        onClick={() => toggleFilterOptionSection("client-start-delay")}
                        className="w-full rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700"
                      >
                        {isFilterOptionSectionExpanded("client-start-delay")
                          ? "Show less"
                          : `Show more (${availableClientStartDelayBuckets.length - FILTER_OPTION_PREVIEW_COUNT})`}
                      </button>
                    ) : null}
                  </div>
                </details>
              </div>
              <div className="mt-4">
                <p className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
                  Queue Buffer Size
                </p>
                <details className="group mt-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-rose-300/80 bg-white/80 px-3 py-2 text-sm text-slate-700 transition hover:border-rose-400 dark:border-slate-500 dark:bg-slate-900/75 dark:text-slate-100">
                    <span className="min-h-4 flex-1 truncate pr-2">
                      {selectedQueueBufferSizeRanges.length > 0
                        ? formatSelectedRangeSummary(
                            selectedQueueBufferSizeRanges,
                            queueBufferSizeBucketLookup,
                            "kbytes",
                          )
                        : "(None selected)"}
                    </span>
                    <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-50 dark:bg-slate-800">
                      <span className="h-2.5 w-2.5 rotate-45 border-b-2 border-r-2 border-slate-500 transition group-open:rotate-[225deg] dark:border-slate-300" />
                    </span>
                  </summary>
                  <div className="mt-2 space-y-1 rounded-2xl border border-rose-300/80 bg-white/80 p-2.5 dark:border-slate-500 dark:bg-slate-900/75">
                    {(isFilterOptionSectionExpanded("queue-buffer")
                      ? availableQueueBufferSizeBuckets
                      : availableQueueBufferSizeBuckets.slice(0, FILTER_OPTION_PREVIEW_COUNT)
                    ).map((size) => (
                      <label
                        key={size.start}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-xs text-slate-700 transition hover:bg-rose-50/90 dark:text-slate-100 dark:hover:bg-slate-700/60"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedQueueBufferSizeRanges.includes(size.start)}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setSelectedQueueBufferSizeRanges((current) =>
                                  current.includes(size.start)
                                    ? current
                                    : [...current, size.start],
                                );
                                return;
                              }
                              setSelectedQueueBufferSizeRanges((current) =>
                                current.filter((value) => value !== size.start),
                              );
                            }}
                            className="h-3.5 w-3.5 rounded border-rose-400 text-teal-700 focus:ring-teal-500 dark:border-slate-400"
                          />
                          <span className="truncate">{size.label} kbytes</span>
                        </span>
                        <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-rose-700 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200">
                          {queueBufferSizeOptionCounts.get(size.start) ?? 0}
                        </span>
                      </label>
                    ))}
                    {availableQueueBufferSizeBuckets.length > FILTER_OPTION_PREVIEW_COUNT ? (
                      <button
                        type="button"
                        onClick={() => toggleFilterOptionSection("queue-buffer")}
                        className="w-full rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700"
                      >
                        {isFilterOptionSectionExpanded("queue-buffer")
                          ? "Show less"
                          : `Show more (${availableQueueBufferSizeBuckets.length - FILTER_OPTION_PREVIEW_COUNT})`}
                      </button>
                    ) : null}
                  </div>
                </details>
              </div>
              <div className="mt-4">
                <p className="block text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
                  Bottleneck Rate
                </p>
                <details className="group mt-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-rose-300/80 bg-white/80 px-3 py-2 text-sm text-slate-700 transition hover:border-rose-400 dark:border-slate-500 dark:bg-slate-900/75 dark:text-slate-100">
                    <span className="min-h-4 flex-1 truncate pr-2">
                      {selectedBottleneckRateRanges.length > 0
                        ? formatSelectedRangeSummary(
                            selectedBottleneckRateRanges,
                            bottleneckRateBucketLookup,
                            "mbit",
                          )
                        : "(None selected)"}
                    </span>
                    <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-50 dark:bg-slate-800">
                      <span className="h-2.5 w-2.5 rotate-45 border-b-2 border-r-2 border-slate-500 transition group-open:rotate-[225deg] dark:border-slate-300" />
                    </span>
                  </summary>
                  <div className="mt-2 space-y-1 rounded-2xl border border-rose-300/80 bg-white/80 p-2.5 dark:border-slate-500 dark:bg-slate-900/75">
                    {(isFilterOptionSectionExpanded("bottleneck-rate")
                      ? availableBottleneckRateBuckets
                      : availableBottleneckRateBuckets.slice(0, FILTER_OPTION_PREVIEW_COUNT)
                    ).map((rate) => (
                      <label
                        key={rate.start}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-xs text-slate-700 transition hover:bg-rose-50/90 dark:text-slate-100 dark:hover:bg-slate-700/60"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedBottleneckRateRanges.includes(rate.start)}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setSelectedBottleneckRateRanges((current) =>
                                  current.includes(rate.start)
                                    ? current
                                    : [...current, rate.start],
                                );
                                return;
                              }
                              setSelectedBottleneckRateRanges((current) =>
                                current.filter((value) => value !== rate.start),
                              );
                            }}
                            className="h-3.5 w-3.5 rounded border-rose-400 text-teal-700 focus:ring-teal-500 dark:border-slate-400"
                          />
                          <span className="truncate">{rate.label} mbit</span>
                        </span>
                        <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-rose-700 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200">
                          {bottleneckRateOptionCounts.get(rate.start) ?? 0}
                        </span>
                      </label>
                    ))}
                    {availableBottleneckRateBuckets.length > FILTER_OPTION_PREVIEW_COUNT ? (
                      <button
                        type="button"
                        onClick={() => toggleFilterOptionSection("bottleneck-rate")}
                        className="w-full rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700"
                      >
                        {isFilterOptionSectionExpanded("bottleneck-rate")
                          ? "Show less"
                          : `Show more (${availableBottleneckRateBuckets.length - FILTER_OPTION_PREVIEW_COUNT})`}
                      </button>
                    ) : null}
                  </div>
                </details>
              </div>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setRunSearchQuery("");
              setSelectedClientCounts([]);
              setSelectedCcaLabels([]);
              setSelectedAddedDelayRanges([]);
              setSelectedClientStartDelayRanges([]);
              setSelectedClientFileSizeRanges([]);
              setSelectedBottleneckRateRanges([]);
              setSelectedQueueBufferSizeRanges([]);
            }}
            className="mt-4 w-full rounded-xl border border-rose-300/80 bg-white/90 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:border-rose-400 hover:bg-rose-50 dark:border-slate-500 dark:bg-slate-800/75 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700/85"
          >
            Clear filters
          </button>
        </article>

        <article className="flex min-h-[32rem] flex-col rounded-3xl border border-rose-200/70 bg-[linear-gradient(165deg,rgba(255,250,253,0.98)_0%,rgba(255,245,250,0.97)_100%)] p-6 shadow-[0_22px_50px_rgba(15,23,42,0.12)] backdrop-blur-sm dark:border-slate-600/70 dark:bg-[linear-gradient(165deg,rgba(30,41,59,0.91)_0%,rgba(51,65,85,0.83)_100%)] dark:shadow-none sm:p-8 lg:min-h-[calc(100dvh-9rem)]">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-teal-700">
            Jumpserve
          </p>
          <h1 className="mt-2 text-center text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
            Parent Runs
          </h1>
          <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-200">
            Search and open a parent run.
          </p>
          <p className="mt-5 text-center text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
            Showing {filteredParentRuns.length} of {parentRuns.length} parent runs
          </p>
          <div className="mt-4 flex justify-end">
            <div className="inline-flex rounded-xl border border-rose-200 bg-white/90 p-1 dark:border-slate-500 dark:bg-slate-800/75">
              <button
                type="button"
                aria-label="Table view"
                onClick={() => setParentRunView("list")}
                className={`inline-flex items-center justify-center rounded-lg p-4 transition active:scale-95 ${
                  parentRunView === "list"
                    ? "bg-slate-700 text-white dark:bg-slate-600"
                    : "text-slate-700 hover:bg-rose-50 active:bg-rose-100 dark:text-slate-100 dark:hover:bg-slate-700 dark:active:bg-slate-600"
                }`}
              >
                <ListViewIcon />
              </button>
              <button
                type="button"
                aria-label="Grid view"
                onClick={() => setParentRunView("grid")}
                className={`inline-flex items-center justify-center rounded-lg p-4 transition active:scale-95 ${
                  parentRunView === "grid"
                    ? "bg-slate-700 text-white dark:bg-slate-600"
                    : "text-slate-700 hover:bg-rose-50 active:bg-rose-100 dark:text-slate-100 dark:hover:bg-slate-700 dark:active:bg-slate-600"
                }`}
              >
                <GridViewIcon />
              </button>
            </div>
          </div>

          <div
            className={`mx-auto mt-4 min-h-0 flex-1 overflow-y-auto px-1 pb-1 ${
              parentRunView === "list"
                ? "max-w-6xl"
                : "grid max-w-6xl content-start gap-3 md:grid-cols-2 xl:grid-cols-3"
            }`}
          >
            {filteredParentRuns.length > 0 ? (
              parentRunView === "list" ? (
                <div className="overflow-x-auto rounded-3xl border border-rose-200/80 bg-[linear-gradient(165deg,#fff7fb_0%,#fff0f7_100%)] dark:border-slate-600 dark:bg-[linear-gradient(165deg,rgba(51,65,85,0.78)_0%,rgba(71,85,105,0.72)_100%)]">
                  <table className="w-full table-fixed border-collapse">
                    <thead>
                      <tr className="border-b border-rose-200/80 bg-white/65 dark:border-slate-500 dark:bg-slate-800/45">
                        <th className="w-[24%] px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
                          <button
                            type="button"
                            onClick={() => toggleParentRunSort("run")}
                            className="flex w-full items-center justify-between gap-2 text-left hover:text-slate-700 dark:hover:text-slate-100"
                          >
                            Run
                            <SortIndicator
                              isActive={parentRunSortColumn === "run"}
                              direction={parentRunSortDirection}
                            />
                          </button>
                        </th>
                        <th className="w-[10%] px-2.5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
                          <button
                            type="button"
                            onClick={() => toggleParentRunSort("elapsedSeconds")}
                            className="flex w-full items-center justify-between gap-2 text-left hover:text-slate-700 dark:hover:text-slate-100"
                          >
                            Elapsed
                            <SortIndicator
                              isActive={parentRunSortColumn === "elapsedSeconds"}
                              direction={parentRunSortDirection}
                            />
                          </button>
                        </th>
                        <th className="w-[17%] px-2.5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
                          <button
                            type="button"
                            onClick={() => toggleParentRunSort("flowCompletionTime")}
                            className="flex w-full items-center justify-between gap-2 text-left hover:text-slate-700 dark:hover:text-slate-100"
                          >
                            Flow Times
                            <SortIndicator
                              isActive={parentRunSortColumn === "flowCompletionTime"}
                              direction={parentRunSortDirection}
                            />
                          </button>
                        </th>
                        <th className="w-[12%] px-2.5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
                          <button
                            type="button"
                            onClick={() => toggleParentRunSort("totalFileSize")}
                            className="flex w-full items-center justify-between gap-2 text-left hover:text-slate-700 dark:hover:text-slate-100"
                          >
                            File Size
                            <SortIndicator
                              isActive={parentRunSortColumn === "totalFileSize"}
                              direction={parentRunSortDirection}
                            />
                          </button>
                        </th>
                        <th className="w-[14%] px-2.5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
                          <button
                            type="button"
                            onClick={() => toggleParentRunSort("clientStartDelay")}
                            className="flex w-full items-center justify-between gap-2 text-left hover:text-slate-700 dark:hover:text-slate-100"
                          >
                            Start Delay
                            <SortIndicator
                              isActive={parentRunSortColumn === "clientStartDelay"}
                              direction={parentRunSortDirection}
                            />
                          </button>
                        </th>
                        <th className="w-[11%] px-2.5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
                          <button
                            type="button"
                            onClick={() => toggleParentRunSort("queueBufferSize")}
                            className="flex w-full items-center justify-between gap-2 text-left hover:text-slate-700 dark:hover:text-slate-100"
                          >
                            Queue
                            <SortIndicator
                              isActive={parentRunSortColumn === "queueBufferSize"}
                              direction={parentRunSortDirection}
                            />
                          </button>
                        </th>
                        <th className="w-[12%] px-2.5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
                          <button
                            type="button"
                            onClick={() => toggleParentRunSort("bottleneckRate")}
                            className="flex w-full items-center justify-between gap-2 text-left hover:text-slate-700 dark:hover:text-slate-100"
                          >
                            Bottleneck
                            <SortIndicator
                              isActive={parentRunSortColumn === "bottleneckRate"}
                              direction={parentRunSortDirection}
                            />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedParentRuns.map((parentRun) => (
                        <tr
                          key={parentRun.id}
                          tabIndex={0}
                          onClick={() => router.push(`/parent-run/${parentRun.id}`)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              router.push(`/parent-run/${parentRun.id}`);
                            }
                          }}
                          className="cursor-pointer border-b border-rose-100/80 align-top transition hover:bg-white/50 focus-visible:bg-white/50 focus-visible:outline-none last:border-b-0 dark:border-slate-600/70 dark:hover:bg-slate-800/30 dark:focus-visible:bg-slate-800/30"
                        >
                          <td className="px-3 py-3 align-top">
                            <Link href={`/parent-run/${parentRun.id}`} className="block min-w-0">
                              <div className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-300">
                                <span className="uppercase tracking-[0.16em]">
                                  {parentRun.clientCount} client{parentRun.clientCount === 1 ? "" : "s"}
                                </span>
                              </div>
                              <span className="mt-1.5 block min-w-0 break-words text-sm font-medium leading-5 text-slate-800 dark:text-slate-100">
                                {parentRun.clientSummaryLine}
                              </span>
                              <span className="mt-2 block text-xs uppercase tracking-[0.14em] text-slate-500 transition hover:text-rose-700 dark:text-slate-200 dark:hover:text-white">
                                Parent #{parentRun.id}
                              </span>
                              <span className="mt-1.5 block text-xs text-slate-500 dark:text-slate-200">
                                {formatCreatedAt(parentRun.createdAt)}
                              </span>
                            </Link>
                          </td>
                          <td className="px-2.5 py-3 text-xs leading-5 text-slate-600 dark:text-slate-200">
                            {parentRun.chartDurationSeconds === null
                              ? "None"
                              : `${formatNumber(parentRun.chartDurationSeconds)} s`}
                          </td>
                          <td className="px-2.5 py-3 text-xs leading-5 text-slate-600 dark:text-slate-200">
                            <div className="flex flex-wrap gap-x-2 gap-y-1">
                              {parentRun.clientFlowCompletionTimes.length > 0 ? (
                                parentRun.clientFlowCompletionTimes.map((flow) => (
                                  <span key={flow.clientNumber}>
                                    C{flow.clientNumber}:{" "}
                                    {formatFlowCompletionTime(flow.flowCompletionTimeMs)}
                                  </span>
                                ))
                              ) : (
                                <span>None</span>
                              )}
                            </div>
                          </td>
                          <td className="px-2.5 py-3 text-xs leading-5 text-slate-600 dark:text-slate-200">
                            {parentRun.totalClientFileSizeMegabytes === null
                              ? "None"
                              : `${formatNumber(parentRun.totalClientFileSizeMegabytes)} MB`}
                          </td>
                          <td className="px-2.5 py-3 text-xs leading-5 text-slate-600 dark:text-slate-200">
                            {formatValueList(parentRun.clientStartDelayMsValues, "ms")}
                          </td>
                          <td className="px-2.5 py-3 text-xs leading-5 text-slate-600 dark:text-slate-200">
                            {parentRun.queueBufferSizeKilobyte === null
                              ? "None"
                              : `${formatNumber(parentRun.queueBufferSizeKilobyte)} kbytes`}
                          </td>
                          <td className="px-2.5 py-3 text-xs leading-5 text-slate-600 dark:text-slate-200">
                            {parentRun.bottleneckRateMegabit === null
                              ? "None"
                              : `${formatNumber(parentRun.bottleneckRateMegabit)} mbit`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                sortedParentRuns.map((parentRun) => (
                  <article
                    key={parentRun.id}
                    className="group rounded-3xl border border-rose-200/80 bg-[linear-gradient(165deg,#fff7fb_0%,#fff0f7_100%)] px-5 py-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-[0_14px_28px_rgba(190,24,93,0.16)] dark:border-slate-600 dark:bg-[linear-gradient(165deg,rgba(51,65,85,0.78)_0%,rgba(71,85,105,0.72)_100%)] dark:hover:border-slate-400 dark:hover:shadow-none"
                  >
                    <Link
                      href={`/parent-run/${parentRun.id}`}
                      className="block min-w-0"
                    >
                      <div className="flex flex-col gap-1 text-sm text-slate-500 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <span className="uppercase tracking-[0.18em]">
                          {parentRun.clientCount} client{parentRun.clientCount === 1 ? "" : "s"}
                        </span>
                        <span>
                          Total file size:{" "}
                          {parentRun.totalClientFileSizeMegabytes === null
                            ? "None"
                            : `${formatNumber(parentRun.totalClientFileSizeMegabytes)} MB`}
                        </span>
                      </div>
                      <div className="mt-2">
                        <span className="block min-w-0 text-base font-medium text-slate-800 dark:text-slate-100">
                          {parentRun.clientSummaryLine}
                        </span>
                      </div>
                      <span className="mt-2.5 block text-sm uppercase tracking-[0.16em] text-slate-500 transition group-hover:text-rose-700 dark:text-slate-200 dark:group-hover:text-white">
                        Parent #{parentRun.id}
                      </span>
                      <span className="mt-1.5 block text-xs text-slate-500 dark:text-slate-200">
                        {formatCreatedAt(parentRun.createdAt)}
                      </span>
                    </Link>
                  </article>
                ))
              )
            ) : (
              <div className="rounded-2xl border border-dashed border-rose-300/80 bg-[#fff5fb] px-4 py-8 text-center text-sm text-slate-600 dark:border-slate-500 dark:bg-slate-700/45 dark:text-slate-200">
                No parent runs matched your filters.
              </div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
