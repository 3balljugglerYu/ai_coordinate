import { ROUTES } from "@/constants";

/**
 * ペルコイン購入ページのURLを生成
 * @param from - 遷移元（戻るボタンの遷移先を制御）
 */
export function getPercoinPurchaseUrl(from?: "coordinate"): string {
  return from
    ? `${ROUTES.MY_PAGE_CREDITS_PURCHASE}?from=${from}`
    : ROUTES.MY_PAGE_CREDITS_PURCHASE;
}
