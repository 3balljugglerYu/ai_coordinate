import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/**
 * ブラウザ用Supabaseクライアント
 * NEXT_PUBLIC_*環境変数を使用
 */
export function createClient() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase URL and Anon Key are required. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment variables."
    );
  }

  return createBrowserClient(url, anonKey);
}

