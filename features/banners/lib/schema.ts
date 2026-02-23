/**
 * バナー管理の型定義
 */

export type BannerStatus = "draft" | "published";

export interface Banner {
  id: string;
  image_url: string;
  storage_path: string | null;
  link_url: string;
  alt: string;
  display_start_at: string | null;
  display_end_at: string | null;
  display_order: number;
  status: BannerStatus;
  tags?: string[]; // マイグレーション適用前は未定義の可能性あり
  created_at: string;
  updated_at: string;
}

export interface BannerInsert {
  image_url: string;
  storage_path?: string | null;
  link_url: string;
  alt: string;
  display_start_at?: string | null;
  display_end_at?: string | null;
  display_order?: number;
  status?: BannerStatus;
  tags?: string[];
}

export interface BannerUpdate {
  image_url?: string;
  storage_path?: string | null;
  link_url?: string;
  alt?: string;
  display_start_at?: string | null;
  display_end_at?: string | null;
  display_order?: number;
  status?: BannerStatus;
  tags?: string[];
}

/**
 * ホーム画面表示用のバナー型（HomeBannerCard と互換）
 */
export interface HomeBanner {
  id: string;
  imageUrl: string;
  linkUrl: string;
  alt: string;
}
