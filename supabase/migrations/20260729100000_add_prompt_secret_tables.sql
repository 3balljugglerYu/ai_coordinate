-- ===============================================
-- Phase 0A (expand): プロンプト秘匿境界の保存先を追加する
-- ===============================================
-- 設計判断: docs/planning/free-prompt-private-mode-implementation-plan.md
--           ADR-001 / REQ-001 / REQ-002 / REQ-003 / REQ-003b
--
-- 背景:
--   generated_images の SELECT ポリシーは行単位で PUBLIC に開放されており、
--   RLS は列を絞れない。したがって公開 anon キーで select=prompt が通り、
--   One-Tap Style のプリセットプロンプトが実際に取得できる状態にある。
--   アプリ層の redaction (prompt-visibility.ts) は境界ではない。
--
-- このマイグレーションは additive のみで、既存の挙動を一切変更しない。
--   - 既存コードはどちらのテーブルも参照しない
--   - generated_images.prompt / image_jobs.prompt_text はこの時点では触らない
--   移行 (Phase 0B) と空化 (Phase 0C) は別 PR・別デプロイで行う。
--
-- 秘密は所有者と開示方針が異なる 2 種類に分ける (ADR-001):
--   1. generated_image_prompt_secrets  = ユーザーへ開示し得る原作者入力
--   2. generation_prompt_snapshots     = 誰にも直接返さない生成実行入力
--
-- 画像の所有者とプロンプトの所有者は一致しない (REQ-003)。
-- One-Tap Style では画像は生成者のものだが、プロンプトは運営資産である。
-- このため所有権は generated_images.user_id ではなく prompt_owner_id で持つ。

BEGIN;

-- ===============================================
-- 1. generated_image_prompt_secrets (原作者入力)
-- ===============================================
-- 本人だけが直接 SELECT できる。フォロワーへの開示はサーバー経路が
-- 可視性ルールを適用したうえで行い、直接 SELECT では他人に見せない。

