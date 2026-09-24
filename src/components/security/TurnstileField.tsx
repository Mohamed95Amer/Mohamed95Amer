"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: "light" | "dark" | "auto";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScript: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser unavailable"));
  if (window.turnstile) return Promise.resolve();
  if (turnstileScript) return turnstileScript;

  turnstileScript = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-getgold-turnstile]");
    const script = existing ?? document.createElement("script");
    const loaded = () => window.turnstile ? resolve() : reject(new Error("Turnstile did not load"));
    const failed = () => {
      turnstileScript = null;
      reject(new Error("Turnstile failed to load"));
    };

    if (existing && window.turnstile) {
      resolve();
      return;
    }

    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!existing) {
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.getgoldTurnstile = "true";
      document.head.appendChild(script);
    }
  });

  return turnstileScript;
}

export function TurnstileField({
  onTokenChange,
  resetKey,
}: {
  onTokenChange: (token: string | null) => void;
  resetKey: number;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const tokenCallbackRef = useRef(onTokenChange);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    tokenCallbackRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    loadTurnstile().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "auto",
        callback: (token) => tokenCallbackRef.current(token),
        "expired-callback": () => tokenCallbackRef.current(null),
        "error-callback": () => {
          tokenCallbackRef.current(null);
          setLoadError(true);
        },
      });
      setLoadError(false);
    }).catch(() => setLoadError(true));

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      tokenCallbackRef.current(null);
    };
  }, [siteKey]);

  useEffect(() => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      tokenCallbackRef.current(null);
      setLoadError(false);
    }
  }, [resetKey]);

  if (!siteKey) return null;

  return (
    <div className="space-y-2" aria-live="polite">
      <div ref={containerRef} />
      {loadError && <p role="alert" className="text-sm text-signal-err">Security check could not load. Check your connection and try again.</p>}
    </div>
  );
}
