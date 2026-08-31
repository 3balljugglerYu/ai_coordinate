"use client";

/**
 * /admin 配下の error boundary。
 *
 * ダッシュボードの土台になる取得（generated_images / style_usage_events /
 * credit_transactions / image_jobs）が失敗したとき、getAdminDashboardData が
 * throw する。それを受けてここでエラーを出す。
 *
 * 空配列で描画すると「0件」が正常な集計として読めてしまい、運営が数字を
 * 信じて判断してしまう。**間違った数字を静かに出すよりページを赤くする**
 * というのが 2026-08-31 の 1,000行打ち切り事故から得た方針。
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

interface AdminErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: AdminErrorProps) {
  useEffect(() => {
    console.error("[admin] error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-12 text-center">
      <h1 className="text-2xl font-bold text-gray-900">
        データの取得に失敗しました
      </h1>
      <p className="text-sm text-muted-foreground">
        数字が欠けたまま表示すると判断を誤るため、あえて表示していません。
        時間をおいて再読み込みしてください。続くようならログを確認してください。
      </p>
      <div>
        <Button onClick={reset} variant="default" type="button">
          再読み込み
        </Button>
      </div>
    </div>
  );
}
