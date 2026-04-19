import { z } from "zod";

export const ANNOUNCEMENT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

export const ANNOUNCEMENT_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const ANNOUNCEMENT_STATUS_VALUES = ["draft", "published"] as const;
export const ANNOUNCEMENT_SURFACE_VALUES = ["page", "tab"] as const;
export const ANNOUNCEMENT_FONT_SIZE_VALUES = [
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "28px",
  "32px",
] as const;

export type AnnouncementStatus =
  (typeof ANNOUNCEMENT_STATUS_VALUES)[number];
export type AnnouncementSeenSurface =
  (typeof ANNOUNCEMENT_SURFACE_VALUES)[number];
export type AnnouncementFontSize =
  (typeof ANNOUNCEMENT_FONT_SIZE_VALUES)[number];

export const announcementStatusSchema = z.enum(ANNOUNCEMENT_STATUS_VALUES);
export const announcementSeenSurfaceSchema = z.enum(
  ANNOUNCEMENT_SURFACE_VALUES
);

export const announcementAdminSaveSchema = z.object({
  title: z.string().trim().min(1).max(120),
  status: announcementStatusSchema,
  publishAt: z.string().datetime().nullable().optional(),
  bodyJson: z.unknown(),
});

export const announcementSeenRequestSchema = z.object({
  surface: announcementSeenSurfaceSchema,
});

export interface AnnouncementAdmin {
  id: string;
  title: string;
  bodyJson: unknown;
  bodyText: string;
  assetPaths: string[];
  status: AnnouncementStatus;
  publishAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementAdminView extends AnnouncementAdmin {
  publishAtDisplay: string;
  displayStatusLabel: string;
  displayStatusClassName: string;
}

export interface AnnouncementSummary {
  id: string;
  title: string;
  publishAt: string;
  isRead: boolean;
  readAt: string | null;
}

export interface AnnouncementSummaryView extends AnnouncementSummary {
  publishAtLabel: string;
}

export interface AnnouncementDetail extends AnnouncementSummary {
  bodyJson: unknown;
  bodyText: string;
}

export interface AnnouncementDetailView extends AnnouncementDetail {
  publishedAtLabel: string;
}

export interface AnnouncementUnreadState {
  hasPageDot: boolean;
  hasTabDot: boolean;
  latestPublishedAt: string | null;
}

export interface AnnouncementImageUploadResult {
  publicUrl: string;
  storagePath: string;
  width: number;
  height: number;
}

export type AnnouncementAdminSaveInput = z.infer<
  typeof announcementAdminSaveSchema
>;
