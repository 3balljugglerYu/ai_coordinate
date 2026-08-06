-- プロンプト/スタイル利用時のクリエイター還元ペルコイン
-- (docs/planning/creator-usage-percoin-reward-implementation-plan.md)
--
-- 他ユーザーが生成に利用するたび、原作者(Free)・クリエイター(One-Tap Style)へ
-- ペルコインを付与する。付与額は /admin/percoin-defaults から Free 用・Style 用を
-- 別々に設定する(既定 0 = OFF で出荷。admin が額を入れて有効化)。
--
-- 主要な設計判断(計画書の ADR に対応):
--   ADR-001 発火点は既存の利用イベント記録関数(record_prompt_usage /
--           record_style_preset_usage)。新しいフックは作らない
--   ADR-002 付与状態は reward_status(pending/granted/skipped/legacy)で持つ。
--           reward_granted_at だけでは「過去分」「OFF中」「終端スキップ」
--           「一時失敗」を区別できず、再処理対象を特定できない
--   ADR-003 付与ごとの通知は作らない(生成のたびに発火するため。節目通知が別にある)
--   ADR-004 設定は percoin_bonus_defaults に source 追加。新2 source は 0〜5 に固定。
--           自己利用除外だけでは2アカウントの相互利用を防げず、付与額が
--           最低生成コスト(10)を超えるとペアの残高が純増するため、上限を DB に刻む
--   ADR-005 Style の provider は profiles 経由で user_id を解決(profiles.id != user_id)
--   ADR-006 付与呼び出しは内側の BEGIN...EXCEPTION に隔離する。
--           record_style_preset_usage は関数全体が単一の EXCEPTION ブロック
--           (=サブトランザクション)のため、素直に足すと付与失敗で利用イベントの
--           INSERT ごとロールバックされ、利用数と節目通知の正本を失う。
--           record_prompt_usage はハンドラが無く、例外が完了RPC全体を中断させて
--           生成が失敗扱い＋返金になる
--   ADR-007 失敗は pending として残し、pg_cron から再処理する。
--           再処理側も行単位の例外ブロックが必須(1件の失敗でバッチ全体が
--           巻き戻り、古い1行の恒久エラーで後続行が滞留するため)
--   ADR-008 受け手単位の直列化は「本機能の付与RPC 2本の冒頭」で行う。
--           共有の get_grantable_free_percoin_amount へロックを入れる案は、
--           既存経路とロック取得順が食い違いデッドロックを生むため撤回した
--           (詳細は下記セクション4)。よってキャップの強制は本機能の2経路間
--           でのみ成立し、既存ボーナスとの並行時の超過は本PR以前のまま残る
--
-- 適用順序: 新規 RPC の追加のみでシグネチャ変更を伴わないため通常順で可。
-- ただし PostgREST のスキーマキャッシュ更新のため末尾で NOTIFY する。

BEGIN;

-- =============================================================================
-- 1. 設定: percoin_bonus_defaults に2 source を追加(新 source は 0〜5)
-- =============================================================================

ALTER TABLE public.percoin_bonus_defaults
  DROP CONSTRAINT IF EXISTS percoin_bonus_defaults_source_check;
ALTER TABLE public.percoin_bonus_defaults
  DROP CONSTRAINT IF EXISTS percoin_bonus_defaults_amount_check;
-- 追加する制約自体も先に落とす。過去に部分適用された環境
-- (検証失敗で履歴に残らず DDL だけ残った場合)でも再実行できるようにする。
ALTER TABLE public.percoin_bonus_defaults
  DROP CONSTRAINT IF EXISTS percoin_bonus_defaults_source_amount_check;

-- source と amount を1つの CHECK にまとめる(source ごとに許容範囲が違うため)。
-- 既存4 source は従来どおり 1〜1000(「必ず1以上」の保証を壊さない)。
-- 新2 source は 0〜5(0 = 付与しない。上限5は経済的な安全域 = 最低生成コスト10 未満)。
ALTER TABLE public.percoin_bonus_defaults
  ADD CONSTRAINT percoin_bonus_defaults_source_amount_check
  CHECK (
    (source IN ('prompt_usage_reward', 'style_usage_reward')
      AND amount BETWEEN 0 AND 5)
    OR
    (source IN ('signup_bonus', 'tour_bonus', 'referral', 'daily_post')
      AND amount BETWEEN 1 AND 1000)
  );

-- 既定 0 = OFF で出荷する(段階公開。admin が額を入れるまで1コインも動かない)
INSERT INTO public.percoin_bonus_defaults (source, amount) VALUES
  ('prompt_usage_reward', 0),
  ('style_usage_reward', 0)
ON CONFLICT (source) DO NOTHING;

-- =============================================================================
-- 2. 取引種別の追加
-- =============================================================================

ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_transaction_type_check;
ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_transaction_type_check
  CHECK (
    transaction_type = ANY (
      ARRAY[
        'purchase'::text, 'consumption'::text, 'refund'::text,
        'signup_bonus'::text, 'daily_post'::text, 'streak'::text,
        'referral'::text, 'admin_bonus'::text, 'forfeiture'::text,
        'tour_bonus'::text, 'admin_deduction'::text, 'subscription'::text,
        'collection_completion'::text,
        'prompt_usage_reward'::text, 'style_usage_reward'::text
      ]
    )
  );

ALTER TABLE public.free_percoin_batches
  DROP CONSTRAINT IF EXISTS free_percoin_batches_source_check;
ALTER TABLE public.free_percoin_batches
  ADD CONSTRAINT free_percoin_batches_source_check
  CHECK (
    source = ANY (
      ARRAY[
        'signup_bonus'::text, 'tour_bonus'::text, 'referral'::text,
        'daily_post'::text, 'streak'::text, 'admin_bonus'::text,
        'refund'::text, 'subscription'::text, 'collection_completion'::text,
        'prompt_usage_reward'::text, 'style_usage_reward'::text
      ]
    )
  );

