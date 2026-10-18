-- 個人あてのお知らせ(計画書: docs/planning/personal-notices-implementation-plan.md)
--
-- 運営が管理画面から、選んだ人だけに、題名と本文を自由に書いたお知らせを送る。
-- 届く場所は「あなたへの通知」(notifications)。新しい種類 admin_message を足す。
--
-- - 送った記録は専用の2表に残す(ADR-002)。受け取った人は自分の通知を消せるが、
--   受付番号と相手の対応(賞品の受け渡しの正本)は消えない。
-- - 送信は send_personal_notice が1つのトランザクションで行う(ADR-003)。
--   一部の人にだけ届く状態を作らない。通知への直接 INSERT は RLS で禁止されている。
-- - 管理者かどうかは API 層(requireAdmin)で確かめる。RPC は service_role 専用。
--   p_admin_user_id は API がセッションから入れる(リクエストのボディからは受け取らない)。
-- - 「開いたか」は opened_at で記録する(ADR-004)。お知らせ画面を開くと未読は
--   すべて既読になる(autoMarkAllRead)ので、is_read は「開いた」の意味にならない。
-- - 作品つきは entity_type='post'(get_notifications_page がサムネイルを結合する)、
--   作品なしは entity_type='user'(本人)にする(ADR-005)。
-- - プッシュは積まない(push_category_for_notification_type は admin_message に NULL を返す)。
--
-- 適用順序: 追加のみ。既存の関数のシグネチャは変えない。

BEGIN;

-- 開催中の企画があるので、notifications の表ロックを長く待たない(待つなら失敗させて出直す)
SET LOCAL lock_timeout = '5s';

-- =============================================================================
-- 1. 通知の種類に admin_message を足す
-- =============================================================================
-- NOT VALID で足してから VALIDATE する。VALIDATE は書き込みを止めないロック
-- (SHARE UPDATE EXCLUSIVE)で既存の行を確かめる。

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (
    type = ANY (
      ARRAY[
        'like'::text, 'comment'::text, 'follow'::text, 'bonus'::text,
        'style_template_approved'::text, 'style_template_rejected'::text,
        'style_template_unpublished'::text,
        'catalog_entry_approved'::text, 'catalog_entry_rejected'::text,
        'catalog_entry_unpublished'::text,
        'creator_looks_submission_received'::text,
        'creator_looks_submission_acknowledged'::text,
        'creator_looks_moderation_result'::text,
        'creator_looks_post_published'::text,
        'post_moderation_removed'::text,
        'post_moderation_appeal_result'::text,
        'derived_post_published'::text,
        'derived_usage_milestone'::text,
        'style_preset_post_published'::text,
        'style_preset_usage_milestone'::text,
        'usage_reward_earned'::text,
        'admin_message'::text
      ]
    )
  ) NOT VALID;

ALTER TABLE public.notifications
  VALIDATE CONSTRAINT notifications_type_check;

-- =============================================================================
-- 2. 送ったお知らせ(1回分)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.personal_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 管理用のメモ(企画ごとの絞り込み用。受け取った人には見えない)
  memo TEXT NOT NULL CHECK (char_length(btrim(memo)) BETWEEN 1 AND 100),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),
  -- 置き換え前の本文({受付番号} を含みうる)
  body_template TEXT NOT NULL CHECK (char_length(btrim(body_template)) BETWEEN 1 AND 2000),
  -- 受付番号の頭の英字。本文に {受付番号} が無いときは NULL
  code_prefix TEXT CHECK (code_prefix IS NULL OR code_prefix ~ '^[A-Z]{2,5}$'),
  recipient_count INTEGER NOT NULL CHECK (recipient_count BETWEEN 1 AND 200),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_notices_created_at
  ON public.personal_notices (created_at DESC);
-- 外部キーの索引(参照先の削除で SET NULL するときに全件を読まない)
CREATE INDEX IF NOT EXISTS idx_personal_notices_created_by
  ON public.personal_notices (created_by)
  WHERE created_by IS NOT NULL;

COMMENT ON TABLE public.personal_notices IS
  '個人あてのお知らせの1回分(運営だけが読む)。受け取った人ごとの記録は personal_notice_recipients。';

