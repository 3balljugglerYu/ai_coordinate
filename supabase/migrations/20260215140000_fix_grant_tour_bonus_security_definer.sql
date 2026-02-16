-- grant_tour_bonus: SECURITY DEFINER に変更して RLS をバイパス
-- user_credits に UPDATE ポリシー、credit_transactions に INSERT ポリシーがないため、
-- SECURITY INVOKER では UPDATE/INSERT が失敗する
-- auth.uid() チェックで自分自身にのみ付与可能なため安全

CREATE OR REPLACE FUNCTION public.grant_tour_bonus(p_user_id UUID)
RETURNS TABLE(amount_granted INTEGER, already_completed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_amount INTEGER := 20;
  v_caller_id UUID;
  v_existing_tour_bonus BOOLEAN;
  v_rows_updated INTEGER;
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
