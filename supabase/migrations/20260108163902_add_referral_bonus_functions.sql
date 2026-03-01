-- ===============================================
-- Referral Bonus Functions Migration
-- リファラル（紹介）特典機能: RPC関数とトリガーの作成
-- ===============================================

-- ===============================================
-- 紹介コード生成関数
-- ===============================================

CREATE OR REPLACE FUNCTION public.generate_referral_code(
  p_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_existing_code TEXT;
  v_new_code TEXT;
  v_attempts INTEGER := 0;
  v_max_attempts INTEGER := 3;
BEGIN
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
$$;

-- ===============================================
-- 紹介特典付与関数
-- 注意: 紹介特典の金額（100ペルコイン）は constants/index.ts の REFERRAL_BONUS_AMOUNT と一致させる必要があります
-- ===============================================

CREATE OR REPLACE FUNCTION public.grant_referral_bonus(
  p_referrer_id UUID,
  p_referred_id UUID,
  p_referral_code TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_referrer_code TEXT;
  v_inserted_id UUID;
  v_bonus_amount INTEGER := 100; -- 定数: constants/index.ts の REFERRAL_BONUS_AMOUNT と一致させる
  v_notification_id UUID;
BEGIN
  -- 自己紹介の防止
  IF p_referrer_id = p_referred_id THEN
    RAISE WARNING 'Self-referral is not allowed: user_id = %', p_referrer_id;
    RETURN 0;
  END IF;

  -- 紹介コードの検証
  SELECT referral_code
  INTO v_referrer_code
  FROM profiles
  WHERE user_id = p_referrer_id;

  IF v_referrer_code IS NULL OR v_referrer_code != p_referral_code THEN
    RAISE WARNING 'Invalid referral code: expected %, got %', v_referrer_code, p_referral_code;
    RETURN 0;
  END IF;

  -- べき等性保証: referralsテーブルにINSERT（ON CONFLICT DO NOTHING）
  INSERT INTO public.referrals (
    referrer_id,
    referred_id,
    referral_code
  ) VALUES (
    p_referrer_id,
    p_referred_id,
    p_referral_code
  )
  ON CONFLICT (referred_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  -- 挿入できた場合のみ特典を付与（べき等性保証）
  IF v_inserted_id IS NOT NULL THEN
    -- 紹介者のペルコイン残高を更新
    UPDATE user_credits
    SET balance = balance + v_bonus_amount,
        updated_at = NOW()
    WHERE user_id = p_referrer_id;

    -- 取引履歴を記録
    INSERT INTO credit_transactions (
      user_id,
      amount,
      transaction_type,
      metadata
    ) VALUES (
      p_referrer_id,
      v_bonus_amount,
      'referral',
      jsonb_build_object(
        'referred_id', p_referred_id,
        'referral_code', p_referral_code,
        'granted_at', NOW()
      )
    );

    -- 通知レコードを作成（紹介者のみ）
    INSERT INTO notifications (
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
    ) VALUES (
      p_referrer_id,
      p_referrer_id,
      'bonus',
      'user',
      p_referrer_id,
      '紹介特典獲得！',
      '友達を紹介して' || v_bonus_amount || 'ペルコインを獲得しました！',
      jsonb_build_object(
        'bonus_amount', v_bonus_amount,
        'bonus_type', 'referral',
        'referred_id', p_referred_id,
        'referral_code', p_referral_code,
        'granted_at', NOW()
      ),
      false,
      NOW()
    )
    RETURNING id INTO v_notification_id;

    RETURN v_bonus_amount;
  ELSE
    -- 既に付与済みの場合は0を返す（べき等性）
    RETURN 0;
  END IF;
END;
$$;

-- ===============================================
-- handle_new_user()トリガー関数の拡張
-- ===============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_referral_code TEXT;
  v_referrer_id UUID;
  v_bonus_granted INTEGER;
BEGIN
  -- 既存の新規登録特典（50ペルコイン）を付与
  INSERT INTO public.user_credits (user_id, balance)
  VALUES (NEW.id, 50);

  INSERT INTO public.credit_transactions (user_id, amount, transaction_type)
  VALUES (NEW.id, 50, 'signup_bonus');

  -- 紹介コードを取得（raw_user_meta_dataから）
  v_referral_code := NEW.raw_user_meta_data->>'referral_code';

  -- 紹介コードが存在する場合、紹介特典を付与
  IF v_referral_code IS NOT NULL AND v_referral_code != '' THEN
    -- 紹介コードから紹介者を特定
    SELECT user_id
    INTO v_referrer_id
    FROM profiles
    WHERE referral_code = v_referral_code;

    -- 紹介者が見つかった場合、特典を付与
    IF v_referrer_id IS NOT NULL THEN
      BEGIN
        v_bonus_granted := grant_referral_bonus(
          v_referrer_id,
          NEW.id,
          v_referral_code
        );

        -- エラーはログに記録のみ（サインアップは継続）
        IF v_bonus_granted = 0 THEN
          RAISE WARNING 'Referral bonus already granted or failed for user_id = %, referral_code = %', NEW.id, v_referral_code;
        END IF;
      EXCEPTION WHEN others THEN
        -- 例外を握りつぶしてサインアップを継続
        RAISE WARNING 'Error granting referral bonus: %', SQLERRM;
      END;
    ELSE
      RAISE WARNING 'Referrer not found for referral_code = %', v_referral_code;
    END IF;
  END IF;

  -- 紹介コードを自動生成（新規ユーザー用）
  BEGIN
    PERFORM generate_referral_code(NEW.id);
  EXCEPTION WHEN others THEN
    -- 例外を握りつぶしてサインアップを継続
    RAISE WARNING 'Error generating referral code: %', SQLERRM;
  END;

  RETURN NEW;
EXCEPTION WHEN others THEN
  -- 最終的な例外処理: サインアップを継続
  RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- トリガーは既に存在するため、再作成は不要
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW
--   EXECUTE FUNCTION public.handle_new_user();