-- =============================================================================
-- 3. 受け取った人ごとの記録(1人1行)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.personal_notice_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES public.personal_notices(id) ON DELETE CASCADE,
  -- 退会で消える(今の通知と同じ扱い)
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 受付番号。ほかの企画の分も含めて重ならない
  receipt_code TEXT UNIQUE CHECK (receipt_code IS NULL OR receipt_code ~ '^[A-Z]{2,5}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$'),
  -- 付けた作品(投稿が消えても記録は残す)
  post_id UUID REFERENCES public.generated_images(id) ON DELETE SET NULL,
  -- 届いたお知らせ。取り消し・本人の削除で NULL になる
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ,
  retracted_at TIMESTAMPTZ,
  retracted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notice_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_personal_notice_recipients_recipient
  ON public.personal_notice_recipients (recipient_id);
CREATE INDEX IF NOT EXISTS idx_personal_notice_recipients_notification
  ON public.personal_notice_recipients (notification_id)
  WHERE notification_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personal_notice_recipients_post
  ON public.personal_notice_recipients (post_id)
  WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personal_notice_recipients_retracted_by
  ON public.personal_notice_recipients (retracted_by)
  WHERE retracted_by IS NOT NULL;

COMMENT ON TABLE public.personal_notice_recipients IS
  '個人あてのお知らせの受け取った人ごとの記録(運営だけが読む)。受付番号と相手の対応の正本。取り消しても行は残す。';

-- 利用者からは読めない・書けない(service_role だけ)
ALTER TABLE public.personal_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_notice_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.personal_notices FROM anon, authenticated;
REVOKE ALL ON TABLE public.personal_notice_recipients FROM anon, authenticated;

