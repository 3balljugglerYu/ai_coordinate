-- ===============================================
-- Phase 1: 非公開モードの可視性・出所カラムと改ざん防止
-- ===============================================
-- 設計判断: docs/planning/free-prompt-private-mode-implementation-plan.md
--           ADR-003 / ADR-004 / ADR-006 / REQ-009 / REQ-010 / REQ-003d
--
-- じゆうモードの投稿者が「プロンプトは見せないが、フォロワーには試させる」を
-- 選べるようにするための土台。この migration は列と不変条件だけを追加し、
-- 既定値は public なので適用してもアプリの挙動は変わらない。
--
-- 出所 (source_post_id) はクレジット表示・非公開強制・利用数の根拠になるため、
-- クライアントから設定・改ざんできてはならない。DB 層で強制する。

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ===============================================
-- 1. 列の追加
-- ===============================================

ALTER TABLE public.generated_images
  ADD COLUMN IF NOT EXISTS prompt_visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (prompt_visibility IN ('public', 'private')),
  -- FK を張らない。原作が削除されても出所を保持する必要があり、
  -- ON DELETE SET NULL では非公開強制もクレジットも失われる。
  -- RESTRICT は原作者が自分の投稿を消せなくなるため不可 (ADR-003)。
  ADD COLUMN IF NOT EXISTS source_post_id UUID,
  ADD COLUMN IF NOT EXISTS source_author_id UUID;

COMMENT ON COLUMN public.generated_images.prompt_visibility IS
  'public = フォロワーへプロンプトを開示 / private = 開示せず派生生成のみ許可。root で private を選べるのは generation_type=free のみ';
COMMENT ON COLUMN public.generated_images.source_post_id IS
  '派生元の root 投稿。FK なし（原作削除後も出所を保持するため）。service role 経路のみ設定可・作成後不変';
COMMENT ON COLUMN public.generated_images.source_author_id IS
  '派生元の原作者。原作が削除されてもクレジットを出せるよう保持する';

CREATE INDEX IF NOT EXISTS idx_generated_images_source_post_id
  ON public.generated_images (source_post_id)
  WHERE source_post_id IS NOT NULL;

-- 運用レコードである image_jobs にも原作参照を持たせる。
-- FK を張らない理由は ADR-003 の系譜保持ではなく、queued / processing の
-- ジョブが原作投稿の削除を阻害しないため。
ALTER TABLE public.image_jobs
  ADD COLUMN IF NOT EXISTS origin_post_id UUID;

COMMENT ON COLUMN public.image_jobs.origin_post_id IS
  '派生生成の原作 root 投稿。service-only の job 作成 RPC のみ設定可・作成後不変';

-- ===============================================
-- 2. 信頼された書き込み経路の判定
-- ===============================================
-- 当初は「authenticated / anon を拒否リストにする」実装だったが、これは
-- 新しいクライアント向けロールが追加されたときに自動で信頼してしまう。
-- また auth.role() は Supabase で deprecated 扱いである。
--
-- そこで正の判定にする。実測した接続コンテキストは次のとおり。
--
--   経路                  session_user     auth.jwt()->>'role'
--   --------------------- ---------------- -------------------
--   Data API (anon)       authenticator    anon
--   Data API (service)    authenticator    service_role
--   psql / migration      postgres         NULL
--
-- Data API 経由は authenticator が接続ロールになるため、
-- 「authenticator 経由なら service_role の JWT だけを信頼し、
--   それ以外の接続 (migration・手動修正) は信頼する」で表現できる。

