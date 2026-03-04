-- grant_admin_bonus は server-side API 経由のみで実行する
-- PUBLIC / anon / authenticated からの直接実行を禁止し、
-- service_role のみ実行可能にする

REVOKE EXECUTE ON FUNCTION public.grant_admin_bonus(UUID, INTEGER, TEXT, UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_admin_bonus(UUID, INTEGER, TEXT, UUID, BOOLEAN, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_admin_bonus(UUID, INTEGER, TEXT, UUID, BOOLEAN, TEXT) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.grant_admin_bonus(UUID, INTEGER, TEXT, UUID, BOOLEAN, TEXT) TO service_role;
