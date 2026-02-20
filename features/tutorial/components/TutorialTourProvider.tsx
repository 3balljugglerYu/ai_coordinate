"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Driver, DriveStep } from "driver.js";
import { getCurrentUser } from "@/features/auth/lib/auth-client";
import { createClient } from "@/lib/supabase/client";
import { TutorialStartModal } from "./TutorialStartModal";
import { TOUR_STEPS } from "../lib/tour-steps";
import { getTutorialPrompt } from "../lib/constants";
import { TUTORIAL_STORAGE_KEYS } from "../types";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SCROLL_TRANSITION_MS = 450;
const GENERATION_COMPLETE_TRANSITION_DELAY_MS = 2000;

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

export function TutorialTourProvider() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const driverRef = useRef<Driver | null>(null);
  const generationCompleteDelayTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  // チュートリアル開始判定（rerender-dependencies: プリミティブな依存のみ）
  const tutorialReset = searchParams.get("tutorial_reset");
  useEffect(() => {
    let mounted = true;

    const checkAndShowModal = async () => {
      try {
        // ホーム画面以外ではモーダルを非表示
        if (pathname !== "/") {
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
  }, [pathname, tutorialReset]);

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

  const startTourFromHome = async () => {
    setShowModal(false);
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");
      sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.CURRENT_STEP, "0");
    }

    const driver = await loadDriver();

    const steps = [...TOUR_STEPS];
    // Step1: モバイルは下部ナビ、PCはサイドバーのコーディネートをハイライト
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
    // ②のステップ: ボタン非表示、コーディネートタップで遷移
    if (steps[0]?.popover) {
      const originalPopover = steps[0].popover as Record<string, unknown>;
      steps[0] = {
        ...steps[0],
        popover: {
          ...originalPopover,
          showButtons: [],
          onNextClick: (_element: Element | undefined, _step: unknown, options: { driver: Driver }) => {
            router.push("/coordinate");
            options.driver.destroy();
          },
        },
      };
    }

    const driverObj = driver({
      showProgress: true,
      animate: !prefersReducedMotion(),
      allowClose: false,
      prevBtnText: "戻る",
      nextBtnText: "次へ",
      steps,
      onDestroyed: () => {
        driverRef.current = null;
        // ページ遷移で破棄された場合は sessionStorage に残す
      },
    });

    driverRef.current = driverObj;
    driverObj.drive(0);
  };

  const startTourFromCoordinate = async () => {
    if (typeof sessionStorage === "undefined") return;

    const inProgress = sessionStorage.getItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS);
    if (inProgress !== "true") return;

    const driver = await loadDriver();

    // DOM の準備を待つ
    const startFromStep = () => {
      const hasRequiredElements = [
        '[data-tour="tour-image-upload"]',
        '[data-tour="tour-prompt-input"]',
      ].every((sel) => document.querySelector(sel));

      if (!hasRequiredElements) {
        requestAnimationFrame(startFromStep);
        return;
      }

      const baseSteps = [...TOUR_STEPS];
      const lastIndex = baseSteps.length - 1;

      // 生成開始（index 4）までは中断可能
      const INTERRUPTIBLE_UNTIL_INDEX = 4;

      // ③画像アップロード説明のステップでデモ画像を自動セット
      // ④着せ替え内容入力のステップでプロンプトを自動セット（日本時間の現在月を基準）
      let stepsWithCallbacks = baseSteps.map((step, idx) => {
        // 中断可能なステップには「閉じる」ボタンを追加（既存の「戻る」「次へ」は維持）
        let mergedStep = step;
        if (idx <= INTERRUPTIBLE_UNTIL_INDEX && step.popover) {
          const currentButtons =
            (step.popover as { showButtons?: Array<"next" | "previous" | "close"> }).showButtons;
          let newButtons: Array<"next" | "previous" | "close">;
          if (currentButtons === undefined || currentButtons.length === 0) {
            // 指定なし: デフォルトで「戻る」「次へ」+「閉じる」
            newButtons = ["previous", "next", "close"];
          } else {
            // 既存のボタンに「閉じる」を追加
            newButtons = [...currentButtons];
            if (!newButtons.includes("close")) {
              newButtons.push("close");
            }
          }
          mergedStep = {
            ...step,
            popover: {
              ...step.popover,
              showButtons: newButtons,
            },
          };
        }
        if (idx === 1) {
          return {
            ...mergedStep,
            onHighlighted: (element: Element | undefined) => {
              document.dispatchEvent(
                new CustomEvent("tutorial:set-demo-image", { bubbles: true })
              );
              // Step2: 画像アップロード欄を画面中央付近にスクロール
              if (element && element !== document.body) {
                requestAnimationFrame(() => {
                  element.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                    inline: "nearest",
                  });
                });
              }
            },
          };
        }
        if (idx === 2) {
          return {
            ...mergedStep,
            onHighlighted: (element: Element | undefined) => {
              document.dispatchEvent(
                new CustomEvent("tutorial:set-prompt", {
                  bubbles: true,
                  detail: { prompt: getTutorialPrompt() },
                })
              );
              // Step3: 着せ替え内容入力欄を画面中央付近にスクロール（カスタムonHighlightedのためここで実行）
              if (element && element !== document.body) {
                requestAnimationFrame(() => {
                  element.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                    inline: "nearest",
                  });
                });
              }
            },
          };
        }
        if (idx === 3) {
          return {
            ...mergedStep,
            onHighlighted: (element: Element | undefined) => {
              document.dispatchEvent(
                new CustomEvent("tutorial:set-background-change", {
                  bubbles: true,
                  detail: { checked: true },
                })
              );
              // Step4: 背景変更オプションを画面中央付近にスクロール
              if (element && element !== document.body) {
                requestAnimationFrame(() => {
                  element.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                    inline: "nearest",
                  });
                });
              }
            },
          };
        }
        if (idx === 7) {
          return {
            ...mergedStep,
            onHighlighted: (element: Element | undefined) => {
              document.body.setAttribute("data-tour-step-first-image", "true");
              document.dispatchEvent(new CustomEvent("tutorial:step-11-changed"));
              if (element && element !== document.body) {
                requestAnimationFrame(() => {
                  element.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                    inline: "nearest",
                  });
                });
              }
            },
          };
        }
        return mergedStep;
      });

      // 最後のステップで完了時にAPIを呼ぶ（next/done/close いずれでも）
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
            onNextClick: (_el: Element | undefined, _step: unknown, opts: { driver: Driver }) =>
              handleTourComplete(opts),
            onCloseClick: (_el: Element | undefined, _step: unknown, opts: { driver: Driver }) =>
              handleTourComplete(opts),
          },
        };
      }

      const handleTourInterrupt = () => {
        sessionStorage.removeItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS);
        sessionStorage.removeItem(TUTORIAL_STORAGE_KEYS.CURRENT_STEP);
        if (typeof document !== "undefined") {
          document.body.removeAttribute("data-tour-in-progress");
          document.body.removeAttribute("data-tour-transitioning");
          document.body.removeAttribute("data-tour-step-first-image");
          document.dispatchEvent(new CustomEvent("tutorial:step-11-changed"));
          // チュートリアル用の画像・プロンプト等をクリアして画面を初期状態に戻す
          document.dispatchEvent(new CustomEvent("tutorial:clear", { bubbles: true }));
        }
      };

      const driverObj = driver({
        showProgress: true,
        animate: !prefersReducedMotion(),
        allowClose: true,
        prevBtnText: "戻る",
        nextBtnText: "次へ",
        doneBtnText: "完了",
        steps: stepsWithCallbacks,
        onDestroyStarted: (_el, _step, opts) => {
          const idx = opts.driver.getActiveIndex() ?? 0;
          if (idx <= INTERRUPTIBLE_UNTIL_INDEX) {
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
          // Step11以外では投稿/ダウンロード無効化を解除
          const idx = driverRef.current?.getActiveIndex();
          if (idx !== 7) {
            document.body.removeAttribute("data-tour-step-first-image");
            document.dispatchEvent(new CustomEvent("tutorial:step-11-changed"));
          }
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
            document.body.removeAttribute("data-tour-step-first-image");
            document.dispatchEvent(new CustomEvent("tutorial:step-11-changed"));
          }
        },
      });

      driverRef.current = driverObj;
      if (typeof document !== "undefined") {
        document.body.setAttribute("data-tour-in-progress", "true");
      }
      driverObj.drive(1); // ③から開始（index 1）
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

  // コーデスタート押下で1秒後にStep8へ進む（生成中...をハイライト）
  useEffect(() => {
    const handler = () => {
      setTimeout(() => {
        const d = driverRef.current;
        if (!d || d.isLastStep()) return;
        const nextIndex = (d.getActiveIndex() ?? 0) + 1;
        runTransitionFlow(d, nextIndex, () => d.moveNext());
      }, 1000);
    };
    document.addEventListener("tutorial:advance-to-next", handler);
    return () => document.removeEventListener("tutorial:advance-to-next", handler);
  }, []);

  // 生成完了で「完了しました！それではみてみましょう！」へ進む
  useEffect(() => {
    const handler = () => {
      // 同イベントの重複発火時は二重遷移を防ぐ
      if (generationCompleteDelayTimerRef.current) return;
      generationCompleteDelayTimerRef.current = setTimeout(() => {
        generationCompleteDelayTimerRef.current = null;
        const d = driverRef.current;
        if (!d || d.isLastStep()) return;
        const nextIndex = (d.getActiveIndex() ?? 0) + 1;
        runTransitionFlow(d, nextIndex, () => d.moveNext());
      }, GENERATION_COMPLETE_TRANSITION_DELAY_MS);
    };
    document.addEventListener("tutorial:generation-complete", handler);
    return () => {
      document.removeEventListener("tutorial:generation-complete", handler);
      if (generationCompleteDelayTimerRef.current) {
        clearTimeout(generationCompleteDelayTimerRef.current);
        generationCompleteDelayTimerRef.current = null;
      }
    };
  }, []);

  // /coordinate に遷移したらツアー再開
  useEffect(() => {
    if (pathname !== "/coordinate") return;
    if (isChecking) return;

    const timer = setTimeout(() => void startTourFromCoordinate(), 300);
    return () => clearTimeout(timer);
  }, [pathname, isChecking]);

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
