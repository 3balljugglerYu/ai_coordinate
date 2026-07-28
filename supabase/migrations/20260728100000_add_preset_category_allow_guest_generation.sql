-- preset_categories に「ゲスト(未ログイン)でも生成できるか」のフラグを追加する。
--
-- 背景:
--   これまでゲスト生成の可否は `category.key === "coordinate"` のハードコード判定で、
--   サーバー(app/(app)/style/generate/handler.ts)とクライアント3箇所に散在していた。
--   カテゴリが増えるたびにコード修正とデプロイが必要で、同期漏れのリスクもあったため、
--   admin から切り替えられるフラグに移行する。
--
-- 安全性:
--   既定は false(ゲスト不可)とし、明示的に許可したカテゴリだけを開放する。
--   移行時に現行挙動そのままの `coordinate` を true にするため、既存ユーザーの体験は変わらない。
--   あわせて要望により `coordinate_2`(コーディネート2.0) も開放する。
ALTER TABLE preset_categories
  ADD COLUMN IF NOT EXISTS allow_guest_generation BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN preset_categories.allow_guest_generation IS
  'true のとき、未ログインユーザーでもこのカテゴリのプリセットで生成できる(ゲスト1日1回の無料枠)。既定 false。';

-- 現行挙動の維持: coordinate は従来どおりゲスト可。
UPDATE preset_categories
  SET allow_guest_generation = true
  WHERE key = 'coordinate';

-- 新規開放: コーディネート2.0(public) もゲスト可にする。
-- 注意: admin_only の 'coordinate2' とは別カテゴリのため、キーを取り違えないこと。
UPDATE preset_categories
  SET allow_guest_generation = true
  WHERE key = 'coordinate_2';
