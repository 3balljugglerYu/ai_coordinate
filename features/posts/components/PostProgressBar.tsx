"use client";

import { useTranslations } from "next-intl";

/**
 * 投稿の送信中に画面下部へ出すバー。
 *
 * ## 置き場所
 *
 * スマホのボトムナビ(`NavigationBar` は `h-16` = 64px、`z-50`)の**すぐ上**に
 * 重ねる。ナビを隠すと現在地が分からなくなるので、被せない。
 * PC ではボトムナビが無い(`lg:hidden`)ので、画面下端に置く。
 *
 * ## 進捗を割合で出さない理由
 *
 * 投稿API は「画像のアップロード」ではなく `is_posted` を立てる操作で、
 * 進捗率を取れない(重い WebP 変換はレスポンス後の `after()` に逃がしてある)。
 * 取れない数字をそれらしく動かすと嘘になるので、**終わりの見えない
 * 往復アニメーション**にする。「動いている・待てばよい」だけを伝える。
 */
export function PostProgressBar({ visible }: { visible: boolean }) {
  const t = useTranslations("posts");

  if (!visible) {
    return null;
  }

  return (
    <div
      className="fixed inset-x-0 bottom-16 z-[60] lg:bottom-0"
      /*
        読み上げは「送信中」を一度伝えれば足りる。polite にして、
        操作中の読み上げを遮らない。
      */
      role="status"
      aria-live="polite"
    >
      <div className="border-t border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-2.5">
          <p className="text-sm font-medium text-slate-700">
            {t("postSubmitting")}
          </p>
        </div>
        {/* 往復して流れる帯。割合は出せないので位置で「進行中」を示す */}
        <div className="h-0.5 w-full overflow-hidden bg-slate-200">
          <div className="post-progress-indeterminate h-full w-1/3 bg-sky-500" />
        </div>
      </div>
    </div>
  );
}
