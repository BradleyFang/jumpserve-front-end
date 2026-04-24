"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type AuthStatus = "loading" | "logged-out" | "logged-in";

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21.64 12.2c0-.64-.06-1.25-.17-1.84H12v3.48h5.41a4.63 4.63 0 0 1-2.01 3.04v2.52h3.25c1.9-1.75 2.99-4.33 2.99-7.2Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.25-2.52c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.05v2.6A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.41 13.89A5.99 5.99 0 0 1 6.1 12c0-.66.11-1.3.31-1.89V7.5H3.05A10 10 0 0 0 2 12c0 1.61.39 3.13 1.05 4.5l3.36-2.61Z"
        fill="#FBBC04"
      />
      <path
        d="M12 5.98c1.47 0 2.8.51 3.84 1.51l2.88-2.88C16.97 2.98 14.7 2 12 2A10 10 0 0 0 3.05 7.5l3.36 2.61C7.2 7.74 9.4 5.98 12 5.98Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function LoggedInIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.14" />
      <path
        d="M8 12.2 10.7 15l5.8-6.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AuthButton() {
  const [supabase] = useState(() => createClient());
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const {
        data: { session: nextSession },
      } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setStatus(nextSession ? "logged-in" : "logged-out");
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setStatus(nextSession ? "logged-in" : "logged-out");
      setErrorMessage(null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleGoogleLogin() {
    setErrorMessage(null);

    const redirectTo =
      typeof window === "undefined"
        ? undefined
        : new URL("/auth/callback", window.location.origin).toString();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) {
      setErrorMessage(error.message);
    }
  }

  const userLabel =
    session?.user.user_metadata.full_name ||
    session?.user.user_metadata.name ||
    session?.user.email ||
    null;

  return (
    <div className="fixed top-3 right-3 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2">
      {status === "logged-in" ? (
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-white/95 px-4 py-2 text-sm font-medium text-emerald-800 shadow-lg shadow-zinc-900/10 backdrop-blur dark:border-emerald-500/40 dark:bg-slate-900/88 dark:text-emerald-200 dark:shadow-black/40">
          <LoggedInIcon />
          <span>Logged in</span>
          {userLabel ? (
            <span className="max-w-44 truncate text-emerald-700/80 dark:text-emerald-200/75">
              {userLabel}
            </span>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={status === "loading"}
          className="inline-flex items-center gap-2 rounded-full border border-rose-300/80 bg-white/95 px-4 py-2 text-sm font-medium text-slate-900 shadow-lg shadow-zinc-900/10 backdrop-blur transition hover:-translate-y-0.5 hover:border-rose-400 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-70 dark:border-slate-500 dark:bg-slate-900/88 dark:text-slate-100 dark:hover:border-slate-400 dark:hover:bg-slate-800"
        >
          <GoogleIcon />
          <span>
            {status === "loading" ? "Checking login..." : "Login with Google"}
          </span>
        </button>
      )}

      {errorMessage ? (
        <p className="max-w-sm rounded-2xl border border-red-200 bg-red-50/95 px-3 py-2 text-sm text-red-700 shadow-lg dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
