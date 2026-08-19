import { revalidatePath, revalidateTag } from "next/cache";

/**
 * スタイルプリセット・カテゴリの公開状態に依存するキャッシュのタグ。
 *
 * 文字列で散らばると、失効させる側と付ける側がずれても気づけない
 * (フィードの引用カードだけ古い slug を持ち続ける、など)。
 */
export const STYLE_PRESETS_CACHE_TAG = "style-presets";

export function revalidateStylePresets() {
  revalidateTag(STYLE_PRESETS_CACHE_TAG, "max");
  revalidatePath("/style");
  revalidatePath("/admin/style-presets");
}
