/**
 * ホーム画面バナーの型定義
 * 表示データはDB（bannersテーブル）から取得
 */

export interface HomeBanner {
  id: string;
  imageUrl: string; // public/ からの相対パス または Supabase Storage URL
  linkUrl: string; // 遷移先URL
  alt: string; // 画像のaltテキスト
}
