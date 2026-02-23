# AGENTS.md

Last updated: 2026-02-22

## Project purpose

`jumpserve-front-end` is a Next.js app that reads Supabase data and visualizes emulation metrics.
The current primary UI is an "Emulated Run Explorer" graphing data from:

- `public.emulated_runs`
- `public.emulated_per_second_stats`

## Stack

- Next.js `16.1.6` (App Router)
- React `19.2.3`
- TypeScript `5`
- Tailwind CSS `4`
- Supabase client libraries:
  - `@supabase/supabase-js`
  - `@supabase/ssr`

## Useful commands

```bash
npm install
npm run dev
npm run lint
npm run build
```

## Environment

Required in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Do not commit real keys or tokens.

## Key files

- `app/page.tsx`
  - Server component.
  - Fetches `emulated_runs` and `emulated_per_second_stats` from Supabase.
  - Normalizes numeric-like values to `number | null`.
  - Renders dashboard component with fetched data.
- `app/components/emulated-runs-dashboard.tsx`
  - Client component.
  - Run selector + metadata cards.
  - Renders SVG line charts for selected run.
- `lib/supabase/server.ts`
  - SSR Supabase client with cookie integration.
- `lib/supabase/client.ts`
  - Browser Supabase client helper.
- `app/globals.css`
  - Global styles and font family defaults.

## Current data model assumptions

### `public.emulated_runs`

Important columns currently used:

- `id` (int, PK)
- `created_at` (timestamptz)
- `client_number` (smallint)
- `delay_added` (smallint)
- `congestion_control_algorithm_id` (smallint)

Joined relation currently used:

- `congestion_control_algorithms(name)`

### `public.emulated_per_second_stats`

Important columns currently used:

- `id` (int, PK)
- `emulated_run_id` (int, FK -> `emulated_runs.id`)
- `snapshot_index` (smallint)
- `elapsed_seconds` (numeric)
- `megabits_per_second` (numeric)
- `round_trip_time_ms` (numeric)
- `bottleneck_queuing_delay_ms` (numeric)
- `in_flight_packets` (int)
- `congestion_window_bytes` (bigint)

## Graph behavior (current)

- Loads up to 50 newest runs by `created_at desc`.
- Loads per-second stats for those run IDs.
- Run dropdown defaults to the first (newest) run.
- Displays three charts:
  - Throughput (`megabits_per_second`)
  - Round-trip Time (`round_trip_time_ms`)
  - Queueing Delay (`bottleneck_queuing_delay_ms`)
- X-axis uses `elapsed_seconds`, then falls back to `snapshot_index`.

## Implementation notes

- Supabase `numeric` / `bigint` values can arrive as strings; convert before chart math.
- Keep server-side querying in server components where possible.
- Preserve non-sensitive error messages for easier debugging.
- Prefer adding new metrics in `METRICS` within `app/components/emulated-runs-dashboard.tsx`.

## Suggested next improvements

- Add URL query params for selected run and filters.
- Add multi-run comparison charts.
- Add additional metric toggles (`cwnd`, in-flight packets, backlog/rate fields).
- Add a small table of raw points under each chart for debugging/validation.
