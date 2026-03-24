"use client";

import { useState, useEffect } from "react";

/** WebView を提供しているアプリの種別 */
export type WebViewApp = "line" | "x" | "facebook" | "instagram" | "tiktok" | "wechat" | "other" | null;

interface WebViewInfo {
  /** WebView 内で動作しているか */
  isWebView: boolean;
  /** 検出されたアプリ種別 */
  app: WebViewApp;
  /** 表示用のアプリ名 */
  appName: string;
  /** Android 端末かどうか */
  isAndroid: boolean;
}

/**
 * UA 文字列からアプリ内ブラウザの種別を判定する。
 */
function detectWebViewApp(ua: string): WebViewApp {
  if (/Line\//i.test(ua)) return "line";
  if (/Twitter|TwitterAndroid/i.test(ua)) return "x";
  if (/FBAN|FBAV/i.test(ua)) return "facebook";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/BytedanceWebview/i.test(ua)) return "tiktok";
  if (/MicroMessenger/i.test(ua)) return "wechat";
  if (/\bwv\b/.test(ua)) return "other";
  return null;
}

/**
 * アプリ種別から表示用の名前を返す。
 */
function getAppDisplayName(app: WebViewApp): string {
  switch (app) {
    case "x": return "X";
    case "line": return "LINE";
    case "facebook": return "Facebook";
    case "instagram": return "Instagram";
    case "tiktok": return "TikTok";
    case "wechat": return "WeChat";
    case "other": return "アプリ";
    default: return "";
  }
}

/**
 * 現在のURLに openExternalBrowser=1 を付与して返す（LINE用）。
 */
export function buildLineExternalUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set("openExternalBrowser", "1");
  return url.toString();
}

/**
 * intent:// スキームURLを構築する（Android用）。
 * Chrome を優先的に起動し、フォールバックとして元のURLを指定する。
 */
export function buildIntentUrl(targetUrl: string): string {
  const url = new URL(targetUrl);
  // hash を除去して intent パラメータの誤解釈を防ぐ
  const fallbackUrl = `${url.origin}${url.pathname}${url.search}`;
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
}

/**
 * WebView 検出のカスタムフック。
 *
 * LINE の場合はマウント時に openExternalBrowser パラメータで外部ブラウザへ自動リダイレクトする。
 * その他のアプリの場合は検出情報を返し、呼び出し側で分岐させる。
 */
export function useWebViewDetection(): WebViewInfo {
  const [info, setInfo] = useState<WebViewInfo>({
    isWebView: false,
    app: null,
    appName: "",
    isAndroid: false,
  });

  useEffect(() => {
    const ua = navigator.userAgent;
    const app = detectWebViewApp(ua);

    if (!app) return;

    if (app === "line") {
      // 既に openExternalBrowser=1 が付与済みの場合はリダイレクトしない（ループ防止）
      const params = new URLSearchParams(window.location.search);
      if (params.get("openExternalBrowser") !== "1") {
        window.location.href = buildLineExternalUrl();
        return;
      }
      // リダイレクト失敗時のフォールバック
    }

    const android = /Android/i.test(ua);
    setInfo({
      isWebView: true,
      app,
      appName: getAppDisplayName(app),
      isAndroid: android,
    });
  }, []);

  return info;
}