-- =============================================================================
-- 4. 受付番号を作る(見まちがえやすい 0 O 1 I L を除いた31文字から4文字)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_personal_notice_code(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_bytes BYTEA;
  v_byte INTEGER;
  v_suffix TEXT := '';
  i INTEGER;
BEGIN
  -- gen_random_uuid は暗号学的な乱数(v4)。版と変種の固定ビットがある 6・8 バイト目は使わない。
  -- 31 で割った余りの偏りを避けるため、248 以上(256 = 8×31 + 8 の端数)は捨てて引き直す。
  WHILE char_length(v_suffix) < 4 LOOP
    v_bytes := uuid_send(gen_random_uuid());
    FOR i IN 0..15 LOOP
      CONTINUE WHEN i IN (6, 8);
      v_byte := get_byte(v_bytes, i);
      CONTINUE WHEN v_byte >= 248;
      v_suffix := v_suffix || substr(v_alphabet, (v_byte % 31) + 1, 1);
      EXIT WHEN char_length(v_suffix) = 4;
    END LOOP;
  END LOOP;
  RETURN p_prefix || '-' || v_suffix;
END;
$$;

-- =============================================================================
-- 5. 送る(検証・番号・3表への書き込みを1トランザクションで)
-- =============================================================================
--
-- p_recipients: [{"recipient_id": "<uuid>", "post_id": "<uuid>|null"}, ...]
-- 宛先の解決(投稿の URL → 投稿した人)は API で行い、ここでも
-- 「作品は宛先本人の公開中の投稿」であることを確かめる(PN-005)。
--
-- 失敗は RAISE EXCEPTION。MESSAGE はコード(PN_*)、DETAIL は対象の行(0始まり)。
-- 最初の不備で止まる(1行分だけ返す)。全行の確認は送る前に API の「相手を確かめる」で行い、
-- ここは最後の砦として同じ条件を強制する。

CREATE OR REPLACE FUNCTION public.send_personal_notice(
  p_admin_user_id UUID,
  p_memo TEXT,
  p_title TEXT,
  p_body_template TEXT,
  p_code_prefix TEXT,
  p_recipients JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_placeholder CONSTANT TEXT := '{受付番号}';
  v_uses_code BOOLEAN;
  v_prefix TEXT;
  v_count INTEGER;
  v_notice_id UUID;
  v_item JSONB;
  v_index INTEGER := 0;
  v_recipient_id UUID;
  v_post_id UUID;
  v_row_id UUID;
  v_code TEXT;
  v_attempt INTEGER;
  v_body TEXT;
  v_notification_id UUID;
  v_results JSONB := '[]'::jsonb;
BEGIN
  -- 管理者の確認(API 層の requireAdmin に加えて、既存の管理用 RPC と同じく admin_users でも)
  IF p_admin_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_users a WHERE a.user_id = p_admin_user_id
  ) THEN
    RAISE EXCEPTION 'PN_ADMIN_REQUIRED';
  END IF;

  -- 入力の書式(表の CHECK と同じ条件を、画面に出せるコードで先に返す)
  IF p_memo IS NULL OR char_length(btrim(p_memo)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'PN_MEMO_INVALID';
  END IF;
  IF p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'PN_TITLE_INVALID';
  END IF;
  IF position(c_placeholder IN p_title) > 0 THEN
    -- 題名では置き換えない(本文だけ)。そのまま届くのを防ぐ
    RAISE EXCEPTION 'PN_PLACEHOLDER_IN_TITLE';
  END IF;
  IF p_body_template IS NULL OR char_length(btrim(p_body_template)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'PN_BODY_INVALID';
  END IF;

  IF p_recipients IS NULL OR jsonb_typeof(p_recipients) <> 'array' THEN
    RAISE EXCEPTION 'PN_RECIPIENTS_INVALID';
  END IF;
  v_count := jsonb_array_length(p_recipients);
  IF v_count < 1 OR v_count > 200 THEN
    RAISE EXCEPTION 'PN_RECIPIENT_COUNT_OUT_OF_RANGE' USING DETAIL = v_count::text;
  END IF;

  v_uses_code := position(c_placeholder IN coalesce(p_body_template, '')) > 0;
  v_prefix := NULLIF(btrim(coalesce(p_code_prefix, '')), '');
  IF v_uses_code AND v_prefix IS NULL THEN
    RAISE EXCEPTION 'PN_CODE_PREFIX_REQUIRED';
  END IF;
  IF v_uses_code AND v_prefix !~ '^[A-Z]{2,5}$' THEN
    RAISE EXCEPTION 'PN_CODE_PREFIX_INVALID';
  END IF;
  IF NOT v_uses_code THEN
    -- 番号を使わないなら頭の英字は残さない
    v_prefix := NULL;
  END IF;

  -- 1回分(memo / title / body / prefix の書式は表の CHECK で弾く)
  INSERT INTO public.personal_notices (
    memo, title, body_template, code_prefix, recipient_count, created_by
  ) VALUES (
    btrim(p_memo), btrim(p_title), p_body_template, v_prefix, v_count, p_admin_user_id
  )
  RETURNING id INTO v_notice_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_recipients) LOOP
    BEGIN
      v_recipient_id := (v_item ->> 'recipient_id')::uuid;
      v_post_id := NULLIF(v_item ->> 'post_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'PN_RECIPIENT_INVALID' USING DETAIL = v_index::text;
    END;
    IF v_recipient_id IS NULL THEN
      RAISE EXCEPTION 'PN_RECIPIENT_INVALID' USING DETAIL = v_index::text;
    END IF;

    -- 相手がいて、退会・停止中でない
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = v_recipient_id
        AND p.deactivated_at IS NULL
    ) THEN
      RAISE EXCEPTION 'PN_RECIPIENT_NOT_AVAILABLE' USING DETAIL = v_index::text;
    END IF;

    -- 作品は宛先本人の公開中の投稿だけ(公開の一覧と同じ条件)
    IF v_post_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.generated_images g
      WHERE g.id = v_post_id
        AND g.user_id = v_recipient_id
        AND g.is_posted IS TRUE
        AND g.moderation_status = 'visible'
    ) THEN
      RAISE EXCEPTION 'PN_POST_NOT_ALLOWED' USING DETAIL = v_index::text;
    END IF;

    -- 同じ人が2回入っていない
    IF EXISTS (
      SELECT 1 FROM public.personal_notice_recipients r
      WHERE r.notice_id = v_notice_id AND r.recipient_id = v_recipient_id
    ) THEN
      RAISE EXCEPTION 'PN_RECIPIENT_DUPLICATED' USING DETAIL = v_index::text;
    END IF;

    v_row_id := gen_random_uuid();
    v_code := NULL;
    -- 先に記録の行を作って番号を確保する。同時に送った別の送信と番号がぶつかったら
    -- (UNIQUE 違反)、その行だけ引き直す(サブトランザクションなので送信全体は止まらない)
    v_attempt := 0;
    LOOP
      v_attempt := v_attempt + 1;
      IF v_uses_code THEN
        v_code := public.generate_personal_notice_code(v_prefix);
      END IF;
      BEGIN
        INSERT INTO public.personal_notice_recipients (
          id, notice_id, recipient_id, receipt_code, post_id
        ) VALUES (
          v_row_id, v_notice_id, v_recipient_id, v_code, v_post_id
        );
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- 同じ人の2回目(notice_id, recipient_id)は引き直しても直らない
        IF EXISTS (
          SELECT 1 FROM public.personal_notice_recipients r
          WHERE r.notice_id = v_notice_id AND r.recipient_id = v_recipient_id
        ) THEN
          RAISE EXCEPTION 'PN_RECIPIENT_DUPLICATED' USING DETAIL = v_index::text;
        END IF;
        IF NOT v_uses_code OR v_attempt >= 20 THEN
          RAISE EXCEPTION 'PN_CODE_EXHAUSTED' USING DETAIL = v_index::text;
        END IF;
      END;
    END LOOP;

    v_body := CASE
      WHEN v_uses_code THEN replace(p_body_template, c_placeholder, v_code)
      ELSE p_body_template
    END;

    -- 匿名の種類: actor_id は本人(送った運営を受け取った人に渡さない)
    INSERT INTO public.notifications (
      recipient_id, actor_id, type, entity_type, entity_id, title, body, data
    ) VALUES (
      v_recipient_id,
      v_recipient_id,
      'admin_message',
      CASE WHEN v_post_id IS NOT NULL THEN 'post' ELSE 'user' END,
      coalesce(v_post_id, v_recipient_id),
      btrim(p_title),
      v_body,
      jsonb_strip_nulls(jsonb_build_object(
        'personal_notice_id', v_notice_id,
        'personal_notice_recipient_id', v_row_id,
        'receipt_code', v_code,
        'post_id', v_post_id
      ))
    )
    RETURNING id INTO v_notification_id;

    UPDATE public.personal_notice_recipients
    SET notification_id = v_notification_id
    WHERE id = v_row_id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'recipient_row_id', v_row_id,
      'recipient_id', v_recipient_id,
      'post_id', v_post_id,
      'receipt_code', v_code,
      'notification_id', v_notification_id
    ));
    v_index := v_index + 1;
  END LOOP;

  RETURN jsonb_build_object('notice_id', v_notice_id, 'recipients', v_results);
