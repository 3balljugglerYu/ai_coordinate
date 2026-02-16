/**
 * チュートリアル用の定数
 */

export const TUTORIAL_DEMO_IMAGE_PATH = "/tutorial-demo.jpg";

/** 日本時間の現在月を取得 */
function getJapanMonth(): number {
  const japanDate = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
  return japanDate.getMonth() + 1; // 1-12
}

/** 日本時間の現在月を基準にしたチュートリアル用プロンプトを生成 */
export function getTutorialPrompt(): string {
  const month = getJapanMonth();
  return `日本の${month}月の季節に合う素敵な服装にしてください。`;
}

export const TUTORIAL_BONUS_AMOUNT = 20;
