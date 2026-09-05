"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

interface GenerationProgressBarProps {
  visible: boolean;
  progress: number;
}

/**
 * 「このプロンプトで生成する」シートを閉じている間、画面下部に出すバー。
 *
 * `PostProgressBar` と同じ見た目・置き場所(タイトル1行＋帯だけ)にする。
 * 当初は `GenerationStatusCard`(メッセージ・ライブメッセージ・フッター付き)を
 * そのまま流用していたが、実機で見ると情報過多で野暮ったく、投稿中バーと
 * 並べたときに浮いていたため作り直した。シートを開いている間に見える
 * `GenerationFormContainer` 内のカードは、これまで通り `GenerationStatusCard`
 * のままで変更していない。
 *
 * 投稿の送信中バーと違い、こちらは実際の進捗率が取れる
 * (`summarizeJobProgress`)ため、投稿側の「終わりの見えない往復アニメーション」
 * ではなく、割合に応じて伸びる帯にする。
 */
export function GenerationProgressBar({
  visible,
  progress,
}: GenerationProgressBarProps) {
  const t = useTranslations("coordinate");

  /*
    ⭐ 表示中はボトムナビを隠す(投稿側と同じ理由: バーがナビより低いため、
    重ねるとアイコンの頭だけが覗く)。クラスは必ずクリーンアップで外すこと。
  */
  useEffect(() => {
    if (!visible) {
      return;
    }

    document.body.classList.add("generation-progress-active");
    return () => {
      document.body.classList.remove("generation-progress-active");
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60]"
      role="status"
      aria-live="polite"
    >
      <div className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex min-h-11 max-w-7xl items-center px-4">
          <p className="text-sm font-medium text-slate-700">
            {t("generatingStatusTitle")}
          </p>
        </div>
        {/* 実際の進捗率で伸びる帯(投稿側は割合を取れないため不定アニメーション、こちらは割合表示) */}
        <div className="h-0.5 w-full overflow-hidden bg-slate-200">
          <div
            className="h-full bg-emerald-500 transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
        {/* ホームインジケータに掛からないための余白 */}
        <div className="generation-progress-safe-bottom" />
      </div>
    </div>
  );
}
