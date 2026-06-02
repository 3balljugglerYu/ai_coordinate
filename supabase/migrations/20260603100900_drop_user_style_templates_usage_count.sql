-- ===============================================
-- user_style_templates.usage_count カラム削除 + 動的取得に切替
-- ===============================================
-- 設計判断:
--   累計利用回数はマイページの生成数と同じく `generated_images` から
--   動的 COUNT で取得する方針に変更 (= 単一の真理、カラム冗長性排除)。
--   インクリメント処理が未実装で常に 0 だったため、カラム自体を削除する。
--
--   /inspire/[templateId] や ホームカルーセル等で表示する usageCount は、
--   SELECT count(*) FROM generated_images WHERE style_template_id = <id>
--   で取得する (= マイページの「生成数」と同じパターン)。
--
-- 削除対象:
--   - public.user_style_templates.usage_count (INTEGER NOT NULL DEFAULT 0)

BEGIN;

ALTER TABLE public.user_style_templates
  DROP COLUMN IF EXISTS usage_count;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- ALTER TABLE public.user_style_templates
--   ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;
-- COMMIT;
-- ===============================================
