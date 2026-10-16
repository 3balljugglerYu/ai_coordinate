"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "../halloween.module.css";

/** 企画ページの終わりの目印。ここまで来たら(下はサイト共通の案内)浮いたボタンを消す */
export const HALLOWEEN_PAGE_END_ID = "hbs-page-end";

/**
 * 参加のボタン(2026-10-16 ユーザー指示)。ページのどこにいても押せるよう、画面の下に浮かせて固定する
 * (冒頭と締めに置いていたボタンはやめた)。名前はアプリの呼び名にそろえる:
 * 「カタログをつくる」(CREATE = /free)・「カタログから生成する」(対象作品)。
 * スマホではアプリの下のメニュー(高さ64px)の上に置く。
 *
 * 企画ページの終わりの目印が画面に入ったら消す。その下はサイト共通の案内(利用規約などのリンク)で、
 * 浮いたボタンが重なると押せなくなるため。
 */
export function FloatingJoinButtons({ joinHref, worksHref }: { joinHref: string; worksHref: string }) {
  const [isPastPage, setIsPastPage] = useState(false);

  useEffect(() => {
    const end = document.getElementById(HALLOWEEN_PAGE_END_ID);
    if (!end || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      // 目印が見えている、または目印より下までスクロールしたら消す
      setIsPastPage(entry.isIntersecting || entry.boundingClientRect.top < 0);
    });
    observer.observe(end);
    return () => observer.disconnect();
  }, []);

  const worksClassName = `${styles.floatingCtaButton} ${styles.floatingCtaSub}`;
  return (
    <nav
      className={`${styles.floatingCta} ${isPastPage ? styles.floatingCtaHidden : ""}`}
      aria-label="企画に参加する"
      aria-hidden={isPastPage ? true : undefined}
      inert={isPastPage}
      data-testid="halloween-floating-cta"
    >
      <Link className={`${styles.floatingCtaButton} ${styles.floatingCtaMain}`} href={joinHref}>
        カタログを
        <wbr />
        つくる
      </Link>
      {/* ページの中へ飛ぶときは素の a(Link を通さない) */}
      {worksHref.startsWith("#") ? (
        <a className={worksClassName} href={worksHref}>
          カタログから
          <wbr />
          生成する
        </a>
      ) : (
        <Link className={worksClassName} href={worksHref}>
          カタログから
          <wbr />
          生成する
        </Link>
      )}
    </nav>
  );
}
