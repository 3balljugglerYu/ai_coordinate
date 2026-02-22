import { ROUTES } from "@/constants";

/** ペルコイン購入ページへの遷移元（戻るボタンの遷移先を制御） */
export type PercoinPurchaseReferrer = "coordinate";

/**
 * ペルコイン購入ページのURLを生成
 * @param from - 遷移元（戻るボタンの遷移先を制御）
 */
export function getPercoinPurchaseUrl(from?: PercoinPurchaseReferrer): string {
  return from
    ? `${ROUTES.MY_PAGE_CREDITS_PURCHASE}?from=${from}`
    : ROUTES.MY_PAGE_CREDITS_PURCHASE;
}
