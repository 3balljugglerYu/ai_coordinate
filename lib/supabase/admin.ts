import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * 管理者権限を持つSupabaseクライアント（Service Role Key使用）
 * RLSポリシーをバイパスしてデータベースにアクセス
 * 注意: このクライアントはサーバーサイドでのみ使用し、クライアントに公開しないこと
 */
export function createAdminClient() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase URL and Service Role Key are required. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment variables."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
