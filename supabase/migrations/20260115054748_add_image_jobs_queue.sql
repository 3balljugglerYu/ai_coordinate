-- ===============================================
-- Image Jobs Queue Migration
-- 非同期画像生成ジョブ管理のためのテーブルとQueue作成
-- ===============================================

-- ===============================================
-- 1. 拡張のインストール（未導入の場合は必須）
-- ===============================================

-- メッセージキュー機能
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Cronジョブ機能
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- CronからEdge Functionを呼ぶためのHTTP機能
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ===============================================
-- 2. image_jobsテーブルの作成
-- ===============================================

-- image_jobs テーブル
-- 役割: 非同期画像生成ジョブの状態管理
CREATE TABLE IF NOT EXISTS public.image_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  prompt_text TEXT NOT NULL,
  input_image_url TEXT,
  source_image_stock_id UUID REFERENCES public.source_image_stocks(id) ON DELETE SET NULL,
  generation_type TEXT DEFAULT 'coordinate'
    CHECK (generation_type IN ('coordinate', 'specified_coordinate', 'full_body', 'chibi')),
  model TEXT
    CHECK (model IS NULL OR model IN ('gemini-2.5-flash-image', 'gemini-3-pro-image-1k', 'gemini-3-pro-image-2k', 'gemini-3-pro-image-4k')),
  background_change BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')) NOT NULL,
  result_image_url TEXT,
  error_message TEXT,
  attempts INTEGER DEFAULT 0 NOT NULL CHECK (attempts >= 0),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- ===============================================
-- 3. インデックスの作成
-- ===============================================

-- user_idインデックス
CREATE INDEX IF NOT EXISTS idx_image_jobs_user_id
ON public.image_jobs(user_id);

-- statusインデックス
CREATE INDEX IF NOT EXISTS idx_image_jobs_status
ON public.image_jobs(status);

-- created_atインデックス
CREATE INDEX IF NOT EXISTS idx_image_jobs_created_at
ON public.image_jobs(created_at DESC);

-- (user_id, status)複合インデックス
CREATE INDEX IF NOT EXISTS idx_image_jobs_user_id_status
ON public.image_jobs(user_id, status);

-- ===============================================
-- 4. RLS ポリシー
-- ===============================================

-- RLSを有効化
ALTER TABLE public.image_jobs ENABLE ROW LEVEL SECURITY;

-- ポリシー1: ユーザーは自分のジョブを閲覧可能
CREATE POLICY "Users can view their own image_jobs"
  ON public.image_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- ポリシー2: ユーザーは自分のジョブを作成可能
CREATE POLICY "Users can insert their own image_jobs"
  ON public.image_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ポリシー3: ユーザーは自分のジョブを更新可能
CREATE POLICY "Users can update their own image_jobs"
  ON public.image_jobs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ポリシー4: ユーザーは自分のジョブを削除可能（通常は使用しないが、一応用意）
CREATE POLICY "Users can delete their own image_jobs"
  ON public.image_jobs
  FOR DELETE
  USING (auth.uid() = user_id);

-- ===============================================
-- 5. updated_at自動更新トリガー
-- ===============================================

-- トリガー作成: image_jobsのupdated_atを自動更新
DROP TRIGGER IF EXISTS update_image_jobs_updated_at ON public.image_jobs;
CREATE TRIGGER update_image_jobs_updated_at
  BEFORE UPDATE ON public.image_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===============================================
-- 6. Supabase Queue (image_jobs) の作成
-- ===============================================

-- pgmqキューを作成（既に存在する場合はエラーになるため、事前にチェック）
-- 注意: pgmq.create() は既存のキューがある場合、エラーを返す可能性がある
-- エラーを無視するため、DOブロックで処理
DO $$
BEGIN
  PERFORM pgmq.create('image_jobs');
EXCEPTION
  WHEN OTHERS THEN
    -- キューが既に存在する場合は無視
    NULL;
END $$;

-- ===============================================
-- 7. ロールバック手順（down手順）
-- ===============================================
-- 必要に応じて以下のSQLを実行してロールバック可能:
--
-- -- トリガーの削除
-- DROP TRIGGER IF EXISTS update_image_jobs_updated_at ON public.image_jobs;
--
-- -- テーブルの削除
-- DROP TABLE IF EXISTS public.image_jobs CASCADE;
--
-- -- キューの削除（pgmq拡張を使用）
-- SELECT pgmq.drop_queue('image_jobs');
--
-- 注意: 拡張の削除は慎重に行う（他のテーブルが使用している可能性があるため）
