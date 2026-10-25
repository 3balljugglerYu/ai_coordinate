"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
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
 * また、マウスでドラッグしても次のページへ進める(指のスワイプはブラウザのスクロールのまま)。
 * ドラッグのあいだはスナップを外して手に付いてこさせ、離したらページに合わせる。
 * 少しでも動かしたら、離したときのクリックで作品を開かない(ドラッグのつもりが確認が出てしまうため)。
 */

/** これより多いページは点で並べず「3 / 20」で出す(点が折り返して読みにくくなるため) */
const MAX_DOTS = 10;

/** マウスでこれだけ動かしたら、ドラッグとみなす(作品を開かない) */
export const DRAG_CLICK_TOLERANCE_PX = 6;
/** 離したとき、これだけ動かしていれば、動かした向きに少なくとも1ページ進める */
export const DRAG_PAGE_THRESHOLD_PX = 40;
/** 移り終わり(scrollend)が届かないブラウザでも、これだけ待ったらスナップを戻す */
export const SNAP_RESTORE_FALLBACK_MS = 700;

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
  const dragRef = useRef<{ startX: number; startScrollLeft: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  /** ドラッグ中に付けた window のリスナーを外す(途中で画面を離れたときも) */
  const endDragRef = useRef<(() => void) | null>(null);

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

  useEffect(() => () => endDragRef.current?.(), []);

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

  // マウスのドラッグ(指はブラウザのスクロールに任せる。左ボタンだけ)
  const onMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (!scroller || event.button !== 0 || event.ctrlKey || pages.length <= visible) return;
    // 押した場所から文字が選ばれないようにする(すき間から外へドラッグしたとき)
    event.preventDefault();
    endDragRef.current?.();
    dragRef.current = { startX: event.clientX, startScrollLeft: scroller.scrollLeft, moved: false };

    const removeListeners = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      endDragRef.current = null;
    };
    // ボタンを離したのが届かなかったとき(メニューが開いた・窓の外で離した)や、画面を離れたときの片付け
    const cancel = () => {
      removeListeners();
      dragRef.current = null;
      delete scroller.dataset.dragging;
    };
    const onMove = (move: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if ((move.buttons & 1) === 0) {
        finish(move.clientX);
        return;
      }
      const dx = move.clientX - drag.startX;
      if (!drag.moved && Math.abs(dx) < DRAG_CLICK_TOLERANCE_PX) return;
      if (!drag.moved) {
        drag.moved = true;
        // 手に付いてこさせるため、ドラッグのあいだはスナップを外す
        scroller.dataset.dragging = "true";
      }
      move.preventDefault();
      scroller.scrollLeft = drag.startScrollLeft - dx;
    };
    const finish = (clientX: number) => {
      const drag = dragRef.current;
      removeListeners();
      dragRef.current = null;
      if (!drag?.moved) return;
      // 離した直後のクリック(カードの上で離したとき)だけ止める。外で離してクリックが届かなくても、次のクリックは止めない
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      const dx = clientX - drag.startX;
      const width = pageWidth(scroller);
      const startPage = Math.round(drag.startScrollLeft / width);
      let target = Math.round((drag.startScrollLeft - dx) / width);
      // 少しのドラッグでも、動かした向きに1ページは進める
      if (target === startPage && Math.abs(dx) >= DRAG_PAGE_THRESHOLD_PX) target += dx < 0 ? 1 : -1;
      goTo(target);
      // スナップを戻すのは、移り終わってから(先に戻すと、近いほうのページへ引き戻されることがある)
      let restored = false;
      const restoreSnap = () => {
        if (restored) return;
        restored = true;
        scroller.removeEventListener("scrollend", restoreSnap);
        delete scroller.dataset.dragging;
      };
      scroller.addEventListener("scrollend", restoreSnap);
      window.setTimeout(restoreSnap, SNAP_RESTORE_FALLBACK_MS);
    };
    const onUp = (up: MouseEvent) => finish(up.clientX);
    endDragRef.current = cancel;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className={styles.works}>
      <div
        ref={scrollerRef}
        className={styles.worksScroller}
        onScroll={handleScroll}
        onMouseDown={onMouseDown}
        // ドラッグしたあとのクリックでは作品を開かない(カードより先にここで止める)
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        // 画像をつかんで動かす(ブラウザの画像のドラッグ)を止め、ページのドラッグにする
        onDragStart={(event) => event.preventDefault()}
        data-draggable={pages.length > visible ? "true" : undefined}
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
