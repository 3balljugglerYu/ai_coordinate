-- ===============================================
-- ストリーク（連続ログイン）特典付与関数
-- 注意: ストリーク特典のスケジュールは constants/index.ts の STREAK_BONUS_SCHEDULE と一致させる必要があります
-- スケジュール: [10, 10, 20, 10, 10, 10, 50, 10, 10, 10, 10, 10, 10, 100] (1-14日目)
-- ===============================================

CREATE OR REPLACE FUNCTION public.grant_streak_bonus(
  p_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_transaction_count INTEGER;
  v_last_login_at TIMESTAMPTZ;
  v_current_jst_date DATE;
  v_last_login_jst_date DATE;
  v_streak_days INTEGER;
  v_new_streak_days INTEGER;
  v_bonus_amount INTEGER;
  v_notification_id UUID;
BEGIN
  -- べき等性チェック: 同じJST日付で既に特典が付与されているか確認
  SELECT COUNT(*)
  INTO v_existing_transaction_count
  FROM credit_transactions
  WHERE user_id = p_user_id
    AND transaction_type = 'streak'
    AND (created_at AT TIME ZONE 'Asia/Tokyo')::DATE = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
  
  -- 既に付与済みの場合は0を返して処理を終了（べき等性を保証）
  IF v_existing_transaction_count > 0 THEN
    RETURN 0;
  END IF;
  
  -- 現在のJST日付を取得
  v_current_jst_date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
  
  -- 最後のログイン日時と連続ログイン日数を取得
  SELECT last_streak_login_at, streak_days
  INTO v_last_login_at, v_streak_days
  FROM profiles
  WHERE user_id = p_user_id;
  
  -- 最後のログイン日時をJST日付に変換
  IF v_last_login_at IS NOT NULL THEN
    v_last_login_jst_date := (v_last_login_at AT TIME ZONE 'Asia/Tokyo')::DATE;
  END IF;
  
  -- 連続ログイン日数の計算
  IF v_last_login_at IS NULL THEN
    -- 初回ログイン
    v_new_streak_days := 1;
  ELSIF v_last_login_jst_date < v_current_jst_date THEN
    -- JST基準で日付が異なる場合
    IF v_last_login_jst_date = v_current_jst_date - 1 THEN
      -- 前日連続している場合: 連続ログイン日数を+1
      v_new_streak_days := COALESCE(v_streak_days, 0) + 1;
      -- 14日を超えた場合は1に戻す（2週間ループ）
      IF v_new_streak_days > 14 THEN
        v_new_streak_days := 1;
      END IF;
    ELSE
      -- 2日以上空いた場合: 連続ログイン日数を1にリセット
      v_new_streak_days := 1;
    END IF;
  ELSE
    -- 同じ日に既にログインしている場合は0を返す（べき等性）
    RETURN 0;
  END IF;
  
  -- 特典スケジュールに基づくペルコイン付与（CASE文で実装）
  -- 定数: constants/index.ts の STREAK_BONUS_SCHEDULE と一致させる
  v_bonus_amount := CASE v_new_streak_days
    WHEN 1 THEN 10  -- STREAK_BONUS_SCHEDULE[0]
    WHEN 2 THEN 10  -- STREAK_BONUS_SCHEDULE[1]
    WHEN 3 THEN 20  -- STREAK_BONUS_SCHEDULE[2]
    WHEN 4 THEN 10  -- STREAK_BONUS_SCHEDULE[3]
    WHEN 5 THEN 10  -- STREAK_BONUS_SCHEDULE[4]
    WHEN 6 THEN 10  -- STREAK_BONUS_SCHEDULE[5]
    WHEN 7 THEN 50  -- STREAK_BONUS_SCHEDULE[6]
    WHEN 8 THEN 10  -- STREAK_BONUS_SCHEDULE[7]
    WHEN 9 THEN 10  -- STREAK_BONUS_SCHEDULE[8]
    WHEN 10 THEN 10 -- STREAK_BONUS_SCHEDULE[9]
    WHEN 11 THEN 10 -- STREAK_BONUS_SCHEDULE[10]
    WHEN 12 THEN 10 -- STREAK_BONUS_SCHEDULE[11]
    WHEN 13 THEN 10 -- STREAK_BONUS_SCHEDULE[12]
    WHEN 14 THEN 100 -- STREAK_BONUS_SCHEDULE[13]
    ELSE 0
  END;
  
  -- 特典が0の場合は何もしない（エラーケース）
  IF v_bonus_amount = 0 THEN
    RETURN 0;
  END IF;
  
  -- ペルコイン残高を更新
  UPDATE user_credits
  SET balance = balance + v_bonus_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- 取引履歴を記録
  INSERT INTO credit_transactions (
    user_id,
    amount,
    transaction_type,
    metadata
  ) VALUES (
    p_user_id,
    v_bonus_amount,
    'streak',
    jsonb_build_object(
      'streak_days', v_new_streak_days,
      'login_at', NOW()
    )
  );
  
  -- 最後のログイン日時と連続ログイン日数を更新
  UPDATE profiles
  SET last_streak_login_at = NOW(),
      streak_days = v_new_streak_days,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- 通知レコードを作成（自分自身への通知として直接INSERT）
  -- create_notification関数は自分自身への通知をスキップするため、直接INSERTする
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
    p_user_id,
    p_user_id,
    'bonus',
    'user',
    p_user_id,
    '連続ログイン特典獲得！',
    v_new_streak_days || '日連続ログインで' || v_bonus_amount || 'ペルコインを獲得しました！',
    jsonb_build_object(
      'bonus_amount', v_bonus_amount,
      'bonus_type', 'streak',
      'streak_days', v_new_streak_days,
      'login_at', NOW()
    ),
    false,
    NOW()
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_bonus_amount;
END;
$$;

