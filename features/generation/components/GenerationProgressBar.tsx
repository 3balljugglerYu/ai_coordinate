"use client";

import { useTranslations } from "next-intl";

interface GenerationProgressBarProps {
  visible: boolean;
  progress: number;
}

/**
 * 「このプロンプトで生成する」シートを閉じている間、画面下部に出すバー。
 *
 * `PostProgressBar` と同じ見た目(タイトル1行＋帯だけ)にする。当初は
 * `GenerationStatusCard`(メッセージ・ライブメッセージ・フッター付き)を
 * そのまま流用していたが、実機で見ると情報過多で野暮ったく、投稿中バーと
 * 並べたときに浮いていたため作り直した。シートを開いている間に見える
 * `GenerationFormContainer` 内のカードは、これまで通り `GenerationStatusCard`
 * のままで変更していない。
 *
 * 投稿の送信中バーと違い、こちらは実際の進捗率が取れる
 * (`summarizeJobProgress`)ため、投稿側の「終わりの見えない往復アニメーション」
 * ではなく、割合に応じて伸びる帯にする。
 *
 * ## ボトムナビは隠さない(`PostProgressBar` との意図的な違い)
 *
 * 投稿の送信中バーはボトムナビを隠すが、これは送信が数秒で終わる
 * 一時的な状態だから許容できる。生成はそうではない。むしろ「シートを
 * 閉じても他の画面へ移動できる」ことがこの機能の存在理由そのものなので、
 * ナビを隠すと本末転倒(生成中はどこにも行けなくなる)。ナビの上に
 * 重ねて表示し、ナビは常に操作できる状態を保つ。
 *
 * `.generation-progress-anchor` がナビの高さ(h-16)+ ナビ自身の
 * safe-area-inset-bottom ぶんだけこのバーを浮かせる。ナビ側が既に
 * safe-area を確保しているため、このバー自身は safe-area の余白を
 * 持たなくてよい。
 */
export function GenerationProgressBar({
  visible,
  progress,
}: GenerationProgressBarProps) {
  const t = useTranslations("coordinate");

  if (!visible) {
    return null;
  }

  return (
    <div
      /*
        ⭐ mount のたびに `generation-progress-bar-enter` の
        下から上へのスライドインが再生される(CSSアニメーションは要素の
        挿入時に自動再生されるため、JS側でトリガーする配線は不要)。
      */
      className="generation-progress-anchor generation-progress-bar-enter fixed inset-x-0 z-[60]"
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
      </div>
    </div>
  );
}
