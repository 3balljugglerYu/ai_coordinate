-- ===============================================
-- prompt_overrides.content の最大文字数を 10000 → 100000 に緩和
-- ===============================================
-- 背景:
--   admin の生成 prompt エディタ (/admin/generation-prompts/[key]) で、
--   creator_looks.meta_extractor の meta-prompt が 10000 字上限に
--   達して保存できなくなったため、上限を 100000 字に引き上げる。
--
-- 設計判断:
--   - 前回の緩和 (20260603101100, 4000 -> 10000) と同じ方針。
--     文字数上限は「暴走入力 (監査ログ肥大・PII 肥大) を防ぐ安全ガード」であり、
--     特定 key 専用ではなく全 prompt_key 共通のグローバル上限のまま緩和する。
--   - API (route.ts) / client (AdminPromptEditClient) / DB の 3 層で同じ上限を持つ
--     defense in depth 設計を維持 (各層の MAX_CONTENT_LENGTH も 100000 に更新済み)。
--   - 上限の緩和のみで、既存 row は全て length<=10000 のため制約違反は発生しない。

BEGIN;

ALTER TABLE public.prompt_overrides
  DROP CONSTRAINT IF EXISTS prompt_overrides_content_check;

ALTER TABLE public.prompt_overrides
  ADD CONSTRAINT prompt_overrides_content_check
  CHECK (length(content) <= 100000 AND length(trim(content)) > 0);

COMMENT ON COLUMN public.prompt_overrides.content IS
  '{{varname}} プレースホルダー記法でテンプレ変数を含む prompt テキスト。max 100000 文字';

COMMIT;

-- ===============================================
-- DOWN: 上限を 10000 に戻す (= length>10000 の row が無い前提)
-- BEGIN;
-- ALTER TABLE public.prompt_overrides
--   DROP CONSTRAINT IF EXISTS prompt_overrides_content_check;
-- ALTER TABLE public.prompt_overrides
--   ADD CONSTRAINT prompt_overrides_content_check
--   CHECK (length(content) <= 10000 AND length(trim(content)) > 0);
-- COMMIT;
-- ===============================================
