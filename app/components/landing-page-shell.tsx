"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  applyTheme,
  getServerThemePreferenceSnapshot,
  getThemePreferenceSnapshot,
  setThemePreference,
  subscribeToThemePreference,
  type ThemePreference,
} from "@/lib/theme-preference";

const THEME_OPTIONS: Array<{
  id: ThemePreference;
  label: string;
}> = [
  {
    id: "light",
    label: "light",
  },
  {
    id: "system",
    label: "default",
  },
  {
    id: "dark",
    label: "dark",
  },
];

function LightThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-20 w-20 sm:h-28 sm:w-28">
      <path
        d="M12 4.5v-2M12 21.5v-2M4.5 12h-2M21.5 12h-2M6.22 6.22l-1.42-1.42M19.2 19.2l-1.42-1.42M17.78 6.22l1.42-1.42M6.8 19.2l1.42-1.42"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="4" fill="currentColor" />
    </svg>
  );
}

function SystemThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-20 w-20 sm:h-28 sm:w-28">
      <defs>
        <linearGradient
          id="system-theme-icon-split"
          x1="22"
          y1="22"
          x2="2"
          y2="2"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#0f172a" />
        </linearGradient>
      </defs>
      <rect
        x="3"
        y="4"
        width="18"
        height="13"
        rx="2"
        fill="none"
        stroke="url(#system-theme-icon-split)"
        strokeWidth="1.6"
      />
      <path
        d="M8 20h8M10.5 17h3"
        stroke="url(#system-theme-icon-split)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DarkThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-20 w-20 sm:h-28 sm:w-28">
      <path
        d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ThemeIcon({ preference }: { preference: ThemePreference }) {
  if (preference === "light") {
    return <LightThemeIcon />;
  }

  if (preference === "dark") {
    return <DarkThemeIcon />;
  }

  return <SystemThemeIcon />;
}

function getThemeOptionCircleClassName(preference: ThemePreference) {
  if (preference === "dark") {
    return "flex h-36 w-36 items-center justify-center rounded-full border border-slate-700/80 bg-slate-950 text-white shadow-lg shadow-black/30 backdrop-blur transition hover:scale-[1.03] sm:h-48 sm:w-48";
  }

  if (preference === "system") {
    return "flex h-36 w-36 items-center justify-center rounded-full text-zinc-900 shadow-lg shadow-zinc-900/10 backdrop-blur transition hover:scale-[1.03] sm:h-48 sm:w-48";
  }

  return "flex h-36 w-36 items-center justify-center rounded-full border border-zinc-200/70 bg-white text-zinc-700 shadow-lg shadow-zinc-900/10 backdrop-blur transition hover:scale-[1.03] sm:h-48 sm:w-48";
}

function getThemeOptionCircleStyle(preference: ThemePreference) {
  if (preference === "system") {
    return {
      background:
        "linear-gradient(135deg, #ffffff 0%, #ffffff 50%, #0f172a 50%, #0f172a 100%)",
    };
  }

  return undefined;
}

export function LandingPageShell() {
  const [isThemeChooserVisible, setIsThemeChooserVisible] = useState(true);
  const [previewPreference, setPreviewPreference] = useState<ThemePreference | null>(null);
  const themeSnapshot = useSyncExternalStore(
    subscribeToThemePreference,
    getThemePreferenceSnapshot,
    getServerThemePreferenceSnapshot,
  );
  const activePreference = previewPreference ?? themeSnapshot.preference;

  useEffect(() => {
    applyTheme(activePreference);
  }, [activePreference]);

  useEffect(() => {
    return () => {
      applyTheme(themeSnapshot.preference);
    };
  }, [themeSnapshot.preference]);

  function handleThemeSelect(preference: ThemePreference) {
    setThemePreference(preference);
    setPreviewPreference(null);
    setIsThemeChooserVisible(false);
  }

  function handlePreviewStart(preference: ThemePreference) {
    setPreviewPreference(preference);
  }

  return (
    <main className="space-atmosphere relative min-h-screen overflow-hidden">
      {isThemeChooserVisible ? (
        <section className="absolute inset-0 z-[60]">
          <div className="absolute inset-0 bg-white/25 backdrop-blur-sm dark:bg-slate-950/35" />
          <div className="relative z-10 flex min-h-screen flex-col justify-center px-4 py-6 sm:px-8">
            <div className="mx-auto w-full max-w-7xl">
              <p
                className="chooser-fade-up-late mt-24 -translate-y-16 text-center text-sm font-semibold uppercase tracking-[0.36em] text-slate-600 dark:text-slate-300 sm:mt-32 sm:-translate-y-20"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                Jumpserve
              </p>
              <div className="-mt-10 grid min-h-[44vh] grid-cols-3 gap-6 sm:-mt-14 sm:gap-10">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleThemeSelect(option.id)}
                    aria-label={`Set theme to ${option.id}`}
                    className="chooser-fade-up flex h-full min-h-[18rem] flex-col items-center justify-center gap-6 text-slate-800 transition hover:-translate-y-1 dark:text-slate-100"
                  >
                    <span
                      className={getThemeOptionCircleClassName(option.id)}
                      style={getThemeOptionCircleStyle(option.id)}
                      onMouseEnter={() => handlePreviewStart(option.id)}
                      onFocus={() => handlePreviewStart(option.id)}
                    >
                      <ThemeIcon preference={option.id} />
                    </span>
                    <span
                      className="text-3xl font-semibold tracking-[0.08em] sm:text-4xl"
                      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                    >
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-8 sm:px-10">
        <div className="w-full max-w-xl">
          <p className="mb-4 text-center text-2xl font-semibold tracking-[0.08em] text-slate-900 dark:text-slate-100">
            <span
              className="chooser-fade-up-late inline-block"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              Jumpserve
            </span>
          </p>
          <nav className="chooser-fade-up grid grid-cols-1 gap-3 rounded-[1.75rem] border border-rose-200/70 bg-[#fff8fc]/95 p-4 text-center shadow-xl dark:border-slate-600 dark:bg-slate-800/82 sm:grid-cols-2">
            <Link
              href="/test-lookup"
              className="flex min-h-20 items-center justify-center rounded-[1.2rem] bg-slate-900 px-4 py-4 text-lg font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            >
              Test lookup
            </Link>
            <Link
              href="/aggregate-graphs"
              className="flex min-h-20 items-center justify-center rounded-[1.2rem] border border-rose-300/80 bg-[#fff5fb] px-4 py-4 text-lg font-semibold text-slate-800 transition hover:-translate-y-0.5 hover:border-rose-400 hover:bg-rose-50 dark:border-slate-500 dark:bg-slate-700/85 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-700"
            >
              Aggregate graphs
            </Link>
          </nav>
        </div>
      </div>
    </main>
  );
}
