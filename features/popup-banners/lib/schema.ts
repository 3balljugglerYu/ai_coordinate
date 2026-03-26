import { z } from "zod";

export const POPUP_BANNER_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

export const POPUP_BANNER_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const POPUP_BANNER_STATUS_VALUES = ["draft", "published"] as const;
export const POPUP_BANNER_ACTION_VALUES = [
  "impression",
  "click",
  "close",
  "dismiss_forever",
] as const;

export type PopupBannerStatus = (typeof POPUP_BANNER_STATUS_VALUES)[number];
export type PopupBannerActionType = (typeof POPUP_BANNER_ACTION_VALUES)[number];

export const popupBannerStatusSchema = z.enum(POPUP_BANNER_STATUS_VALUES);
export const popupBannerActionSchema = z.enum(POPUP_BANNER_ACTION_VALUES);

export const popupBannerReorderSchema = z.object({
  order: z.array(z.string().uuid()).min(1),
});

export const popupBannerInteractSchema = z.object({
  banner_id: z.string().uuid(),
  action_type: popupBannerActionSchema,
});

export interface PopupBanner {
  id: string;
  image_url: string;
  storage_path: string | null;
  link_url: string | null;
  alt: string;
  show_once_only: boolean;
  display_start_at: string | null;
  display_end_at: string | null;
  display_order: number;
  status: PopupBannerStatus;
  created_at: string;
  updated_at: string;
}

export interface PopupBannerInsert {
  id?: string;
  image_url: string;
  storage_path?: string | null;
  link_url?: string | null;
  alt: string;
  show_once_only?: boolean;
  display_start_at?: string | null;
  display_end_at?: string | null;
  display_order?: number;
  status?: PopupBannerStatus;
}

export interface PopupBannerUpdate {
  image_url?: string;
  storage_path?: string | null;
  link_url?: string | null;
  alt?: string;
  show_once_only?: boolean;
  display_start_at?: string | null;
  display_end_at?: string | null;
  display_order?: number;
  status?: PopupBannerStatus;
}

export interface ActivePopupBanner {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  alt: string;
  showOnceOnly: boolean;
  displayOrder: number;
}

export interface PopupBannerViewRecord {
  popup_banner_id: string;
  action_type: PopupBannerActionType;
  permanently_dismissed: boolean;
  reshow_after: string | null;
  updated_at: string;
}

export interface PopupBannerHistoryEntry {
  actionType: PopupBannerActionType;
  permanentlyDismissed: boolean;
  reshowAfter: string | null;
  updatedAt?: string | null;
}

export type PopupBannerHistoryMap = Record<string, PopupBannerHistoryEntry>;

export interface PopupBannerAnalyticsRow {
  event_date: string;
  event_type: PopupBannerActionType;
  count: number;
}

export interface PopupBannerAnalyticsPoint {
  bucket: string;
  label: string;
  impression: number;
  click: number;
  close: number;
  dismiss_forever: number;
}