END;
$$;

COMMENT ON FUNCTION public.send_personal_notice(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) IS
  '個人あてのお知らせを送る(service_role 専用・管理者の確認は API 層と admin_users)。全員分を1トランザクションで作り、1件でも不備があれば何も送らない。';

-- =============================================================================
-- 6. 1人分を取り消す(相手の通知を消し、記録は「取り消し」として残す)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.retract_personal_notice_recipient(
  p_admin_user_id UUID,
  p_recipient_row_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.personal_notice_recipients%ROWTYPE;
BEGIN
  IF p_admin_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_users a WHERE a.user_id = p_admin_user_id
  ) THEN
    RAISE EXCEPTION 'PN_ADMIN_REQUIRED';
  END IF;

  SELECT * INTO v_row
  FROM public.personal_notice_recipients
  WHERE id = p_recipient_row_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PN_RECIPIENT_ROW_NOT_FOUND';
  END IF;

  -- 取り消し済みなら何もしない(冪等)
  IF v_row.retracted_at IS NOT NULL THEN
    RETURN jsonb_build_object('retracted', false, 'retracted_at', v_row.retracted_at);
  END IF;

  UPDATE public.personal_notice_recipients
  SET retracted_at = now(),
      retracted_by = p_admin_user_id
  WHERE id = v_row.id;

  -- 通知を消す(push_outbox は ON DELETE CASCADE。notification_id は SET NULL になる)
  IF v_row.notification_id IS NOT NULL THEN
    DELETE FROM public.notifications
    WHERE id = v_row.notification_id
      AND recipient_id = v_row.recipient_id
      AND type = 'admin_message';
  END IF;

  RETURN jsonb_build_object('retracted', true, 'retracted_at', now());
