-- ===============================================
-- 見本（参照画像）つきのカタログと、その審査
-- ===============================================
-- 計画: docs/planning/i2i-catalog-review-implementation-plan.md（Phase 1）
--
-- 足すもの:
--   1. i2i_catalog_allowlist           見本を使える人（運営が選ぶ・fail-closed）
--   2. storage bucket catalog-references 見本の置き場所（非公開・利用者のポリシーなし）
--   3. catalog_reference_images         見本1枚ごとの行（本人だけ読める）
--   4. image_jobs.catalog_reference_*   作者の生成で使う見本と、まねるもの
--   5. generated_image_reference_secrets できた画像と見本の対応（service_role 専用）
--   6. generated_image_catalog_reviews  審査の状態（本人と運営だけ読める）
--   7. 承認前の投稿を止めるトリガー
--   8. RPC: submit_catalog_review / apply_catalog_review_decision /
--           resolve_catalog_reference_for_job
--   9. complete_image_job_with_prompt_secrets・validate_derived_prompt_source の拡張
--  10. 通知の type とプッシュの分類
--
-- 既存の動きは変えない: 審査の行がない画像（今あるすべて）は、これまでどおり投稿できる。

BEGIN;

-- -----------------------------------------------
-- 1. 見本を使える人
-- -----------------------------------------------
-- creator_looks_allowlist と同じ形（ADR-001）。表が空なら誰も使えない。

CREATE TABLE IF NOT EXISTS public.i2i_catalog_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE
    REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by UUID
    REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 200),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.i2i_catalog_allowlist IS
  '見本（参照画像）つきのカタログを作れる人。運営が足す・外す。空なら誰も使えない（fail-closed）';
COMMENT ON COLUMN public.i2i_catalog_allowlist.is_active IS
  'false にすると使えない（一時停止）';

CREATE INDEX IF NOT EXISTS idx_i2i_catalog_allowlist_active_user
  ON public.i2i_catalog_allowlist (user_id)
  WHERE is_active = true;

ALTER TABLE public.i2i_catalog_allowlist ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.i2i_catalog_allowlist FROM PUBLIC;
REVOKE ALL ON TABLE public.i2i_catalog_allowlist FROM anon;
REVOKE ALL ON TABLE public.i2i_catalog_allowlist FROM authenticated;
GRANT SELECT ON TABLE public.i2i_catalog_allowlist TO authenticated;