-- =============================================================================
-- 3. 利用イベントに付与状態を持たせる(ADR-002)
-- =============================================================================

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['prompt_usage_events', 'style_preset_usage_events'] LOOP
    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS reward_status text NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS reward_granted_at timestamptz,
        ADD COLUMN IF NOT EXISTS reward_processed_at timestamptz,
        ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_error text,
        ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz
    $f$, v_table);

    EXECUTE format($f$
      ALTER TABLE public.%I
        DROP CONSTRAINT IF EXISTS %I
    $f$, v_table, v_table || '_reward_status_check');

    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD CONSTRAINT %I
        CHECK (reward_status IN ('pending', 'granted', 'skipped', 'legacy'))
    $f$, v_table, v_table || '_reward_status_check');

    -- 再処理が拾う行だけを引く部分インデックス
    EXECUTE format($f$
      CREATE INDEX IF NOT EXISTS %I
        ON public.%I (created_at)
        WHERE reward_status = 'pending'
    $f$, 'idx_' || v_table || '_reward_pending', v_table);

    -- 本機能導入前のイベントは legacy 固定。再処理が過去分を拾って
    -- 遡及付与するのを防ぐ(ADR-002)。
    EXECUTE format($f$
      UPDATE public.%I
      SET reward_status = 'legacy',
          reward_processed_at = now()
      WHERE reward_status = 'pending'
    $f$, v_table);
  END LOOP;
END;
$$;

COMMENT ON COLUMN public.prompt_usage_events.reward_status IS
  '還元付与の状態。pending=未処理(再処理対象) / granted=付与済 / skipped=終端スキップ(自己利用・額0等) / legacy=本機能導入前';
COMMENT ON COLUMN public.style_preset_usage_events.reward_status IS
  '還元付与の状態。pending=未処理(再処理対象) / granted=付与済 / skipped=終端スキップ(自己利用・額0等) / legacy=本機能導入前';

-- =============================================================================
-- 4. 受け手単位の直列化(ADR-008 再改訂)
-- =============================================================================
--
-- キャップ計算は user_credits をロックせず SELECT するため、同一ユーザーへの
-- 並行付与で双方が同じ残り枠を計算し、5万キャップを超え得る
-- (例: 無料残高49,998 で2件同時 → 双方が枠2を計算 → 50,002)。
--
-- 当初は get_grantable_free_percoin_amount の内部にロックを置き、
-- 「キャップ計算を行う全経路」を一括で直列化する設計だった。しかし本番の
-- 既存関数を調べたところ、ロック取得順が経路ごとに食い違っており、
-- 共有関数にロックを入れると新たなデッドロックを生むことが判明した:
--
--   grant_daily_post_bonus : キャップ計算 → profiles UPDATE  (advisory → 行)
--   grant_streak_bonus     : profiles UPDATE → キャップ計算  (行 → advisory)
--
-- 同一ユーザーの投稿報酬とログイン報酬が並行すると循環待ちになり、
-- どちらかが deadlock detected で中断される。キャップ超過は「稀に上限を
-- 少し超える」だけだが、デッドロックは既存の報酬付与そのものを失敗させる。
-- 割に合わないため、共有関数には手を入れず、本機能の付与RPCの冒頭でのみ
-- ロックを取る(下記 6/7)。
--
--   - 本機能の付与どうし(人気クリエイターへの高頻度な同時付与 = この機能が
--     現実に作る競合)は完全に直列化される
--   - 既存ボーナスとの同時実行における超過は、本PR以前と同じ状態で残る
--     (本機能が作った問題ではない既存の穴)
--   - 既存関数を1つも書き換えないため、回帰もデッドロックも増やさない
--
-- キャップを全経路の厳密な強制上限にするには、全付与経路で「受け手ロックを
-- 最初に取る」順序へ統一する必要がある(既存の金銭処理を複数書き換えるため、
-- 独立したタスクとして扱う)。
--
-- 本マイグレーションの初期版はこの共有関数にロックを入れていた。検証より前に
-- COMMIT していたため、その版を一度でも走らせた環境にはロック入りの定義が
-- 残っている。ここで元の定義へ明示的に戻し、どの環境から適用しても同じ状態に
-- 収束させる(下のカタログ検証がロックの不在を assert する)。
CREATE OR REPLACE FUNCTION public.get_grantable_free_percoin_amount(
  p_user_id uuid,
  p_requested_amount integer
)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
declare
  v_cap constant integer := 50000;
  v_free_balance integer;
begin
  if p_requested_amount is null or p_requested_amount <= 0 then
    return 0;
  end if;

  select greatest(coalesce(balance, 0) - coalesce(paid_balance, 0), 0)
  into v_free_balance
  from public.user_credits
  where user_id = p_user_id;

  return greatest(least(p_requested_amount, v_cap - coalesce(v_free_balance, 0)), 0);
end;
$$;

