-- コレクション完走報酬 (docs/planning/collection-completion-reward-implementation-plan.md)
--
-- - preset_categories.completion_reward_percoins: adminがカテゴリごとに設定する付与額(0/null=報酬なし)
-- - collection_completions.reward_granted_at: 付与済みマーカー(ADR-001: test-and-setで冪等)
-- - grant_collection_completion_reward RPC: finalize成功後にmount routeから呼ぶ(service_role専用)。
--   grant_tour_bonus の付与処理を踏襲するが、権限モデルは異なり authenticated へは公開しない
--   (額・user_idはサーバー側で解決、クライアント入力を信用しない = ADR-002/EARS-08)。
-- - 5万無料残高キャップ(get_grantable_free_percoin_amount)適用(ADR-004)。
--   キャップ後0の場合は reward_granted_at のみ立てて取引・通知は作らない(EARS-03)。

-- 1) admin設定列(デフォルト0=報酬なし。adminが額を入れるまで実質OFF=段階公開)
ALTER TABLE public.preset_categories
  ADD COLUMN completion_reward_percoins integer DEFAULT 0
  CHECK (completion_reward_percoins IS NULL OR completion_reward_percoins >= 0);

COMMENT ON COLUMN public.preset_categories.completion_reward_percoins IS
  'コレクション完走時に付与するペルコイン数。0またはnull=報酬なし';

-- 2) 付与済みマーカー(完走行が真実の源泉。同一完走への二重付与をDB層で防ぐ)
ALTER TABLE public.collection_completions
  ADD COLUMN reward_granted_at timestamptz;

COMMENT ON COLUMN public.collection_completions.reward_granted_at IS
  '完走報酬の付与日時。NULL=未付与。grant_collection_completion_reward が test-and-set で更新';

-- 3) transaction_type に collection_completion を追加
--    (現行定義=20260331110000 の12種に追加。古い11種定義から張り替えないこと)
ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_transaction_type_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_transaction_type_check
  CHECK (
    transaction_type = ANY (
      ARRAY[
        'purchase'::text,
        'consumption'::text,
        'refund'::text,
        'signup_bonus'::text,
        'daily_post'::text,
        'streak'::text,
        'referral'::text,
        'admin_bonus'::text,
        'forfeiture'::text,
        'tour_bonus'::text,
        'admin_deduction'::text,
        'subscription'::text,
        'collection_completion'::text
      ]
    )
  );

-- 4) free_percoin_batches.source にも collection_completion を追加
--    (現行定義=20260331110000 の8種に追加)
ALTER TABLE public.free_percoin_batches
  DROP CONSTRAINT IF EXISTS free_percoin_batches_source_check;

ALTER TABLE public.free_percoin_batches
  ADD CONSTRAINT free_percoin_batches_source_check
  CHECK (
    source = ANY (
      ARRAY[
        'signup_bonus'::text,
        'tour_bonus'::text,
        'referral'::text,
        'daily_post'::text,
        'streak'::text,
        'admin_bonus'::text,
        'refund'::text,
        'subscription'::text,
        'collection_completion'::text
      ]
    )
  );

-- 5) 付与RPC(service_role専用)
CREATE OR REPLACE FUNCTION public.grant_collection_completion_reward(
  p_completion_id uuid,
  p_user_id uuid
)
RETURNS TABLE(amount_granted integer, already_granted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_id uuid;
  v_category_key text;
  v_display_name text;
  v_configured integer;
  v_amount integer;
  v_tx_id uuid;
  v_expire_at timestamptz;
  v_rows_updated integer;
BEGIN
  -- 冪等の要(ADR-001): 完走行の test-and-set。
  -- 所有者一致 + completed + 未付与 の1行だけが更新に成功する。
  -- 以降で例外が起きた場合は同一トランザクションごとロールバックされ、未付与状態に戻る。
  UPDATE public.collection_completions cc
  SET reward_granted_at = now()
  WHERE cc.id = p_completion_id
    AND cc.user_id = p_user_id
    AND cc.mount_status = 'completed'
    AND cc.reward_granted_at IS NULL
  RETURNING cc.category_id INTO v_category_id;

  IF v_category_id IS NULL THEN
    -- 既付与 / 未完走 / 所有者不一致 → 何もしない
    RETURN QUERY SELECT 0::integer, TRUE::boolean;
    RETURN;
  END IF;

  SELECT pc.key, pc.display_name_ja, COALESCE(pc.completion_reward_percoins, 0)
  INTO v_category_key, v_display_name, v_configured
  FROM public.preset_categories pc
  WHERE pc.id = v_category_id;

  -- 5万無料残高キャップ(ADR-004)
  v_amount := public.get_grantable_free_percoin_amount(p_user_id, v_configured);

  IF v_amount IS NULL OR v_amount <= 0 THEN
    -- 額0設定 or キャップで0 → reward_granted_at は立てたまま、取引・通知は作らない(EARS-03)
    RETURN QUERY SELECT 0::integer, FALSE::boolean;
    RETURN;
  END IF;

  INSERT INTO public.credit_transactions (
    user_id, amount, transaction_type, related_generation_id, metadata
  ) VALUES (
    p_user_id, v_amount, 'collection_completion', NULL,
    jsonb_build_object(
      'source', 'grant_collection_completion_reward',
      'completion_id', p_completion_id,
      'category_id', v_category_id,
      'category_key', v_category_key
    )
  )
  RETURNING id INTO v_tx_id;

  -- 有効期限: JST月初 + 7ヶ月 - 1秒(既存bonusと同一ルール)
  v_expire_at := (
    date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
    + interval '7 months' - interval '1 second'
  ) AT TIME ZONE 'Asia/Tokyo';

  INSERT INTO public.free_percoin_batches (
    user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id
  )
  VALUES (p_user_id, v_amount, v_amount, now(), v_expire_at, 'collection_completion', v_tx_id);

  UPDATE public.user_credits
  SET balance = balance + v_amount, updated_at = now()
  WHERE user_id = p_user_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    INSERT INTO public.user_credits (user_id, balance, paid_balance)
    VALUES (p_user_id, v_amount, 0)
    ON CONFLICT (user_id) DO UPDATE SET
      balance = user_credits.balance + v_amount,
      updated_at = now();
  END IF;

  -- 通知(EARS-05)。通知失敗は付与自体を巻き戻さない(WARNINGのみ)。
  -- entity_type='user' / entity_id=p_user_id は grant_tour_bonus と同じ整合。
  BEGIN
    INSERT INTO public.notifications (
      recipient_id, actor_id, type, entity_type, entity_id, title, body, data, is_read, created_at
    ) VALUES (
      p_user_id, p_user_id, 'bonus', 'user', p_user_id,
      'コレクション完走報酬獲得！',
      '「' || COALESCE(v_display_name, 'コレクション') || '」完走で' || v_amount || 'ペルコインを獲得しました！',
      jsonb_build_object(
        'bonus_amount', v_amount,
        'bonus_type', 'collection_completion',
        'category_key', v_category_key,
        'completion_id', p_completion_id,
        'granted_at', now()
      ),
      false, now()
    );
  EXCEPTION
    WHEN OTHERS THEN RAISE WARNING 'Collection completion reward notification failed (%), skipping', SQLERRM;
  END;

  RETURN QUERY SELECT v_amount::integer, FALSE::boolean;
END;
$$;

-- 権限: service_role 専用(grant_tour_bonus と異なり authenticated へは公開しない)
REVOKE ALL ON FUNCTION public.grant_collection_completion_reward(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_collection_completion_reward(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.grant_collection_completion_reward(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_collection_completion_reward(uuid, uuid) TO service_role;
