"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface GenerationProgressBarProps {
  progress: number;
  /**
   * 帯を現在値まで伸ばしきるのにかける時間。
   * ステージ別の表(`STAGE_PROGRESS_TRANSITION_MS`)から Host が引いて渡す。
   */
  progressTransitionDurationMs: number;
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
 * ナビを隠すと本末転倒(生成中はどこにも行けなくなる)。
 *
 * ## ナビより奥のレイヤーに敷く(`PostProgressBar` と同じ技法に統一)
 *
 * 単純にナビの上へ浮かせる(`bottom: ナビの高さ`)ことも試したが、投稿側で
 * 実機で「まだ高い」と感じられた過去の経緯があり、`PostProgressBar` が
 * 採った技法に統一した: バーはナビ(z-50)より奥の `z-40` に敷き、
 * `.generation-progress-nav-clearance` でナビの高さ(h-16)+ ナビ自身の
 * safe-area-inset-bottom ぶんだけ白背景を下へ回り込ませてナビの背面に
 * 隠す。タイトル行はナビの上端にちょうど接する位置になり、画面下端への
 * 「貼り付いた」感覚はナビ自身が担保するため、このバー自身が画面の
 * 真の下端に接する必要はない。
 *
 * 副次効果として、`.generation-progress-bar-enter` のスライドインが
 * 自動的に「ナビの背面(画面の真の下端)から迫り上がる」動きになる。
 * `translateY(100%)` は要素自身の高さ(ナビ回り込み分を含む)を基準に
 * するため、キーフレーム自体は変更していない。
 */
export function GenerationProgressBar({
  progress,
  progressTransitionDurationMs,
}: GenerationProgressBarProps) {
  const t = useTranslations("coordinate");
  /*
    ⭐ 出現時は 0% から現在値へ伸ばす(シート内カードの
    `animateFromZeroOnMount` と同じ演出)。

    シートを閉じるのは多くの場合 `generating`(90%)の最中で、そのまま
    現在値で描くと初回レンダーに transition が乗らず、90% のまま数十秒
    静止する = 「アニメーションが無い」に見える。0% から 25 秒かけて
    伸ばせばシート内と同じ「伸び続けている」見え方になる。

    値の反映を1フレーム遅らせるのは、`width: 0%` を一度描いてからでないと
    transition が発火しないため(カード側も同じ理由で rAF を使っている)。
    動きを減らす設定の人には `motion-reduce:transition-none` が効くので、
    ここでの分岐は不要(次のフレームで即座に現在値へ飛ぶ)。

    ⭐⭐ 表示/非表示は**呼び出し元(Host)が mount/unmount で切り替える**。
    ここで `visible` を持って `return null` すると state が残り、
    次に出たときに 0% から始められない(前回の値のまま静止する)。
  */
  const [renderedProgress, setRenderedProgress] = useState(0);
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setRenderedProgress(progress);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [progress]);

  return (
    <div
      /*
        ⭐ mount のたびに `generation-progress-bar-enter` の
        下から上へのスライドインが再生される(CSSアニメーションは要素の
        挿入時に自動再生されるため、JS側でトリガーする配線は不要)。
      */
      className="generation-progress-anchor generation-progress-bar-enter fixed inset-x-0 z-40"
      role="status"
      aria-live="polite"
    >
      <div className="generation-progress-nav-clearance border-t border-slate-200 bg-white">
        <div className="mx-auto flex min-h-11 max-w-7xl items-center px-4">
          <p className="text-sm font-medium text-slate-700">
            {t("generatingStatusTitle")}
          </p>
        </div>
        {/* 実際の進捗率で伸びる帯(投稿側は割合を取れないため不定アニメーション、こちらは割合表示) */}
        <div className="h-0.5 w-full overflow-hidden bg-slate-200">
          <div
            className="h-full bg-emerald-500 transition-[width] ease-out motion-reduce:transition-none"
            style={{
              width: `${renderedProgress}%`,
              // ステージ別の所要時間(Host が STAGE_PROGRESS_TRANSITION_MS から渡す)
              transitionDuration: `${progressTransitionDurationMs}ms`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
