"use client";

/**
 * /inspire/[templateId] の error boundary。
 *
 * Server Component 内で throw された例外をキャッチして UI フォールバックを表示する。
 * 既存ページには error.tsx が無く、エラー時に Next.js のデフォルト 500 ページに
 * 落ちていた (HG-001 指摘)。
 *
 * 設計判断: docs/planning/creator-looks-implementation-plan.md HG-001
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

interface InspirePageErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function InspirePageError({
  error,
  reset,
}: InspirePageErrorProps) {
  useEffect(() => {
    // 監視: 詳細ログには PII / hidden_prompt が含まれないよう sanitize しない方針
    // (= error.message は generic、digest は Next.js のサーバ側 ID)
    console.error("[inspire detail] error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-12 text-center">
      <h1 className="text-2xl font-bold text-gray-900">
        ページの読み込みに失敗しました
      </h1>
      <p className="text-sm text-muted-foreground">
        時間をおいてから再度お試しください。
      </p>
      <div>
        <Button onClick={reset} variant="default">
          再読み込み
        </Button>
      </div>
    </div>
  );
}
