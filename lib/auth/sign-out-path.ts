/**
 * サーバー経由のログアウトの受け皿(app/api/auth/signout/route.ts)のパス。
 *
 * ブラウザ側(features/auth/lib/auth-client.ts の signOut)と proxy.ts が同じ値を使う。
 * proxy はこの経路(完全一致)だけ Supabase のセッションに触らないので、
 * 値がずれると素通しが効かなくなり、トークン更新の Cookie がログアウトを打ち消しうる。
 */
export const SIGN_OUT_API_PATH = "/api/auth/signout";
