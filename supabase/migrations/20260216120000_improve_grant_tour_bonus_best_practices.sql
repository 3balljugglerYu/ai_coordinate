-- 1. レースコンディション対策: 1ユーザー1回の tour_bonus を保証する部分一意インデックス
-- 2. 複合インデックス: EXISTS クエリ (user_id, transaction_type) の最適化も兼ねる
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_one_tour_bonus_per_user
  ON public.credit_transactions (user_id)
  WHERE transaction_type = 'tour_bonus';

-- grant_tour_bonus: レース対策・例外ハンドリング改善
-- - INSERT を先に行い unique_violation で重複を検知（部分一意インデックスと連携）
-- - 通知 INSERT は具体的な例外を個別にハンドリング
CREATE OR REPLACE FUNCTION public.grant_tour_bonus(p_user_id UUID)
RETURNS TABLE(amount_granted INTEGER, already_completed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_amount INTEGER := 20;
  v_caller_id UUID;
  v_rows_updated INTEGER;
BEGIN
  -- 呼び出し元が認証ユーザーであること、かつ自分自身であることを確認
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR v_caller_id != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: can only grant tour bonus to self';
  END IF;

  -- 取引履歴を先に記録（部分一意インデックスで重複を防止、レースコンディション対策）
  -- INSERT 成功 = 初回付与、unique_violation = 既に付与済み
  BEGIN
    INSERT INTO public.credit_transactions (
      user_id,
      amount,
      transaction_type,
      related_generation_id,
      metadata
    ) VALUES (
      p_user_id,
      v_amount,
      'tour_bonus',
      NULL,
      jsonb_build_object('reason', 'tutorial_completion', 'source', 'grant_tour_bonus')
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT 0::INTEGER, TRUE::BOOLEAN;
    RETURN;
  END;

  -- 残高を更新（tour_bonus は promo として付与）
  UPDATE public.user_credits
  SET
    balance = balance + v_amount,
    promo_balance = promo_balance + v_amount
  WHERE user_id = p_user_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- user_credits にレコードがない場合は作成（新規ユーザーでトリガーが遅延した場合など）
  IF v_rows_updated = 0 THEN
    INSERT INTO public.user_credits (user_id, balance, paid_balance, promo_balance)
    VALUES (p_user_id, v_amount, 0, v_amount)
    ON CONFLICT (user_id) DO UPDATE SET
      balance = user_credits.balance + v_amount,
      promo_balance = user_credits.promo_balance + v_amount;
  END IF;

  -- 通知レコードを挿入（失敗してもペルコイン付与は成功とする）
  -- 具体的な例外を個別にハンドリング（EXCEPTION WHEN OTHERS を避ける）
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
      p_user_id,
      p_user_id,
      'bonus',
      'user',
      p_user_id,
      'チュートリアルボーナス獲得！',
      'チュートリアル完了で20ペルコインを獲得しました！',
      jsonb_build_object(
        'bonus_amount', v_amount,
        'bonus_type', 'tour_bonus',
        'granted_at', NOW()
      ),
      false,
      NOW()
    );
  EXCEPTION
    WHEN unique_violation THEN
      RAISE WARNING 'Tour bonus notification: unique_violation (%), skipping', SQLERRM;
    WHEN foreign_key_violation THEN
      RAISE WARNING 'Tour bonus notification: foreign_key_violation (%), skipping', SQLERRM;
    WHEN not_null_violation THEN
      RAISE WARNING 'Tour bonus notification: not_null_violation (%), skipping', SQLERRM;
    WHEN check_violation THEN
      RAISE WARNING 'Tour bonus notification: check_violation (%), skipping', SQLERRM;
    WHEN OTHERS THEN
      -- 想定外の例外もログに残しつつ処理は継続（通知失敗でペルコイン付与をロールバックしない）
      RAISE WARNING 'Tour bonus notification: unexpected error (%), skipping', SQLERRM;
  END;

  RETURN QUERY SELECT v_amount::INTEGER, FALSE::BOOLEAN;
END;
$$;
