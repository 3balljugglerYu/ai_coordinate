-- grant_tour_bonus: チュートリアル完了時に20ペルコインを付与するRPC
-- grant_streak_bonus と同様の自己実行型（認証ユーザーが自分自身にのみ付与可能）

-- credit_transactions.transaction_type に tour_bonus を追加
ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_transaction_type_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'purchase', 'consumption', 'refund', 'signup_bonus', 'daily_post',
    'streak', 'referral', 'admin_bonus', 'forfeiture', 'tour_bonus'
  ]));

CREATE OR REPLACE FUNCTION public.grant_tour_bonus(p_user_id UUID)
RETURNS TABLE(amount_granted INTEGER, already_completed BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_amount INTEGER := 20;
  v_caller_id UUID;
  v_existing_tour_bonus BOOLEAN;
BEGIN
  -- 呼び出し元が認証ユーザーであること、かつ自分自身であることを確認
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR v_caller_id != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: can only grant tour bonus to self';
  END IF;

  -- 既に tour_bonus を受け取っているかチェック
  SELECT EXISTS(
    SELECT 1 FROM public.credit_transactions
    WHERE user_id = p_user_id AND transaction_type = 'tour_bonus'
  ) INTO v_existing_tour_bonus;

  IF v_existing_tour_bonus THEN
    RETURN QUERY SELECT 0::INTEGER, TRUE::BOOLEAN;
    RETURN;
  END IF;

  -- 残高を更新（tour_bonus は promo として付与）
  -- user_credits は新規ユーザー作成時にトリガーで自動作成される
  UPDATE public.user_credits
  SET
    balance = balance + v_amount,
    promo_balance = promo_balance + v_amount
  WHERE user_id = p_user_id;

  -- 取引履歴を記録
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

  RETURN QUERY SELECT v_amount::INTEGER, FALSE::BOOLEAN;
END;
$$;

-- RLS: 認証ユーザーが自分自身の user_id で呼び出せるようにする
-- SECURITY INVOKER により、呼び出し元の権限で実行されるため、auth.uid() のチェックで十分
