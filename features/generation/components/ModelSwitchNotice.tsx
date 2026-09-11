"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { markModelSwitchNoticeSeen } from "@/features/generation/lib/form-preferences";

/**
 * 既定モデルを ChatGPT Images 2.5 へ切り替えたことを、1回だけ知らせるスポットライト。
 *
 * ## なぜ必要か
 *
 * 2.5 を全公開しても、既定が 2.0 のままでは誰も切り替えなかった
 * (公開 3 時間で外部ユーザーの 2.5 利用が 0 件。生成した 4 人は全員 2.0)。
 * ホームのフィード既定化(#517)でも同じことが起きており、そのときと同じく
 * 「既定を変える + 1回だけ案内する」の組み合わせで解く。
 *
 * ## なぜ「OK」だけなのか
 *
 * #517 と同じ理由。「OK / 元に戻す」を並べると**押しやすさそのものが誘導**になり、
 * 何%が本当に戻したいのかが測れなくなる。OK だけにして、戻したい人が自分で
 * セレクターを開く形にすると素直な選好が出る。本文では**戻せる場所を教えるだけ**にする。
 *
 * driver.js は初期バンドルに載せないよう動的 import する
 * (HomeViewSwitchNotice / TutorialTourProvider と同じ作法)。
 */

/** スポットライトを当てる先。GenerationModelControls の data-tour と同じ値。 */
export const MODEL_SELECT_TOUR_TARGET = '[data-tour="tour-model-select"]';

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface ModelSwitchNoticeProps {
  /** 表示する条件が整ったか（呼び出し側が判定して渡す）。 */
  open: boolean;
  /** 閉じたあとに呼ばれる。 */
  onClose: () => void;
}

export function ModelSwitchNotice({ open, onClose }: ModelSwitchNoticeProps) {
  const t = useTranslations("coordinate");

  useEffect(() => {
    if (!open) {
      return;
    }

    let destroyed = false;
    let destroy: (() => void) | null = null;

    const run = async () => {
      /*
        既にモーダルが開いているときは出さない（次回に持ち越す）。
        driver.js のオーバーレイは z-index が極端に高く、開いているダイアログを
        覆って操作できなくする。/style ではチュートリアルやポップアップバナーが
        出ることがあり、「案内が1回遅れる」より「他の導線を潰す」方がはるかに悪い。
      */
      if (document.querySelector('[role="dialog"]')) {
        return;
      }

      // 対象が描画される前に呼ぶと何も指せない。
      // モデル選択を出さないカテゴリでは要素自体が無いので、その場合は出さない。
      const target = document.querySelector<HTMLElement>(
        MODEL_SELECT_TOUR_TARGET
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
        popoverClass: "persta-tour-popover",
        overlayOpacity: 0.6,
        stagePadding: 8,
        stageRadius: 16,
        doneBtnText: t("modelSwitchNoticeConfirm"),
        showButtons: ["next"],
        nextBtnText: t("modelSwitchNoticeConfirm"),
        steps: [
          {
            element: target,
            popover: {
              title: t("modelSwitchNoticeTitle"),
              description: t("modelSwitchNoticeBody"),
            },
          },
        ],
        onDestroyed: () => {
          // 何で閉じられても「案内済み」にする(再訪で出し続けないため)
          markModelSwitchNoticeSeen();
          onClose();
        },
      });

      destroy = () => driverObj.destroy();
      driverObj.drive(0);
    };

    // セレクターの描画を待ってから起動する
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
