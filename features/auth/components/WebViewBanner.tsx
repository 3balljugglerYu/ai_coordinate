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
 * 現在のURLに openExternalBrowser=1 を付与して返す（LINE用）。
 */
function buildLineExternalUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set("openExternalBrowser", "1");
  return url.toString();
}

/**
 * LINE, Facebook, Instagram などのアプリ内ブラウザ（WebView）を検出し、
 * 外部ブラウザで開くよう案内するコンポーネント。
 *
 * - LINE: openExternalBrowser パラメータで外部ブラウザへ自動リダイレクト
 * - その他: URLコピーバナーを表示
 */
export function WebViewBanner() {
  const [webViewType, setWebViewType] = useState<WebViewType>(null);
  const [copied, setCopied] = useState(false);
  const t = useTranslations("auth");

  useEffect(() => {
    const detected = detectWebView(navigator.userAgent);

    if (detected === "line") {
      // 既に openExternalBrowser=1 が付与済みの場合はリダイレクトしない（ループ防止）
      const params = new URLSearchParams(window.location.search);
      if (params.get("openExternalBrowser") === "1") {
        setWebViewType("other");
        return;
      }
      window.location.href = buildLineExternalUrl();
      return;
    }

    setWebViewType(detected);
  }, []);

  if (!webViewType) return null;

  const currentUrl = window.location.href;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // フォールバック: 古いブラウザ向け
      const textArea = document.createElement("textarea");
      textArea.value = currentUrl;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Alert className="mb-4 border-amber-300 bg-amber-50">
      <ExternalLink className="h-4 w-4 text-amber-600" />
      <AlertDescription className="text-amber-800">
        <p className="mb-2 font-medium">{t("webViewWarningTitle")}</p>
        <p className="mb-3 text-sm">{t("webViewWarningDescription")}</p>
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
      </AlertDescription>
    </Alert>
  );
}
