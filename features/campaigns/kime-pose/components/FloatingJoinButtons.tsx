"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CAMPAIGN_EVENTS, trackCampaignEvent } from "@/features/campaigns/lib/campaign-events";
import { useKimePosePhase } from "../hooks/useKimePosePhase";
import styles from "../kime-pose.module.css";
import { WorksAnchor } from "./WorksAnchor";

/** 企画ページの終わりの目印。ここまで来たら(下はサイト共通の案内)浮いたボタンを消す */
export const KIME_POSE_PAGE_END_ID = "kp-page-end";

/** 応募作品へのボタン(押したら GA4 に送る。ハロウィンの「カタログから生成する」と同じイベント) */
function WorksButton({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  return (
    <WorksAnchor className={className} href={href} onClick={() => trackCampaignEvent(CAMPAIGN_EVENTS.ctaCatalog)}>
      {children}
    </WorksAnchor>
  );
}

/**
 * 参加のボタン。ページのどこにいても押せるよう、画面の下に浮かせて固定する(ハロウィン企画と同じ置き方)。
 * スマホではアプリの下のメニュー(高さ64px)の上に置く。
 *
 * 出すボタンは企画の段階で変える(時刻はブラウザで見る。分かるまでは出さない):
 * - 応募期間: 「カタログをつくる」(CREATE)と「応募作品を見る」
 * - 投票期間: 「作品を見て投票する」だけ(応募は締め切り)
 * - 応募の前・締め切りのあと: 出さない
 * GA4 のイベント名はハロウィン企画と同じもの(企画はページのパスで分ける)。
 *
 * 企画ページの終わりの目印が画面に入ったら消す(その下のサイト共通の案内に重ならないように)。
 */
export function FloatingJoinButtons({ joinHref, worksHref }: { joinHref: string; worksHref: string }) {
  const phase = useKimePosePhase();
  const [isPastPage, setIsPastPage] = useState(false);

  useEffect(() => {
    const end = document.getElementById(KIME_POSE_PAGE_END_ID);
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

  if (phase !== "submit" && phase !== "vote") {
    return null;
  }

  return (
    <nav
      className={`${styles.floatingCta} ${isPastPage ? styles.floatingCtaHidden : ""}`}
      aria-label="企画に参加する"
      aria-hidden={isPastPage ? true : undefined}
      inert={isPastPage}
      data-testid="kime-pose-floating-cta"
      data-phase={phase}
    >
      {phase === "submit" ? (
        <>
          <Link
            className={`${styles.floatingCtaButton} ${styles.floatingCtaMain}`}
            href={joinHref}
            onClick={() => trackCampaignEvent(CAMPAIGN_EVENTS.ctaCreate)}
          >
            カタログを
            <wbr />
            つくる
          </Link>
          <WorksButton className={`${styles.floatingCtaButton} ${styles.floatingCtaSub}`} href={worksHref}>
            応募作品を
            <wbr />
            見る
          </WorksButton>
        </>
      ) : (
        <WorksButton className={`${styles.floatingCtaButton} ${styles.floatingCtaMain}`} href={worksHref}>
          作品を見て
          <wbr />
          投票する
        </WorksButton>
      )}
    </nav>
  );
}
