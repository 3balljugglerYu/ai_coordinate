"use client";

import { useTranslations } from "next-intl";

/**
 * 投稿の送信中に画面下部へ出すバー。
 *
 * ## 置き場所: ボトムナビの下のレイヤーに敷く(ナビは隠さない)
 *
 * ⭐ 当初はボトムナビを `display: none` で隠していたが、「送信中は
 * どこにも行けない」という指摘を生成中バー(`GenerationProgressBar`)側の
 * 修正時に受けた。投稿は生成と違い数秒で終わる一時的な状態ではあるものの、
 * 同じ考え方(ナビは常に操作できる状態を保つ)に揃え、ナビを隠すのをやめた。
 *
 * ただし生成中バーのように単純にナビの上に浮かせる(`bottom: nav の高さ`)
 * と、実機で「まだ高い」と感じられた過去の経緯がある(ナビは `h-16` +
 * `safe-area-inset-bottom` があり、その上に置くと端から離れて浮いた
 * 印象になる)。そこで、バー自身の見た目はナビより**手前ではなく奥の
 * レイヤー**(`z-40` 、ナビは `z-50`)に敷き、ナビの高さぶんの余白
 * (`post-progress-nav-clearance`)を白背景ごと下に伸ばしてナビの背面に
 * 回り込ませる。タイトル行はナビの上端にちょうど接する位置に来て、画面
 * 下端への「貼り付いた」感覚はナビ自身が保証する(バーが直接下端に
 * 接している必要が無い)。
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
      className="post-progress-anchor fixed inset-x-0 z-40"
      /*
        読み上げは「送信中」を一度伝えれば足りる。polite にして、
        操作中の読み上げを遮らない。
      */
      role="status"
      aria-live="polite"
    >
      {/*
        背景は半透明にしない。透けると下のものが浮き出る。
        `post-progress-nav-clearance` がナビの高さぶん padding-bottom を
        足し、この白背景をナビの背面まで伸ばす(下側はナビに隠れて
        見えない)。
      */}
      <div className="post-progress-nav-clearance border-t border-slate-200 bg-white">
        <div className="mx-auto flex min-h-11 max-w-7xl items-center px-4">
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
