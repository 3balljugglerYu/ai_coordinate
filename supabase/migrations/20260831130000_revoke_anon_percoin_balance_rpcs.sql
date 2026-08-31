BEGIN;

/*
  残高を扱う RPC 3本から anon の EXECUTE を剥がす（#583 の続き）。

  ## なぜ残っていたか

  #583 では「セッションクライアント経由で呼ぶ関数」に anon を残していた。
  しかしこの3本は**ログインが前提の機能**であり、未ログインから呼ぶ必要が無い。
  そして本文のガードが未ログインを弾けない作りだったため、開いたままだと実害が出る。

  ## 何ができてしまうか

  - apply_percoin_transaction
      purchase 系: `IF auth.uid() IS NOT NULL THEN RAISE ... service role`
      consumption: `IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN RAISE`
      どちらも **auth.uid() が NULL の未ログインは素通りする**。
      任意ユーザーの有償残高を増やせ、任意ユーザーの残高を消費させられる。
      内部で deduct_free_percoins を呼ぶが、#583 でそちらを閉じても
      SECURITY DEFINER の内部呼び出しは所有者権限で動くため意味が無い
      （入口であるこの関数を閉じる必要がある）。
      実測: 未ログインで本体まで到達し、金額チェックでのみ停止することを確認した。

  - get_expiring_this_month_count / get_free_percoin_batches_expiring
      `IF auth.uid() IS NOT NULL AND p_user_id != auth.uid() THEN RETURN`
      未ログインは1行目を素通りし、続く COALESCE(p_user_id, auth.uid()) で
      **指定した他人の失効予定残高を読める**。

  ⭐ 3本とも、ログイン中のユーザーに対しては条件式が正しく機能する
  （auth.uid() が値を持つため）。壊れているのは未ログインの場合だけなので、
  anon を剥がせば実害は消える。本文の条件式そのものの是正は別途。

  ## 残す権限

  authenticated: 消費と自分の残高表示はセッションクライアント経由で呼ぶ
  service_role : purchase 系は Stripe の Webhook がサーバーから呼ぶ

  なお increment_view_count は本人確認が無く同種だが、
  **未ログインの閲覧をカウントする仕様**のため対象外とした。
  影響は表示上の閲覧数のみで、ペルコインも原価も動かない。
*/

REVOKE ALL ON FUNCTION public.apply_percoin_transaction(p_user_id uuid, p_amount integer, p_mode text, p_metadata jsonb, p_stripe_payment_intent_id text, p_related_generation_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_percoin_transaction(p_user_id uuid, p_amount integer, p_mode text, p_metadata jsonb, p_stripe_payment_intent_id text, p_related_generation_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_percoin_transaction(p_user_id uuid, p_amount integer, p_mode text, p_metadata jsonb, p_stripe_payment_intent_id text, p_related_generation_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_percoin_transaction(p_user_id uuid, p_amount integer, p_mode text, p_metadata jsonb, p_stripe_payment_intent_id text, p_related_generation_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_expiring_this_month_count(p_user_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_expiring_this_month_count(p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_expiring_this_month_count(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_expiring_this_month_count(p_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_free_percoin_batches_expiring(p_user_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_free_percoin_batches_expiring(p_user_id uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_free_percoin_batches_expiring(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_free_percoin_batches_expiring(p_user_id uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
