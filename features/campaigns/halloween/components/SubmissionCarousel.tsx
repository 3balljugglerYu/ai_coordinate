"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
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
 */

/** これより多いページは点で並べず「3 / 20」で出す(点が折り返して読みにくくなるため) */
const MAX_DOTS = 10;

export function SubmissionCarousel({ pages }: { pages: readonly CampaignSubmissionItem[][] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [pendingItem, setPendingItem] = useState<CampaignSubmissionItem | null>(null);
  const lastPage = pages.length - 1;

  const handleScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.clientWidth === 0) return;
    const page = Math.round(scroller.scrollLeft / scroller.clientWidth);
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
      scroller.scrollTo({ left: target * scroller.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
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
                      sizes="(min-width: 860px) 170px, 30vw"
                      className={styles.workImg}
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
      </div>

      {pages.length > 1 ? (
        <div className={styles.worksNav}>
          <button
            type="button"
            className={styles.worksArrow}
            onClick={() => {
              if (current > 0) goTo(current - 1);
            }}
            aria-disabled={current === 0 ? true : undefined}
            aria-label="前のページ"
          >
            ‹
          </button>
          {pages.length <= MAX_DOTS ? (
            <div className={styles.worksDots}>
              {pages.map((items, pageIndex) => (
                <button
                  key={items[0]?.postId ?? pageIndex}
                  type="button"
                  className={styles.worksDot}
                  onClick={() => goTo(pageIndex)}
                  aria-label={`${pageIndex + 1}ページ目`}
                  aria-current={pageIndex === current ? "true" : undefined}
                />
              ))}
            </div>
          ) : (
            <span className={styles.worksCount} aria-live="polite">
              {current + 1} / {pages.length}
            </span>
          )}
          <button
            type="button"
            className={styles.worksArrow}
            onClick={() => {
              if (current < lastPage) goTo(current + 1);
            }}
            aria-disabled={current === lastPage ? true : undefined}
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
