"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

/**
 * 投稿の送信中に画面下部へ出すバー。
 *
 * ## 置き場所
 *
 * **画面の下端**に置き、ボトムナビ(`z-50`)には被せる(こちらは `z-[60]`)。
 *
 * ⭐ 当初はナビの上に載せていたが、実機で「まだ高い」と感じられた。
 * ナビは `h-16` に加えて `safe-area-inset-bottom` を足しているので、
 * その上に置くと端に貼り付いている感じにならない。送信中は一時的な状態で、
 * ナビを隠しても現在地を見失う場面ではないと判断した。
 *
 * 下端に置くぶん、中身がホームインジケータに掛からないよう、バーの内側に
 * safe-area ぶんの余白を持たせている(位置ではなく余白で逃がす)。
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

  /*
    ⭐ 送信中はボトムナビを隠す。

    バーはナビより低い(X に合わせた高さ)ので、ただ下端に重ねると
    **ナビのアイコンの頭だけが上にはみ出して見える**。バーをナビの高さまで
    伸ばすと、今度は帯として高すぎる。隠すのがいちばん素直。

    送信は数秒で終わる一時的な状態で、そのあいだ現在地を見失う場面ではない。
    クラスは必ずクリーンアップで外すこと(付けっぱなしだとナビが消えたままになる)。
  */
  useEffect(() => {
    if (!visible) {
      return;
    }

    document.body.classList.add("post-progress-active");
    return () => {
      document.body.classList.remove("post-progress-active");
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <div
      className="post-progress-anchor fixed inset-x-0 z-[60]"
      /*
        読み上げは「送信中」を一度伝えれば足りる。polite にして、
        操作中の読み上げを遮らない。
      */
      role="status"
      aria-live="polite"
    >
      {/*
        背景は半透明にしない。透けると下のものが浮き出る。
      */}
      <div className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex min-h-11 max-w-7xl items-center px-4">
          <p className="text-sm font-medium text-slate-700">
            {t("postSubmitting")}
          </p>
        </div>
        {/* 往復して流れる帯。割合は出せないので位置で「進行中」を示す */}
        <div className="h-0.5 w-full overflow-hidden bg-slate-200">
          <div className="post-progress-indeterminate h-full w-1/3 bg-sky-500" />
        </div>
        {/* ホームインジケータに掛からないための余白 */}
        <div className="post-progress-safe-bottom" />
      </div>
    </div>
  );
}
