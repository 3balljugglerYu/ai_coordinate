"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Driver, DriveStep } from "driver.js";
import { getCurrentUser } from "@/features/auth/lib/auth-client";
import { createClient } from "@/lib/supabase/client";
import { TutorialStartModal } from "./TutorialStartModal";
import { getTourSteps, type TutorialTourCopy } from "../lib/tour-steps";
import { TUTORIAL_STORAGE_KEYS } from "../types";
import { TUTORIAL_TOUR_ENTRY_PATH } from "../lib/tutorial-status";
import { stripLocalePrefix } from "@/i18n/config";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SCROLL_TRANSITION_MS = 450;

/** driver.js をチュートリアル開始時のみ遅延読み込み（bundle-dynamic-imports） */
async function loadDriver() {
  await import("driver.js/dist/driver.css");
  const { driver } = await import("driver.js");
  return driver;
}

/** ステップ定義から要素を解決 */
function resolveStepElement(step: DriveStep | undefined): Element | null {
  if (!step?.element) return null;
  const el =
    typeof step.element === "function"
      ? (step.element as () => Element)()
      : typeof step.element === "string"
        ? document.querySelector(step.element)
        : step.element;
  return el instanceof Element ? el : null;
}

/** ハイライト非表示 → スクロール → ハイライト再表示の遷移フロー */
function runTransitionFlow(
  driverObj: Driver,
  targetIndex: number,
  onComplete: () => void
) {
  const steps = driverObj.getConfig().steps ?? [];
  const targetStep = steps[targetIndex];
  const targetEl = resolveStepElement(targetStep);
  const isDummy = targetEl?.id === "driver-dummy-element";

  document.body.setAttribute("data-tour-transitioning", "true");

  if (targetEl && !isDummy) {
    targetEl.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
  }

  setTimeout(() => {
    document.body.removeAttribute("data-tour-transitioning");
    onComplete();
  }, SCROLL_TRANSITION_MS);
}

/**
 * 新規登録チュートリアル(全5ステップ・ツールチップのみ)のオーケストレーター。
 *
 * ホームで開始モーダル → ①ナビ入口を案内 → タップで /style へ遷移
 * (NavigationBar/AppSidebar 側がツアー進行中は直近モード復帰を止めて /style
 * に固定する) → ②〜④は One-Tap Style のミニツアーと同じアンカー →
 * ⑤締めの「完了」で /api/tutorial/complete を呼び、完了ボーナスを付与する。
 * 生成・デモ画像挿入は行わない(課金経路に影響しない)。
 */
