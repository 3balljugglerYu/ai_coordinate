-- ===============================================
-- Update Referral Bonus to Grant on First Login
-- リファラル（紹介）特典機能: 初回ログイン成功時に付与するように変更
-- ===============================================

-- ===============================================
-- 初回ログイン時に紹介特典を付与するRPC関数
-- ===============================================

CREATE OR REPLACE FUNCTION public.check_and_grant_referral_bonus_on_first_login(
  p_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_referral_code TEXT;
  v_referrer_id UUID;
  v_bonus_granted INTEGER;
  v_already_granted BOOLEAN;
BEGIN
  -- 既に紹介特典が付与されているか確認（referralsテーブルにレコードが存在するか）
  SELECT EXISTS(
    SELECT 1
    FROM referrals
    WHERE referred_id = p_user_id
  ) INTO v_already_granted;

  -- 既に付与済みの場合は0を返す（べき等性）
  IF v_already_granted THEN
    RETURN 0;
  END IF;

  -- 紹介コードを取得（auth.users.raw_user_meta_dataから）
  SELECT raw_user_meta_data->>'referral_code'
  INTO v_referral_code
  FROM auth.users
  WHERE id = p_user_id;

  -- 紹介コードが存在しない場合は0を返す
  IF v_referral_code IS NULL OR v_referral_code = '' THEN
    RETURN 0;
  END IF;

  -- 紹介コードから紹介者を特定
  SELECT user_id
  INTO v_referrer_id
  FROM profiles
  WHERE referral_code = v_referral_code;

  -- 紹介者が見つからない場合は0を返す
  IF v_referrer_id IS NULL THEN
    RETURN 0;
  END IF;

  -- 紹介特典を付与
  BEGIN
    v_bonus_granted := grant_referral_bonus(
      v_referrer_id,
      p_user_id,
      v_referral_code
    );

    -- エラーはログに記録のみ
    IF v_bonus_granted = 0 THEN
      RAISE WARNING 'Referral bonus already granted or failed for user_id = %, referral_code = %', p_user_id, v_referral_code;
    END IF;

    RETURN v_bonus_granted;
  EXCEPTION WHEN others THEN
    -- 例外を握りつぶして処理を継続
    RAISE WARNING 'Error granting referral bonus on first login: %', SQLERRM;
    RETURN 0;
  END;
END;
$$;

-- ===============================================
-- handle_new_user()トリガー関数の修正
-- 紹介特典付与のロジックを削除（初回ログイン時に付与するように変更）
-- ===============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- 既存の新規登録特典（50ペルコイン）を付与
  INSERT INTO public.user_credits (user_id, balance)
  VALUES (NEW.id, 50);

  INSERT INTO public.credit_transactions (user_id, amount, transaction_type)
  VALUES (NEW.id, 50, 'signup_bonus');

  -- 紹介コードを自動生成（新規ユーザー用）
  BEGIN
    PERFORM generate_referral_code(NEW.id);
  EXCEPTION WHEN others THEN
    -- 例外を握りつぶしてサインアップを継続
    RAISE WARNING 'Error generating referral code: %', SQLERRM;
  END;

  -- 注意: 紹介特典は初回ログイン成功時に付与される（check_and_grant_referral_bonus_on_first_login関数を使用）

  RETURN NEW;
EXCEPTION WHEN others THEN
  -- 最終的な例外処理: サインアップを継続
  RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
  RETURN NEW;
END;
$$;

