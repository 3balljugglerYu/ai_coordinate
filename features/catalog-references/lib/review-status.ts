import type { CatalogReviewReasonCategory } from "./review-reasons";

export const REVIEW_STATUSES = ["not_submitted", "pending", "approved", "rejected"] as const;
export type CatalogReviewStatus = (typeof REVIEW_STATUSES)[number];
export interface OwnCatalogReview {
  imageId: string;
  status: CatalogReviewStatus;
  reasonCategory: CatalogReviewReasonCategory | null;
  reason: string | null;
  updatedAt: string;
  imageUrl: string | null;
  isPosted: boolean;
  available: boolean;
}
export const REVIEW_STATUS_PATH = "/my-page/catalog-reviews";
export function reviewStatusHref(imageId: string): string {
  return `${REVIEW_STATUS_PATH}?image=${encodeURIComponent(imageId)}`;
}

/** 審査変更後、本人の初期画像一覧にも最新の状態を載せるためのタグ。 */
export const CATALOG_REVIEW_IMAGES_TAG = "my-page-catalog-review-images";
