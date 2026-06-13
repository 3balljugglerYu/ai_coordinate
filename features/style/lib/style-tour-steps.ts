import type { DriveStep } from "driver.js";

export interface StyleTourCopy {
  presetTitle: string;
  presetDescription: string;
  characterTitle: string;
  characterDescription: string;
  generateTitle: string;
  generateDescription: string;
}

/**
 * /style（One-Tap Style）画面のチュートリアルステップ定義。
 * 新規ユーザー向けチュートリアル（features/tutorial）とは独立しており、
 * タイトル横の「チュートリアル」ボタンから何度でも起動できる。
 */
export function getStyleTourSteps(copy: StyleTourCopy): DriveStep[] {
  return [
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
  ];
}
