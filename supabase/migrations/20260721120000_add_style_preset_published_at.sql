-- /style プリセットの「公開日時」。
--
-- 新着判定(ホームの新着枠・NEWバッジ・探索シートの✨新着)は従来 created_at
-- (レコード作成=下書き保存時点)を使っていたが、長く下書きのままだった
-- プリセットを公開しても新着にならない問題があった。公開日時を別カラムで
-- 記録し、アプリ側は published_at ?? created_at で新着を判定する。
ALTER TABLE public.style_presets
  ADD COLUMN published_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.style_presets.published_at IS
  '最後に draft等→published へ遷移した日時(トリガーで自動記録)。新着判定に使う。NULL は未公開または移行前データ';

-- 既存の公開済みプリセットは created_at で埋める(従来の新着判定と同じ挙動を維持)。
UPDATE public.style_presets
SET published_at = created_at
WHERE status = 'published';

-- status が published へ「遷移」するたびに published_at を更新する(案B)。
--  - INSERT で最初から published の場合も記録する
--  - 公開中の編集(published のまま UPDATE)では更新しない
--  - 公開→下書き→再公開では最新の再公開日時に更新される(新着に返り咲く)
CREATE OR REPLACE FUNCTION public.set_style_preset_published_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
      NEW.published_at = now();
    END IF;
  ELSIF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    NEW.published_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_style_preset_published_at
  BEFORE INSERT OR UPDATE ON public.style_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_style_preset_published_at();
