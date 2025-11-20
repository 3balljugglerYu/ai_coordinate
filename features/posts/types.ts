/**
 * 投稿機能の型定義
 */

import type { GeneratedImageRecord } from "@/features/generation/lib/database";

export interface PostImageRequest {
  id: string;
  caption?: string;
}

export interface PostImageResponse {
  id: string;
  is_posted: boolean;
  caption: string | null;
  posted_at: string;
}

export interface Post extends GeneratedImageRecord {
  user?: {
    id: string;
    email?: string;
    avatar_url?: string | null;
  } | null;
  like_count?: number;
}
