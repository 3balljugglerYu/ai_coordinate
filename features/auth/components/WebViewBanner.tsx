"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, Copy, Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type WebViewType = "line" | "other" | null;

/**
 * アプリ内ブラウザ（WebView）を検出する。
 * LINE の場合は openExternalBrowser パラメータで外部ブラウザへ自動遷移できるため区別する。
 * X（Twitter）は SFSafariViewController / Chrome Custom Tabs を使用するため検出対象外。
 */
function detectWebView(ua: string): WebViewType {
  if (/Line\//i.test(ua)) return "line";

  const otherPatterns = [
    /FBAN|FBAV/i, // Facebook
    /Instagram/i,
    /MicroMessenger/i, // WeChat
    /\bwv\b/, // Android WebView
  ];
  if (otherPatterns.some((pattern) => pattern.test(ua))) return "other";

  return null;
}

/**
 * Android端末かどうかを判定する。
 */
function isAndroid(ua: string): boolean {
  return /Android/i.test(ua);
}

/**
 * 現在のURLに openExternalBrowser=1 を付与して返す（LINE用）。
 */
function buildLineExternalUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set("openExternalBrowser", "1");
  return url.toString();
}

/**
 * intent:// スキームURLを構築する（Android用）。
 * Chrome を優先的に起動し、フォールバックとして元のURLを指定する。
 */
function buildIntentUrl(targetUrl: string): string {
  const url = new URL(targetUrl);
  // intent://host/path#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=<encoded>;end
  return `intent://${url.host}${url.pathname}${url.search}${url.hash}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(targetUrl)};end`;
}

/**
 * LINE, Facebook, Instagram などのアプリ内ブラウザ（WebView）を検出し、
 * 外部ブラウザで開くよう案内するコンポーネント。
 *
 * - LINE: openExternalBrowser パラメータで外部ブラウザへ自動リダイレクト
 * - その他 (Android): intent:// スキームで外部ブラウザを起動するボタンを表示
 * - その他 (iOS): URLコピーバナーを表示
 */
export function WebViewBanner() {
  const [webViewType, setWebViewType] = useState<WebViewType>(null);
  const [android, setAndroid] = useState(false);
  const [copied, setCopied] = useState(false);
  const t = useTranslations("auth");

  useEffect(() => {
    const ua = navigator.userAgent;
    const detected = detectWebView(ua);

    if (detected === "line") {
      // 既に openExternalBrowser=1 が付与済みの場合はリダイレクトしない（ループ防止）
      const params = new URLSearchParams(window.location.search);
      if (params.get("openExternalBrowser") === "1") {
        setWebViewType("other");
        setAndroid(isAndroid(ua));
        return;
      }
      window.location.href = buildLineExternalUrl();
      return;
    }

    setWebViewType(detected);
    setAndroid(isAndroid(ua));
  }, []);

  if (!webViewType) return null;

  const currentUrl = window.location.href;

  const handleOpenBrowser = () => {
    window.location.href = buildIntentUrl(currentUrl);
  };

  const handleCopyUrl = async () => {
    let copiedSuccessfully = false;
    try {
      await navigator.clipboard.writeText(currentUrl);
      copiedSuccessfully = true;
    } catch {
      // フォールバック: 古いブラウザ向け
      const textArea = document.createElement("textarea");
      textArea.value = currentUrl;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        copiedSuccessfully = document.execCommand("copy");
      } catch {
        // execCommand が例外をスローした場合はコピー失敗として扱う
      } finally {
        document.body.removeChild(textArea);
      }
    }

    if (copiedSuccessfully) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Alert className="mb-4 border-amber-300 bg-amber-50">
      <ExternalLink className="h-4 w-4 text-amber-600" />
      <AlertDescription className="text-amber-800">
        <p className="mb-2 font-medium">{t("webViewWarningTitle")}</p>
        <p className="mb-3 text-sm">
          {android
            ? t("webViewWarningDescriptionAndroid")
            : t("webViewWarningDescription")}
        </p>
        <div className="flex flex-wrap gap-2">
          {android && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-amber-400 bg-white text-amber-800 hover:bg-amber-100"
              onClick={handleOpenBrowser}
            >
              <ExternalLink className="mr-1.5 h-4 w-4" />
              {t("webViewOpenBrowser")}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-amber-400 bg-white text-amber-800 hover:bg-amber-100"
            onClick={handleCopyUrl}
          >
            {copied ? (
              <Check className="mr-1.5 h-4 w-4" />
            ) : (
              <Copy className="mr-1.5 h-4 w-4" />
            )}
            {copied ? t("webViewUrlCopied") : t("webViewCopyUrl")}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
