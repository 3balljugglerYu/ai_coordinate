"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    Redoc?: {
      init: (
        specOrSpecUrl: string,
        options: Record<string, unknown>,
        element: HTMLElement
      ) => void;
    };
  }
}

const REDOC_SCRIPT_SRC = "/api-docs/redoc";
const REDOC_SCRIPT_SELECTOR = 'script[data-redoc-bundle="true"]';
const REDOC_LOAD_TIMEOUT_MS = 10_000;

const REDOC_OPTIONS = {
  hideDownloadButton: false,
  expandResponses: "200,202",
  requiredPropsFirst: true,
  sortPropsAlphabetically: false,
  theme: {
    colors: {
      primary: {
        main: "#111827",
      },
    },
    typography: {
      fontSize: "14px",
      lineHeight: "1.6",
      fontFamily:
        'Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      headings: {
        fontFamily:
          'Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
      code: {
        fontFamily:
          'Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      },
    },
  },
} as const;

export function ApiDocsClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let hashScrollFrame: number | null = null;
    let hashScrollTimer: number | null = null;
    let loadTimeout: number | null = null;
    const containerElement = containerRef.current;

    const scrollToHashTarget = (hash: string) => {
      const targetId = decodeURIComponent(hash.replace(/^#/, ""));

      if (!targetId) {
        return;
      }

      const target = document.getElementById(targetId);

      if (!target) {
        return;
      }

      target.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    };

    const scheduleHashScroll = (hash: string) => {
      if (hashScrollTimer !== null) {
        window.clearTimeout(hashScrollTimer);
      }

      if (hashScrollFrame !== null) {
        window.cancelAnimationFrame(hashScrollFrame);
      }

      hashScrollTimer = window.setTimeout(() => {
        hashScrollFrame = window.requestAnimationFrame(() => {
          scrollToHashTarget(hash);
          hashScrollFrame = null;
        });
        hashScrollTimer = null;
      }, 0);
    };

    const handleHashChange = () => {
      scheduleHashScroll(window.location.hash);
    };

    const handleNavigationClick = (event: MouseEvent) => {
      const clickTarget = event.target;

      if (!(clickTarget instanceof Element)) {
        return;
      }

      const navigationTrigger = clickTarget.closest('[data-item-id], a[href^="#"]');

      if (!navigationTrigger || !containerElement?.contains(navigationTrigger)) {
        return;
      }

      if (navigationTrigger instanceof HTMLElement && navigationTrigger.dataset.itemId) {
        scheduleHashScroll(`#${navigationTrigger.dataset.itemId}`);
        return;
      }

      if (navigationTrigger instanceof HTMLAnchorElement && navigationTrigger.hash) {
        scheduleHashScroll(navigationTrigger.hash);
      }
    };

    const mountRedoc = () => {
      if (cancelled || !containerElement || !window.Redoc) {
        return false;
      }

      containerElement.innerHTML = "";
      window.Redoc.init("/openapi.yaml", REDOC_OPTIONS, containerElement);
      setStatus("ready");

      if (window.location.hash) {
        window.setTimeout(() => {
          if (!cancelled) {
            scheduleHashScroll(window.location.hash);
          }
        }, 0);
      }

      return true;
    };

    const handleScriptError = () => {
      if (cancelled) {
        return;
      }

      setStatus("error");
    };

    const scriptElement =
      document.querySelector<HTMLScriptElement>(REDOC_SCRIPT_SELECTOR) ??
      document.createElement("script");

    const handleScriptLoad = () => {
      if (loadTimeout !== null) {
        window.clearTimeout(loadTimeout);
        loadTimeout = null;
      }

      if (!mountRedoc()) {
        handleScriptError();
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    containerElement?.addEventListener("click", handleNavigationClick, true);

    if (window.Redoc) {
      mountRedoc();
    } else {
      scriptElement.dataset.redocBundle = "true";
      scriptElement.src = REDOC_SCRIPT_SRC;
      scriptElement.async = true;

      scriptElement.addEventListener("load", handleScriptLoad);
      scriptElement.addEventListener("error", handleScriptError);

      if (!scriptElement.isConnected) {
        document.head.appendChild(scriptElement);
      }

      loadTimeout = window.setTimeout(() => {
        handleScriptError();
      }, REDOC_LOAD_TIMEOUT_MS);
    }

    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", handleHashChange);
      containerElement?.removeEventListener("click", handleNavigationClick, true);
      scriptElement.removeEventListener("load", handleScriptLoad);
      scriptElement.removeEventListener("error", handleScriptError);
      if (loadTimeout !== null) {
        window.clearTimeout(loadTimeout);
      }
      if (hashScrollTimer !== null) {
        window.clearTimeout(hashScrollTimer);
      }
      if (hashScrollFrame !== null) {
        window.cancelAnimationFrame(hashScrollFrame);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-950">
      {status !== "ready" ? (
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="max-w-md rounded-2xl border border-slate-200 bg-slate-50 px-6 py-5 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-slate-950">API Docs</h1>
            {status === "loading" ? (
              <p className="mt-2 text-sm text-slate-600">
                ReDoc を読み込んでいます。数秒待っても表示されない場合は再読み込みしてください。
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                ReDoc の読み込みに失敗しました。ローカルの開発サーバーを再起動してから再読み込みしてください。
              </p>
            )}
          </div>
        </div>
      ) : null}
      <div
        ref={containerRef}
        className={status === "ready" ? "min-h-screen" : "hidden"}
      />
    </div>
  );
}
