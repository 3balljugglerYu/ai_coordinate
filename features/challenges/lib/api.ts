import { createClient } from "@/lib/supabase/client";

/**
 * ユーザーの連続ログイン日数を取得
 */
export async function getStreakDays(): Promise<number> {
  const supabase = createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data, error } = await supabase
    .from("profiles")
    .select("streak_days")
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("Error fetching streak days:", error);
    return 0;
  }

  return data?.streak_days || 0;
}