-- 本人は自分の行だけ読める。書き込みは管理 API（service_role）だけ。
DROP POLICY IF EXISTS "i2i_catalog_allowlist_self_select" ON public.i2i_catalog_allowlist;
CREATE POLICY "i2i_catalog_allowlist_self_select"
  ON public.i2i_catalog_allowlist
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP TRIGGER IF EXISTS update_i2i_catalog_allowlist_updated_at ON public.i2i_catalog_allowlist;
CREATE TRIGGER update_i2i_catalog_allowlist_updated_at
  BEFORE UPDATE ON public.i2i_catalog_allowlist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_in_i2i_catalog_allowlist(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.i2i_catalog_allowlist
    WHERE user_id = p_user_id
      AND is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_in_i2i_catalog_allowlist(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_in_i2i_catalog_allowlist(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_in_i2i_catalog_allowlist(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_in_i2i_catalog_allowlist(uuid) TO service_role;

-- -----------------------------------------------
-- 2. 見本の置き場所
-- -----------------------------------------------
-- 非公開。利用者向けの storage ポリシーは作らない。上げるのも読むのも
-- サーバー（service_role）だけ。作者に見せるときは署名つき URL を出す（ADR-002）。

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'catalog-references',
  'catalog-references',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------
-- 3. 見本1枚ごとの行
-- -----------------------------------------------

CREATE TABLE IF NOT EXISTS public.catalog_reference_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE
    CHECK (char_length(storage_path) BETWEEN 1 AND 512),
  copyright_consent_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catalog_reference_images IS
  '見本（参照画像）。置き場所は catalog-references/{user_id}/… 。作るのはサーバーだけ';
COMMENT ON COLUMN public.catalog_reference_images.copyright_consent_at IS
  '使える見本・使えない見本の案内に同意した時刻';

CREATE INDEX IF NOT EXISTS idx_catalog_reference_images_user
  ON public.catalog_reference_images (user_id, created_at DESC);

ALTER TABLE public.catalog_reference_images ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_reference_images FROM PUBLIC;
REVOKE ALL ON TABLE public.catalog_reference_images FROM anon;
REVOKE ALL ON TABLE public.catalog_reference_images FROM authenticated;
GRANT SELECT ON TABLE public.catalog_reference_images TO authenticated;

DROP POLICY IF EXISTS "catalog_reference_images_self_select" ON public.catalog_reference_images;
CREATE POLICY "catalog_reference_images_self_select"
  ON public.catalog_reference_images
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- -----------------------------------------------
-- 4. image_jobs の列
-- -----------------------------------------------
-- 作者が見本を使って生成するときだけ入る。派生生成（origin_post_id あり）では
-- 入れない。worker が元の投稿から引く（ADR-003）。

ALTER TABLE public.image_jobs
  ADD COLUMN IF NOT EXISTS catalog_reference_id UUID
    REFERENCES public.catalog_reference_images(id),
  ADD COLUMN IF NOT EXISTS catalog_reference_takes TEXT[];

COMMENT ON COLUMN public.image_jobs.catalog_reference_id IS
  '作者の生成で使う見本。サーバーだけが作成時に入れられ、あとから変えられない';
COMMENT ON COLUMN public.image_jobs.catalog_reference_takes IS
  '見本からまねるもの（outfit / pose / angle / background の1つ以上）';

ALTER TABLE public.image_jobs
  DROP CONSTRAINT IF EXISTS image_jobs_catalog_reference_shape_check;
ALTER TABLE public.image_jobs
  ADD CONSTRAINT image_jobs_catalog_reference_shape_check CHECK (
    (catalog_reference_id IS NULL AND catalog_reference_takes IS NULL)
    OR (
      catalog_reference_id IS NOT NULL
      AND generation_type = 'free'
      AND origin_post_id IS NULL
      AND cardinality(catalog_reference_takes) BETWEEN 1 AND 4
      AND catalog_reference_takes <@ ARRAY['outfit', 'pose', 'angle', 'background']::text[]
    )
  ) NOT VALID;
-- 既存行はすべて NULL なので検証は軽い
ALTER TABLE public.image_jobs
  VALIDATE CONSTRAINT image_jobs_catalog_reference_shape_check;

CREATE INDEX IF NOT EXISTS idx_image_jobs_catalog_reference
  ON public.image_jobs (catalog_reference_id)
  WHERE catalog_reference_id IS NOT NULL;

-- 本人は自分の image_jobs を INSERT・UPDATE できる。見本の列は
-- origin_post_id と同じく、信頼できる書き手が作成時に入れたもの以外を拒む。
-- 処理中に本人が id を消して審査の行を作らせない抜け道もここでふさぐ。
CREATE OR REPLACE FUNCTION public.enforce_image_job_catalog_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_trusted_lineage_writer()
       AND (NEW.catalog_reference_id IS NOT NULL OR NEW.catalog_reference_takes IS NOT NULL)
    THEN
      RAISE EXCEPTION 'catalog_reference はクライアントから設定できない'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.catalog_reference_id IS DISTINCT FROM OLD.catalog_reference_id
     OR NEW.catalog_reference_takes IS DISTINCT FROM OLD.catalog_reference_takes
  THEN
    RAISE EXCEPTION 'catalog_reference は作成後に変更できない'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_image_job_catalog_reference ON public.image_jobs;
CREATE TRIGGER trg_enforce_image_job_catalog_reference
  BEFORE INSERT OR UPDATE OF catalog_reference_id, catalog_reference_takes
  ON public.image_jobs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_image_job_catalog_reference();

-- -----------------------------------------------
-- 5. できた画像と見本の対応
-- -----------------------------------------------
-- 見本の場所はほかの人に漏らさない。generated_images に列を置かず、
-- service_role だけが読める表に分ける（generated_image_prompt_secrets と同じ考え）。

CREATE TABLE IF NOT EXISTS public.generated_image_reference_secrets (
  image_id UUID PRIMARY KEY
    REFERENCES public.generated_images(id) ON DELETE CASCADE,
  reference_id UUID NOT NULL
    REFERENCES public.catalog_reference_images(id) ON DELETE CASCADE,
  takes TEXT[] NOT NULL CHECK (
    cardinality(takes) BETWEEN 1 AND 4
    AND takes <@ ARRAY['outfit', 'pose', 'angle', 'background']::text[]
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.generated_image_reference_secrets IS
  '見本を使って作った画像と、その見本・まねるもの。service_role 専用';

CREATE INDEX IF NOT EXISTS idx_generated_image_reference_secrets_reference
  ON public.generated_image_reference_secrets (reference_id);

ALTER TABLE public.generated_image_reference_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.generated_image_reference_secrets FROM PUBLIC;
REVOKE ALL ON TABLE public.generated_image_reference_secrets FROM anon;
REVOKE ALL ON TABLE public.generated_image_reference_secrets FROM authenticated;

-- -----------------------------------------------
-- 6. 審査の状態
-- -----------------------------------------------
-- 行がある画像だけが審査の対象。書くのは下の RPC と service_role だけ（ADR-004）。

CREATE TABLE IF NOT EXISTS public.generated_image_catalog_reviews (
  image_id UUID PRIMARY KEY
    REFERENCES public.generated_images(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_submitted'
    CHECK (status IN ('not_submitted', 'pending', 'approved', 'rejected')),
  reason_category TEXT
    CHECK (reason_category IS NULL OR reason_category IN (
      'official_or_others_work',
      'real_person',
      'sexual_or_violent',
      'other'
    )),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 500),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT generated_image_catalog_reviews_rejection_reason_check CHECK (
    status <> 'rejected' OR reason_category IS NOT NULL
  )
);

COMMENT ON TABLE public.generated_image_catalog_reviews IS
  '見本つきの作品の審査。行があって approved でない画像は投稿できない';
COMMENT ON COLUMN public.generated_image_catalog_reviews.reason_category IS
  '作り直しの理由（ガイドラインの項目）。rejected のとき必須';

CREATE INDEX IF NOT EXISTS idx_generated_image_catalog_reviews_status
  ON public.generated_image_catalog_reviews (status, submitted_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_generated_image_catalog_reviews_user
  ON public.generated_image_catalog_reviews (user_id, updated_at DESC);

ALTER TABLE public.generated_image_catalog_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.generated_image_catalog_reviews FROM PUBLIC;
REVOKE ALL ON TABLE public.generated_image_catalog_reviews FROM anon;
REVOKE ALL ON TABLE public.generated_image_catalog_reviews FROM authenticated;
GRANT SELECT ON TABLE public.generated_image_catalog_reviews TO authenticated;

DROP POLICY IF EXISTS "generated_image_catalog_reviews_owner_or_admin_select"
  ON public.generated_image_catalog_reviews;
CREATE POLICY "generated_image_catalog_reviews_owner_or_admin_select"
  ON public.generated_image_catalog_reviews
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.user_id = (SELECT auth.uid())
    )
  );

DROP TRIGGER IF EXISTS update_generated_image_catalog_reviews_updated_at
  ON public.generated_image_catalog_reviews;
CREATE TRIGGER update_generated_image_catalog_reviews_updated_at
  BEFORE UPDATE ON public.generated_image_catalog_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------
-- 7. 承認前の投稿を止める
-- -----------------------------------------------
-- 本人は generated_images を UPDATE できる（ブラウザから直接の道もある）ので、
-- 止めるのは DB。前例は enforce_no_publish_while_removed。
-- authenticated / anon には generated_images の INSERT 権限がない（2026-10-29 本番で確認）
-- ので、写した行を投稿済みで作る道はない。INSERT にも掛けておくのは、
-- 将来 INSERT が開いたときの保険。
-- 信頼できる書き手でも例外にしない。承認していない作品を公開する正しい経路はない。

CREATE OR REPLACE FUNCTION public.enforce_catalog_review_before_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.is_posted IS TRUE
     AND (TG_OP = 'INSERT' OR OLD.is_posted IS DISTINCT FROM true)
     AND EXISTS (
       SELECT 1
       FROM public.generated_image_catalog_reviews AS r
       WHERE r.image_id = NEW.id
         AND r.status <> 'approved'
     )
  THEN
    RAISE EXCEPTION 'post_review_pending'
      USING ERRCODE = '42501',
            HINT = 'This image uses a reference image and must be approved before posting.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_catalog_review_before_publish ON public.generated_images;
CREATE TRIGGER trg_enforce_catalog_review_before_publish
  BEFORE INSERT OR UPDATE OF is_posted ON public.generated_images
  FOR EACH ROW EXECUTE FUNCTION public.enforce_catalog_review_before_publish();

-- -----------------------------------------------
-- 8. RPC
-- -----------------------------------------------

-- 作者が「審査に出す」を押す。本人の not_submitted の行だけ pending にする。
-- 作り直し（rejected）は出し直せない（ADR-004）。
CREATE OR REPLACE FUNCTION public.submit_catalog_review(p_image_id uuid)
RETURNS TABLE(status text, submitted_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_review public.generated_image_catalog_reviews%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'CATALOG_REVIEW_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_review
  FROM public.generated_image_catalog_reviews
  WHERE image_id = p_image_id
  FOR UPDATE;

  -- 他人の画像と、行がない画像は同じ扱いにする（存在を推測させない）
  IF NOT FOUND OR v_review.user_id <> v_uid THEN
    RAISE EXCEPTION 'CATALOG_REVIEW_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_review.status <> 'not_submitted' THEN
    RAISE EXCEPTION 'CATALOG_REVIEW_INVALID_STATE' USING ERRCODE = '22023';
  END IF;

  -- 削除・非表示になった画像は出せない
  IF NOT EXISTS (
    SELECT 1 FROM public.generated_images AS gi
    WHERE gi.id = p_image_id
      AND gi.user_id = v_uid
      AND gi.moderation_status = 'visible'
  ) THEN
    RAISE EXCEPTION 'CATALOG_REVIEW_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.generated_image_catalog_reviews AS r
  SET status = 'pending',
      submitted_at = now()
  WHERE r.image_id = p_image_id;

  RETURN QUERY
  SELECT r.status, r.submitted_at
  FROM public.generated_image_catalog_reviews AS r
  WHERE r.image_id = p_image_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_catalog_review(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_catalog_review(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_catalog_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_catalog_review(uuid) TO service_role;

-- 運営の判定。管理 API（requireAdmin のあと service_role）からだけ呼ぶ。
-- 状態の更新と通知を同じトランザクションで行う。
CREATE OR REPLACE FUNCTION public.apply_catalog_review_decision(
  p_image_id uuid,
  p_admin_id uuid,
  p_action text,
  p_reason_category text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(status text, reviewed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
DECLARE
  v_review public.generated_image_catalog_reviews%ROWTYPE;
  v_new_status text;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'CATALOG_REVIEW_INVALID_ACTION' USING ERRCODE = '22023';
  END IF;

  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'CATALOG_REVIEW_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'reject' AND p_reason_category IS NULL THEN
    RAISE EXCEPTION 'CATALOG_REVIEW_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_review
  FROM public.generated_image_catalog_reviews
  WHERE image_id = p_image_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CATALOG_REVIEW_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 判定は pending の行だけ。二重押しや判定の取り消しはしない。
  IF v_review.status <> 'pending' THEN
    RAISE EXCEPTION 'CATALOG_REVIEW_INVALID_STATE' USING ERRCODE = '22023';
  END IF;

  v_new_status := CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END;

  UPDATE public.generated_image_catalog_reviews AS r
  SET status = v_new_status,
      reason_category = CASE WHEN p_action = 'reject' THEN p_reason_category ELSE NULL END,
      reason = CASE WHEN p_action = 'reject' THEN v_reason ELSE NULL END,
      reviewed_at = now(),
      reviewed_by = p_admin_id
  WHERE r.image_id = p_image_id;

  -- 文言は画面側で type から組み立てる。title / body は通知一覧の予備。
  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    title,
    body,
    data
  )
  VALUES (
    v_review.user_id,
    p_admin_id,
    CASE p_action WHEN 'approve' THEN 'catalog_review_approved' ELSE 'catalog_review_rejected' END,
    'post',
    p_image_id,
    CASE p_action
      WHEN 'approve' THEN '公開できるようになりました'
      ELSE '作り直しが必要です'
    END,
    CASE p_action
      WHEN 'approve' THEN '見本を使った作品の確認が終わりました。投稿すると、みんなのカタログに並びます。'
      ELSE '見本を使った作品は公開できませんでした。見本を変えて作り直してください。'
    END,
    jsonb_build_object(
      'reason_category', CASE WHEN p_action = 'reject' THEN p_reason_category END,
      'reason', CASE WHEN p_action = 'reject' THEN v_reason END
    )
  );

  RETURN QUERY
  SELECT r.status, r.reviewed_at
  FROM public.generated_image_catalog_reviews AS r
  WHERE r.image_id = p_image_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_catalog_review_decision(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_catalog_review_decision(uuid, uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_catalog_review_decision(uuid, uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_catalog_review_decision(uuid, uuid, text, text, text) TO service_role;

-- worker が課金の前に呼ぶ。このジョブで image_1 に使う見本の場所とまねるものを返す。
-- 見本を使わないジョブでは 0 行。使ってはいけないときは例外にする（理由は返さない）。
--
-- 計画では resolve_derived_prompt_source の戻り値を広げる案だったが、
-- 戻り値の型を変えると DROP が要り、作者自身の見本（派生でない）も同じ場所で
-- 確かめたいので、専用の RPC に分けた。
CREATE OR REPLACE FUNCTION public.resolve_catalog_reference_for_job(p_job_id uuid)
RETURNS TABLE(storage_path text, takes text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
DECLARE
  v_job public.image_jobs%ROWTYPE;
  v_valid boolean;
  v_root uuid;
  v_root_owner uuid;
  v_secret public.generated_image_reference_secrets%ROWTYPE;
  v_review_status text;
BEGIN
  SELECT * INTO v_job FROM public.image_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CATALOG_REFERENCE_UNAVAILABLE';
  END IF;

  -- 作者が自分の見本で生成する
  IF v_job.catalog_reference_id IS NOT NULL THEN
    IF NOT public.is_in_i2i_catalog_allowlist(v_job.user_id) THEN
      RAISE EXCEPTION 'CATALOG_REFERENCE_UNAVAILABLE';
    END IF;

    RETURN QUERY
    SELECT c.storage_path, v_job.catalog_reference_takes
    FROM public.catalog_reference_images AS c
    WHERE c.id = v_job.catalog_reference_id
      AND c.user_id = v_job.user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CATALOG_REFERENCE_UNAVAILABLE';
    END IF;
    RETURN;
  END IF;

  IF v_job.origin_post_id IS NULL THEN
    RETURN;
  END IF;

  -- 派生生成: 元の投稿（根）が見本を使っていれば、その見本を使う
  SELECT v.is_available, v.root_post_id, v.origin_author_id
  INTO v_valid, v_root, v_root_owner
  FROM public.validate_derived_prompt_source(v_job.origin_post_id, v_job.user_id) AS v;

  IF NOT COALESCE(v_valid, false) THEN
    RAISE EXCEPTION 'CATALOG_REFERENCE_UNAVAILABLE';
  END IF;

  SELECT * INTO v_secret
  FROM public.generated_image_reference_secrets
  WHERE image_id = v_root;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT r.status INTO v_review_status
  FROM public.generated_image_catalog_reviews AS r
  WHERE r.image_id = v_root;

  -- 承認前の作品から作れるのは作者本人だけで、一覧から外れたら止める（Phase 5）
  IF COALESCE(v_review_status, 'not_submitted') <> 'approved' THEN
    IF v_job.user_id <> v_root_owner
       OR NOT public.is_in_i2i_catalog_allowlist(v_job.user_id)
    THEN
      RAISE EXCEPTION 'CATALOG_REFERENCE_UNAVAILABLE';
    END IF;
  END IF;

  RETURN QUERY
  SELECT c.storage_path, v_secret.takes
  FROM public.catalog_reference_images AS c
  WHERE c.id = v_secret.reference_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CATALOG_REFERENCE_UNAVAILABLE';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_catalog_reference_for_job(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_catalog_reference_for_job(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_catalog_reference_for_job(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_catalog_reference_for_job(uuid) TO service_role;

-- -----------------------------------------------
-- 9a. 作り直しになった作品は、作者本人も元にできない
-- -----------------------------------------------
-- 以下は 20260730200100 の本体に「根の審査が rejected なら不可」を1つ足しただけ。

CREATE OR REPLACE FUNCTION public.validate_derived_prompt_source(p_source_post_id uuid, p_requester_id uuid)
 RETURNS TABLE(is_available boolean, root_post_id uuid, origin_author_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_post public.generated_images%ROWTYPE;
  v_root public.generated_images%ROWTYPE;
BEGIN
  -- 利用不可の理由は呼び出し側へ返さない。削除・投稿取消・公開停止・
  -- 非公開解除のどれであっても同じ結果にする (ADR-005)。
  -- 理由を返すと、そこから原作の状態を推測できてしまう。
  IF p_source_post_id IS NULL OR p_requester_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO v_post
  FROM public.generated_images
  WHERE id = p_source_post_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 派生 ID を渡された場合は根へ解決する
  IF v_post.source_post_id IS NOT NULL THEN
    SELECT * INTO v_root
    FROM public.generated_images
    WHERE id = v_post.source_post_id;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;
  ELSE
    v_root := v_post;
  END IF;

  -- prompt_visibility は問わない。公開・非公開のどちらも原作にできる。
  -- 想定外の値が入っていたら通さない（列の CHECK と二重にする）。
  -- 投稿済みであること。ただし本人が自分の生成物を使う場合は問わない。
  -- user_id IS NULL を先に見ているので、以降の比較は非 NULL 同士になる。
  IF v_root.user_id IS NULL
     OR (v_root.is_posted IS NOT TRUE AND v_root.user_id <> p_requester_id)
     OR v_root.moderation_status <> 'visible'
     OR v_root.generation_type <> 'free'
     OR v_root.prompt_visibility NOT IN ('public', 'private')
     OR v_root.source_post_id IS NOT NULL
  THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 見本つきの作品で、作り直しになったものは元にできない（作者本人も）。
  -- 運営が使えないと判断した見本を、生成に使い続けさせない。
  IF EXISTS (
    SELECT 1
    FROM public.generated_image_catalog_reviews
    WHERE image_id = v_root.id
      AND status = 'rejected'
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- author secret が無ければ解決できない
  IF NOT EXISTS (
    SELECT 1
    FROM public.generated_image_prompt_secrets
    WHERE image_id = v_root.id
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 原作者のアカウントが削除予定なら利用不可
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = v_root.user_id
      AND deletion_scheduled_at IS NOT NULL
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 双方向いずれのブロック関係も不可
  IF EXISTS (
    SELECT 1
    FROM public.user_blocks
    WHERE (blocker_id = v_root.user_id AND blocked_id = p_requester_id)
       OR (blocker_id = p_requester_id AND blocked_id = v_root.user_id)
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 本人、またはフォロワーだけが使える
  IF v_root.user_id <> p_requester_id
     AND NOT EXISTS (
       SELECT 1
       FROM public.follows
       WHERE follower_id = p_requester_id
         AND followee_id = v_root.user_id
     )
  THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_root.id, v_root.user_id;
END;
$function$;

-- -----------------------------------------------
-- 9b. 完成時に、見本との対応と審査の行を書く
-- -----------------------------------------------
-- 20260910120100 の本体に、ループ内の「見本の記録」と、根の取得を足した。
-- ・作者の見本で作った画像 → reference secret と not_submitted の審査の行
-- ・承認されていない見本つきの作品から作った画像 → not_submitted の審査の行（ADR-008）

CREATE OR REPLACE FUNCTION public.complete_image_job_with_prompt_secrets(p_job_id uuid, p_images jsonb, p_generation_metadata jsonb DEFAULT NULL::jsonb, p_result_image_url text DEFAULT NULL::text, p_model text DEFAULT NULL::text, p_background_mode text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, image_url text, storage_path text, image_job_result_index integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_job public.image_jobs%ROWTYPE;
  v_execution public.generation_prompt_snapshots%ROWTYPE;
  v_origin_author uuid;
  v_origin_available boolean;
  v_origin_root uuid;
  v_needs_review boolean := false;
  v_expected_count integer;
  v_image_count integer;
  v_image jsonb;
  v_index integer := 0;
  v_image_url text;
  v_storage_path text;
  v_image_width integer;
  v_image_height integer;
  v_inserted_id uuid;
  v_first_image_id uuid;
  v_first_image_url text;
BEGIN
  IF p_images IS NULL OR jsonb_typeof(p_images) <> 'array' THEN
    RAISE EXCEPTION 'p_images must be a JSON array';
  END IF;

  SELECT *
  INTO v_job
  FROM public.image_jobs
  WHERE image_jobs.id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'image job not found: %', p_job_id;
  END IF;

  -- 冪等: すでに成功しているなら既存行を返す
  IF v_job.status = 'succeeded' THEN
    RETURN QUERY
    SELECT
      gi.id,
      gi.image_url,
      gi.storage_path,
      gi.image_job_result_index
    FROM public.generated_images AS gi
    WHERE gi.image_job_id = p_job_id
    ORDER BY gi.image_job_result_index ASC NULLS LAST, gi.created_at ASC;
    RETURN;
  END IF;

  IF v_job.status <> 'processing' THEN
    RAISE EXCEPTION 'image job must be processing to complete: %, status=%', p_job_id, v_job.status;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.generated_images AS gi
    WHERE gi.image_job_id = p_job_id
  ) THEN
    RAISE EXCEPTION 'generated images already exist for job: %', p_job_id;
  END IF;

  v_expected_count := COALESCE(v_job.requested_image_count, 1);
  v_image_count := jsonb_array_length(p_images);

  IF v_image_count <> v_expected_count THEN
    RAISE EXCEPTION 'generated image count mismatch for job %, expected %, got %',
      p_job_id,
      v_expected_count,
      v_image_count;
  END IF;

  SELECT *
  INTO v_execution
  FROM public.generation_prompt_snapshots
  WHERE generation_prompt_snapshots.image_job_id = p_job_id;

  -- 派生ジョブは完了時点でも認可が有効か再検証する (REQ-004 / REQ-011)。
  --
  -- 生成には数十秒〜数分かかるため、その間に原作者が投稿を取り消す・非公開に
  -- する・派生者をブロックする・アカウント削除を予約する、あるいは派生者が
  -- フォローを外す、といった変化が起こり得る。存在確認だけでは
  -- 「取り消された投稿のプロンプトから作られた画像」が残ってしまう。
  --
  -- ここで失敗させると生成済みの成果物を破棄して返金することになるが、
  -- 原作者の意思を成果物より優先する（ADR-004 の延長）。
  IF v_job.origin_post_id IS NOT NULL THEN
    SELECT is_available, origin_author_id, root_post_id
    INTO v_origin_available, v_origin_author, v_origin_root
    FROM public.validate_derived_prompt_source(v_job.origin_post_id, v_job.user_id);

    IF NOT COALESCE(v_origin_available, false) OR v_origin_author IS NULL THEN
      RAISE EXCEPTION
        'DERIVED_ORIGIN_UNAVAILABLE: origin post no longer usable for job %', p_job_id;
    END IF;

    -- 承認されていない見本つきの作品から作った画像は、審査に回す（ADR-008）
    v_needs_review := EXISTS (
      SELECT 1
      FROM public.generated_image_reference_secrets AS s
      WHERE s.image_id = v_origin_root
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.generated_image_catalog_reviews AS r
      WHERE r.image_id = v_origin_root
        AND r.status = 'approved'
    );
  END IF;

  -- 作者の見本は、本人のものであることを完了時にも確かめる
  IF v_job.catalog_reference_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.catalog_reference_images AS c
      WHERE c.id = v_job.catalog_reference_id
        AND c.user_id = v_job.user_id
    ) THEN
      RAISE EXCEPTION 'CATALOG_REFERENCE_UNAVAILABLE: reference not owned for job %', p_job_id;
    END IF;
    v_needs_review := true;
  END IF;

  FOR v_image IN
    SELECT element
    FROM jsonb_array_elements(p_images) AS elements(element)
  LOOP
    v_image_url := NULLIF(TRIM(v_image->>'image_url'), '');
    v_storage_path := NULLIF(TRIM(v_image->>'storage_path'), '');
    v_image_width := CASE
      WHEN v_image->>'width' ~ '^[1-9][0-9]*$' THEN (v_image->>'width')::integer
      ELSE NULL
    END;
    v_image_height := CASE
      WHEN v_image->>'height' ~ '^[1-9][0-9]*$' THEN (v_image->>'height')::integer
      ELSE NULL
    END;

    IF v_image_url IS NULL THEN
      RAISE EXCEPTION 'image_url is required for job %, index %', p_job_id, v_index;
    END IF;

    IF v_storage_path IS NULL THEN
      RAISE EXCEPTION 'storage_path is required for job %, index %', p_job_id, v_index;
    END IF;

    INSERT INTO public.generated_images AS gi (
      user_id,
      image_url,
      storage_path,
      prompt,
      background_mode,
      is_posted,
      generation_type,
      generation_metadata,
      model,
      source_image_stock_id,
      image_job_id,
      image_job_result_index,
      width,
      height,
      style_template_id,
      override_target,
      override_outfit,
      override_angle,
      override_pose,
      override_background,
      source_post_id,
      source_author_id
    )
    VALUES (
      v_job.user_id,
      v_image_url,
      v_storage_path,
      -- 本文はユーザーが読める列に置かない。表示は author secret から
      -- 解決される (REQ-020)。
      '',
      COALESCE(p_background_mode, v_job.background_mode),
      false,
      v_job.generation_type,
      COALESCE(p_generation_metadata, v_job.generation_metadata),
      COALESCE(p_model, v_job.model),
      v_job.source_image_stock_id,
      p_job_id,
      v_index,
      v_image_width,
      v_image_height,
      v_job.style_template_id,
      v_job.override_target,
      v_job.override_outfit,
      v_job.override_angle,
      v_job.override_pose,
      v_job.override_background,
      -- 出所は検証済みジョブと原作行から導出する（REQ-009）。
      -- trigger が root / free / 原作者一致を再検証する。
      v_job.origin_post_id,
      v_origin_author
    )
    RETURNING gi.id INTO v_inserted_id;

    -- author secret はユーザーへ開示し得る生入力があるときだけ作る。
    --
    -- origin_post_id IS NULL を独立した条件にする。author_input の NULL 判定
    -- だけに頼ると、将来 provider_prompt へフォールバックする変更が入った
    -- ときに、原作者の入力が派生者の secret として作られてしまう。
    -- generated_image_prompt_secrets 側の trigger でも同じことを拒否する。
    IF v_job.origin_post_id IS NULL
       AND v_execution.snapshot_kind = 'materialized'
       AND v_execution.author_input IS NOT NULL
       AND v_execution.author_input_owner_id IS NOT NULL
    THEN
      INSERT INTO public.generated_image_prompt_secrets (
        image_id,
        prompt,
        prompt_owner_id,
        source_kind
      )
      VALUES (
        v_inserted_id,
        v_execution.author_input,
        v_execution.author_input_owner_id,
        'author_input'
      )
      ON CONFLICT (image_id) DO NOTHING;
    END IF;

    -- 見本との対応は、作者の見本で作った画像（根）にだけ置く。
    -- 派生生成では置かない。使うたびに根から引く（ADR-003）。
    IF v_job.catalog_reference_id IS NOT NULL THEN
      INSERT INTO public.generated_image_reference_secrets (image_id, reference_id, takes)
      VALUES (v_inserted_id, v_job.catalog_reference_id, v_job.catalog_reference_takes)
      ON CONFLICT (image_id) DO NOTHING;
    END IF;

    IF v_needs_review THEN
      INSERT INTO public.generated_image_catalog_reviews (image_id, user_id, status)
      VALUES (v_inserted_id, v_job.user_id, 'not_submitted')
      ON CONFLICT (image_id) DO NOTHING;
    END IF;

    IF v_index = 0 THEN
      v_first_image_id := v_inserted_id;
      v_first_image_url := v_image_url;
    END IF;

    v_index := v_index + 1;
  END LOOP;

  UPDATE public.image_jobs
  SET
    status = 'succeeded',
    processing_stage = 'completed',
    result_image_url = COALESCE(NULLIF(TRIM(p_result_image_url), ''), v_first_image_url),
    error_message = NULL,
    completed_at = now(),
    generation_metadata = COALESCE(p_generation_metadata, v_job.generation_metadata),
    updated_at = now()
  WHERE image_jobs.id = p_job_id
    AND image_jobs.status = 'processing';

  UPDATE public.credit_transactions
  SET related_generation_id = v_first_image_id
  WHERE credit_transactions.user_id = v_job.user_id
    AND credit_transactions.related_generation_id IS NULL
    AND credit_transactions.transaction_type = 'consumption'
    AND credit_transactions.metadata->>'job_id' = p_job_id::text;

  -- 派生生成の利用イベントを同一トランザクションで記録する (REQ-012)
  IF v_job.origin_post_id IS NOT NULL THEN
    PERFORM public.record_prompt_usage(p_job_id);
  END IF;

  RETURN QUERY
  SELECT
    gi.id,
    gi.image_url,
    gi.storage_path,
    gi.image_job_result_index
  FROM public.generated_images AS gi
  WHERE gi.image_job_id = p_job_id
  ORDER BY gi.image_job_result_index ASC NULLS LAST, gi.created_at ASC;
END;
$function$;

-- -----------------------------------------------
-- 10. 通知
-- -----------------------------------------------

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
    'like', 'comment', 'follow', 'bonus',
    'style_template_approved', 'style_template_rejected', 'style_template_unpublished',
    'catalog_entry_approved', 'catalog_entry_rejected', 'catalog_entry_unpublished',
    'creator_looks_submission_received', 'creator_looks_submission_acknowledged',
    'creator_looks_moderation_result', 'creator_looks_post_published',
    'post_moderation_removed', 'post_moderation_appeal_result',
    'derived_post_published', 'derived_usage_milestone',
    'style_preset_post_published', 'style_preset_usage_milestone',
    'usage_reward_earned', 'admin_message',
    'catalog_review_approved', 'catalog_review_rejected'
  ]::text[])) NOT VALID;
ALTER TABLE public.notifications
  VALIDATE CONSTRAINT notifications_type_check;

CREATE OR REPLACE FUNCTION public.push_category_for_notification_type(p_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_type = 'like' THEN 'likes'
    WHEN p_type = 'comment' THEN 'comments'
    WHEN p_type = 'follow' THEN 'follows'
    WHEN p_type IN (
      'derived_post_published',
      'derived_usage_milestone',
      'style_preset_post_published',
      'style_preset_usage_milestone',
      'creator_looks_post_published'
    ) THEN 'creator_activity'
    WHEN p_type IN ('bonus', 'usage_reward_earned') THEN 'percoin'
    WHEN p_type IN (
      'style_template_approved',
      'style_template_rejected',
      'style_template_unpublished',
      'catalog_entry_approved',
      'catalog_entry_rejected',
      'catalog_entry_unpublished',
      'creator_looks_submission_received',
      'creator_looks_submission_acknowledged',
      'creator_looks_moderation_result',
      'post_moderation_removed',
      'post_moderation_appeal_result',
      'catalog_review_approved',
      'catalog_review_rejected'
    ) THEN 'moderation'
    ELSE NULL
  END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