-- 判定そのものは引数を取る純関数に切り出す。session_user は接続で決まるため
-- migration 内から偽装できず、そのままでは 4 経路を検証できない。
CREATE OR REPLACE FUNCTION public.is_trusted_lineage_writer_for(
  p_session_user text,
  p_jwt_role text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    -- Data API (PostgREST) 経由。JWT の role が service_role のときだけ信頼する。
    -- 未知のクライアントロールが増えても、ここが false になるので安全側に倒れる。
    WHEN p_session_user = 'authenticator'
      THEN COALESCE(p_jwt_role, '') = 'service_role'
    -- migration や運用中の手動修正 (postgres 等の直接接続)
    ELSE true
  END;
$$;

COMMENT ON FUNCTION public.is_trusted_lineage_writer_for(text, text) IS
  'is_trusted_lineage_writer の判定本体。接続コンテキストを引数で受けるため migration から検証できる';

CREATE OR REPLACE FUNCTION public.is_trusted_lineage_writer()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  -- 生の current_setting は使わない。PostgREST が request.jwt.claims に空文字を
  -- 入れる経路があり、''::jsonb は invalid input syntax で落ちる。
  -- auth.jwt() は nullif で空文字を潰しているため、そこへ委ねる。
  SELECT public.is_trusted_lineage_writer_for(
    session_user::text,
    auth.jwt() ->> 'role'
  );
$$;

COMMENT ON FUNCTION public.is_trusted_lineage_writer() IS
  '出所列を設定してよい経路か。Data API 経由は service_role の JWT のみ信頼し、直接接続 (migration) は信頼する。未知のクライアントロールは信頼しない';

-- 4 経路 + 未知ロールを固定する。想定が崩れたら適用時に落ちる。
DO $$
DECLARE
  v_case record;
BEGIN
  FOR v_case IN
    SELECT *
    FROM (VALUES
      -- ブラウザからの通常アクセス
      ('authenticator', 'authenticated', false),
      -- 未ログインのアクセス
      ('authenticator', 'anon',          false),
      -- サーバー経路 (API route / Worker)
      ('authenticator', 'service_role',  true),
      -- JWT なしで Data API を叩いた場合
      ('authenticator', NULL,            false),
      -- 将来クライアント向けロールが増えても信頼しない
      ('authenticator', 'future_role',   false),
      -- migration / 手動修正
      ('postgres',      NULL,            true)
    ) AS t(session_user_name, jwt_role, expected)
  LOOP
    IF public.is_trusted_lineage_writer_for(
         v_case.session_user_name,
         v_case.jwt_role
       ) IS DISTINCT FROM v_case.expected
    THEN
      RAISE EXCEPTION
        'is_trusted_lineage_writer_for(%, %) が期待値 % と一致しない',
        v_case.session_user_name,
        COALESCE(v_case.jwt_role, '<null>'),
        v_case.expected;
    END IF;
  END LOOP;
END;
$$;

-- auth.jwt() が呼べること（Supabase の auth スキーマ前提）も確認しておく。
-- migration 経路では NULL が返り、postgres なので true になる。
DO $$
BEGIN
  IF public.is_trusted_lineage_writer() IS NOT TRUE THEN
    RAISE EXCEPTION 'migration 経路が信頼されない判定になっている';
  END IF;
END;
$$;

-- ===============================================
-- 3. generated_images の guard trigger
-- ===============================================

CREATE OR REPLACE FUNCTION public.enforce_generated_image_lineage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_origin public.generated_images%ROWTYPE;
BEGIN
  -- (a) 出所列はクライアントから触らせない。
  --     INSERT 時に値が入っている場合と、UPDATE で変化する場合の両方を見る。
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_trusted_lineage_writer()
       AND (NEW.source_post_id IS NOT NULL OR NEW.source_author_id IS NOT NULL)
    THEN
      RAISE EXCEPTION
        'source_post_id / source_author_id はクライアントから設定できない (REQ-009)';
    END IF;
  ELSE
    IF NEW.source_post_id IS DISTINCT FROM OLD.source_post_id
       OR NEW.source_author_id IS DISTINCT FROM OLD.source_author_id
    THEN
      -- (b) 作成後は誰であっても変更不可。NULL から非 NULL への後付けも拒否する。
      --     これを許すと「先に INSERT して後から UPDATE で出所を付ける」経路で
      --     author secret 側の trigger をすり抜けられる。
      RAISE EXCEPTION
        'source_post_id / source_author_id は作成後に変更できない (REQ-010)';
    END IF;
  END IF;

  IF NEW.source_post_id IS NOT NULL THEN
    -- (c) 自己参照は不正
    IF NEW.source_post_id = NEW.id THEN
      RAISE EXCEPTION 'source_post_id が自分自身を指している';
    END IF;

    -- (d) 派生投稿は投稿者の選択より優先して非公開にする (ADR-004)。
    --     プロンプトは原作者の資産であり、派生者に公開の権限はない。
    NEW.prompt_visibility := 'private';

    -- (e) 作成時は原作の実在・root・free・原作者一致を検証する。
    --     CHECK 制約は subquery を使えないため trigger で行う。
    IF TG_OP = 'INSERT' THEN
      SELECT * INTO v_origin
      FROM public.generated_images
      WHERE id = NEW.source_post_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'source_post_id が存在しない: %', NEW.source_post_id;
      END IF;

      IF v_origin.source_post_id IS NOT NULL THEN
        RAISE EXCEPTION 'source_post_id は root 投稿を指す必要がある（派生を指している）';
      END IF;

      IF v_origin.generation_type <> 'free' THEN
        RAISE EXCEPTION
          'source_post_id は generation_type=free の投稿のみ指せる: %', v_origin.generation_type;
      END IF;

      -- 派生画像自身も free でなければならない。
      -- 原作側だけを見ていると、API を直叩きして generationType を coordinate や
      -- one_tap_style にした派生が通り、通常の free とは違う builder で処理される。
      IF NEW.generation_type <> 'free' THEN
        RAISE EXCEPTION
          '派生画像の generation_type は free でなければならない: %', NEW.generation_type;
      END IF;

      IF NEW.source_author_id IS DISTINCT FROM v_origin.user_id THEN
        RAISE EXCEPTION 'source_author_id が原作の所有者と一致しない';
      END IF;
    END IF;
  ELSE
    -- (f) root で private を選べるのは free のみ。
    --     coordinate / one_tap_style / inspire は今回の対象外 (ADR-011)。
    IF NEW.prompt_visibility = 'private' AND NEW.generation_type <> 'free' THEN
      RAISE EXCEPTION
        'prompt_visibility=private は generation_type=free のみ: %', NEW.generation_type;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_generated_image_lineage ON public.generated_images;
CREATE TRIGGER trg_enforce_generated_image_lineage
  BEFORE INSERT OR UPDATE ON public.generated_images
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_generated_image_lineage();

-- ===============================================
-- 4. image_jobs.origin_post_id の guard trigger
-- ===============================================

CREATE OR REPLACE FUNCTION public.enforce_image_job_origin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_trusted_lineage_writer() AND NEW.origin_post_id IS NOT NULL THEN
      RAISE EXCEPTION
        'origin_post_id はクライアントから設定できない (REQ-009)';
    END IF;
  ELSIF NEW.origin_post_id IS DISTINCT FROM OLD.origin_post_id THEN
    RAISE EXCEPTION 'origin_post_id は作成後に変更できない';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_image_job_origin ON public.image_jobs;
CREATE TRIGGER trg_enforce_image_job_origin
  BEFORE INSERT OR UPDATE ON public.image_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_image_job_origin();

-- ===============================================
-- 5. 実行入力レコードの種別を origin と整合させる（REQ-003d 第2層）
-- ===============================================
-- テーブルの local CHECK は「derived_reference なら本文を持たない」ことを
-- 保証するが、「origin を持つ job なら derived_reference でなければならない」
-- は cross-table 参照が必要なため trigger で強制する。
--
-- これがないと、派生 job に materialized record を付けて author_input を
-- 持たせることで、原作者の入力を派生者の secret として作らせる余地が残る。

CREATE OR REPLACE FUNCTION public.enforce_prompt_execution_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_origin_post_id UUID;
  v_job_exists boolean;
BEGIN
  SELECT origin_post_id, true
  INTO v_origin_post_id, v_job_exists
  FROM public.image_jobs
  WHERE id = NEW.image_job_id;

  IF NOT COALESCE(v_job_exists, false) THEN
    RAISE EXCEPTION 'image_job が存在しない: %', NEW.image_job_id;
  END IF;

  IF v_origin_post_id IS NOT NULL AND NEW.snapshot_kind <> 'derived_reference' THEN
    RAISE EXCEPTION
      '派生 job の実行入力は derived_reference でなければならない: %', NEW.snapshot_kind;
  END IF;

  IF v_origin_post_id IS NULL AND NEW.snapshot_kind <> 'materialized' THEN
    RAISE EXCEPTION
      '通常 job の実行入力は materialized でなければならない: %', NEW.snapshot_kind;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_prompt_execution_kind
  ON public.generation_prompt_snapshots;
CREATE TRIGGER trg_enforce_prompt_execution_kind
  BEFORE INSERT OR UPDATE ON public.generation_prompt_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_prompt_execution_kind();

-- ===============================================
-- 6. 派生画像に author secret を作らせない（REQ-003d 第3層）
-- ===============================================
-- 完了 RPC 側でも origin_post_id を独立条件として抑止するが、service role の
-- 直接書き込みでも防げるよう DB でも拒否する。
--
-- 派生者は原作のプロンプトを編集できないため、生成に使われたのは原作者の
-- 入力そのものである。それを派生者所有の secret として作ると、RLS 上は
-- 派生者のものになり、表示制御では取り返せない。

CREATE OR REPLACE FUNCTION public.reject_derived_image_prompt_secret()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_post_id UUID;
BEGIN
  SELECT source_post_id
  INTO v_source_post_id
  FROM public.generated_images
  WHERE id = NEW.image_id;

  IF v_source_post_id IS NOT NULL THEN
    RAISE EXCEPTION
      '派生画像に author secret は作成できない: image_id=%', NEW.image_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_derived_image_prompt_secret
  ON public.generated_image_prompt_secrets;
CREATE TRIGGER trg_reject_derived_image_prompt_secret
  BEFORE INSERT OR UPDATE ON public.generated_image_prompt_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_derived_image_prompt_secret();

-- ===============================================
-- 7. 適用後の検証
-- ===============================================
-- 既定値のまま何も変わっていないことを確認する。

DO $$
DECLARE
  v_non_public integer;
  v_with_source integer;
BEGIN
  SELECT count(*) FILTER (WHERE prompt_visibility <> 'public'),
         count(*) FILTER (WHERE source_post_id IS NOT NULL)
  INTO v_non_public, v_with_source
  FROM public.generated_images;

  IF v_non_public > 0 OR v_with_source > 0 THEN
    RAISE EXCEPTION
      '既定値以外の行が存在する（非public % 件 / 出所付き % 件）。想定外のため中断',
      v_non_public, v_with_source;
  END IF;

  RAISE NOTICE 'Phase 1-A 完了: 列と guard trigger を追加。既存行はすべて public / 出所なし';
END;
$$;

COMMIT;

-- ===============================================
-- DOWN:
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_reject_derived_image_prompt_secret ON public.generated_image_prompt_secrets;
-- DROP TRIGGER IF EXISTS trg_enforce_prompt_execution_kind ON public.generation_prompt_snapshots;
-- DROP TRIGGER IF EXISTS trg_enforce_image_job_origin ON public.image_jobs;
-- DROP TRIGGER IF EXISTS trg_enforce_generated_image_lineage ON public.generated_images;
-- DROP FUNCTION IF EXISTS public.reject_derived_image_prompt_secret();
-- DROP FUNCTION IF EXISTS public.enforce_prompt_execution_kind();
-- DROP FUNCTION IF EXISTS public.enforce_image_job_origin();
-- DROP FUNCTION IF EXISTS public.enforce_generated_image_lineage();
-- DROP FUNCTION IF EXISTS public.is_trusted_lineage_writer();
-- DROP FUNCTION IF EXISTS public.is_trusted_lineage_writer_for(text, text);
-- ALTER TABLE public.image_jobs DROP COLUMN IF EXISTS origin_post_id;
-- ALTER TABLE public.generated_images
--   DROP COLUMN IF EXISTS source_author_id,
--   DROP COLUMN IF EXISTS source_post_id,
--   DROP COLUMN IF EXISTS prompt_visibility;
-- COMMIT;
-- ===============================================
