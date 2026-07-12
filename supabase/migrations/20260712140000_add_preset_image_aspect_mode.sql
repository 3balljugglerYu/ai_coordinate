-- 出力比率モードに 'preset_image'(登録画像=preset サムネに合わせる) を許可する。
-- PR #421 で追加したモードだが CHECK 制約の更新が漏れており、admin 保存が
-- 制約違反で 500 になっていた不具合の修正。既存 CHECK を張り替える。
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

  -- 新しい CHECK: source + preset_image + 明示9比率。
  ALTER TABLE public.preset_categories
    ADD CONSTRAINT preset_categories_output_aspect_ratio_mode_check
    CHECK (
      output_aspect_ratio_mode IN (
        'source', 'preset_image',
        '9:16', '4:5', '3:4', '2:3', '1:1', '3:2', '4:3', '5:4', '16:9'
      )
    );
END $$;

COMMENT ON COLUMN public.preset_categories.output_aspect_ratio_mode IS
  'source = アップロード比率に合わせて自動選択(9段階の最近傍) / preset_image = preset のサムネ(登録画像)比率に合わせる / 9:16〜16:9 = 明示比率固定';
