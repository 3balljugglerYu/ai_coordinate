-- preset_categories.output_aspect_ratio_mode を「自動(source) + 明示9比率」に拡張する。
--
-- 旧仕様: CHECK (output_aspect_ratio_mode IN ('source','square'))
-- 新仕様: 'source'(アップロード比率に合わせて自動選択) +
--         コーディネート/style の自動選択と同じ9段階の明示比率
--         ('9:16','4:5','3:4','2:3','1:1','3:2','4:3','5:4','16:9')
--
-- 既存の 'square' は '1:1' に移行する(出力は同じ正方形)。
-- 旧 CHECK 制約名に依存しないよう、列を参照する CHECK 制約を動的に全て drop してから貼り直す。

DO $$
DECLARE
  conname_var text;
BEGIN
  -- 1) 先に output_aspect_ratio_mode を参照する CHECK 制約を全て削除する。
  --    (旧 CHECK('source','square') が有効なままだと次の UPDATE で '1:1' が違反するため)
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

  -- 2) 既存 'square' → '1:1'(制約が無い状態で実行)
  UPDATE public.preset_categories
  SET output_aspect_ratio_mode = '1:1'
  WHERE output_aspect_ratio_mode = 'square';

  -- 3) 新しい CHECK を貼る
  ALTER TABLE public.preset_categories
    ADD CONSTRAINT preset_categories_output_aspect_ratio_mode_check
    CHECK (
      output_aspect_ratio_mode IN (
        'source', '9:16', '4:5', '3:4', '2:3', '1:1', '3:2', '4:3', '5:4', '16:9'
      )
    );
END $$;

COMMENT ON COLUMN public.preset_categories.output_aspect_ratio_mode IS
  'source = アップロード比率に合わせて自動選択(9段階の最近傍) / 9:16〜16:9 = 明示比率固定(コーディネート/styleの自動選択と同じ9段階)';
