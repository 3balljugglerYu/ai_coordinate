BEGIN;

/*
  RPC が未ログイン(anon)から実行できる状態を塞ぐ。

  ## 何が起きていたか

  Supabase は新規関数の EXECUTE を PUBLIC 既定付与に加えて anon と
  authenticated にも直接 GRANT する。そのため SECURITY DEFINER 関数が
  **未ログインのまま /rest/v1/rpc/ から実行できる状態**だった
  (トリガーを除き36本)。SET ROLE anon で実行できることを確認済み。

  特に危険だったもの:
  - refund_percoins / deduct_percoins_admin
      `IF auth.uid() IS NOT NULL THEN RAISE` で守っていたが、これは
      **ログイン中のユーザーだけを弾き、匿名は素通りする**。
      「service_role のみ」という意図と実際の効果がずれていた
  - request_account_deletion
      確認条件が p_confirm_text='DELETE' と p_reauth_ok=true の**引数のみ**。
      通ると対象アカウントを停止し、投稿を全部非公開にし、削除を予約する
  - get_user_ids_by_emails
      auth.users を読み、メールから user_id と残高を返す。ガード無し
  - pgmq_send / pgmq_read / pgmq_delete

  ## 対象を絞った理由（レビュー指摘を受けて）

  当初は36本すべてを分類して一度に閉じようとしたが、**分類を2度誤った**。
  ファイル単位で `createAdminClient` の有無を見る方法だと、
  1つのファイルに両方のクライアントが混在する場合に誤判定する
  (`server-api.ts` の delete_comment_thread / increment_view_count は
  セッションクライアント経由で、閉じると本番が壊れるところだった)。

  そこで**呼び出し箇所ごとに、直前の supabase 代入まで遡って確認できたものだけ**に
  絞った。判定しきれなかったものはこの PR では触れない。
  安全側に倒す方が、閉じ漏れより優先度が高い(閉じ漏れは次の PR で拾える)。

  ## 残りの扱い

  セッションクライアント経由で呼ぶ関数(increment_view_count / delete_comment_thread /
  create_collection_completion_post / get_follow_counts / get_user_*_count /
  get_post_bonus_amounts など)は権限を変更しない。未ログインの閲覧でも
  呼ばれるものが含まれるため。呼び出し元の client を1件ずつ確定させてから別 PR で扱う。

  refund_percoins / deduct_percoins_admin に残る
  「auth.uid() が NULL であることを service_role の代わりに使う」書き方も
  条件式としては誤りだが、権限を剥がすことで外からは届かなくなる。別途直す。
*/