CREATE TABLE IF NOT EXISTS public.generated_image_prompt_secrets (
  image_id UUID PRIMARY KEY
    REFERENCES public.generated_images(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  prompt_owner_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL
    CHECK (source_kind IN ('author_input', 'legacy_built')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.generated_image_prompt_secrets IS
  'ユーザーへ開示し得る原作者入力。直接 SELECT は本人のみ。フォロワーへの開示はサーバー経路が可視性ルールを適用して行う';
COMMENT ON COLUMN public.generated_image_prompt_secrets.prompt_owner_id IS
  'プロンプトの所有者。generated_images.user_id とは一致しない場合があるため、所有権をここで明示する (REQ-003)';
COMMENT ON COLUMN public.generated_image_prompt_secrets.source_kind IS
  'author_input = 新規行の生入力。legacy_built = 生入力を復元できない移行行のビルド済み全文 (ADR-013)';

CREATE INDEX IF NOT EXISTS idx_generated_image_prompt_secrets_owner
  ON public.generated_image_prompt_secrets (prompt_owner_id);

ALTER TABLE public.generated_image_prompt_secrets ENABLE ROW LEVEL SECURITY;

-- Supabase は public スキーマの新規テーブルへ anon / authenticated の
-- 既定権限を付与するため、明示的に剥奪してから必要分だけ戻す。
REVOKE ALL ON TABLE public.generated_image_prompt_secrets FROM PUBLIC;
REVOKE ALL ON TABLE public.generated_image_prompt_secrets FROM anon;
REVOKE ALL ON TABLE public.generated_image_prompt_secrets FROM authenticated;

-- 本人が自分の入力を読めるようにするため SELECT だけ戻す。
-- INSERT / UPDATE / DELETE は付与しない (= service_role と SECURITY DEFINER 専用)。
GRANT SELECT ON TABLE public.generated_image_prompt_secrets TO authenticated;

DROP POLICY IF EXISTS "generated_image_prompt_secrets_owner_select"
  ON public.generated_image_prompt_secrets;
CREATE POLICY "generated_image_prompt_secrets_owner_select"
  ON public.generated_image_prompt_secrets
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = prompt_owner_id);

-- 書き込みポリシーは意図的に作らない。
-- RLS 有効 + ポリシー無しなので、service_role 以外の INSERT/UPDATE/DELETE は
-- 権限とポリシーの二重で拒否される。

-- ===============================================
-- 2. generation_prompt_snapshots (生成実行入力)
-- ===============================================
-- 全新規 job が 1 対 1 で持つ service-only レコード。
-- anon / authenticated には権限もポリシーも一切与えない。
--
-- snapshot_kind による判別:
--   materialized      = 通常 job。provider へ送る全文を持つ
--   derived_reference = private free の派生 job。本文を一切持たず、
--                       原作と不変テンプレート版への参照だけを持つ (ADR-002)
--
-- 派生 job に本文を持たせないのは、派生件数に比例して秘密の永続コピーが
-- 増えることを避けるため。Worker が実行直前に author secret から
-- メモリ上でのみ再ビルドする。

CREATE TABLE IF NOT EXISTS public.generation_prompt_snapshots (
  image_job_id UUID PRIMARY KEY
    REFERENCES public.image_jobs(id) ON DELETE CASCADE,
  snapshot_kind TEXT NOT NULL
    CHECK (snapshot_kind IN ('materialized', 'derived_reference')),
  provider_prompt TEXT,
  author_input TEXT,
  author_input_owner_id UUID,
  source_kind TEXT NOT NULL,
  source_revision TEXT,
  template_revision_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- materialized: provider へ送る全文が必須。テンプレート版参照は持たない
  CONSTRAINT generation_prompt_snapshots_materialized_shape CHECK (
    snapshot_kind <> 'materialized'
    OR (
      provider_prompt IS NOT NULL
      AND template_revision_id IS NULL
    )
  ),

  -- derived_reference: 本文を一切持たない (REQ-003d の第 1 層)
  -- template_revision_id は Phase 1 で revision テーブルと同時に NOT NULL 化する。
  -- この時点では revision テーブルが存在しないため、本文の不在だけを強制する。
  CONSTRAINT generation_prompt_snapshots_derived_shape CHECK (
    snapshot_kind <> 'derived_reference'
    OR (
      provider_prompt IS NULL
      AND author_input IS NULL
      AND author_input_owner_id IS NULL
      AND source_revision IS NULL
      AND source_kind = 'free'
    )
  ),

  -- author_input と所有者は必ず対で存在する
  CONSTRAINT generation_prompt_snapshots_author_input_pairing CHECK (
    (author_input IS NULL) = (author_input_owner_id IS NULL)
  )
);

COMMENT ON TABLE public.generation_prompt_snapshots IS
  '全新規 job の生成実行入力。service_role と SECURITY DEFINER 関数のみアクセス可。派生 job は本文を持たない';
COMMENT ON COLUMN public.generation_prompt_snapshots.snapshot_kind IS
  'materialized = 通常 job で provider 全文を保持。derived_reference = 派生 job で本文を保持せず参照のみ (ADR-002)';
COMMENT ON COLUMN public.generation_prompt_snapshots.author_input IS
  'ユーザーへ開示可能な生成種別に限り、生入力を一時保持する。生成成功時に author secret へ転記する';
COMMENT ON COLUMN public.generation_prompt_snapshots.template_revision_id IS
  '派生 job が固定する free テンプレート版。参照先テーブルと FK は Phase 1 で追加する';

ALTER TABLE public.generation_prompt_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.generation_prompt_snapshots FROM PUBLIC;
REVOKE ALL ON TABLE public.generation_prompt_snapshots FROM anon;
REVOKE ALL ON TABLE public.generation_prompt_snapshots FROM authenticated;

-- 意図を明示するため、全アクション deny のポリシーを 1 つだけ置く
-- (ポリシー無し + RLS 有効と同じ挙動)。
DROP POLICY IF EXISTS "generation_prompt_snapshots_no_public_access"
  ON public.generation_prompt_snapshots;
CREATE POLICY "generation_prompt_snapshots_no_public_access"
  ON public.generation_prompt_snapshots
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP TABLE IF EXISTS public.generation_prompt_snapshots;
-- DROP TABLE IF EXISTS public.generated_image_prompt_secrets;
-- COMMIT;
-- ===============================================
