import type { ReportCategoryId, ReportSubcategoryId } from "@/constants/report-taxonomy";

export type ModerationStatus = "visible" | "pending" | "removed";

export interface ReportPostRequest {
  postId: string;
  categoryId: ReportCategoryId;
  subcategoryId: ReportSubcategoryId;
  details?: string;
}

export interface ReportPostResponse {
  reportId: string;
  postModerationStatus: ModerationStatus;
  isHiddenForReporter: boolean;
}

export interface ModerationQueueItem {
  id: string;
  user_id: string | null;
  image_url: string;
  caption: string | null;
  moderation_status: ModerationStatus;
  moderation_reason: string | null;
  posted_at: string | null;
  created_at: string;
  report_count: number;
  weighted_report_score: number;
  latest_reported_at: string | null;
}

export interface BlockStatusResponse {
  isBlocked: boolean;
  isBlockedBy: boolean;
}
