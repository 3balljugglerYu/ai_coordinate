/**
 * チュートリアル用の定数
 */

export const TUTORIAL_DEMO_IMAGE_PATH = "/tutorial-demo.jpg";

/** 日本時間の現在月を取得 */
export function getJapanMonth(): number {
  const japanDate = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
  return japanDate.getMonth() + 1; // 1-12
}

export const TUTORIAL_BONUS_AMOUNT = 20;
