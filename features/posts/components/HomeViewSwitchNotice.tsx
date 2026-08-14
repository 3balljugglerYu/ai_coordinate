"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { markHomeViewSwitchNoticeSeen } from "../lib/home-view-preference";

/**
 * ホームの既定をフィードへ切り替えたことを、1回だけ知らせるスポットライト。
 *
 * ## なぜ「OK」だけなのか
 *
 * 「OK / 元に戻す」を並べると、**押しやすさそのものが誘導**になり、
 * 何%が本当に戻したいのかが測れなくなる。OK だけにして、本当に嫌な人が
 * 自分でトグルを探す形にすると、素直な選好が出る。
 * だから本文では**戻せる場所を教えるだけ**にとどめる。
 *
 * ## なぜスポットライトなのか
 *
 * 黙って表示が変わるのが最も不親切で、しかもトグルは小さく気づかれない。
 * チュートリアルと同じ見せ方で「ここで戻せる」を一度だけ指し示す。
 *
 * driver.js は初期バンドルに載せないよう動的 import する
 * (TutorialTourProvider と同じ作法)。
 */

/** スポットライトを当てる先。HomeViewToggle 側に同じ値を付ける。 */
export const HOME_VIEW_TOGGLE_TOUR_ID = "home-view-toggle";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface HomeViewSwitchNoticeProps {
  /** 表示する条件が整ったか（PostList が判定して渡す）。 */
  open: boolean;
  /** 閉じたあとに呼ばれる。 */
  onClose: () => void;
}

export function HomeViewSwitchNotice({
  open,
  onClose,
}: HomeViewSwitchNoticeProps) {
  const t = useTranslations("posts");

  useEffect(() => {
    if (!open) {
      return;
    }

    let destroyed = false;
    let destroy: (() => void) | null = null;

    const run = async () => {
      // 対象が描画される前に呼ぶと何も指せないので、要素の出現を待つ
      const target = document.querySelector<HTMLElement>(
        `[data-tour-id="${HOME_VIEW_TOGGLE_TOUR_ID}"]`
      );
      if (!target || destroyed) {
        return;
      }

      await import("driver.js/dist/driver.css");
      const { driver } = await import("driver.js");
      if (destroyed) {
        return;
      }

      const driverObj = driver({
        showProgress: false,
        animate: !prefersReducedMotion(),
        allowClose: false,
        // Persta 共通のトーン(globals.css)
        popoverClass: "persta-tour-popover",
        overlayOpacity: 0.6,
        stagePadding: 8,
        stageRadius: 16,
        doneBtnText: t("homeViewSwitchNoticeConfirm"),
        showButtons: ["next"],
        nextBtnText: t("homeViewSwitchNoticeConfirm"),
        steps: [
          {
            element: target,
            popover: {
              title: t("homeViewSwitchNoticeTitle"),
              description: t("homeViewSwitchNoticeBody"),
            },
          },
        ],
        onDestroyed: () => {
          // 何で閉じられても「案内済み」にする(再訪で出し続けないため)
          markHomeViewSwitchNoticeSeen();
          onClose();
        },
      });

      destroy = () => driverObj.destroy();
      driverObj.drive(0);
    };

    // トグルの描画を待ってから起動する
    const timer = window.setTimeout(run, 300);

    return () => {
      destroyed = true;
      window.clearTimeout(timer);
      destroy?.();
    };
    // 起動条件は open のみ。onClose の再生成で作り直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return null;
}
