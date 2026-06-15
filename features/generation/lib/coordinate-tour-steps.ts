import type { DriveStep } from "driver.js";

export interface CoordinateTourCopy {
  uploadTitle: string;
  uploadDescription: string;
  promptTitle: string;
  promptDescription: string;
  generateTitle: string;
  generateDescription: string;
}

/**
 * /coordinate(コーディネート)画面の簡易チュートリアル(3ステップ)。
 * One-Tap Style の StyleTourButton と同じ「タイトル下から起動する画面内ツアー」で、
 * 既存の data-tour 属性(アップロード→プロンプト→生成)を参照する。
 * 文言は tutorial ネームスペースの既存キーを流用する。
 */
export function getCoordinateTourSteps(copy: CoordinateTourCopy): DriveStep[] {
  return [
    {
      element: '[data-tour="tour-image-upload"]',
      popover: {
        title: copy.uploadTitle,
        description: copy.uploadDescription,
        side: "bottom",
        align: "center",
      },
    },
    {
      element: '[data-tour="tour-prompt-input"]',
      popover: {
        title: copy.promptTitle,
        description: copy.promptDescription,
        side: "top",
        align: "center",
      },
    },
    {
      element: '[data-tour="tour-generate-btn"]',
      popover: {
        title: copy.generateTitle,
        description: copy.generateDescription,
        side: "top",
        align: "center",
      },
    },
  ];
}
