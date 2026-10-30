import type { CatalogReferenceTake } from "@/shared/generation/catalog-reference";

/** 上げ終えた見本(id はサーバーが返したもの。画像の場所は持たない) */
export interface CatalogReferenceValue {
  id: string;
  /** 手元のファイルから作った blob の URL(表示だけに使う) */
  previewUrl: string;
  takes: CatalogReferenceTake[];
}