-- =============================================================================
-- 5. 付与の共通処理(内部関数)
-- =============================================================================
--
-- 受け手・種別・イベントIDを受け取り、キャップ適用後の額でウォレット3点更新を行う。
-- 付与額が0(未設定 or キャップで0)なら false を返し、呼び出し側が skipped 扱いにする。
-- 有効期限は既存ボーナスと同一ルール(JST月初 + 7ヶ月 - 1秒)。
CREATE OR REPLACE FUNCTION public.apply_usage_reward_grant(
  p_recipient_id uuid,
  p_source text,
  p_metadata jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_configured integer;
  v_amount integer;
  v_tx_id uuid;
  v_expire_at timestamptz;
  v_rows_updated integer;
BEGIN
  SELECT amount INTO v_configured
  FROM public.percoin_bonus_defaults
  WHERE source = p_source;

  -- 未設定 = 付与しない(既定0で出荷するため、admin が額を入れるまでここで抜ける)
  IF COALESCE(v_configured, 0) <= 0 THEN
    RETURN 0;
  END IF;

  -- 5万無料残高キャップ。受け手単位の直列化は呼び出し元の付与RPCが冒頭で
  -- 取る advisory lock で担保する(ADR-008。共有関数側には入れない)
  v_amount := public.get_grantable_free_percoin_amount(p_recipient_id, v_configured);

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.credit_transactions (
    user_id, amount, transaction_type, related_generation_id, metadata
  ) VALUES (
    p_recipient_id, v_amount, p_source, NULL, p_metadata
  )
  RETURNING id INTO v_tx_id;

  v_expire_at := (
    date_trunc('month', now() AT TIME ZONE 'Asia/Tokyo')
    + interval '7 months' - interval '1 second'
  ) AT TIME ZONE 'Asia/Tokyo';

  INSERT INTO public.free_percoin_batches (
    user_id, amount, remaining_amount, granted_at, expire_at, source, credit_transaction_id
  )
  VALUES (p_recipient_id, v_amount, v_amount, now(), v_expire_at, p_source, v_tx_id);

  UPDATE public.user_credits
  SET balance = balance + v_amount, updated_at = now()
  WHERE user_id = p_recipient_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    INSERT INTO public.user_credits (user_id, balance, paid_balance)
    VALUES (p_recipient_id, v_amount, 0)
    ON CONFLICT (user_id) DO UPDATE SET
      balance = user_credits.balance + v_amount,
      updated_at = now();
  END IF;

  RETURN v_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_usage_reward_grant(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_usage_reward_grant(uuid, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.apply_usage_reward_grant(uuid, text, jsonb) IS
  '利用還元の付与本体(service_role専用)。設定額0/キャップ0なら0を返す。付与額を返す';

-- =============================================================================
-- 6. Free(派生プロンプト)の還元付与
-- =============================================================================

CREATE OR REPLACE FUNCTION public.grant_prompt_usage_reward(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.prompt_usage_events%ROWTYPE;
  v_recipient uuid;
  v_origin_ok boolean;
  v_amount integer;
BEGIN
  -- 受け手を先に読む(ロックを他のどのロックよりも先に取るため。ADR-008)
  SELECT e.origin_author_id INTO v_recipient
  FROM public.prompt_usage_events e
  WHERE e.id = p_event_id AND e.reward_status = 'pending';

  IF v_recipient IS NULL THEN
    RETURN;
  END IF;

  -- 受け手単位の直列化。キャップ計算〜ウォレット更新までを守る。
  -- 「受け手ロックを最初に取る」を本関数の規約とし、行ロックより先に置く
  -- (順序が経路ごとに食い違うとデッドロックになるため)。
  PERFORM pg_advisory_xact_lock(hashtextextended(v_recipient::text, 0));

  -- 冪等の要(ADR-002): pending の1行だけが処理に進む。
  -- 以降で例外が起きた場合は呼び出し側の内側ブロックごとロールバックされ、
  -- pending に戻る(= 再処理で拾える)。
  UPDATE public.prompt_usage_events e
  SET reward_status = 'granted'
  WHERE e.id = p_event_id
    AND e.reward_status = 'pending'
  RETURNING e.* INTO v_event;

  IF v_event.id IS NULL THEN
    RETURN;
  END IF;

  -- 自己利用は付与しない(REQ-03)
  IF v_event.origin_author_id = v_event.user_id THEN
    UPDATE public.prompt_usage_events
    SET reward_status = 'skipped', reward_processed_at = now()
    WHERE id = p_event_id;
    RETURN;
  END IF;

  -- 原作が公開中であること(REQ-06)。投稿済み × 表示可能。
  -- 生成時点では validate_derived_prompt_source が検証済みだが、
  -- 取り下げ・非表示化は後から起こり得るので付与時にも確認する。
  SELECT (gi.is_posted = true AND gi.moderation_status = 'visible')
  INTO v_origin_ok
  FROM public.generated_images gi
  WHERE gi.id = v_event.origin_post_id;

  IF v_origin_ok IS DISTINCT FROM true THEN
    UPDATE public.prompt_usage_events
    SET reward_status = 'skipped', reward_processed_at = now()
    WHERE id = p_event_id;
    RETURN;
  END IF;

  v_amount := public.apply_usage_reward_grant(
    v_event.origin_author_id,
    'prompt_usage_reward',
    jsonb_build_object(
      'source', 'grant_prompt_usage_reward',
      'event_id', p_event_id,
      'origin_post_id', v_event.origin_post_id,
      'image_job_id', v_event.image_job_id
    )
  );

  IF v_amount <= 0 THEN
    -- 額0設定 or キャップで0 → 終端スキップ(再処理対象にしない)
    UPDATE public.prompt_usage_events
    SET reward_status = 'skipped', reward_processed_at = now()
    WHERE id = p_event_id;
    RETURN;
  END IF;

  UPDATE public.prompt_usage_events
  SET reward_granted_at = now(), reward_processed_at = now()
  WHERE id = p_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_prompt_usage_reward(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_prompt_usage_reward(uuid) TO service_role;

COMMENT ON FUNCTION public.grant_prompt_usage_reward(uuid) IS
  'Free派生プロンプトの利用に対する原作者への還元(service_role専用・冪等)';

-- =============================================================================
-- 7. Style(One-Tap Style)の還元付与
-- =============================================================================

CREATE OR REPLACE FUNCTION public.grant_style_preset_usage_reward(p_generated_image_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.style_preset_usage_events%ROWTYPE;
  v_provider uuid;
  v_amount integer;
BEGIN
  -- 受け手(provider)を先に解決する。ロックを他のどのロックよりも先に取るため。
  -- provider 解決はクレジット表示・クリエイター通知と同一規則(ADR-005)。
  -- provider_user_id は profiles.id への FK なので profiles.user_id を明示的に引く。
  SELECT COALESCE(preset_provider.user_id, category_provider.user_id)
  INTO v_provider
  FROM public.style_preset_usage_events e
  JOIN public.style_presets sp ON sp.id = e.preset_id
  LEFT JOIN public.preset_categories pc ON pc.id = sp.category_id
  LEFT JOIN public.profiles preset_provider ON preset_provider.id = sp.provider_user_id
  LEFT JOIN public.profiles category_provider ON category_provider.id = pc.provider_user_id
  WHERE e.generated_image_id = p_generated_image_id AND e.reward_status = 'pending';

  -- 受け手単位の直列化(ADR-008)。provider 未設定なら誰も受け取らないので
  -- ロックは不要。以降の test-and-set より先に取る。
  IF v_provider IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_provider::text, 0));
  END IF;

  UPDATE public.style_preset_usage_events e
  SET reward_status = 'granted'
  WHERE e.generated_image_id = p_generated_image_id
    AND e.reward_status = 'pending'
  RETURNING e.* INTO v_event;

  IF v_event.id IS NULL THEN
    RETURN;
  END IF;

  -- クリエイター未設定 → 誰にも付与しない(REQ-05)
  -- 自己利用も付与しない(REQ-03)
  IF v_provider IS NULL OR v_provider = v_event.user_id THEN
    UPDATE public.style_preset_usage_events
    SET reward_status = 'skipped', reward_processed_at = now()
    WHERE generated_image_id = p_generated_image_id;
    RETURN;
  END IF;

  -- 公開中の判定は記録時ゲート(#479)で済んでいる。
  -- イベント行が存在する = 生成時点で公開中だったことの証跡。
  v_amount := public.apply_usage_reward_grant(
    v_provider,
    'style_usage_reward',
    jsonb_build_object(
      'source', 'grant_style_preset_usage_reward',
      'event_id', p_generated_image_id,
      'preset_id', v_event.preset_id,
      'generated_image_id', v_event.generated_image_id
    )
  );

  IF v_amount <= 0 THEN
    UPDATE public.style_preset_usage_events
    SET reward_status = 'skipped', reward_processed_at = now()
    WHERE generated_image_id = p_generated_image_id;
    RETURN;
  END IF;

  UPDATE public.style_preset_usage_events
  SET reward_granted_at = now(), reward_processed_at = now()
  WHERE generated_image_id = p_generated_image_id;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_style_preset_usage_reward(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_style_preset_usage_reward(uuid) TO service_role;

COMMENT ON FUNCTION public.grant_style_preset_usage_reward(uuid) IS
  'One-Tap Styleの利用に対するクリエイターへの還元(service_role専用・冪等)';

-- =============================================================================
-- 8. 記録関数へのフック(ADR-006: 付与のみを内側の例外ブロックに隔離)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_prompt_usage(
  p_image_job_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.image_jobs%ROWTYPE;
  v_origin_author uuid;
  v_event_id uuid;
BEGIN
  SELECT * INTO v_job
  FROM public.image_jobs
  WHERE id = p_image_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'image job not found: %', p_image_job_id;
  END IF;

  -- 派生ジョブでなければ記録しない
  IF v_job.origin_post_id IS NULL THEN
    RETURN;
  END IF;

  IF v_job.status <> 'succeeded' THEN
    RAISE EXCEPTION
      '成功していないジョブの利用イベントは記録しない: %, status=%',
      p_image_job_id, v_job.status;
  END IF;

  -- 原作者は原作行から取る。削除済みでも記録は残す。
  SELECT user_id INTO v_origin_author
  FROM public.generated_images
  WHERE id = v_job.origin_post_id;

  INSERT INTO public.prompt_usage_events (
    image_job_id,
    origin_post_id,
    origin_author_id,
    user_id
  )
  VALUES (
    p_image_job_id,
    v_job.origin_post_id,
    COALESCE(v_origin_author, v_job.user_id),
    v_job.user_id
  )
  ON CONFLICT (image_job_id) DO NOTHING
  RETURNING id INTO v_event_id;

  -- 還元付与(ADR-006)。
  -- この関数にはハンドラが無く、例外は complete_image_job_with_prompt_secrets
  -- 全体を中断させて生成を失敗扱い＋返金にしてしまう。付与だけを内側の
  -- ブロックに閉じ込め、失敗しても pending のまま生成を成功させる。
  IF v_event_id IS NOT NULL THEN
    BEGIN
      PERFORM public.grant_prompt_usage_reward(v_event_id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to grant prompt usage reward (event=%): %', v_event_id, SQLERRM;
    END;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.record_prompt_usage(uuid) IS
  '成功済みジョブから origin / 利用者を導出して冪等記録し、原作者への還元を試みる。引数を信用しない';

CREATE OR REPLACE FUNCTION public.record_style_preset_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  -- WHEN 句と同条件の再チェック（二重ガードの慣例）
  IF NEW.generation_type <> 'one_tap_style'
     OR NEW.generation_metadata->'oneTapStyle'->>'id' IS NULL
     OR NEW.user_id IS NULL
  THEN
    RETURN NEW;
  END IF;

  -- 公開中の生成だけを利用実績にする (ADR-009 / #479)。
  -- 条件はアプリ側の公開判定 (20260610130000) と同一:
  -- published × visibility='public' × is_active × 表示期間 [starts, ends)。
  -- 運営の公開前・期間外テストはカウントも通知も還元もされない。
  IF NOT EXISTS (
    SELECT 1
    FROM public.style_presets sp
    JOIN public.preset_categories pc ON pc.id = sp.category_id
    WHERE sp.id = (NEW.generation_metadata->'oneTapStyle'->>'id')::uuid
      AND sp.status = 'published'
      AND pc.visibility = 'public'
      AND pc.is_active = true
      AND (pc.collection_display_starts_at IS NULL
           OR now() >= pc.collection_display_starts_at)
      AND (pc.collection_display_ends_at IS NULL
           OR now() < pc.collection_display_ends_at)
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.style_preset_usage_events
    (generated_image_id, preset_id, user_id, created_at, was_public_at_generation)
  VALUES (
    NEW.id,
    (NEW.generation_metadata->'oneTapStyle'->>'id')::uuid,
    NEW.user_id,
    COALESCE(NEW.created_at, now()),
    true
  )
  ON CONFLICT (generated_image_id) DO NOTHING
  RETURNING generated_image_id INTO v_event_id;

  -- 還元付与(ADR-006)。
  -- この関数は末尾に EXCEPTION ハンドラを持つ = 関数全体が1つの
  -- サブトランザクション。付与呼び出しを裸で置くと、付与の失敗で
  -- 上の INSERT ごとロールバックされ、利用数と節目通知の正本を失う。
  -- 内側のブロックに閉じ込めて、ロールバック範囲を付与だけに限定する。
  IF v_event_id IS NOT NULL THEN
    BEGIN
      PERFORM public.grant_style_preset_usage_reward(v_event_id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to grant style preset usage reward (event=%): %', v_event_id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- 記録の失敗で生成完了 RPC を巻き込まない (REQ-007)
    RAISE WARNING 'Failed to record style preset usage: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- =============================================================================
-- 9. 再処理(ADR-007)
-- =============================================================================
--
-- 一時的な失敗で pending のまま残った行を回収する。
-- 行ごとに内側の例外ブロックを張るのが必須(pg_cron の1回の呼び出しは
-- 1トランザクションのため、1行の失敗でバッチ全体が巻き戻り、
-- 古い1行の恒久エラーで後続行が永久に処理されなくなる)。
CREATE OR REPLACE FUNCTION public.reprocess_pending_usage_rewards(
  p_limit integer DEFAULT 50
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
  v_processed integer := 0;
BEGIN
  -- 候補の claim と処理順について:
  --   - 行は FOR UPDATE SKIP LOCKED で claim する。cron と手動実行が重なっても
  --     互いに別の行を掴み、同じ先頭 N 件を奪い合わない
  --   - 並び順は「実際の受け手(advisory lock のキー)」にする。Style の受け手は
  --     利用者ではなく provider なので、ここで解決してから並べる
  --   - UNION 全体には行ロックを付けられないため、テーブルごとに claim して
  --     prompt → style の順に処理する。並行バッチも同じ順序を辿るので
  --     ロック取得順が食い違わない
  FOR v_row IN
    WITH prompt_claim AS (
      SELECT e.id,
             'prompt'::text AS kind,
             e.origin_author_id AS recipient_id,
             e.created_at
      FROM public.prompt_usage_events e
      WHERE e.reward_status = 'pending'
        AND e.created_at < now() - interval '5 minutes'
        AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= now())
      ORDER BY e.origin_author_id, e.created_at
      LIMIT GREATEST(COALESCE(p_limit, 50), 1)
      FOR UPDATE OF e SKIP LOCKED
    ),
    style_claim AS (
      SELECT e.generated_image_id AS id,
             'style'::text AS kind,
             COALESCE(preset_provider.user_id, category_provider.user_id) AS recipient_id,
             e.created_at
      FROM public.style_preset_usage_events e
      JOIN public.style_presets sp ON sp.id = e.preset_id
      LEFT JOIN public.preset_categories pc ON pc.id = sp.category_id
      LEFT JOIN public.profiles preset_provider ON preset_provider.id = sp.provider_user_id
      LEFT JOIN public.profiles category_provider ON category_provider.id = pc.provider_user_id
      WHERE e.reward_status = 'pending'
        AND e.created_at < now() - interval '5 minutes'
        AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= now())
      ORDER BY COALESCE(preset_provider.user_id, category_provider.user_id), e.created_at
      LIMIT GREATEST(COALESCE(p_limit, 50), 1)
      FOR UPDATE OF e SKIP LOCKED
    )
    SELECT id, kind, recipient_id, created_at, 0 AS table_order FROM prompt_claim
    UNION ALL
    SELECT id, kind, recipient_id, created_at, 1 AS table_order FROM style_claim
    -- 受け手を最優先に並べる。テーブル順を先にすると、同じ受け手が両テーブルに
    -- いる場合にバッチごとで並び順が変わり、循環待ちになる
    -- (A: prompt受け手A → style受け手B / B: prompt受け手B → style受け手A)。
    -- 受け手順をグローバルに固定すれば、どのバッチも同じ順序でロックを取る。
    ORDER BY recipient_id, table_order, created_at
  LOOP
    BEGIN
      IF v_row.kind = 'prompt' THEN
        PERFORM public.grant_prompt_usage_reward(v_row.id);
      ELSE
        PERFORM public.grant_style_preset_usage_reward(v_row.id);
      END IF;
      v_processed := v_processed + 1;
    EXCEPTION
      WHEN OTHERS THEN
        -- この行だけ pending のまま残し、後続行の処理を続ける。
        --
        -- 指数部を LEAST(attempt_count, 9) で先に頭打ちにする。外側の
        -- LEAST(interval, '24 hours') だけでは、恒久エラーで attempt_count が
        -- 伸びたときに interval * power(2, n) の評価で 22008 interval out of
        -- range が発生する。しかもこの UPDATE は EXCEPTION ハンドラの中に
        -- あり、ハンドラ内の例外は同じハンドラでは捕捉されず外へ伝播するため、
        -- バッチ全体を巻き戻してしまう。
        IF v_row.kind = 'prompt' THEN
          UPDATE public.prompt_usage_events
          SET attempt_count = attempt_count + 1,
              last_error = SQLERRM,
              next_attempt_at = now() + LEAST(
                interval '5 minutes' * power(
                  2::double precision,
                  LEAST(attempt_count, 9)::double precision
                ),
                interval '24 hours'
              )
          WHERE id = v_row.id;
        ELSE
          UPDATE public.style_preset_usage_events
          SET attempt_count = attempt_count + 1,
              last_error = SQLERRM,
              next_attempt_at = now() + LEAST(
                interval '5 minutes' * power(
                  2::double precision,
                  LEAST(attempt_count, 9)::double precision
                ),
                interval '24 hours'
              )
          WHERE generated_image_id = v_row.id;
        END IF;
        RAISE WARNING 'Pending usage reward failed: kind=%, event=%, error=%',
          v_row.kind, v_row.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_processed;
END;
$$;

REVOKE ALL ON FUNCTION public.reprocess_pending_usage_rewards(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reprocess_pending_usage_rewards(integer) TO service_role;

COMMENT ON FUNCTION public.reprocess_pending_usage_rewards(integer) IS
  '付与に失敗して pending のまま残った利用イベントを再処理する(service_role専用)。行単位で隔離し、失敗行は指数バックオフ。p_limit は「テーブルごと」の上限で、1回の実行では最大 2*p_limit 件(Free + Style)を処理する';

-- =============================================================================
-- 10. pg_cron 登録(既存ジョブがあれば貼り替える。20260728130200 と同じ手順)
-- =============================================================================

DO $do$
DECLARE
  v_existing_job_id bigint;
BEGIN
  SELECT jobid INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'reprocess_pending_usage_rewards'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'reprocess_pending_usage_rewards',
    -- 10分ごと。p_limit はテーブルごとの上限なので1回で最大100件(Free+Style)
    '*/10 * * * *',
    'SELECT public.reprocess_pending_usage_rewards(50);'
  );
END;
$do$;

-- =============================================================================
-- 11. カタログ検証 + 実データ dry-run(必ずロールバックする)
-- =============================================================================
--
-- COMMIT はこのファイルの末尾に置く。検証より前にコミットすると、
-- 検証が失敗しても DDL・関数・cron だけが残り、マイグレーション履歴には
-- 未適用として記録される(再実行時に既存制約と衝突して手動修復が必要になる)。
-- dry-run 内の PT999 は内側のサブトランザクションだけを戻すため、
-- 外側の DDL トランザクションとは両立する。

DO $$
DECLARE
  v_defaults integer;
  v_columns integer;
  v_legacy_pending integer;
  v_funcs integer;
  v_cron integer;
  v_lock_present boolean;
BEGIN
  SELECT count(*) INTO v_defaults
  FROM public.percoin_bonus_defaults
  WHERE source IN ('prompt_usage_reward', 'style_usage_reward') AND amount = 0;
  IF v_defaults <> 2 THEN
    RAISE EXCEPTION '設定 source が % 件(2件・既定0であること)', v_defaults;
  END IF;

  SELECT count(*) INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('prompt_usage_events', 'style_preset_usage_events')
    AND column_name IN ('reward_status', 'reward_granted_at', 'reward_processed_at',
                        'attempt_count', 'last_error', 'next_attempt_at');
  IF v_columns <> 12 THEN
    RAISE EXCEPTION '付与状態の列が % 本(2テーブル×6本必要)', v_columns;
  END IF;

  SELECT (SELECT count(*) FROM public.prompt_usage_events WHERE reward_status = 'pending')
       + (SELECT count(*) FROM public.style_preset_usage_events WHERE reward_status = 'pending')
  INTO v_legacy_pending;
  IF v_legacy_pending <> 0 THEN
    RAISE EXCEPTION '既存イベントに pending が % 件残っている(全て legacy であること)', v_legacy_pending;
  END IF;

  SELECT count(*) INTO v_funcs
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('apply_usage_reward_grant', 'grant_prompt_usage_reward',
                      'grant_style_preset_usage_reward', 'reprocess_pending_usage_rewards');
  IF v_funcs <> 4 THEN
    RAISE EXCEPTION '付与関数が % 本(4本必要)', v_funcs;
  END IF;

  -- 受け手単位の直列化は付与RPCの側で行う(ADR-008 再改訂。共有関数に入れると
  -- 既存経路とロック順が食い違いデッドロックになるため)
  SELECT bool_and(p.prosrc LIKE '%pg_advisory_xact_lock%') INTO v_lock_present
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('grant_prompt_usage_reward', 'grant_style_preset_usage_reward');
  IF v_lock_present IS DISTINCT FROM true THEN
    RAISE EXCEPTION '付与RPCに受け手単位の advisory lock が入っていない';
  END IF;

  -- 共有のキャップ関数は元のまま(ロックを持ち込んでいない)ことを確認する
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_grantable_free_percoin_amount'
      AND p.prosrc LIKE '%pg_advisory_xact_lock%'
  ) THEN
    RAISE EXCEPTION 'キャップ関数にロックが入っている(既存経路とのデッドロック要因)';
  END IF;

  IF has_function_privilege('authenticated', 'public.grant_prompt_usage_reward(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reprocess_pending_usage_rewards(integer)', 'EXECUTE')
  THEN
    RAISE EXCEPTION '付与/再処理 RPC が authenticated から実行可能になっている';
  END IF;

  SELECT count(*) INTO v_cron FROM cron.job WHERE jobname = 'reprocess_pending_usage_rewards';
  IF v_cron <> 1 THEN
    RAISE EXCEPTION '再処理の cron ジョブが % 件(1件必要)', v_cron;
  END IF;

  RAISE NOTICE 'カタログ検証 OK(設定2件=0・状態列12本・既存pending0件・付与関数4本・キャップにロック・権限・cron)';
END;
$$;

-- バックオフ式の境界検証(値のみ。副作用なし)
DO $$
DECLARE
  v0 interval;
  v1 interval;
  v1000 interval;
BEGIN
  SELECT LEAST(interval '5 minutes' * power(2::double precision, LEAST(0, 9)::double precision), interval '24 hours') INTO v0;
  SELECT LEAST(interval '5 minutes' * power(2::double precision, LEAST(1, 9)::double precision), interval '24 hours') INTO v1;
  SELECT LEAST(interval '5 minutes' * power(2::double precision, LEAST(1000, 9)::double precision), interval '24 hours') INTO v1000;

  IF v0 <> interval '5 minutes' OR v1 <> interval '10 minutes' OR v1000 <> interval '24 hours' THEN
    RAISE EXCEPTION 'バックオフ式が想定と違う(0=%, 1=%, 1000=%)', v0, v1, v1000;
  END IF;

  RAISE NOTICE 'バックオフ検証 OK(0→5分・1→10分・1000→24時間で例外なし)';
END;
$$;

-- 実データでの dry-run。必ずロールバックするサブトランザクションで行う。
-- (コミット済みの INSERT + DELETE では論理レプリケーションに痕跡が漏れるため)
--
-- 実データが無い環境(Supabase Preview の新規ブランチ等)では NOTICE を出して
-- スキップする。マイグレーションの成否を適用先のデータ量に依存させないため。
-- 本番適用時は NOTICE が「スキップ」ではなく「OK」であることを必ず確認する。
DO $$
DECLARE
  v_provider_profile uuid;
  v_provider_user uuid;
  v_consumer uuid;
  v_preset uuid;
  v_image uuid;
  v_event uuid;
  v_status text;
  v_legacy_before integer;
  v_balance_before integer;
  v_balance_after integer;
  v_tx_count integer;
  v_batch_count integer;
  v_new_image uuid;
  v_job uuid;
  v_free_recipient uuid;
BEGIN
  -- 検証用の実データが揃うか先に確かめる(揃わなければスキップ)
  SELECT sp.id INTO v_preset
  FROM public.style_presets sp
  JOIN public.preset_categories pc ON pc.id = sp.category_id
  WHERE sp.status = 'published' AND pc.visibility = 'public' AND pc.is_active = true
  LIMIT 1;

  SELECT p.id, p.user_id INTO v_provider_profile, v_provider_user
  FROM public.profiles p
  WHERE p.user_id IS NOT NULL
  LIMIT 1;

  SELECT p.user_id INTO v_consumer
  FROM public.profiles p
  WHERE p.user_id IS NOT NULL AND p.user_id <> v_provider_user
  LIMIT 1;

  IF v_preset IS NULL OR v_provider_user IS NULL OR v_consumer IS NULL THEN
    RAISE NOTICE '実データが無いため dry-run をスキップした(プレビュー環境等)';
    RETURN;
  END IF;

  SELECT gi.id INTO v_image
  FROM public.generated_images gi
  WHERE gi.user_id = v_consumer
    AND NOT EXISTS (
      SELECT 1 FROM public.style_preset_usage_events e
      WHERE e.generated_image_id = gi.id
    )
  LIMIT 1;

  IF v_image IS NULL THEN
    RAISE NOTICE '未使用の画像が無いため dry-run をスキップした';
    RETURN;
  END IF;

  BEGIN
    -- provider を検証用ユーザーに固定してから始める。
    -- これをしないと「額0だから skipped」なのか「provider 未設定だから
    -- skipped」なのか区別できず、検証が素通りする。
    UPDATE public.style_presets
    SET provider_user_id = v_provider_profile
    WHERE id = v_preset;

    INSERT INTO public.style_preset_usage_events
      (generated_image_id, preset_id, user_id, created_at, was_public_at_generation)
    VALUES (v_image, v_preset, v_consumer, now(), true)
    RETURNING generated_image_id INTO v_event;

    SELECT COALESCE(balance, 0) INTO v_balance_before
    FROM public.user_credits WHERE user_id = v_provider_user;

    -- (a) 額0(既定)は skipped で確定し、取引もバッチも作られず残高も動かない
    PERFORM public.grant_style_preset_usage_reward(v_event);

    SELECT reward_status INTO v_status
    FROM public.style_preset_usage_events WHERE generated_image_id = v_event;
    SELECT count(*) INTO v_tx_count
    FROM public.credit_transactions
    WHERE metadata->>'event_id' = v_event::text;
    SELECT count(*) INTO v_batch_count
    FROM public.free_percoin_batches
    WHERE source = 'style_usage_reward' AND user_id = v_provider_user
      AND granted_at > now() - interval '1 minute';
    SELECT COALESCE(balance, 0) INTO v_balance_after
    FROM public.user_credits WHERE user_id = v_provider_user;

    IF v_status <> 'skipped' THEN
      RAISE EXCEPTION '額0のとき skipped にならない(status=%)', v_status;
    END IF;
    IF v_tx_count <> 0 OR v_batch_count <> 0 THEN
      RAISE EXCEPTION '額0なのに取引(%)/バッチ(%)が作られた', v_tx_count, v_batch_count;
    END IF;
    IF COALESCE(v_balance_after, 0) <> COALESCE(v_balance_before, 0) THEN
      RAISE EXCEPTION '額0なのに残高が動いた(before=%, after=%)', v_balance_before, v_balance_after;
    END IF;

    -- (b) 額を入れると付与され、残高が増え、granted になる
    UPDATE public.percoin_bonus_defaults SET amount = 2 WHERE source = 'style_usage_reward';
    UPDATE public.style_preset_usage_events SET reward_status = 'pending' WHERE generated_image_id = v_event;

    PERFORM public.grant_style_preset_usage_reward(v_event);

    SELECT reward_status INTO v_status
    FROM public.style_preset_usage_events WHERE generated_image_id = v_event;
    SELECT COALESCE(balance, 0) INTO v_balance_after
    FROM public.user_credits WHERE user_id = v_provider_user;
    SELECT count(*) INTO v_tx_count
    FROM public.credit_transactions WHERE metadata->>'event_id' = v_event::text;

    IF v_status <> 'granted' THEN
      RAISE EXCEPTION '付与後に granted にならない(status=%)', v_status;
    END IF;
    IF COALESCE(v_balance_after, 0) <> COALESCE(v_balance_before, 0) + 2 THEN
      RAISE EXCEPTION '残高が2増えていない(before=%, after=%)', v_balance_before, v_balance_after;
    END IF;
    IF v_tx_count <> 1 THEN
      RAISE EXCEPTION '取引が1件でない(count=%)', v_tx_count;
    END IF;

    -- (c) 二重実行しても増えない(冪等)
    PERFORM public.grant_style_preset_usage_reward(v_event);
    SELECT COALESCE(balance, 0) INTO v_balance_after
    FROM public.user_credits WHERE user_id = v_provider_user;
    IF COALESCE(v_balance_after, 0) <> COALESCE(v_balance_before, 0) + 2 THEN
      RAISE EXCEPTION '二重実行で残高が増えた(after=%)', v_balance_after;
    END IF;

    -- (d) 自己利用は skipped(利用者 = provider)
    UPDATE public.style_preset_usage_events
    SET reward_status = 'pending', user_id = v_provider_user
    WHERE generated_image_id = v_event;
    PERFORM public.grant_style_preset_usage_reward(v_event);
    SELECT reward_status INTO v_status
    FROM public.style_preset_usage_events WHERE generated_image_id = v_event;
    IF v_status <> 'skipped' THEN
      RAISE EXCEPTION '自己利用が skipped にならない(status=%)', v_status;
    END IF;

    -- (e) 付与が失敗しても利用イベントは残り、ウォレットは動かない(ADR-006)。
    --     失敗の注入は検証用ユーザーの残高だけで行う(共有スキーマには触らない)。
    --     balance = paid_balance = int 上限にすると、無料残高は0のままなので
    --     キャップは2を通し、直後の balance + 2 が integer 範囲外で失敗する。
    UPDATE public.style_preset_usage_events
    SET reward_status = 'pending', user_id = v_consumer
    WHERE generated_image_id = v_event;

    INSERT INTO public.user_credits (user_id, balance, paid_balance)
    VALUES (v_provider_user, 2147483647, 2147483647)
    ON CONFLICT (user_id) DO UPDATE
      SET balance = 2147483647, paid_balance = 2147483647;

    BEGIN
      PERFORM public.grant_style_preset_usage_reward(v_event);
      RAISE EXCEPTION '付与が失敗するはずのケースで成功した';
    EXCEPTION
      WHEN numeric_value_out_of_range THEN
        NULL;  -- 記録関数側の内側ブロックと同じ扱い(付与だけが巻き戻る)
    END;

    SELECT reward_status INTO v_status
    FROM public.style_preset_usage_events WHERE generated_image_id = v_event;
    SELECT COALESCE(balance, 0) INTO v_balance_after
    FROM public.user_credits WHERE user_id = v_provider_user;

    IF v_status <> 'pending' THEN
      RAISE EXCEPTION '付与失敗後に pending へ戻っていない(status=%)', v_status;
    END IF;
    IF v_balance_after <> 2147483647 THEN
      RAISE EXCEPTION '付与失敗なのに残高が動いた(after=%)', v_balance_after;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.credit_transactions
      WHERE metadata->>'event_id' = v_event::text
        AND transaction_type = 'style_usage_reward'
        AND created_at > now() - interval '1 minute'
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION '付与失敗なのに取引が増えた';
    END IF;

    -- (f) 記録関数を通した隔離の検証(ADR-006 の本丸)。
    --     付与が失敗しても、記録関数が作った利用イベントは残ること。
    --     残高は int 上限のままなので付与は必ず失敗する。
    --
    --     f-1) Style: トリガー経由。record_style_preset_usage は関数全体が
    --          単一の EXCEPTION ブロックのため、内側で隔離できていないと
    --          付与失敗で INSERT ごと巻き戻る。
    INSERT INTO public.generated_images (
      user_id, image_url, storage_path, prompt, background_mode,
      is_posted, generation_type, generation_metadata, model, width, height
    )
    SELECT gi.user_id, gi.image_url, gi.storage_path, '', gi.background_mode,
           false, 'one_tap_style',
           jsonb_build_object('oneTapStyle', jsonb_build_object('id', v_preset::text)),
           gi.model, gi.width, gi.height
    FROM public.generated_images gi
    WHERE gi.id = v_image
    RETURNING id INTO v_new_image;

    IF NOT EXISTS (
      SELECT 1 FROM public.style_preset_usage_events
      WHERE generated_image_id = v_new_image AND reward_status = 'pending'
    ) THEN
      RAISE EXCEPTION
        'Style: 付与失敗で利用イベントまで巻き戻った(内側の例外ブロックが効いていない)';
    END IF;

    --     f-2) Free: 完了RPCから呼ばれる record_prompt_usage 経由。
    --          こちらはハンドラが無いため、隔離できていないと例外が
    --          この PERFORM まで伝播する(= 生成完了RPCが中断する挙動と同じ)。
    UPDATE public.percoin_bonus_defaults SET amount = 2 WHERE source = 'prompt_usage_reward';

    -- 付与が「失敗」する経路へ確実に到達するイベントだけを選ぶ。
    -- 自己利用や原作が非公開のイベントを拾うと skipped で正常終了してしまい、
    -- 下の pending 判定が誤って失敗する(適用先データに依存した誤検知)。
    SELECT e.image_job_id, e.origin_author_id INTO v_job, v_free_recipient
    FROM public.prompt_usage_events e
    JOIN public.image_jobs j ON j.id = e.image_job_id
    JOIN public.generated_images gi ON gi.id = e.origin_post_id
    WHERE j.status = 'succeeded'
      AND e.user_id <> e.origin_author_id
      AND gi.is_posted = true
      AND gi.moderation_status = 'visible'
    LIMIT 1;

    IF v_job IS NOT NULL THEN
      INSERT INTO public.user_credits (user_id, balance, paid_balance)
      VALUES (v_free_recipient, 2147483647, 2147483647)
      ON CONFLICT (user_id) DO UPDATE
        SET balance = 2147483647, paid_balance = 2147483647;

      DELETE FROM public.prompt_usage_events WHERE image_job_id = v_job;

      -- 例外が伝播したらここで dry-run 全体が落ちる(= 隔離できていない)
      PERFORM public.record_prompt_usage(v_job);

      IF NOT EXISTS (
        SELECT 1 FROM public.prompt_usage_events
        WHERE image_job_id = v_job AND reward_status = 'pending'
      ) THEN
        RAISE EXCEPTION
          'Free: 付与失敗で利用イベントが残っていない(内側の例外ブロックが効いていない)';
      END IF;
    ELSE
      RAISE NOTICE 'Free 経路の隔離検証は対象イベント(他者利用×公開中の原作)が無いためスキップした';
    END IF;

    -- (g) legacy は再処理で拾われない
    SELECT count(*) INTO v_legacy_before
    FROM public.style_preset_usage_events WHERE reward_status = 'legacy';
    PERFORM public.reprocess_pending_usage_rewards(10);
    IF (SELECT count(*) FROM public.style_preset_usage_events WHERE reward_status = 'legacy')
       <> v_legacy_before THEN
      RAISE EXCEPTION 'legacy が再処理で変化した';
    END IF;

    RAISE NOTICE '実データ dry-run OK(額0=skipped/取引0/残高不変・付与で+2かつgranted・二重実行で不変・自己利用skipped・付与失敗でpending維持かつ残高不変・記録関数経由でもStyle/Free両方イベント残存・legacy不変)';

    -- 検証はここで必ず巻き戻す
    RAISE EXCEPTION 'PT999' USING ERRCODE = 'PT999';
  EXCEPTION
    WHEN SQLSTATE 'PT999' THEN
      RAISE NOTICE 'dry-run の変更はすべてロールバックした';
  END;
END;
$$;

-- PostgREST のスキーマキャッシュへ新関数を反映する
NOTIFY pgrst, 'reload schema';

COMMIT;
