-- ===============================================
-- collection_completions テーブル: コレクションの達成と台紙生成状態
-- ===============================================
-- ユーザー × シリーズ(カテゴリ) ごとに 1 行。台紙生成は「予約(generating) →
-- 完了(completed) / 失敗(failed)」の状態で管理し、初回のみ生成する(再生成なし)。
-- 設計判断は docs/planning/collection-feature-implementation-plan.md ADR-004 を参照。
-- ===============================================

CREATE TABLE IF NOT EXISTS public.collection_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.preset_categories(id) ON DELETE RESTRICT,
  -- 集計の連続性のため key をスナップショット保存(category 改名・削除耐性)
  category_key TEXT NOT NULL,
  threshold_at_completion INTEGER NOT NULL CHECK (threshold_at_completion > 0),
  mount_image_path TEXT,
  mount_status TEXT NOT NULL DEFAULT 'generating'
    CHECK (mount_status IN ('generating', 'completed', 'failed')),
  mount_error TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 初回のみ生成(再生成なし)を DB 制約で担保
  CONSTRAINT collection_completions_user_category_unique UNIQUE (user_id, category_id)
);

-- マイページ(本人) / admin 達成者一覧の取得用
CREATE INDEX IF NOT EXISTS idx_collection_completions_user_status
  ON public.collection_completions (user_id, mount_status, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_completions_category_completed
  ON public.collection_completions (category_id, completed_at DESC);

-- updated_at 自動更新(既存の共通トリガ関数を流用)
DROP TRIGGER IF EXISTS update_collection_completions_updated_at ON public.collection_completions;
CREATE TRIGGER update_collection_completions_updated_at
  BEFORE UPDATE ON public.collection_completions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: 本人のみ SELECT。書き込みは SECURITY DEFINER RPC / service_role 経由に限定し、
-- anon / authenticated には INSERT / UPDATE / DELETE policy を付けない。
ALTER TABLE public.collection_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collection_completions_select_own" ON public.collection_completions;
CREATE POLICY "collection_completions_select_own"
  ON public.collection_completions
  FOR SELECT
  USING (user_id = (select auth.uid()));

COMMENT ON TABLE public.collection_completions IS 'コレクション(シリーズ)の達成記録と台紙生成状態。user×categoryで一意';
COMMENT ON COLUMN public.collection_completions.category_key IS 'category.key のスナップショット。集計の連続性のため保持';
COMMENT ON COLUMN public.collection_completions.mount_status IS 'generating / completed / failed。表示・KPI は原則 completed のみ対象';
COMMENT ON COLUMN public.collection_completions.threshold_at_completion IS '達成判定時の N。後からNを変更しても達成済みは据え置き';

-- ===============================================
-- DOWN:
-- DROP TABLE IF EXISTS public.collection_completions;
-- ===============================================
