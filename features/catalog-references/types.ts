import type { CatalogReferenceTake } from "@/shared/generation/catalog-reference";

/** 上げ終えた見本(id はサーバーが返したもの。画像の場所は持たない) */
export interface CatalogReferenceValue {
  id: string;
  /** 手元のファイルから作った blob の URL(表示だけに使う) */
  previewUrl: string;
  takes: CatalogReferenceTake[];
}

/**
 * 見本を使える人のときだけ、/free のサーバーで確かめて作る画面に渡す値(使えない人には渡さない)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md §10
 */
export interface CatalogReferenceAccess {
  /** 本人の ID(「先行公開」の案内を見た印を、本人ごとに分けて端末に残す) */
  userId: string;
  /** 有効な同意がサーバーにあるか(無いときだけ、見本を選んだ直後に同意の画面を出す) */
  consented: boolean;
  /** 一度でも同意したことがあるか(無いときだけ「先行公開」の案内と「次からは出ません」を出す) */
  consentedBefore: boolean;
}
