"use client";

import { useSyncExternalStore } from "react";
import {
  getServerThemePreferenceSnapshot,
  getThemePreferenceSnapshot,
  setThemePreference,
  subscribeToThemePreference,
  type ThemePreference,
} from "@/lib/theme-preference";

function getNextPreference(preference: ThemePreference): ThemePreference {
  if (preference === "system") {
    return "light";
  }

  if (preference === "light") {
    return "dark";
  }

  return "system";
}

function getPreferenceLabel(preference: ThemePreference) {
  if (preference === "system") {
    return "System Default";
  }

  return preference === "light" ? "Light" : "Dark";
}

function LightThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
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

function DarkThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SystemThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <rect
        x="3"
        y="4"
        width="18"
        height="13"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8 20h8M10.5 17h3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const preference = useSyncExternalStore(
    subscribeToThemePreference,
    () => getThemePreferenceSnapshot().preference,
    () => getServerThemePreferenceSnapshot().preference,
  );
  const nextPreference = getNextPreference(preference);
  const currentLabel = getPreferenceLabel(preference);
  const nextLabel = getPreferenceLabel(nextPreference);

  return (
    <button
      type="button"
      onClick={() => setThemePreference(nextPreference)}
      aria-label={`Theme: ${currentLabel}. Switch to ${nextLabel}.`}
      title={`Theme: ${currentLabel}. Switch to ${nextLabel}.`}
      className="fixed right-3 bottom-3 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-200/70 bg-white/90 text-zinc-700 shadow-lg shadow-zinc-900/10 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-100 dark:shadow-black/40 dark:focus-visible:ring-zinc-500/70"
    >
      {preference === "light" ? (
        <LightThemeIcon />
      ) : preference === "dark" ? (
        <DarkThemeIcon />
      ) : (
        <SystemThemeIcon />
      )}
    </button>
  );
}
