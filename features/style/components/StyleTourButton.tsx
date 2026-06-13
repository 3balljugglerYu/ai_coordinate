"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Driver, DriveStep } from "driver.js";
import { Button } from "@/components/ui/button";
import { getStyleTourSteps } from "../lib/style-tour-steps";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SCROLL_TRANSITION_MS = 450;

/** driver.js はツアー開始時のみ遅延読み込み（bundle-dynamic-imports） */
async function loadDriver() {
  await import("driver.js/dist/driver.css");
  const { driver } = await import("driver.js");
  return driver;
}

/** ステップ定義から要素を解決 */
function resolveStepElement(step: DriveStep | undefined): Element | null {
  if (!step?.element) return null;
  const el =
    typeof step.element === "string"
      ? document.querySelector(step.element)
      : typeof step.element === "function"
        ? (step.element as () => Element)()
        : step.element;
  return el instanceof Element ? el : null;
}

/**
 * ハイライト非表示 → スクロール → ハイライト再表示の遷移フロー。
 * スクロール中にポップオーバーが対象から離れて見えるのを防ぐ
 * （TutorialTourProvider と同じパターン。body[data-tour-transitioning] の
 * スタイルは globals.css で共有）。
 */
function runTransitionFlow(
  driverObj: Driver,
  targetIndex: number,
  onComplete: () => void,
  isActive?: () => boolean
) {
  const steps = driverObj.getConfig().steps ?? [];
  const targetEl = resolveStepElement(steps[targetIndex]);

  document.body.setAttribute("data-tour-transitioning", "true");

  if (targetEl) {
    targetEl.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
  }

  setTimeout(() => {
    document.body.removeAttribute("data-tour-transitioning");
    // タイマー待機中にアンマウント・破棄された場合は、破棄済み driver への
    // moveNext / movePrevious 呼び出しを避ける
    if (isActive && !isActive()) return;
    onComplete();
  }, SCROLL_TRANSITION_MS);
}

/**
 * /style（One-Tap Style）画面のチュートリアル起動ボタン。
 * 新規ユーザー向けチュートリアル（TutorialTourProvider）とは独立した
 * 3ステップの画面内ツアーを起動する。コイン付与や完了状態の保存はない。
 */
export function StyleTourButton() {
  const t = useTranslations("style");
  const driverRef = useRef<Driver | null>(null);
  const isInitializingRef = useRef(false);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, []);

  const startTour = async () => {
    // 連打や多重起動を防ぐ（既にツアー中、または driver.js の遅延読み込み中なら何もしない）
    if (driverRef.current || isInitializingRef.current) return;

    isInitializingRef.current = true;
    try {
      const driver = await loadDriver();
      if (driverRef.current) return;

      const driverObj = driver({
        showProgress: true,
        progressText: "{{current}} / {{total}}",
        animate: !prefersReducedMotion(),
        allowClose: true,
        // ハイライト中の要素もタップ不可にして、説明中の押し間違いを防ぐ
        disableActiveInteraction: true,
        overlayOpacity: 0.6,
        stagePadding: 8,
        stageRadius: 16,
        popoverClass: "style-tour-popover",
        prevBtnText: t("tourPrevButton"),
        nextBtnText: t("tourNextButton"),
        doneBtnText: t("tourDoneButton"),
        steps: getStyleTourSteps({
          presetTitle: t("tourStepPresetTitle"),
          presetDescription: t("tourStepPresetDescription"),
          characterTitle: t("tourStepCharacterTitle"),
          characterDescription: t("tourStepCharacterDescription"),
          generateTitle: t("tourStepGenerateTitle"),
          generateDescription: t("tourStepGenerateDescription"),
        }),
        onNextClick: (_el, _step, opts) => {
          const d = opts.driver;
          if (d.isLastStep()) {
            // 最終ステップの「さっそく試す！」: 閉じたあと、すぐ操作を始められる
            // ようスタイル選択セクションまでスクロールして戻す
            d.destroy();
            requestAnimationFrame(() => {
              const presetSection = document.querySelector(
                '[data-tour="style-tour-preset"]'
              );
              if (!presetSection) return;
              // スティッキーヘッダー（約57px）に「スタイル選択」見出しが
              // 隠れないよう、ヘッダー分のマージンを引いてスクロールする
              const STICKY_HEADER_OFFSET = 72;
              const top =
                presetSection.getBoundingClientRect().top +
                window.scrollY -
                STICKY_HEADER_OFFSET;
              window.scrollTo({
                top: Math.max(top, 0),
                behavior: prefersReducedMotion() ? "auto" : "smooth",
              });
            });
            return;
          }
          const nextIndex = (d.getActiveIndex() ?? 0) + 1;
          runTransitionFlow(
            d,
            nextIndex,
            () => d.moveNext(),
            () => driverRef.current === d
          );
        },
        onPrevClick: (_el, _step, opts) => {
          const d = opts.driver;
          if (d.isFirstStep()) return;
          const prevIndex = (d.getActiveIndex() ?? 0) - 1;
          runTransitionFlow(
            d,
            prevIndex,
            () => d.movePrevious(),
            () => driverRef.current === d
          );
        },
        onHighlighted: (element) => {
          // 初回表示時: ハイライト要素を画面中央付近に寄せる（既存チュートリアルと同じ挙動）
          if (element && element !== document.body) {
            requestAnimationFrame(() => {
              element.scrollIntoView({
                behavior: prefersReducedMotion() ? "auto" : "smooth",
                block: "center",
                inline: "nearest",
              });
            });
          }
        },
        onDestroyed: () => {
          document.body.removeAttribute("data-tour-transitioning");
          driverRef.current = null;
        },
      });

      driverRef.current = driverObj;
      driverObj.drive(0);
    } catch (error) {
      console.error("Failed to start style tour:", error);
    } finally {
      isInitializingRef.current = false;
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void startTour();
      }}
      className="h-8 shrink-0 gap-1.5 rounded-full border-transparent bg-gradient-to-r from-pink-500 to-orange-400 px-3 text-xs font-semibold text-white shadow-sm transition hover:from-pink-600 hover:to-orange-500 hover:text-white"
      aria-label={t("tourButtonAriaLabel")}
      data-testid="style-tour-button"
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{t("tourButton")}</span>
    </Button>
  );
}
