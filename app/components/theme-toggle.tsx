"use client";

import { useSyncExternalStore } from "react";

type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "theme-preference";
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

function parsePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

function readPreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }
  return parsePreference(window.localStorage.getItem(STORAGE_KEY));
}

function resolveDarkMode(preference: ThemePreference) {
  if (preference === "dark") {
    return true;
  }
  if (preference === "light") {
    return false;
  }
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

function applyTheme(preference: ThemePreference) {
  const darkMode = resolveDarkMode(preference);
  document.documentElement.classList.toggle("dark", darkMode);
  document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
}

function emitThemePreferenceChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  listeners.add(listener);

  const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
  const handleSystemThemeChange = () => {
    if (readPreference() === "system") {
      applyTheme("system");
      listener();
    }
  };
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      applyTheme(readPreference());
      listener();
    }
  };

  mediaQuery.addEventListener("change", handleSystemThemeChange);
  window.addEventListener("storage", handleStorageChange);

  return () => {
    listeners.delete(listener);
    mediaQuery.removeEventListener("change", handleSystemThemeChange);
    window.removeEventListener("storage", handleStorageChange);
  };
}

function getServerSnapshot(): ThemePreference {
  return "system";
}

function setThemePreference(nextPreference: ThemePreference) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, nextPreference);
  applyTheme(nextPreference);
  emitThemePreferenceChange();
}

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
    subscribe,
    readPreference,
    getServerSnapshot,
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
