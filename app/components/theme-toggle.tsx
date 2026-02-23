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

export function ThemeToggle() {
  const preference = useSyncExternalStore(
    subscribe,
    readPreference,
    getServerSnapshot,
  );

  return (
    <div className="fixed right-4 bottom-4 z-50 rounded-2xl border border-slate-300/80 bg-white/90 p-1.5 shadow-xl backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/90">
      <div className="flex items-center gap-1">
        {(
          [
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
            { id: "system", label: "System" },
          ] as const
        ).map((option) => {
          const isActive = option.id === preference;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setThemePreference(option.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold tracking-wide transition ${
                isActive
                  ? "bg-teal-600 text-white shadow-sm"
                  : "bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
              aria-pressed={isActive}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
