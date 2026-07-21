-- mark_reply_to_deleted の cascade 削除対応(DB回帰テスト T12 で発見)。
--
-- 問題: 画像削除やアカウント削除の cascade など「単一コマンドが引用元と引用先の
-- 両方を削除する」ケースで、BEFORE DELETE トリガーの一括 UPDATE が
-- 「同一コマンドで既に処理された行」に触れて SQLSTATE 27000
-- (tuple to be updated was already modified) になり、削除自体が失敗していた。
-- 特に「自分の返信に自分で引用リプライしたユーザーの退会」が失敗しうる。
--
-- 修正: 行単位の UPDATE に分割し、27000 のみ捕捉してスキップする。
-- スキップされる行は同一コマンドで削除中の行であり、いずれにせよ消えるため
-- フラグを立てる必要がない(意味的にも正しい)。生き残る参照元は従来どおり
-- フラグが立ち、その後の FK ON DELETE SET NULL で参照が NULL 化される。
CREATE OR REPLACE FUNCTION public.mark_reply_to_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM set_config('app.comment_quote_internal', '1', true);

  FOR v_id IN
    SELECT id
    FROM public.comments
    WHERE reply_to_comment_id = OLD.id
      AND reply_to_deleted = FALSE
  LOOP
    BEGIN
      UPDATE public.comments
      SET reply_to_deleted = TRUE
      WHERE id = v_id;
    EXCEPTION
      WHEN SQLSTATE '27000' THEN
        -- 同一コマンド(cascade)で削除中の行。フラグ不要のためスキップする。
        NULL;
    END;
  END LOOP;

  RETURN OLD;
END;
$$;
