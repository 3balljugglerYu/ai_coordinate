import type { DriveStep } from "driver.js";

export interface TutorialTourCopy {
  navigateTitle: string;
  navigateDescription: string;
  presetTitle: string;
  presetDescription: string;
  characterTitle: string;
  characterDescription: string;
  generateTitle: string;
  generateDescription: string;
  finishedTitle: string;
  finishedDescription: string;
}

/**
 * 新規登録チュートリアル(全5ステップ・ツールチップのみ)のステップ定義。
 *
 * ① ホームでナビの生成入口を案内(タップで /style へ遷移)
 * ②〜④ One-Tap Style のミニツアー(style-tour-*)と同じアンカーを共用
 *       (スタイル選択 → キャラクター写真 → 生成ボタン)
 * ⑤ 締め(「完了」で完了APIを呼び、完了ボーナスを付与)
 *
 * 生成もデモ画像の挿入も行わないため、課金経路には一切影響しない。
 * ①の element はモバイル/PC でナビの実体が異なるため Provider 側で差し替える。
 */
export function getTourSteps(copy: TutorialTourCopy): DriveStep[] {
  return [
    {
      element: '[data-tour="coordinate-nav-mobile"]',
      popover: {
        title: copy.navigateTitle,
        description: copy.navigateDescription,
        side: "top",
        align: "center",
      },
    },
    {
      element: '[data-tour="style-tour-preset"]',
      popover: {
        title: copy.presetTitle,
        description: copy.presetDescription,
        side: "bottom",
        align: "center",
      },
    },
    {
      element: '[data-tour="style-tour-character"]',
      popover: {
        title: copy.characterTitle,
        description: copy.characterDescription,
        side: "top",
        align: "center",
      },
    },
    {
      element: '[data-tour="style-tour-generate"]',
      popover: {
        title: copy.generateTitle,
        description: copy.generateDescription,
        side: "top",
        align: "center",
      },
    },
    {
      popover: {
        title: copy.finishedTitle,
        description: copy.finishedDescription,
        side: "over",
        align: "center",
        showButtons: ["next"],
      },
    },
  ];
}
