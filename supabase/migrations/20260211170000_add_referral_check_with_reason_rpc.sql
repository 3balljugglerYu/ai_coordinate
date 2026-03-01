-- ===============================================
-- Referral bonus check RPC with reason codes
-- ===============================================

CREATE OR REPLACE FUNCTION public.check_and_grant_referral_bonus_on_first_login_with_reason(
  p_user_id UUID,
  p_referral_code TEXT DEFAULT NULL
)
RETURNS TABLE(
  bonus_granted INTEGER,
  reason_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_referral_code TEXT;
  v_meta_referral_code TEXT;
  v_referrer_id UUID;
  v_user_created_at TIMESTAMPTZ;
  v_bonus_granted INTEGER;
  v_already_granted BOOLEAN;
BEGIN
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
$$;

REVOKE ALL ON FUNCTION public.check_and_grant_referral_bonus_on_first_login_with_reason(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_grant_referral_bonus_on_first_login_with_reason(UUID, TEXT) TO authenticated;
