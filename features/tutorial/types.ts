/**
 * チュートリアル機能の型定義
 */

export interface TutorialState {
  isActive: boolean;
  currentStep: number;
  isModalOpen: boolean;
}

export const TUTORIAL_STORAGE_KEYS = {
  CURRENT_STEP: "tutorial_current_step",
  IN_PROGRESS: "tutorial_in_progress",
  /** 「いいえ」選択時にセット。ミッション画面のボタンクリックまでモーダルを非表示にする */
  DECLINED: "tutorial_declined",
} as const;
