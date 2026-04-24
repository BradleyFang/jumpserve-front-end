"use client";

export type ThemePreference = "light" | "dark" | "system";
type ThemePreferenceListener = () => void;
type ThemePreferenceSnapshot = {
  hasStoredPreference: boolean;
  preference: ThemePreference;
};

export const STORAGE_KEY = "theme-preference";
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set<ThemePreferenceListener>();
const SERVER_THEME_PREFERENCE_SNAPSHOT: ThemePreferenceSnapshot = {
  hasStoredPreference: false,
  preference: "system",
};
let cachedThemePreferenceSnapshot: ThemePreferenceSnapshot =
  SERVER_THEME_PREFERENCE_SNAPSHOT;

export function parsePreference(value: string | null): ThemePreference | null {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : null;
}

export function readPreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  return parsePreference(window.localStorage.getItem(STORAGE_KEY)) ?? "system";
}

export function hasStoredPreference() {
  if (typeof window === "undefined") {
    return false;
  }

  return parsePreference(window.localStorage.getItem(STORAGE_KEY)) !== null;
}

export function resolveDarkMode(preference: ThemePreference) {
  if (typeof window === "undefined") {
    return preference === "dark";
  }

  if (preference === "dark") {
    return true;
  }

  if (preference === "light") {
    return false;
  }

  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

export function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") {
    return;
  }

  const darkMode = resolveDarkMode(preference);
  document.documentElement.classList.toggle("dark", darkMode);
  document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
}

export function emitThemePreferenceChange() {
  listeners.forEach((listener) => listener());
}

export function subscribeToThemePreference(listener: ThemePreferenceListener) {
  if (typeof window === "undefined") {
    return () => {};
  }

  listeners.add(listener);

  const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
  const handleSystemThemeChange = () => {
    if (readPreference() === "system") {
      applyTheme("system");
      emitThemePreferenceChange();
    }
  };
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      applyTheme(readPreference());
      emitThemePreferenceChange();
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

export function getThemePreferenceSnapshot(): ThemePreferenceSnapshot {
  const nextSnapshot = {
    hasStoredPreference: hasStoredPreference(),
    preference: readPreference(),
  } satisfies ThemePreferenceSnapshot;

  if (
    cachedThemePreferenceSnapshot.hasStoredPreference ===
      nextSnapshot.hasStoredPreference &&
    cachedThemePreferenceSnapshot.preference === nextSnapshot.preference
  ) {
    return cachedThemePreferenceSnapshot;
  }

  cachedThemePreferenceSnapshot = nextSnapshot;
  return cachedThemePreferenceSnapshot;
}

export function getServerThemePreferenceSnapshot(): ThemePreferenceSnapshot {
  return SERVER_THEME_PREFERENCE_SNAPSHOT;
}

export function setThemePreference(nextPreference: ThemePreference) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, nextPreference);
  applyTheme(nextPreference);
  emitThemePreferenceChange();
}
