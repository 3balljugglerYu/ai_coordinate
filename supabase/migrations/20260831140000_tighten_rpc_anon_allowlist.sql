BEGIN;

/*
  anon の許可リストを「未ログインから呼ばれる必要があるものだけ」に絞り、
  service_role の判定を正しい形へ直す（#584 の続き。レビュー指摘に基づく）。

  ## 1) 許可リストの考え方を変える

  これまでは「未ログインから呼ばれても関数内で弾けるもの」を残していた。
  正しくは **未ログインから呼ばれる必要があるものだけ**を残す。
  弾けることと、開けておく理由があることは別。

  剥がす5本はいずれもログインが前提:
    create_collection_completion_post / delete_comment_thread /
    get_user_generated_count / grant_tour_bonus / insert_source_image_stock

  ⭐ get_user_generated_count は image_jobs の成功数を集計しており、
  **公開投稿数ではなく本人の生成総数**（未投稿ぶんを含む）。
  呼び出し側も isOwnProfile のときだけ呼び、他人には "-" を出している。
  公開情報ではないので anon に開けておく理由が無い。

  残す6本（未ログインの画面で実際に必要なもの）:
    get_follow_counts / get_user_like_count / get_user_view_count /
    get_post_bonus_amounts / get_prompt_use_bonus_amount / increment_view_count

  ## 2) increment_view_count に公開条件を足す

  id だけで更新していたため、**非公開・審査中の画像の閲覧数も増やせた**。
  RLS の公開条件（is_posted = true かつ moderation_status = 'visible'）に揃える。
  未ログインの閲覧を数える仕様は維持する。

  ## 3) service_role 判定を auth.uid() から切り離す

  `IF auth.uid() IS NOT NULL THEN RAISE ... service role only` は
  「service_role のみ」の意図に対して**ログイン中のユーザーしか弾かない**。
  未ログインは auth.uid() が NULL なので素通りする（#582〜#584 の原因）。

  既存の is_trusted_lineage_writer() に寄せる。これは
  session_user が 'authenticator'（PostgREST 経由）なら JWT の role が
  service_role のときだけ true、それ以外（migration や cron の直接接続）は true。
  未知のクライアントロールが増えても false に倒れる。

  ⭐ 権限で入口を塞いでも、次に同じ書き方をした関数が既定 grant で開いた瞬間に
  再発する。条件式そのものを直しておく必要がある。

  ## 補足: 既定権限は閉じられない

  public スキーマの関数は supabase_admin の既定権限で anon / authenticated へ
  EXECUTE が自動付与される。postgres 側の既定は変更できるが supabase_admin 側は
  `permission denied to change default privileges` で変更できない（検証済み）。
  そのため「新規関数が既定で閉じる」状態は作れず、検知で補う
  （scripts/check-rpc-grants.mjs を同 PR で追加）。
*/