export function TutorialTourProvider() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("tutorial");
  const styleT = useTranslations("style");
  const [showModal, setShowModal] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const driverRef = useRef<Driver | null>(null);
  const styleTourStartedRef = useRef(false);
  const normalizedPath = pathname ? stripLocalePrefix(pathname).pathname : "/";

  // チュートリアル開始判定（rerender-dependencies: プリミティブな依存のみ）
  const tutorialReset = searchParams.get("tutorial_reset");
  useEffect(() => {
    let mounted = true;

    const checkAndShowModal = async () => {
      try {
        // ホーム画面以外ではモーダルを非表示
        if (normalizedPath !== "/") {
          setShowModal(false);
          setIsChecking(false);
          return;
        }

        const user = await getCurrentUser();
        if (!mounted || !user) {
          setIsChecking(false);
          return;
        }

        const completed = user.user_metadata?.tutorial_completed === true;
        const forceReset = tutorialReset === "1";
        const declined =
          typeof localStorage !== "undefined" &&
          localStorage.getItem(TUTORIAL_STORAGE_KEYS.DECLINED) === "true";
        if (completed && !forceReset) {
          setShowModal(false);
          setIsChecking(false);
          return;
        }
        if (declined && !forceReset) {
          setShowModal(false);
          setIsChecking(false);
          return;
        }

        setShowModal(true);
      } catch {
        // エラー時はモーダルを表示しない
      } finally {
        if (mounted) setIsChecking(false);
      }
    };

    void checkAndShowModal();
    return () => {
      mounted = false;
    };
  }, [normalizedPath, tutorialReset]);

  const markTutorialCompleted = async () => {
    const supabase = createClient();
    await supabase.auth.updateUser({
      data: { tutorial_completed: true },
    });
  };

  const handleDecline = () => {
    setShowModal(false);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(TUTORIAL_STORAGE_KEYS.DECLINED, "true");
    }
    // スキップ扱い：tutorial_completed は更新しない（後からミッション画面のボタンで再開可能）
  };

  const buildTourCopy = (): TutorialTourCopy => ({
    navigateTitle: t("stepNavigateTitle"),
    navigateDescription: t("stepNavigateDescription"),
    // ②〜④は /style ミニツアー(StyleTourButton)と同じ文言を共用する
    presetTitle: styleT("tourStepPresetTitle"),
    presetDescription: styleT("tourStepPresetDescription"),
    characterTitle: styleT("tourStepCharacterTitle"),
    characterDescription: styleT("tourStepCharacterDescription"),
    generateTitle: styleT("tourStepGenerateTitle"),
    generateDescription: styleT("tourStepGenerateDescription"),
    finishedTitle: t("stepFinishedTitle"),
    finishedDescription: t("stepFinishedDescription"),
  });

  const startTourFromHome = async () => {
    setShowModal(false);
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");
      sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.CURRENT_STEP, "0");
    }

    const tourSteps = getTourSteps(buildTourCopy());
    const driver = await loadDriver();

    const steps = [...tourSteps];
    // Step1: モバイルは下部ナビ、PCはサイドバーの生成入口をハイライト
    const isMobileOrTablet =
      typeof window !== "undefined" && window.innerWidth < 1024;
    steps[0] = {
      ...steps[0],
      element: () => {
        const el = isMobileOrTablet
          ? document.querySelector('[data-tour="coordinate-nav-mobile"]')
          : document.querySelector('[data-tour="coordinate-nav-desktop"]');
        return (el ?? document.body) as Element;
      },
    };
    // ①のステップ: ボタン非表示、入口ボタンのタップで /style へ遷移
    if (steps[0]?.popover) {
      const originalPopover = steps[0].popover as Record<string, unknown>;
      steps[0] = {
        ...steps[0],
        popover: {
          ...originalPopover,
          showButtons: [],
          onNextClick: (
            _element: Element | undefined,
            _step: unknown,
            options: { driver: Driver }
          ) => {
            router.push(TUTORIAL_TOUR_ENTRY_PATH);
            options.driver.destroy();
          },
        },
      };
    }

    const driverObj = driver({
      showProgress: true,
      animate: !prefersReducedMotion(),
      allowClose: false,
      // Persta 共通のポップなトーン（/style と統一。globals.css 参照）
      popoverClass: "persta-tour-popover",
      overlayOpacity: 0.6,
      stagePadding: 8,
      stageRadius: 16,
      prevBtnText: t("prevButton"),
      nextBtnText: t("nextButton"),
      steps,
      onDestroyed: () => {
        driverRef.current = null;
        // ページ遷移で破棄された場合は sessionStorage に残す
      },
    });

    driverRef.current = driverObj;
    driverObj.drive(0);
  };

  const startTourFromStyle = async () => {
    if (typeof sessionStorage === "undefined") return;

    const inProgress = sessionStorage.getItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS);
    if (inProgress !== "true") return;

    const driver = await loadDriver();
    const tourSteps = getTourSteps(buildTourCopy());

    // DOM の準備を待つ(②〜④のアンカーは /style ページ側に実装済み)
    const startFromStep = () => {
      const hasRequiredElements = [
        '[data-tour="style-tour-preset"]',
        '[data-tour="style-tour-character"]',
        '[data-tour="style-tour-generate"]',
      ].every((sel) => document.querySelector(sel));

      if (!hasRequiredElements) {
        requestAnimationFrame(startFromStep);
        return;
      }

      const baseSteps = [...tourSteps];
      const lastIndex = baseSteps.length - 1;

      // ②〜④(締めの手前まで)は「閉じる」で中断できるようにする
      let stepsWithCallbacks = baseSteps.map((step, idx) => {
        if (idx === 0 || idx === lastIndex || !step.popover) return step;
        const currentButtons = (
          step.popover as {
            showButtons?: Array<"next" | "previous" | "close">;
          }
        ).showButtons;
        const newButtons: Array<"next" | "previous" | "close"> =
          currentButtons === undefined || currentButtons.length === 0
            ? ["previous", "next", "close"]
            : currentButtons.includes("close")
              ? [...currentButtons]
              : [...currentButtons, "close"];
        return {
          ...step,
          popover: {
            ...step.popover,
            showButtons: newButtons,
          },
        };
      });

      // 締めのステップ: 「完了」で完了APIを呼ぶ(付与は冪等)
      const lastStep = stepsWithCallbacks[lastIndex];
      const handleTourComplete = (opts: { driver: Driver }) => {
        document.body.setAttribute("data-tour-transitioning", "true");
        setTimeout(() => {
          document.body.removeAttribute("data-tour-transitioning");
          sessionStorage.removeItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS);
          sessionStorage.removeItem(TUTORIAL_STORAGE_KEYS.CURRENT_STEP);
          void completeTutorial();
          opts.driver.destroy();
        }, 100);
      };
      if (lastStep?.popover) {
        const orig = lastStep.popover as Record<string, unknown>;
        stepsWithCallbacks = [...stepsWithCallbacks];
        stepsWithCallbacks[lastIndex] = {
          ...lastStep,
          popover: {
            ...orig,
            onNextClick: (
              _el: Element | undefined,
              _step: unknown,
              opts: { driver: Driver }
            ) => handleTourComplete(opts),
            onCloseClick: (
              _el: Element | undefined,
              _step: unknown,
              opts: { driver: Driver }
            ) => handleTourComplete(opts),
          },
        };
      }

      const handleTourInterrupt = () => {
        sessionStorage.removeItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS);
        sessionStorage.removeItem(TUTORIAL_STORAGE_KEYS.CURRENT_STEP);
        if (typeof document !== "undefined") {
          document.body.removeAttribute("data-tour-in-progress");
          document.body.removeAttribute("data-tour-transitioning");
        }
      };

      const driverObj = driver({
        showProgress: true,
        animate: !prefersReducedMotion(),
        allowClose: true,
        // ツールチップのみのツアーのため、ハイライト中の要素も操作不可にする。
        // スタイル選択・写真設定・生成ボタンをツアー中に触れると、意図しない
        // 生成(コイン消費)が起きうる(①のナビタップだけは遷移手段なので、
        // ホーム側のドライバーでは操作可能のまま)。
        disableActiveInteraction: true,
        // Persta 共通のポップなトーン（/style と統一。globals.css 参照）
        popoverClass: "persta-tour-popover",
        overlayOpacity: 0.6,
        stagePadding: 8,
        stageRadius: 16,
        prevBtnText: t("prevButton"),
        nextBtnText: t("nextButton"),
        doneBtnText: t("doneButton"),
        steps: stepsWithCallbacks,
        onDestroyStarted: (_el, _step, opts) => {
          const idx = opts.driver.getActiveIndex() ?? 0;
          if (idx < lastIndex) {
            handleTourInterrupt();
            opts.driver.destroy();
          }
        },
        onNextClick: (_el, _step, opts) => {
          const d = opts.driver;
          if (d.isLastStep()) return;
          const nextIndex = (d.getActiveIndex() ?? 0) + 1;
          runTransitionFlow(d, nextIndex, () => d.moveNext());
        },
        onPrevClick: (_el, _step, opts) => {
          const d = opts.driver;
          if (d.isFirstStep()) return;
          const prevIndex = (d.getActiveIndex() ?? 0) - 1;
          runTransitionFlow(d, prevIndex, () => d.movePrevious());
        },
        onHighlighted: (element) => {
          // 初回表示時: ハイライト要素を画面中央付近にスクロール
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
          driverRef.current = null;
          if (typeof document !== "undefined") {
            document.body.removeAttribute("data-tour-in-progress");
            document.body.removeAttribute("data-tour-transitioning");
          }
        },
      });

      driverRef.current = driverObj;
      if (typeof document !== "undefined") {
        document.body.setAttribute("data-tour-in-progress", "true");
      }
      driverObj.drive(1); // ②から開始（index 1）
    };

    requestAnimationFrame(startFromStep);
  };

  const handleConfirm = () => {
    void startTourFromHome();
  };

  const completeTutorial = async () => {
    try {
      const res = await fetch("/api/tutorial/complete", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        await markTutorialCompleted();
        // ペルコイン残高の即時反映
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        console.error("[Tutorial] Complete failed:", res.status, data);
      }
    } catch (err) {
      console.error("[Tutorial] Failed to complete:", err);
    }
  };

  // /style に遷移したらツアー再開
  useEffect(() => {
    if (normalizedPath !== TUTORIAL_TOUR_ENTRY_PATH) {
      styleTourStartedRef.current = false;
      return;
    }
    if (isChecking) return;
    if (styleTourStartedRef.current) return;

    styleTourStartedRef.current = true;
    let cancelled = false;

    if (driverRef.current) {
      driverRef.current.destroy();
    }

    const resumeTourWhenReady = () => {
      if (cancelled) return;

      if (driverRef.current) {
        window.setTimeout(resumeTourWhenReady, 100);
        return;
      }

      void startTourFromStyle();
    };

    const timer = window.setTimeout(resumeTourWhenReady, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isChecking, normalizedPath]);

  if (isChecking) return null;

  return (
    <>
      <TutorialStartModal
        open={showModal}
        onConfirm={handleConfirm}
        onDecline={handleDecline}
      />
    </>
  );
}
