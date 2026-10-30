-- プランを途中で変えたときの支払いを、売上として記録する
--   計画: docs/planning/subscription-change-revenue-recording-plan.md(案A・2026-10-26 ユーザー決定)
--
--   プランを上げたとき(日割りの請求)と月額→年額のときの支払いは、今までどこにも記録されていなかった
--   (付与は change-service.ts が金額なしで書き、webhook はこの請求を付与済みとして何もしない)。
--   webhook の invoice.paid で、ペルコインは付けずに「支払いだけ」を記録する。
--
--   ## record_subscription_payment
--   transaction_type = 'subscription'・amount = 0 の行を1つ書く。種類は増やさない(CHECK を変えない)。
--   stripe_payment_intent_id は 'payment:' || 請求 ID。付与の行(請求 ID そのもの)とぶつからず、
--   Stripe が同じ通知を送り直しても、今ある一意の索引で1行だけになる。
--   売上は metadata.revenueYen を、今の決まり(isRevenueTransaction・本番の subscription で revenueYen あり)が
--   そのまま数える。量は0なので、残高と「買った量」は動かない。credit_transactions にトリガーは無い。
--   service_role だけが呼べる。
--
--   ## get_percoin_transactions_with_expiry / get_percoin_transactions_count
--   ペルコインの履歴には、この「支払いだけ」の行(metadata.paymentOnly = true)を出さない
--   (計画 4章の決定: 履歴はペルコインの増減の一覧なので)。本番の定義に1行ずつ足しただけで、ほかは変えない。

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.record_subscription_payment(
  p_user_id uuid,
  p_invoice_id text,
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_invoice_id IS NULL OR btrim(p_invoice_id) = '' THEN
    RAISE EXCEPTION 'record_subscription_payment: user and invoice are required';
  END IF;

  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    transaction_type,
    stripe_payment_intent_id,
    metadata
  )
  VALUES (
    p_user_id,
    0,
    'subscription',
    'payment:' || p_invoice_id,
    COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object('paymentOnly', true, 'invoiceId', p_invoice_id)
  )
  ON CONFLICT (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_subscription_payment(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_subscription_payment(uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.record_subscription_payment(uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_subscription_payment(uuid, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.record_subscription_payment(uuid, text, jsonb) IS
  'プラン変更の支払いだけを記録する(量0の subscription・paymentOnly)。同じ請求は1行だけ。service_role のみ。';

CREATE OR REPLACE FUNCTION public.get_percoin_transactions_with_expiry(p_user_id uuid DEFAULT NULL::uuid, p_filter text DEFAULT 'all'::text, p_sort text DEFAULT 'created_at'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, amount integer, transaction_type text, metadata jsonb, created_at timestamp with time zone, expire_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
    RETURN;
  END IF;

  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH batch_summary AS (
    SELECT
      fpb.credit_transaction_id,
      fpb.user_id,
      BOOL_OR(fpb.expire_at IS NOT NULL AND fpb.expire_at > now()) AS has_period_limited,
      BOOL_OR(fpb.expire_at IS NULL) AS has_unlimited,
      MIN(fpb.expire_at) FILTER (WHERE fpb.expire_at IS NOT NULL AND fpb.expire_at > now()) AS expire_at_min,
      MAX(fpb.expire_at) FILTER (WHERE fpb.expire_at IS NOT NULL AND fpb.expire_at > now()) AS expire_at_max
    FROM free_percoin_batches fpb
    WHERE fpb.user_id = v_user_id
      AND fpb.credit_transaction_id IS NOT NULL
    GROUP BY fpb.credit_transaction_id, fpb.user_id
  )
  SELECT
    ct.id,
    ct.amount,
    ct.transaction_type,
    ct.metadata,
    ct.created_at,
    CASE
      WHEN COALESCE(bs.has_unlimited, FALSE) THEN NULL
      WHEN bs.expire_at_min IS NULL THEN NULL
      WHEN bs.expire_at_min = bs.expire_at_max THEN bs.expire_at_min
      ELSE NULL
    END AS expire_at
  FROM credit_transactions ct
  LEFT JOIN batch_summary bs
    ON bs.credit_transaction_id = ct.id
   AND bs.user_id = ct.user_id
  WHERE ct.user_id = v_user_id
    -- プラン変更の支払いだけの行(量0・paymentOnly)は、ペルコインの増減ではないので出さない
    AND COALESCE(ct.metadata->>'paymentOnly', 'false') <> 'true'
    AND (
      p_filter = 'all'
      OR (
        p_filter = 'regular'
        AND (
          (ct.transaction_type = 'purchase' AND NOT COALESCE(bs.has_period_limited, FALSE))
          OR (
            ct.transaction_type = 'admin_bonus'
            AND COALESCE(ct.metadata->>'balance_type', 'period_limited') = 'unlimited'
          )
          OR (
            ct.transaction_type = 'admin_deduction'
            AND COALESCE(ct.metadata->>'balance_type', 'unlimited') = 'unlimited'
          )
        )
      )
      OR (
        p_filter = 'period_limited'
        AND (
          (
            COALESCE(bs.has_period_limited, FALSE)
            AND ct.transaction_type NOT IN ('refund', 'admin_bonus', 'admin_deduction')
          )
          OR (
            ct.transaction_type = 'admin_bonus'
            AND COALESCE(ct.metadata->>'balance_type', 'period_limited') = 'period_limited'
          )
          OR (
            ct.transaction_type = 'admin_deduction'
            AND COALESCE(ct.metadata->>'balance_type', 'unlimited') = 'period_limited'
          )
        )
      )
      OR (p_filter = 'usage' AND ct.transaction_type IN ('consumption', 'refund'))
    )
  ORDER BY
    CASE WHEN p_sort = 'expire_at' THEN
      CASE
        WHEN COALESCE(bs.has_unlimited, FALSE) THEN NULL
        WHEN bs.expire_at_min IS NULL THEN NULL
        WHEN bs.expire_at_min = bs.expire_at_max THEN bs.expire_at_min
        ELSE NULL
      END
    END ASC NULLS LAST,
    ct.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_percoin_transactions_count(p_user_id uuid DEFAULT NULL::uuid, p_filter text DEFAULT 'all'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
    RETURN 0;
  END IF;

  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH batch_summary AS (
    SELECT
      fpb.credit_transaction_id,
      fpb.user_id,
      BOOL_OR(fpb.expire_at IS NOT NULL AND fpb.expire_at > now()) AS has_period_limited
    FROM free_percoin_batches fpb
    WHERE fpb.user_id = v_user_id
      AND fpb.credit_transaction_id IS NOT NULL
    GROUP BY fpb.credit_transaction_id, fpb.user_id
  )
  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM credit_transactions ct
  LEFT JOIN batch_summary bs
    ON bs.credit_transaction_id = ct.id
   AND bs.user_id = ct.user_id
  WHERE ct.user_id = v_user_id
    -- プラン変更の支払いだけの行(量0・paymentOnly)は、ペルコインの増減ではないので出さない
    AND COALESCE(ct.metadata->>'paymentOnly', 'false') <> 'true'
    AND (
      p_filter = 'all'
      OR (
        p_filter = 'regular'
        AND (
          (ct.transaction_type = 'purchase' AND NOT COALESCE(bs.has_period_limited, FALSE))
          OR (
            ct.transaction_type = 'admin_bonus'
            AND COALESCE(ct.metadata->>'balance_type', 'period_limited') = 'unlimited'
          )
          OR (
            ct.transaction_type = 'admin_deduction'
            AND COALESCE(ct.metadata->>'balance_type', 'unlimited') = 'unlimited'
          )
        )
      )
      OR (
        p_filter = 'period_limited'
        AND (
          (
            COALESCE(bs.has_period_limited, FALSE)
            AND ct.transaction_type NOT IN ('refund', 'admin_bonus', 'admin_deduction')
          )
          OR (
            ct.transaction_type = 'admin_bonus'
            AND COALESCE(ct.metadata->>'balance_type', 'period_limited') = 'period_limited'
          )
          OR (
            ct.transaction_type = 'admin_deduction'
            AND COALESCE(ct.metadata->>'balance_type', 'unlimited') = 'period_limited'
          )
        )
      )
      OR (p_filter = 'usage' AND ct.transaction_type IN ('consumption', 'refund'))
    );

  RETURN v_count;
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
