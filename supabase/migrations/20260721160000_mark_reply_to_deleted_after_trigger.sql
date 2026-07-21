-- mark_reply_to_deleted を AFTER DELETE 化(DB回帰テスト T14 で発見した cascade 問題の恒久対応)。
--
-- 問題(20260721150000 の行単位スキップでも残存):
-- BEFORE DELETE トリガーが引用元へフラグを立てた「後」に、同一コマンド(cascade)が
-- その引用元行自体を削除しにいく順序だと、DELETE 側が SQLSTATE 27000
-- (tuple to be deleted was already modified) を出して cascade 全体が失敗する。
-- 例: 自分の返信に自分で引用リプライしたユーザーの退会(user_id cascade が
-- 引用先と引用元を同一コマンドで削除)。
--
-- 対応: AFTER DELETE の行トリガーに変更する。
--  - 実行時点で削除対象行はすべて削除済みのため、「これから削除される行」への
--    書き込みが構造的に発生しない(27000 の根本原因を除去)
--  - 生き残った引用元だけが UPDATE され、フラグが立つ
--  - トリガー名を "0_..." とし、内部 RI トリガー(RI_ConstraintTrigger_*)より
--    先に発火させる(AFTER ROW トリガーは名前順で発火)。これにより
--    FK ON DELETE SET NULL が reply_to_comment_id を NULL 化する前に
--    参照(= OLD.id)でマッチできる。RI はその後、同一コマンド内で更新済みの
--    行にも問題なく SET NULL を適用する(単発削除の回帰テスト T10 で実証済み)
DROP TRIGGER IF EXISTS trigger_mark_reply_to_deleted ON public.comments;

CREATE TRIGGER "0_mark_reply_to_deleted"
AFTER DELETE
ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.mark_reply_to_deleted();
