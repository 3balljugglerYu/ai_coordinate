-- handle_new_user() が signup_source を 'style' / 'wardrobe' 以外すべて捨てていた問題の是正。
--
-- 背景:
--   CHECK 制約は 20260627100000 で書式チェック(^[a-z0-9_-]{1,40}$)へ緩和済みだが、
--   トリガー側のハードコードされた許可リストが残ったままだった。
--   このため外部チャネルのタグ(x_profile / 企画キー 等)は届いた瞬間に NULL にされ、
--   本番の profiles は 193人中185人(96%)が signup_source IS NULL になっていた。
--   神コレ・イタリア旅行で「シェア経由の流入」を数えられなかった直接の原因。
--
-- この migration:
--   許可リストを外し、CHECK と同じ書式チェックだけに置き換える。
--   書式に合わない値は NULL に落とす(= INSERT を失敗させない)。
--   これは重要で、profiles の INSERT が CHECK 違反で落ちると
--   関数末尾の EXCEPTION ハンドラが握りつぶし、**プロフィールが作られないまま
--   ユーザーが登録完了してしまう**。書式検証をトリガー側にも残す理由。
--
-- 関数本体は signup_source の判定以外いっさい変えていない
-- (登録ボーナス付与・無料枠バッチ・通知・紹介コード生成はそのまま)。

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_default_nickname text;
  v_signup_bonus integer;
  v_tx_id uuid;
  v_expire_at timestamptz;
  v_signup_source text;
BEGIN
  v_signup_bonus := get_percoin_bonus_default('signup_bonus');

  IF NEW.email IS NOT NULL THEN
    v_default_nickname := split_part(NEW.email, '@', 1);
    IF length(v_default_nickname) > 20 THEN
      v_default_nickname := left(v_default_nickname, 20);
    END IF;
  END IF;

  -- 書式は profiles_signup_source_check と一致させること。
  -- 値の許可リストは持たない(企画キー等の任意タグを受け入れるため)。
  v_signup_source := NULLIF(NEW.raw_user_meta_data->>'signup_source', '');
  IF v_signup_source IS NOT NULL
     AND v_signup_source !~ '^[a-z0-9_-]{1,40}$' THEN
    v_signup_source := NULL;
  END IF;

  INSERT INTO public.profiles (id, user_id, nickname, signup_source)
  VALUES (NEW.id, NEW.id, v_default_nickname, v_signup_source)
  ON CONFLICT (user_id) DO NOTHING;

  v_expire_at := (
    date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
    + interval '7 months' - interval '1 second'
  ) AT TIME ZONE 'Asia/Tokyo';

  INSERT INTO public.credit_transactions (user_id, amount, transaction_type, metadata)
  VALUES (
    NEW.id,
    v_signup_bonus,
    'signup_bonus',
    jsonb_build_object('bucket', 'promo')
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.free_percoin_batches (user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id)
  VALUES (NEW.id, v_signup_bonus, v_signup_bonus, now(), v_expire_at, 'signup_bonus', v_tx_id);

  INSERT INTO public.user_credits (user_id, balance, paid_balance)
  VALUES (NEW.id, v_signup_bonus, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_credits.balance + v_signup_bonus, updated_at = NOW();

  BEGIN
    INSERT INTO public.notifications (
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
      NEW.id,
      NEW.id,
      'bonus',
      'user',
      NEW.id,
      '新規登録ボーナス獲得！',
      '新規登録特典として' || v_signup_bonus || 'ペルコインを獲得しました！',
      jsonb_build_object(
        'bonus_amount', v_signup_bonus,
        'bonus_type', 'signup_bonus',
        'granted_at', NOW()
      ),
      false,
      NOW()
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Error creating signup bonus notification: %', SQLERRM;
  END;

  BEGIN
    PERFORM generate_referral_code(NEW.id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Error generating referral code: %', SQLERRM;
  END;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
  RETURN NEW;
END;
$function$;

COMMIT;
