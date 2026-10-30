-- i2i カタログ: 作り直しになった見本で作った、ほかの作品を、審査に出せない・承認できないようにする
-- 計画: docs/planning/i2i-catalog-review-implementation-plan.md（Phase 4）
--
-- 段階1（20261029100000）では、作品を作り直しにすると、その見本（catalog_reference_images.rejected_at）が止まる。
-- ところが、同じ見本で作った別の作品は、審査に出せて承認もできた。承認して投稿しても、
-- ほかの人の生成ではその見本が使えない（resolve_catalog_reference_for_job が止める）。
-- 2026-10-30 ユーザー決定: 審査に出すことも、承認することもできないようにする（作り直しにはできる）。
--
-- 変えるのは2つの RPC だけ。どちらも段階1の定義に確かめを1つ足して置き換える（権限は同じに付け直す）。
-- 断るときは 'CATALOG_REVIEW_REFERENCE_REJECTED'（ERRCODE 22023）。API はこの文で見分ける。

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

  -- 見本が、ほかの作品の審査で作り直しになっていれば出せない。
  -- 承認されても、その見本はもう使えない（resolve_catalog_reference_for_job が止める）。
  -- 見本は根の作品にだけ対応があるので、派生の作品なら根をたどる。
  IF EXISTS (
    SELECT 1
    FROM public.generated_images AS gi
    JOIN public.generated_image_reference_secrets AS s
      ON s.image_id = COALESCE(gi.source_post_id, gi.id)
    JOIN public.catalog_reference_images AS c
      ON c.id = s.reference_id
    WHERE gi.id = p_image_id
      AND c.rejected_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'CATALOG_REVIEW_REFERENCE_REJECTED' USING ERRCODE = '22023';
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

  -- 出したあとに削除・非表示になった画像は承認しない（通知も出さない）。
  -- 作り直しにはできる（見本を止めるため）。
  IF p_action = 'approve' AND NOT EXISTS (
    SELECT 1 FROM public.generated_images AS gi
    WHERE gi.id = p_image_id
      AND gi.moderation_status = 'visible'
  ) THEN
    RAISE EXCEPTION 'CATALOG_REVIEW_IMAGE_UNAVAILABLE' USING ERRCODE = '22023';
  END IF;

  -- 見本が、ほかの作品の審査で作り直しになっていれば承認しない（その見本はもう使えない）。
  -- 作り直しにはできる。
  IF p_action = 'approve' THEN
    IF EXISTS (
      SELECT 1
      FROM public.generated_images AS gi
      JOIN public.generated_image_reference_secrets AS s
        ON s.image_id = COALESCE(gi.source_post_id, gi.id)
      JOIN public.catalog_reference_images AS c
        ON c.id = s.reference_id
      WHERE gi.id = p_image_id
        AND c.rejected_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'CATALOG_REVIEW_REFERENCE_REJECTED' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_new_status := CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END;

  -- 作り直しは、使った見本そのものを止める。見本は根の作品にだけ対応があるので、
  -- 派生の作品なら根をたどる。止めないと、同じ見本で新しく作って出し直せてしまう。
  IF p_action = 'reject' THEN
    UPDATE public.catalog_reference_images AS c
    SET rejected_at = COALESCE(c.rejected_at, now())
    WHERE c.id IN (
      SELECT s.reference_id
      FROM public.generated_images AS gi
      JOIN public.generated_image_reference_secrets AS s
        ON s.image_id = COALESCE(gi.source_post_id, gi.id)
      WHERE gi.id = p_image_id
    );
  END IF;

  UPDATE public.generated_image_catalog_reviews AS r
  SET status = v_new_status,
      reason_category = CASE WHEN p_action = 'reject' THEN p_reason_category ELSE NULL END,
      reason = CASE WHEN p_action = 'reject' THEN v_reason ELSE NULL END,
      reviewed_at = now(),
      reviewed_by = p_admin_id
  WHERE r.image_id = p_image_id;

  -- 文言は画面側で type から組み立てる。title / body は通知一覧の予備。
  -- actor は受け取った本人にする（審査した運営を見せない。moderation 系の決まり ADR-011）。
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
    v_review.user_id,
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