END;
$$;

COMMENT ON FUNCTION public.retract_personal_notice_recipient(UUID, UUID) IS
  '個人あてのお知らせを1人分取り消す(service_role 専用)。通知は消し、記録と受付番号は残す。取り消し済みなら何もしない。';

-- =============================================================================
-- 7. 開いた記録(詳細ページを開いたとき。本人の行だけ)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_personal_notice_opened(
  p_user_id UUID,
  p_notification_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_found BOOLEAN;
BEGIN
  UPDATE public.personal_notice_recipients
  SET opened_at = coalesce(opened_at, now())
  WHERE notification_id = p_notification_id
    AND recipient_id = p_user_id
    AND retracted_at IS NULL;
  v_found := FOUND;

  IF v_found THEN
    UPDATE public.notifications
    SET is_read = true,
        read_at = coalesce(read_at, now())
    WHERE id = p_notification_id
      AND recipient_id = p_user_id;
  END IF;

  RETURN v_found;
END;
$$;

COMMENT ON FUNCTION public.mark_personal_notice_opened(UUID, UUID) IS
  '個人あてのお知らせの詳細ページを開いた記録(service_role 専用・p_user_id は API がセッションから入れる)。opened_at は初回だけ。';

-- =============================================================================
-- 8. 権限(public スキーマの関数は anon / authenticated にも自動で EXECUTE が付くため閉じる)
-- =============================================================================

REVOKE ALL ON FUNCTION public.generate_personal_notice_code(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_personal_notice(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retract_personal_notice_recipient(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_personal_notice_opened(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_personal_notice_code(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.send_personal_notice(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.retract_personal_notice_recipient(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_personal_notice_opened(UUID, UUID) TO service_role;

-- =============================================================================
-- 9. カタログ検証
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND conname = 'notifications_type_check'
      AND pg_get_constraintdef(oid) LIKE '%admin_message%'
      AND pg_get_constraintdef(oid) LIKE '%usage_reward_earned%'
  ) THEN
    RAISE EXCEPTION 'notifications_type_check に admin_message が入っていない';
  END IF;

  IF public.push_category_for_notification_type('admin_message') IS NOT NULL THEN
    RAISE EXCEPTION 'admin_message はプッシュを積まない想定(push_category が NULL でない)';
  END IF;

  IF has_function_privilege('anon', 'public.send_personal_notice(uuid,text,text,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.send_personal_notice(uuid,text,text,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.retract_personal_notice_recipient(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.retract_personal_notice_recipient(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.mark_personal_notice_opened(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.mark_personal_notice_opened(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.generate_personal_notice_code(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.generate_personal_notice_code(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '個人あてのお知らせの RPC が利用者から実行できる';
  END IF;

  IF has_table_privilege('authenticated', 'public.personal_notice_recipients', 'SELECT')
     OR has_table_privilege('anon', 'public.personal_notice_recipients', 'SELECT')
     OR has_table_privilege('authenticated', 'public.personal_notices', 'SELECT')
     OR has_table_privilege('anon', 'public.personal_notices', 'SELECT') THEN
    RAISE EXCEPTION '個人あてのお知らせの表が利用者から読める';
  END IF;
END;
$$;

COMMIT;

-- =============================================================================
-- 戻し方(DOWN。本番での実行はユーザー承認のうえで)
-- =============================================================================
-- 先に admin_message の通知を消さないと CHECK を戻せない。
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.mark_personal_notice_opened(UUID, UUID);
--   DROP FUNCTION IF EXISTS public.retract_personal_notice_recipient(UUID, UUID);
--   DROP FUNCTION IF EXISTS public.send_personal_notice(UUID, TEXT, TEXT, TEXT, TEXT, JSONB);
--   DROP FUNCTION IF EXISTS public.generate_personal_notice_code(TEXT);
--   DROP TABLE IF EXISTS public.personal_notice_recipients;
--   DROP TABLE IF EXISTS public.personal_notices;
--   DELETE FROM public.notifications WHERE type = 'admin_message';
--   ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
--   ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (...21種類...);
--   COMMIT;
