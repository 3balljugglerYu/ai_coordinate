/**
 * フリー素材画像管理の型定義
 */

export interface MaterialPageImage {
  id: string;
  page_slug: string;
  image_url: string;
  storage_path: string | null;
  alt: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface MaterialPageImageInsert {
  page_slug: string;
  image_url: string;
  storage_path?: string | null;
  alt: string;
  display_order?: number;
}

export interface MaterialPageImageUpdate {
  image_url?: string;
  storage_path?: string | null;
  alt?: string;
  display_order?: number;
}
