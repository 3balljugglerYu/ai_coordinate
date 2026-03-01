-- ===============================================
-- Likes and Comments Migration
-- いいね・コメント機能のテーブルと閲覧数カラムの実装
-- ===============================================

-- likes テーブル
-- 役割: 投稿に対するいいね情報を管理
CREATE TABLE IF NOT EXISTS public.likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  image_id UUID REFERENCES public.generated_images(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  -- 1投稿1ユーザー1回のみいいね可能
  UNIQUE(user_id, image_id)
);

-- comments テーブル
-- 役割: 投稿に対するコメント情報を管理
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  image_id UUID REFERENCES public.generated_images(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) <= 200),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- generated_images.view_count カラムの追加
-- 役割: 閲覧数をキャッシュ
ALTER TABLE public.generated_images
ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0 NOT NULL CHECK (view_count >= 0);

-- ===============================================
-- インデックス作成
-- ===============================================

-- likes テーブルのインデックス
CREATE INDEX IF NOT EXISTS idx_likes_image_id ON public.likes(image_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON public.likes(user_id);
-- 複合インデックス: いいね数集計と日別・週別・月別集計のパフォーマンス向上
CREATE INDEX IF NOT EXISTS idx_likes_image_id_created_at ON public.likes(image_id, created_at);

-- comments テーブルのインデックス
CREATE INDEX IF NOT EXISTS idx_comments_image_id ON public.comments(image_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments(user_id);
-- 複合インデックス: コメント一覧取得と日別・週別・月別集計のパフォーマンス向上
CREATE INDEX IF NOT EXISTS idx_comments_image_id_created_at ON public.comments(image_id, created_at);

-- ===============================================
-- RLS ポリシー
-- ===============================================

-- likes: RLSを有効化
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

-- likes: SELECT - 全ユーザーが閲覧可能（いいね数の表示など）
CREATE POLICY "Allow public read access on likes"
  ON public.likes
  FOR SELECT
  USING (true);

-- likes: INSERT - 認証ユーザーのみいいね可能
CREATE POLICY "Allow authenticated users to insert likes"
  ON public.likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- likes: DELETE - 本人のみいいね解除可能
CREATE POLICY "Allow users to delete their own likes"
  ON public.likes
  FOR DELETE
  USING (auth.uid() = user_id);

-- comments: RLSを有効化
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- comments: SELECT - 全ユーザーが閲覧可能（削除されていないコメントのみ）
CREATE POLICY "Allow public read access on non-deleted comments"
  ON public.comments
  FOR SELECT
  USING (deleted_at IS NULL);

-- comments: INSERT - 認証ユーザーのみコメント投稿可能
CREATE POLICY "Allow authenticated users to insert comments"
  ON public.comments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- comments: UPDATE - 本人のみコメント編集可能
CREATE POLICY "Allow users to update their own comments"
  ON public.comments
  FOR UPDATE
  USING (auth.uid() = user_id AND deleted_at IS NULL)
  WITH CHECK (auth.uid() = user_id);

-- comments: DELETE - 本人のみコメント削除可能（論理削除）
CREATE POLICY "Allow users to delete their own comments"
  ON public.comments
  FOR UPDATE
  USING (auth.uid() = user_id AND deleted_at IS NULL)
  WITH CHECK (auth.uid() = user_id);

-- ===============================================
-- updated_at自動更新トリガー
-- ===============================================

-- トリガー作成: commentsのupdated_atを自動更新
DROP TRIGGER IF EXISTS update_comments_updated_at ON public.comments;
CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===============================================
-- 閲覧数インクリメント関数
-- ===============================================

-- 閲覧数をインクリメントするPostgreSQL関数
CREATE OR REPLACE FUNCTION public.increment_view_count(image_id_param UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.generated_images
  SET view_count = view_count + 1
  WHERE id = image_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

