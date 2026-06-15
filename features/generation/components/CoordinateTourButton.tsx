"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Driver, DriveStep } from "driver.js";
import { Button } from "@/components/ui/button";
import { getCoordinateTourSteps } from "../lib/coordinate-tour-steps";

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
 * （StyleTourButton / TutorialTourProvider と同じパターン。
 *   body[data-tour-transitioning] のスタイルは globals.css で共有）
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
    if (isActive && !isActive()) return;
    onComplete();
  }, SCROLL_TRANSITION_MS);
}

/**
 * /coordinate（コーディネート）画面の簡易チュートリアル起動ボタン。
 * One-Tap Style の StyleTourButton と同型で、新規ユーザー向けチュートリアル
 * （TutorialTourProvider）とは独立した 3 ステップの画面内ツアーを起動する。
 * コイン付与や完了状態の保存はない。文言は tutorial ネームスペースを流用。
 */
export function CoordinateTourButton() {
  const t = useTranslations("tutorial");
  const coordinateT = useTranslations("coordinate");
  const driverRef = useRef<Driver | null>(null);
  const isInitializingRef = useRef(false);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, []);

  const startTour = async () => {
    // 連打や多重起動を防ぐ
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
        disableActiveInteraction: true,
        overlayOpacity: 0.6,
        stagePadding: 8,
        stageRadius: 16,
        popoverClass: "persta-tour-popover",
        prevBtnText: t("prevButton"),
        nextBtnText: t("nextButton"),
        doneBtnText: t("doneButton"),
        steps: getCoordinateTourSteps({
          // タイトルと操作ボタンは tutorial の既存キーを流用。説明文は
          // 新規ユーザー向け(体験用画像/プロンプトのセット、コイン返却)を
          // 前提としており簡易ツアーには不正確なため、coordinate 専用の
          // 説明文に差し替える。
          uploadTitle: t("stepUploadTitle"),
          uploadDescription: coordinateT("tourStepUploadDescription"),
          promptTitle: t("stepPromptTitle"),
          promptDescription: coordinateT("tourStepPromptDescription"),
          generateTitle: t("stepGenerateTitle"),
          generateDescription: coordinateT("tourStepGenerateDescription"),
        }),
        onNextClick: (_el, _step, opts) => {
          const d = opts.driver;
          if (d.isLastStep()) {
            // 完了時: 閉じたあと、すぐ操作を始められるよう最初の対象
            // (画像アップロード)まで上にスクロールして戻す（StyleTourButton と同じ）
            d.destroy();
            requestAnimationFrame(() => {
              const uploadSection = document.querySelector(
                '[data-tour="tour-image-upload"]'
              );
              if (!uploadSection) return;
              const STICKY_HEADER_OFFSET = 72;
              const top =
                uploadSection.getBoundingClientRect().top +
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
      console.error("Failed to start coordinate tour:", error);
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
      data-testid="coordinate-tour-button"
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{coordinateT("tourButton")}</span>
    </Button>
  );
}
