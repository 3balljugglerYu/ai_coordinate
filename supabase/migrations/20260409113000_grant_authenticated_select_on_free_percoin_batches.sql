-- free_percoin_batches を参照する SECURITY INVOKER RPC が
-- authenticated ロールで 403 にならないよう、SELECT を付与する
GRANT SELECT ON TABLE public.free_percoin_batches TO authenticated;
