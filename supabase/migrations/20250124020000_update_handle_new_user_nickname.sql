-- ===============================================
-- Update handle_new_user function
-- メールアドレスの@より前の部分から記号を_に置き換え、20文字に切り詰める処理を追加
-- ===============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- user_creditsレコードを作成（初期残高50）
  INSERT INTO public.user_credits (user_id, balance)
  VALUES (NEW.id, 50)
  ON CONFLICT (user_id) DO NOTHING;

  -- credit_transactionsに記録
  INSERT INTO public.credit_transactions (user_id, amount, transaction_type)
  VALUES (NEW.id, 50, 'signup_bonus')
  ON CONFLICT DO NOTHING;

  -- profilesレコードを作成
  INSERT INTO public.profiles (id, user_id, nickname, bio, avatar_url, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'nickname',
      NEW.raw_user_meta_data->>'display_name',
      SUBSTRING(
        REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-zA-Z0-9]', '_', 'g'),
        1,
        20
      )
    ),
    NEW.raw_user_meta_data->>'bio',
    NEW.raw_user_meta_data->>'avatar_url',
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

