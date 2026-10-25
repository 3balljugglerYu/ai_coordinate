"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { ShowcaseLeaveDialog } from "@/features/credits/components/ShowcaseLeaveDialog";
import type { CampaignSubmissionItem } from "@/features/campaigns/hashtag-campaign/get-submission-pages";
import { CAMPAIGN_EVENTS, trackCampaignEvent } from "@/features/campaigns/lib/campaign-events";
import styles from "../halloween.module.css";

/**
 * 「キャンペーン対象作品」(2026-10-15 ユーザー決定)。
 *
 * 3列 × 3段の9件を1ページにし、左右にスワイプすると次のページへ移る(1件ずつではなくページ単位)。
 * 2026-10-24 ユーザー指示で3列 × 2段から変更。1ページの件数はサーバー側(SUBMISSION_PAGE_SIZE)が決める。
 * ページ分けと「1ページに同じ人は1件まで(足りないページは残りを詰める)」はサーバー側
 * (paginatePreferringDistinctAuthors)で済ませてある。
 * カードはサムネイルだけ(作者名・利用回数は出さない。2026-10-15 ユーザー指示)。作者名は
 * 読み上げ用の説明(alt)と、押したときの確認にだけ使う。
 *
 * 動かし方はブラウザのスクロールとスナップ(scroll-snap)に任せる。自前のアニメーションで
 * 動かさないので、途中で止まって動かなくなることがない。PC 向けに左右の矢印も置く。
 * 端の矢印は native の disabled にしない(押したまま端に着くとフォーカスが落ちるため)。
 *
 * サムネイルを押したときは /use-prompts と同じ確認を挟む(読み物の途中で黙って移動しない)。
 *
 * 2026-10-25 ユーザー指示: PC では横が3列だと寂しいので、横幅いっぱいに広げてページを並べて見せる
 * (幅に応じて1・2・3ページ = 3・6・9列。CSS の --works-visible)。矢印と点は1ページ(3列)ずつ進む。
 * マウスで操作する画面(PC)では、ページごとに止めず、ふつうの横スクロールにする(スクロールバーを出す)。
 * マウスのドラッグで送る形も試したが、カクついたのでやめた(2026-10-25 ユーザー判断)。
 */

/** これより多いページは点で並べず「3 / 20」で出す(点が折り返して読みにくくなるため) */
const MAX_DOTS = 10;


export function SubmissionCarousel({ pages }: { pages: readonly CampaignSubmissionItem[][] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [pendingItem, setPendingItem] = useState<CampaignSubmissionItem | null>(null);
  /** 一度に見えるページの数(幅で変わる。CSS の --works-visible) */
  const [visible, setVisible] = useState(1);
  /** いちばん左に置けるページの最後(見えるページの数だけ手前) */
  const lastPage = Math.max(pages.length - visible, 0);
  /** 幅が広がって置ける位置が減ったときも、はみ出さない位置として出す(スクロールが起きなくても) */
  const shown = Math.min(current, lastPage);

  /** 1ページの幅(小数まで)。測れないとき(描く前など)は、見えている幅を1ページとみなす */
  const pageWidth = (scroller: HTMLDivElement) => {
    const first = scroller.firstElementChild as HTMLElement | null;
    const width = first ? first.getBoundingClientRect().width : 0;
    return width > 0 ? width : scroller.clientWidth;
  };

  // 描く前に測る(PC で最初に全ページ分の点が出てから減る、ちらつきをなくす)
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const measure = () => {
      const width = pageWidth(scroller);
      setVisible(width > 0 ? Math.max(1, Math.round(scroller.clientWidth / width)) : 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const handleScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.clientWidth === 0) return;
    const page = Math.round(scroller.scrollLeft / pageWidth(scroller));
    setCurrent(Math.min(Math.max(page, 0), lastPage));
  };

  const goTo = (page: number) => {
    const target = Math.min(Math.max(page, 0), lastPage);
    const scroller = scrollerRef.current;
    if (scroller) {
      const reduceMotion =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      scroller.scrollTo({ left: target * pageWidth(scroller), behavior: reduceMotion ? "auto" : "smooth" });
    }
    setCurrent(target);
  };

  return (
    <div className={styles.works}>
      <div
        ref={scrollerRef}
        className={styles.worksScroller}
        onScroll={handleScroll}
        role="group"
        aria-label="キャンペーン対象作品"
        data-testid="halloween-works"
      >
        {pages.map((items, pageIndex) => (
          <ul
            key={items.map((item) => item.postId).join(",")}
            className={styles.worksPage}
            aria-label={`${pageIndex + 1}ページ目(全${pages.length}ページ)`}
            data-testid="halloween-works-page"
          >
            {items.map((item) => (
              <li key={item.postId} data-testid="halloween-work">
                {/*
                  Link のまま onClick で受け止める(/use-prompts と同じ)。button に替えると
                  長押しの「新しいタブで開く」が使えなくなる。
                */}
                <Link
                  href={`/posts/${encodeURIComponent(item.postId)}`}
                  className={styles.workLink}
                  onClick={(event) => {
                    // 修飾キー・中クリックは本来の動き(別タブ)に任せる
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                      return;
                    }
                    event.preventDefault();
                    trackCampaignEvent(CAMPAIGN_EVENTS.workTap);
                    setPendingItem(item);
                  }}
                >
                  <span className={styles.workThumb}>
                    <Image
                      src={item.thumbnailUrl}
                      alt={`${item.authorName}さんの作品`}
                      fill
                      // 6列・9列になるのは区画の幅が700px以上(画面の幅でおよそ732px以上)から
                      sizes="(min-width: 732px) 190px, 30vw"
                      className={styles.workImg}
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
      </div>

      {lastPage > 0 ? (
        <div className={styles.worksNav}>
          <button
            type="button"
            className={styles.worksArrow}
            onClick={() => {
              if (shown > 0) goTo(shown - 1);
            }}
            aria-disabled={shown === 0 ? true : undefined}
            aria-label="前のページ"
          >
            ‹
          </button>
          {lastPage + 1 <= MAX_DOTS ? (
            <div className={styles.worksDots}>
              {pages.slice(0, lastPage + 1).map((items, pageIndex) => (
                <button
                  key={items[0]?.postId ?? pageIndex}
                  type="button"
                  className={styles.worksDot}
                  onClick={() => goTo(pageIndex)}
                  aria-label={`${pageIndex + 1}ページ目`}
                  aria-current={pageIndex === shown ? "true" : undefined}
                />
              ))}
            </div>
          ) : (
            <span className={styles.worksCount} aria-live="polite">
              {/* ページの数で出す(各ページの「全○ページ」とそろえる)。並べて見えるときは、見えている範囲 */}
              {visible > 1
                ? `${shown + 1}〜${Math.min(shown + visible, pages.length)} / ${pages.length}`
                : `${shown + 1} / ${pages.length}`}
            </span>
          )}
          <button
            type="button"
            className={styles.worksArrow}
            onClick={() => {
              if (shown < lastPage) goTo(shown + 1);
            }}
            aria-disabled={shown === lastPage ? true : undefined}
            aria-label="次のページ"
          >
            ›
          </button>
        </div>
      ) : null}

      <ShowcaseLeaveDialog
        item={pendingItem}
        onOpenChange={(open) => {
          if (!open) setPendingItem(null);
        }}
      />
    </div>
  );
}
