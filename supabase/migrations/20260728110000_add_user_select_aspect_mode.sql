-- 出力比率モードに 'user_select'(ユーザーが決める) を追加する。
--
-- 「ユーザー画面に比率セレクタを出すか」は output_aspect_ratio_mode = 'user_select' から
-- 一意に導出できるため、専用フラグ列は持たない(二重管理による不整合を防ぐ)。
--
-- 目的:
--   admin でカテゴリの出力比率を「ユーザーが決める」にすると、One-Tap Style の
--   生成画面に /free と同様の比率セレクタが出て、ユーザー自身が比率を選べるようになる。
--
-- 安全性:
--   'user_select' は「実際の比率はリクエスト時にユーザー入力から決まる」ことを表す
--   メタなモードで、比率ラベルそのものではない。Worker 側では
--   resolveOutputAspectRatio() が 'user_select' を 'source'(入力比率にスナップ)へ
--   フォールバックするため、ユーザー選択が無い/壊れている場合も従来どおり動作する。
DO $$
DECLARE
  conname_var text;
BEGIN
  -- output_aspect_ratio_mode を参照する既存 CHECK を全て削除。
  FOR conname_var IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND rel.relname = 'preset_categories'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%output_aspect_ratio_mode%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.preset_categories DROP CONSTRAINT %I',
      conname_var
    );
  END LOOP;

  -- 新しい CHECK: source + preset_image + user_select + 明示9比率。
  ALTER TABLE public.preset_categories
    ADD CONSTRAINT preset_categories_output_aspect_ratio_mode_check
    CHECK (
      output_aspect_ratio_mode IN (
        'source', 'preset_image', 'user_select',
        '9:16', '4:5', '3:4', '2:3', '1:1', '3:2', '4:3', '5:4', '16:9'
      )
    );
END $$;

COMMENT ON COLUMN public.preset_categories.output_aspect_ratio_mode IS
  'source = アップロード比率に合わせて自動選択(9段階の最近傍) / preset_image = preset のサムネ(登録画像)比率に合わせる / user_select = ユーザーが生成画面で選ぶ / 9:16〜16:9 = 明示比率固定';