-- ---- service_role からのみ呼ぶ（呼び出し箇所ごとに確認済み） ----
REVOKE ALL ON FUNCTION public.deduct_free_percoins(p_user_id uuid, p_amount integer, p_metadata jsonb, p_related_generation_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_free_percoins(p_user_id uuid, p_amount integer, p_metadata jsonb, p_related_generation_id uuid) FROM anon;
REVOKE ALL ON FUNCTION public.deduct_free_percoins(p_user_id uuid, p_amount integer, p_metadata jsonb, p_related_generation_id uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_free_percoins(p_user_id uuid, p_amount integer, p_metadata jsonb, p_related_generation_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.deduct_percoins_admin(p_user_id uuid, p_amount integer, p_balance_type text, p_idempotency_key text, p_metadata jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_percoins_admin(p_user_id uuid, p_amount integer, p_balance_type text, p_idempotency_key text, p_metadata jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.deduct_percoins_admin(p_user_id uuid, p_amount integer, p_balance_type text, p_idempotency_key text, p_metadata jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_percoins_admin(p_user_id uuid, p_amount integer, p_balance_type text, p_idempotency_key text, p_metadata jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.get_due_deletion_candidates(p_limit integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_due_deletion_candidates(p_limit integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_due_deletion_candidates(p_limit integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_deletion_candidates(p_limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_expiration_notification_targets() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_expiration_notification_targets() FROM anon;
REVOKE ALL ON FUNCTION public.get_expiration_notification_targets() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_expiration_notification_targets() TO service_role;

REVOKE ALL ON FUNCTION public.get_user_ids_by_emails(p_emails text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_ids_by_emails(p_emails text[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_user_ids_by_emails(p_emails text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_ids_by_emails(p_emails text[]) TO service_role;

REVOKE ALL ON FUNCTION public.pgmq_delete(p_queue_name text, p_msg_id bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pgmq_delete(p_queue_name text, p_msg_id bigint) FROM anon;
REVOKE ALL ON FUNCTION public.pgmq_delete(p_queue_name text, p_msg_id bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pgmq_delete(p_queue_name text, p_msg_id bigint) TO service_role;

REVOKE ALL ON FUNCTION public.pgmq_read(p_queue_name text, p_vt integer, p_qty integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pgmq_read(p_queue_name text, p_vt integer, p_qty integer) FROM anon;
REVOKE ALL ON FUNCTION public.pgmq_read(p_queue_name text, p_vt integer, p_qty integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pgmq_read(p_queue_name text, p_vt integer, p_qty integer) TO service_role;

REVOKE ALL ON FUNCTION public.pgmq_send(p_queue_name text, p_message jsonb, p_delay integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pgmq_send(p_queue_name text, p_message jsonb, p_delay integer) FROM anon;
REVOKE ALL ON FUNCTION public.pgmq_send(p_queue_name text, p_message jsonb, p_delay integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pgmq_send(p_queue_name text, p_message jsonb, p_delay integer) TO service_role;

REVOKE ALL ON FUNCTION public.record_forfeiture_ledger(p_user_id uuid, p_email_hash text, p_deleted_at timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_forfeiture_ledger(p_user_id uuid, p_email_hash text, p_deleted_at timestamp with time zone) FROM anon;
REVOKE ALL ON FUNCTION public.record_forfeiture_ledger(p_user_id uuid, p_email_hash text, p_deleted_at timestamp with time zone) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_forfeiture_ledger(p_user_id uuid, p_email_hash text, p_deleted_at timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.refund_percoins(p_user_id uuid, p_amount integer, p_to_promo integer, p_to_paid integer, p_job_id text, p_metadata jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_percoins(p_user_id uuid, p_amount integer, p_to_promo integer, p_to_paid integer, p_job_id text, p_metadata jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.refund_percoins(p_user_id uuid, p_amount integer, p_to_promo integer, p_to_paid integer, p_job_id text, p_metadata jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refund_percoins(p_user_id uuid, p_amount integer, p_to_promo integer, p_to_paid integer, p_job_id text, p_metadata jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.request_account_deletion(p_user_id uuid, p_confirm_text text, p_reauth_ok boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_account_deletion(p_user_id uuid, p_confirm_text text, p_reauth_ok boolean) FROM anon;
REVOKE ALL ON FUNCTION public.request_account_deletion(p_user_id uuid, p_confirm_text text, p_reauth_ok boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(p_user_id uuid, p_confirm_text text, p_reauth_ok boolean) TO service_role;

-- ---- アプリコードからの呼び出しが無い ----
REVOKE ALL ON FUNCTION public.check_and_grant_referral_bonus_on_first_login(p_user_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_and_grant_referral_bonus_on_first_login(p_user_id uuid) FROM anon;
REVOKE ALL ON FUNCTION public.check_and_grant_referral_bonus_on_first_login(p_user_id uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_grant_referral_bonus_on_first_login(p_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_cron_job_run_details() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_cron_job_run_details() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_cron_job_run_details() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_cron_job_run_details() TO service_role;

REVOKE ALL ON FUNCTION public.expire_free_percoin_batches() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_free_percoin_batches() FROM anon;
REVOKE ALL ON FUNCTION public.expire_free_percoin_batches() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_free_percoin_batches() TO service_role;

REVOKE ALL ON FUNCTION public.get_percoin_bonus_default(p_source text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_percoin_bonus_default(p_source text) FROM anon;
REVOKE ALL ON FUNCTION public.get_percoin_bonus_default(p_source text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_bonus_default(p_source text) TO service_role;

REVOKE ALL ON FUNCTION public.get_percoin_streak_amount(p_streak_day integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_percoin_streak_amount(p_streak_day integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_percoin_streak_amount(p_streak_day integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_percoin_streak_amount(p_streak_day integer) TO service_role;

REVOKE ALL ON FUNCTION public.grant_referral_bonus(p_referrer_id uuid, p_referred_id uuid, p_referral_code text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_referral_bonus(p_referrer_id uuid, p_referred_id uuid, p_referral_code text) FROM anon;
REVOKE ALL ON FUNCTION public.grant_referral_bonus(p_referrer_id uuid, p_referred_id uuid, p_referral_code text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_referral_bonus(p_referrer_id uuid, p_referred_id uuid, p_referral_code text) TO service_role;

REVOKE ALL ON FUNCTION public.monitor_generation_billing_anomalies(p_since timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.monitor_generation_billing_anomalies(p_since timestamp with time zone) FROM anon;
REVOKE ALL ON FUNCTION public.monitor_generation_billing_anomalies(p_since timestamp with time zone) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.monitor_generation_billing_anomalies(p_since timestamp with time zone) TO service_role;

-- ---- セッションクライアント経由で呼ぶため authenticated は残し、anon だけ剥がす ----
--
--      ⭐ ガード(auth.uid() <> p_user_id)だけでは anon を止められない。
--      anon は auth.uid() が NULL なので条件を素通りし、任意の p_user_id で
--      実行できてしまう(grant_streak_bonus はペルコイン付与まで進む)。
--      CREATE OR REPLACE は既存の EXECUTE 権限を閉じないので、権限側でも剥がす。

REVOKE ALL ON FUNCTION public.cancel_account_deletion(p_user_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_account_deletion(p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion(p_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.check_and_grant_referral_bonus_on_first_login_with_reason(p_user_id uuid, p_referral_code text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_and_grant_referral_bonus_on_first_login_with_reason(p_user_id uuid, p_referral_code text) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_and_grant_referral_bonus_on_first_login_with_reason(p_user_id uuid, p_referral_code text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_grant_referral_bonus_on_first_login_with_reason(p_user_id uuid, p_referral_code text) TO service_role;

REVOKE ALL ON FUNCTION public.generate_referral_code(p_user_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_referral_code(p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_referral_code(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_referral_code(p_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.grant_streak_bonus(p_user_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_streak_bonus(p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.grant_streak_bonus(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_streak_bonus(p_user_id uuid) TO service_role;

-- ---- 上記4本に「他人の user_id では実行できない」条件を足す ----
--      定義は pg_get_functiondef の本文の BEGIN 直後へガードを挿入しただけ

CREATE OR REPLACE FUNCTION public.cancel_account_deletion(p_user_id uuid)
 RETURNS TABLE(status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_was_scheduled boolean;
BEGIN
  /*
    呼び出し元の検証。これらはセッションクライアント経由で呼ばれるため
    authenticated の EXECUTE を残す必要がある。その代わり、他人の user_id を
    渡して実行できないようにする（ログインさえしていれば通る状態だった）。
    サーバー経由(service_role)は auth.uid() が NULL なので従来どおり通る。
  */
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller is not the target user';
  END IF;

  SELECT (deletion_scheduled_at IS NOT NULL)
  INTO v_was_scheduled
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF COALESCE(v_was_scheduled, false) = false THEN
    RETURN QUERY SELECT 'not_scheduled'::text;
    RETURN;
  END IF;

  UPDATE public.profiles
  SET
    deactivation_requested_at = NULL,
    deletion_scheduled_at = NULL,
    deactivated_at = NULL,
    reactivated_at = now()
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT 'reactivated'::text;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_and_grant_referral_bonus_on_first_login_with_reason(p_user_id uuid, p_referral_code text DEFAULT NULL::text)
 RETURNS TABLE(bonus_granted integer, reason_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_referral_code TEXT;
  v_meta_referral_code TEXT;
  v_referrer_id UUID;
  v_user_created_at TIMESTAMPTZ;
  v_bonus_granted INTEGER;
  v_already_granted BOOLEAN;
BEGIN
  /*
    呼び出し元の検証。これらはセッションクライアント経由で呼ばれるため
    authenticated の EXECUTE を残す必要がある。その代わり、他人の user_id を
    渡して実行できないようにする（ログインさえしていれば通る状態だった）。
    サーバー経由(service_role)は auth.uid() が NULL なので従来どおり通る。
  */
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller is not the target user';
  END IF;

  -- 新規ユーザー判定とメタデータ取得
  SELECT
    created_at,
    raw_user_meta_data->>'referral_code'
  INTO
    v_user_created_at,
    v_meta_referral_code
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_created_at IS NULL THEN
    RETURN QUERY SELECT 0, 'transient_error';
    RETURN;
  END IF;

  -- アカウント作成から24時間を超えた場合は対象外
  IF v_user_created_at < (NOW() - INTERVAL '24 hours') THEN
    RETURN QUERY SELECT 0, 'window_expired';
    RETURN;
  END IF;

  -- 既に紹介特典が付与されている場合
  SELECT EXISTS(
    SELECT 1
    FROM public.referrals
    WHERE referred_id = p_user_id
  ) INTO v_already_granted;

  IF v_already_granted THEN
    RETURN QUERY SELECT 0, 'already_granted';
    RETURN;
  END IF;

  -- リクエストパラメータ優先、なければメタデータを参照
  v_referral_code := COALESCE(
    NULLIF(BTRIM(p_referral_code), ''),
    NULLIF(BTRIM(v_meta_referral_code), '')
  );

  IF v_referral_code IS NULL THEN
    RETURN QUERY SELECT 0, 'missing_code';
    RETURN;
  END IF;

  -- 紹介コードから紹介者を特定
  SELECT user_id
  INTO v_referrer_id
  FROM public.profiles
  WHERE referral_code = v_referral_code;

  -- 不正コードまたは自己紹介を拒否
  IF v_referrer_id IS NULL OR v_referrer_id = p_user_id THEN
    RETURN QUERY SELECT 0, 'invalid_code';
    RETURN;
  END IF;

  BEGIN
    v_bonus_granted := public.grant_referral_bonus(
      v_referrer_id,
      p_user_id,
      v_referral_code
    );

    IF v_bonus_granted > 0 THEN
      RETURN QUERY SELECT v_bonus_granted, 'granted';
      RETURN;
    END IF;

    -- 競合で0が返る可能性があるため再確認
    SELECT EXISTS(
      SELECT 1
      FROM public.referrals
      WHERE referred_id = p_user_id
    ) INTO v_already_granted;

    IF v_already_granted THEN
      RETURN QUERY SELECT 0, 'already_granted';
    ELSE
      RETURN QUERY SELECT 0, 'transient_error';
    END IF;
    RETURN;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Error granting referral bonus with reason: %', SQLERRM;
    RETURN QUERY SELECT 0, 'transient_error';
    RETURN;
  END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_referral_code(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_existing_code TEXT;
  v_new_code TEXT;
  v_attempts INTEGER := 0;
  v_max_attempts INTEGER := 3;
BEGIN
  /*
    呼び出し元の検証。これらはセッションクライアント経由で呼ばれるため
    authenticated の EXECUTE を残す必要がある。その代わり、他人の user_id を
    渡して実行できないようにする（ログインさえしていれば通る状態だった）。
    サーバー経由(service_role)は auth.uid() が NULL なので従来どおり通る。
  */
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller is not the target user';
  END IF;

  -- 既存の紹介コードを確認
  SELECT referral_code
  INTO v_existing_code
  FROM profiles
  WHERE user_id = p_user_id;

  -- 既に紹介コードが存在する場合は既存のコードを返す
  IF v_existing_code IS NOT NULL THEN
    RETURN v_existing_code;
  END IF;

  -- ランダム文字列を生成（8文字の英数字）
  LOOP
    v_new_code := upper(
      substr(
        encode(gen_random_bytes(6), 'base64'),
        1,
        8
      )
    );
    -- 英数字のみにする（特殊文字を除去）
    v_new_code := regexp_replace(v_new_code, '[^A-Z0-9]', '', 'g');
    
    -- 8文字になるまで調整
    WHILE length(v_new_code) < 8 LOOP
      v_new_code := v_new_code || upper(
        substr(
          encode(gen_random_bytes(1), 'base64'),
          1,
          1
        )
      );
      v_new_code := regexp_replace(v_new_code, '[^A-Z0-9]', '', 'g');
    END LOOP;
    
    v_new_code := substr(v_new_code, 1, 8);

    -- ユニーク性を確認
    IF NOT EXISTS (
      SELECT 1
      FROM profiles
      WHERE referral_code = v_new_code
    ) THEN
      -- ユニークなコードが見つかった
      UPDATE profiles
      SET referral_code = v_new_code,
          updated_at = NOW()
      WHERE user_id = p_user_id;

      RETURN v_new_code;
    END IF;

    -- 再試行
    v_attempts := v_attempts + 1;
    IF v_attempts >= v_max_attempts THEN
      RAISE EXCEPTION 'Failed to generate unique referral code after % attempts', v_max_attempts;
    END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.grant_streak_bonus(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_existing_transaction_count integer;
  v_last_login_at timestamptz;
  v_current_jst_date date;
  v_last_login_jst_date date;
  v_streak_days integer;
  v_new_streak_days integer;
  v_base_bonus_amount integer;
  v_bonus_multiplier numeric;
  v_requested_bonus_amount integer;
  v_grant_amount integer;
  v_notification_id uuid;
  v_tx_id uuid;
  v_expire_at timestamptz;
begin
  /*
    呼び出し元の検証。これらはセッションクライアント経由で呼ばれるため
    authenticated の EXECUTE を残す必要がある。その代わり、他人の user_id を
    渡して実行できないようにする（ログインさえしていれば通る状態だった）。
    サーバー経由(service_role)は auth.uid() が NULL なので従来どおり通る。
  */
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller is not the target user';
  END IF;

  select count(*)
  into v_existing_transaction_count
  from public.credit_transactions
  where user_id = p_user_id
    and transaction_type = 'streak'
    and (created_at at time zone 'Asia/Tokyo')::date =
      (current_timestamp at time zone 'Asia/Tokyo')::date;

  if v_existing_transaction_count > 0 then
    return 0;
  end if;

  v_current_jst_date := (current_timestamp at time zone 'Asia/Tokyo')::date;

  select last_streak_login_at, streak_days
  into v_last_login_at, v_streak_days
  from public.profiles
  where user_id = p_user_id;

  if v_last_login_at is not null then
    v_last_login_jst_date := (v_last_login_at at time zone 'Asia/Tokyo')::date;
  end if;

  if v_last_login_at is null then
    v_new_streak_days := 1;
  elsif v_last_login_jst_date < v_current_jst_date then
    if v_last_login_jst_date = v_current_jst_date - 1 then
      v_new_streak_days := coalesce(v_streak_days, 0) + 1;
      if v_new_streak_days > 14 then
        v_new_streak_days := 1;
      end if;
    else
      v_new_streak_days := 1;
    end if;
  else
    return 0;
  end if;

  v_base_bonus_amount := public.get_percoin_streak_amount(v_new_streak_days);

  update public.profiles
  set last_streak_login_at = now(),
      streak_days = v_new_streak_days,
      updated_at = now()
  where user_id = p_user_id;

  if v_base_bonus_amount = 0 then
    return 0;
  end if;

  v_bonus_multiplier := public.get_subscription_bonus_multiplier(p_user_id);
  v_requested_bonus_amount := ceil(v_base_bonus_amount * v_bonus_multiplier)::integer;
  v_grant_amount := public.get_grantable_free_percoin_amount(
    p_user_id,
    v_requested_bonus_amount
  );

  if v_grant_amount <= 0 then
    return 0;
  end if;

  v_expire_at := (
    date_trunc('month', now() at time zone 'Asia/Tokyo')
    + interval '7 months' - interval '1 second'
  ) at time zone 'Asia/Tokyo';

  insert into public.credit_transactions (
    user_id,
    amount,
    transaction_type,
    metadata
  )
  values (
    p_user_id,
    v_grant_amount,
    'streak',
    jsonb_build_object(
      'streak_days', v_new_streak_days,
      'login_at', now(),
      'base_bonus_amount', v_base_bonus_amount,
      'bonus_multiplier', v_bonus_multiplier,
      'requested_bonus_amount', v_requested_bonus_amount,
      'granted_bonus_amount', v_grant_amount
    )
  )
  returning id into v_tx_id;

  insert into public.free_percoin_batches (
    user_id,
    amount,
    remaining_amount,
    granted_at,
    expire_at,
    source,
    credit_transaction_id
  )
  values (
    p_user_id,
    v_grant_amount,
    v_grant_amount,
    now(),
    v_expire_at,
    'streak',
    v_tx_id
  );

  insert into public.user_credits (user_id, balance, paid_balance)
  values (p_user_id, v_grant_amount, 0)
  on conflict (user_id) do update
  set balance = public.user_credits.balance + v_grant_amount,
      updated_at = now();

  insert into public.notifications (
    recipient_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    title,
    body,
    data,
    is_read,
    created_at
  )
  values (
    p_user_id,
    p_user_id,
    'bonus',
    'user',
    p_user_id,
    '連続ログイン特典獲得！',
    v_new_streak_days || '日連続ログインで' || v_grant_amount || 'ペルコインを獲得しました！',
    jsonb_build_object(
      'bonus_amount', v_grant_amount,
      'bonus_type', 'streak',
      'streak_days', v_new_streak_days,
      'login_at', now(),
      'base_bonus_amount', v_base_bonus_amount,
      'bonus_multiplier', v_bonus_multiplier
    ),
    false,
    now()
  )
  returning id into v_notification_id;

  return v_grant_amount;
end;
$function$
;

NOTIFY pgrst, 'reload schema';

COMMIT;