-- ---- 1) ログインが前提の5本から anon を剥がす ----
REVOKE ALL ON FUNCTION public.create_collection_completion_post(p_completion_id uuid, p_caption text, p_image_url text, p_storage_path text, p_storage_path_display text, p_storage_path_thumb text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_collection_completion_post(p_completion_id uuid, p_caption text, p_image_url text, p_storage_path text, p_storage_path_display text, p_storage_path_thumb text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_collection_completion_post(p_completion_id uuid, p_caption text, p_image_url text, p_storage_path text, p_storage_path_display text, p_storage_path_thumb text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_collection_completion_post(p_completion_id uuid, p_caption text, p_image_url text, p_storage_path text, p_storage_path_display text, p_storage_path_thumb text) TO service_role;

REVOKE ALL ON FUNCTION public.delete_comment_thread(p_comment_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_comment_thread(p_comment_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_comment_thread(p_comment_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_comment_thread(p_comment_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_user_generated_count(p_user_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_generated_count(p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_generated_count(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_generated_count(p_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.grant_tour_bonus(p_user_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_tour_bonus(p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.grant_tour_bonus(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_tour_bonus(p_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.insert_source_image_stock(p_user_id uuid, p_image_url text, p_storage_path text, p_name text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_source_image_stock(p_user_id uuid, p_image_url text, p_storage_path text, p_name text) FROM anon;
GRANT EXECUTE ON FUNCTION public.insert_source_image_stock(p_user_id uuid, p_image_url text, p_storage_path text, p_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_source_image_stock(p_user_id uuid, p_image_url text, p_storage_path text, p_name text) TO service_role;

-- ---- 2) 閲覧数は公開中の投稿だけ / 3) service_role 判定の是正 ----
--      定義は pg_get_functiondef から取得し、該当箇所だけを置換している

CREATE OR REPLACE FUNCTION public.refund_percoins(p_user_id uuid, p_amount integer, p_to_promo integer, p_to_paid integer, p_job_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_expire_at TIMESTAMPTZ;
  v_tx_id UUID;
  v_job_id TEXT;
  v_job_uuid UUID;
  v_consumption_tx_id UUID;
  v_allocation_total INTEGER := 0;
  v_to_period_limited INTEGER := 0;
  v_to_unlimited_bonus INTEGER := 0;
  v_to_paid INTEGER := 0;
BEGIN
  IF NOT public.is_trusted_lineage_writer() THEN
    RAISE EXCEPTION 'Unauthorized: refund_percoins can only be called with service role';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid refund amount';
  END IF;

  v_job_id := NULLIF(TRIM(COALESCE(p_job_id, '')), '');
  IF v_job_id IS NOT NULL THEN
    IF v_job_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid job_id: %', v_job_id;
    END IF;
    v_job_uuid := v_job_id::UUID;

    IF EXISTS (
      SELECT 1 FROM credit_transactions
      WHERE user_id = p_user_id
        AND transaction_type = 'refund'
        AND metadata->>'job_id' = v_job_id
    ) THEN
      RETURN;
    END IF;

    SELECT ct.id
      INTO v_consumption_tx_id
    FROM credit_transactions ct
    WHERE ct.user_id = p_user_id
      AND ct.transaction_type = 'consumption'
      AND ct.metadata->>'job_id' = v_job_id
    ORDER BY ct.created_at DESC
    LIMIT 1;

    IF v_consumption_tx_id IS NOT NULL THEN
      SELECT COALESCE(SUM(gpa.amount), 0)::INTEGER
        INTO v_allocation_total
      FROM generation_percoin_allocations gpa
      WHERE gpa.consumption_transaction_id = v_consumption_tx_id
        AND gpa.user_id = p_user_id
        AND gpa.job_id = v_job_uuid
        AND gpa.restored_at IS NULL;
    END IF;
  END IF;

  -- allocationベース返金（本流）
  IF v_consumption_tx_id IS NOT NULL AND v_allocation_total > 0 THEN
    IF v_allocation_total != p_amount THEN
      RAISE EXCEPTION 'allocation total mismatch: expected %, got %', v_allocation_total, p_amount;
    END IF;

    SELECT
      COALESCE(SUM(gpa.amount) FILTER (WHERE gpa.allocation_kind = 'period_limited'), 0)::INTEGER,
      COALESCE(SUM(gpa.amount) FILTER (WHERE gpa.allocation_kind = 'unlimited_bonus'), 0)::INTEGER,
      COALESCE(SUM(gpa.amount) FILTER (WHERE gpa.allocation_kind = 'paid'), 0)::INTEGER
    INTO
      v_to_period_limited,
      v_to_unlimited_bonus,
      v_to_paid
    FROM generation_percoin_allocations gpa
    WHERE gpa.consumption_transaction_id = v_consumption_tx_id
      AND gpa.user_id = p_user_id
      AND gpa.job_id = v_job_uuid
      AND gpa.restored_at IS NULL;

    INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
    VALUES (
      p_user_id,
      p_amount,
      'refund',
      COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'to_promo', v_to_period_limited + v_to_unlimited_bonus,
        'to_paid', v_to_paid,
        'to_period_limited', v_to_period_limited,
        'to_unlimited_bonus', v_to_unlimited_bonus,
        'job_id', v_job_id,
        'refund_mode', 'allocations'
      )
    )
    RETURNING id INTO v_tx_id;

    IF v_to_period_limited > 0 THEN
      INSERT INTO free_percoin_batches (
        user_id,
        amount,
        remaining_amount,
        granted_at,
        expire_at,
        source,
        credit_transaction_id
      )
      SELECT
        p_user_id,
        SUM(gpa.amount)::INTEGER,
        SUM(gpa.amount)::INTEGER,
        v_now,
        gpa.source_expire_at,
        'refund',
        v_tx_id
      FROM generation_percoin_allocations gpa
      WHERE gpa.consumption_transaction_id = v_consumption_tx_id
        AND gpa.user_id = p_user_id
        AND gpa.job_id = v_job_uuid
        AND gpa.restored_at IS NULL
        AND gpa.allocation_kind = 'period_limited'
      GROUP BY gpa.source_expire_at;
    END IF;

    IF v_to_unlimited_bonus > 0 THEN
      INSERT INTO free_percoin_batches (
        user_id,
        amount,
        remaining_amount,
        granted_at,
        expire_at,
        source,
        credit_transaction_id
      )
      VALUES (
        p_user_id,
        v_to_unlimited_bonus,
        v_to_unlimited_bonus,
        v_now,
        NULL,
        'refund',
        v_tx_id
      );
    END IF;

    INSERT INTO user_credits (user_id, balance, paid_balance)
    VALUES (p_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE user_credits
    SET paid_balance = paid_balance + v_to_paid,
        balance = balance + p_amount,
        updated_at = v_now
    WHERE user_id = p_user_id;

    UPDATE generation_percoin_allocations
    SET refund_transaction_id = v_tx_id,
        restored_at = v_now
    WHERE consumption_transaction_id = v_consumption_tx_id
      AND user_id = p_user_id
      AND job_id = v_job_uuid
      AND restored_at IS NULL;

    RETURN;
  END IF;

  -- legacy fallback（allocationが存在しない旧データ向け）
  IF p_to_promo + p_to_paid != p_amount THEN
    RAISE EXCEPTION 'invalid refund amounts';
  END IF;

  INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
  VALUES (
    p_user_id,
    p_amount,
    'refund',
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'to_promo', p_to_promo,
      'to_paid', p_to_paid,
      'to_period_limited', p_to_promo,
      'to_unlimited_bonus', 0,
      'job_id', v_job_id,
      'refund_mode', 'legacy_fallback'
    )
  )
  RETURNING id INTO v_tx_id;

  IF p_to_promo > 0 THEN
    v_expire_at := (
      date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
      + interval '7 months' - interval '1 second'
    ) AT TIME ZONE 'Asia/Tokyo';

    INSERT INTO free_percoin_batches (
      user_id,
      amount,
      remaining_amount,
      granted_at,
      expire_at,
      source,
      credit_transaction_id
    )
    VALUES (
      p_user_id,
      p_to_promo,
      p_to_promo,
      v_now,
      v_expire_at,
      'refund',
      v_tx_id
    );
  END IF;

  INSERT INTO user_credits (user_id, balance, paid_balance)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE user_credits
  SET paid_balance = paid_balance + p_to_paid,
      balance = balance + p_amount,
      updated_at = v_now
  WHERE user_id = p_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.deduct_percoins_admin(p_user_id uuid, p_amount integer, p_balance_type text, p_idempotency_key text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(balance integer, amount_deducted integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_paid_balance INTEGER;
  v_remaining INTEGER;
  v_deduct INTEGER;
  v_from_unlimited_bonus INTEGER := 0;
  v_from_paid INTEGER := 0;
  v_new_balance INTEGER;
  r RECORD;
BEGIN
  IF NOT public.is_trusted_lineage_writer() THEN
    RAISE EXCEPTION 'Unauthorized: deduct_percoins_admin can only be called with service role';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF p_balance_type NOT IN ('period_limited', 'unlimited') THEN
    RAISE EXCEPTION 'balance_type must be period_limited or unlimited';
  END IF;

  IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('credit_transactions_admin_deduction'),
    hashtext(p_idempotency_key)
  );

  IF EXISTS (
    SELECT 1
    FROM credit_transactions
    WHERE transaction_type = 'admin_deduction'
      AND metadata->>'idempotency_key' = p_idempotency_key
  ) THEN
    SELECT uc.balance INTO v_new_balance
    FROM user_credits uc
    WHERE uc.user_id = p_user_id;

    RETURN QUERY SELECT COALESCE(v_new_balance, 0), 0;
    RETURN;
  END IF;

  INSERT INTO user_credits (user_id, balance, paid_balance)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT uc.paid_balance INTO v_paid_balance
  FROM user_credits uc
  WHERE uc.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_credits row not found for user_id=%', p_user_id;
  END IF;

  v_remaining := p_amount;

  IF p_balance_type = 'period_limited' THEN
    FOR r IN (
      SELECT id, remaining_amount
      FROM free_percoin_batches
      WHERE user_id = p_user_id
        AND remaining_amount > 0
        AND expire_at IS NOT NULL
        AND expire_at > now()
      ORDER BY expire_at ASC
      FOR UPDATE
    ) LOOP
      EXIT WHEN v_remaining <= 0;

      v_deduct := LEAST(r.remaining_amount, v_remaining);
      v_remaining := v_remaining - v_deduct;

      UPDATE free_percoin_batches
      SET remaining_amount = remaining_amount - v_deduct,
          updated_at = now()
      WHERE id = r.id;

      DELETE FROM free_percoin_batches
      WHERE id = r.id AND remaining_amount = 0;
    END LOOP;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'ユーザーが保有している期間限定のペルコインが、設定したペルコイン数より少ないです。',
        DETAIL = 'INSUFFICIENT_PERIOD_LIMITED_PERCOIN';
    END IF;

    UPDATE user_credits
    SET balance = user_credits.balance - p_amount,
        updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
    VALUES (
      p_user_id,
      -p_amount,
      'admin_deduction',
      COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'balance_type', p_balance_type,
        'idempotency_key', p_idempotency_key,
        'from_period_limited', p_amount
      )
    );
  ELSE
    FOR r IN (
      SELECT id, remaining_amount
      FROM free_percoin_batches
      WHERE user_id = p_user_id
        AND remaining_amount > 0
        AND expire_at IS NULL
      ORDER BY granted_at ASC
      FOR UPDATE
    ) LOOP
      EXIT WHEN v_remaining <= 0;

      v_deduct := LEAST(r.remaining_amount, v_remaining);
      v_from_unlimited_bonus := v_from_unlimited_bonus + v_deduct;
      v_remaining := v_remaining - v_deduct;

      UPDATE free_percoin_batches
      SET remaining_amount = remaining_amount - v_deduct,
          updated_at = now()
      WHERE id = r.id;

      DELETE FROM free_percoin_batches
      WHERE id = r.id AND remaining_amount = 0;
    END LOOP;

    v_from_paid := v_remaining;
    IF v_from_paid > v_paid_balance THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'ユーザーが保有している無期限のペルコインが、設定したペルコイン数より少ないです。',
        DETAIL = 'INSUFFICIENT_UNLIMITED_PERCOIN';
    END IF;

    UPDATE user_credits
    SET paid_balance = user_credits.paid_balance - v_from_paid,
        balance = user_credits.balance - p_amount,
        updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
    VALUES (
      p_user_id,
      -p_amount,
      'admin_deduction',
      COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'balance_type', p_balance_type,
        'idempotency_key', p_idempotency_key,
        'from_unlimited_bonus', v_from_unlimited_bonus,
        'from_paid', v_from_paid
      )
    );
  END IF;

  SELECT uc.balance INTO v_new_balance
  FROM user_credits uc
  WHERE uc.user_id = p_user_id;

  RETURN QUERY SELECT v_new_balance, p_amount;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_percoin_transaction(p_user_id uuid, p_amount integer, p_mode text, p_metadata jsonb DEFAULT NULL::jsonb, p_stripe_payment_intent_id text DEFAULT NULL::text, p_related_generation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(balance integer, from_promo integer, from_paid integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_expire_at TIMESTAMPTZ;
  v_tx_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF p_mode NOT IN ('purchase_paid', 'purchase_promo', 'consumption') THEN
    RAISE EXCEPTION 'unsupported mode: %', p_mode;
  END IF;

  IF p_mode = 'consumption' THEN
    IF NOT public.is_trusted_lineage_writer()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Unauthorized: caller must be service role or target user (auth.uid() = p_user_id)';
    END IF;
    RETURN QUERY SELECT * FROM deduct_free_percoins(p_user_id, p_amount, p_metadata, p_related_generation_id);
    RETURN;
  END IF;

  IF NOT public.is_trusted_lineage_writer() THEN
    RAISE EXCEPTION 'Unauthorized: purchase modes can only be called with service role';
  END IF;

  INSERT INTO user_credits (user_id, balance, paid_balance)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  IF p_mode = 'purchase_paid' THEN
    UPDATE user_credits
    SET paid_balance = user_credits.paid_balance + p_amount,
        balance = user_credits.balance + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO credit_transactions (user_id, amount, transaction_type, stripe_payment_intent_id, metadata)
    VALUES (p_user_id, p_amount, 'purchase', p_stripe_payment_intent_id, COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('bucket', 'paid'))
    RETURNING id INTO v_tx_id;

    RETURN QUERY
    SELECT uc.balance, 0, p_amount
    FROM user_credits uc WHERE uc.user_id = p_user_id;
    RETURN;
  END IF;

  IF p_mode = 'purchase_promo' THEN
    v_expire_at := (
      date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
      + interval '7 months' - interval '1 second'
    ) AT TIME ZONE 'Asia/Tokyo';

    INSERT INTO credit_transactions (user_id, amount, transaction_type, metadata)
    VALUES (p_user_id, p_amount, 'purchase', COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('bucket', 'promo'))
    RETURNING id INTO v_tx_id;

    INSERT INTO free_percoin_batches (user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id)
    VALUES (p_user_id, p_amount, p_amount, now(), v_expire_at, 'admin_bonus', v_tx_id);

    UPDATE user_credits
    SET balance = user_credits.balance + p_amount, updated_at = now()
    WHERE user_id = p_user_id;

    RETURN QUERY
    SELECT uc.balance, p_amount, 0
    FROM user_credits uc WHERE uc.user_id = p_user_id;
    RETURN;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_view_count(image_id_param uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.generated_images
  SET view_count = view_count + 1
  WHERE id = image_id_param
    AND is_posted = true
    AND moderation_status = 'visible';
END;
$function$
;

-- ---- 4) レビュー指摘: authenticated 経由の露出も塞ぐ ----
--      anon を剥がしただけでは「ログインさえしていれば他人の情報が読める」状態が残る。
--      公開プロフィールの集計は、他人から見るとき RLS の公開条件に揃える。

CREATE OR REPLACE FUNCTION public.get_user_generated_count(p_user_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  /*
    未投稿ぶんを含む本人の生成総数。公開情報ではないので他人には返さない。
    anon は権限側で剥がしたが、それだけでは「ログインさえしていれば
    他人の生成量が読める」状態が残る（レビュー指摘）。
  */
  IF auth.uid() IS DISTINCT FROM p_user_id
     AND NOT public.is_trusted_lineage_writer() THEN
    RAISE EXCEPTION 'Unauthorized: caller is not the target user';
  END IF;

  RETURN coalesce(
    (SELECT sum(coalesce(requested_image_count, 1))
     FROM public.image_jobs
     WHERE user_id = p_user_id AND status = 'succeeded'),
    0
  )::bigint;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_like_count(p_user_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::bigint
  from public.likes as l
  join public.generated_images as gi on gi.id = l.image_id
  where gi.user_id = p_user_id
    and gi.is_posted = true
    AND (
      -- 他人から見るときは公開中の投稿だけ。RLS の公開条件に合わせる
      gi.moderation_status = 'visible'
      OR auth.uid() = p_user_id
      OR public.is_trusted_lineage_writer()
    );
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_view_count(p_user_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(view_count), 0)::bigint
  from public.generated_images
  where user_id = p_user_id
    and is_posted = true
    and (
      -- 他人から見るときは公開中の投稿だけ。RLS の公開条件に合わせる
      moderation_status = 'visible'
      OR auth.uid() = p_user_id
      OR public.is_trusted_lineage_writer()
    );
$function$
;


NOTIFY pgrst, 'reload schema';

COMMIT;
