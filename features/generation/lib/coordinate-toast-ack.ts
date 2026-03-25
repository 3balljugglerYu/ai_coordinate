import { createClient as createBrowserClient } from "@/lib/supabase/client";

/**
 * 生成完了トーストの重複（別端末・別ブラウザ）を防ぐためのサーバー側ウォーターマーク。
 */
export async function fetchCoordinateToastAckAt(
  userId: string
): Promise<string | null> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("last_coordinate_toast_ack_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`プロフィールの取得に失敗しました: ${error.message}`);
  }

  const raw = data?.last_coordinate_toast_ack_at;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export async function setCoordinateToastAckAt(
  userId: string,
  isoTimestamp: string
): Promise<void> {
  const supabase = createBrowserClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      last_coordinate_toast_ack_at: isoTimestamp,
      updated_at: now,
    })
    .eq("user_id", userId)
    .select("user_id");

  if (error) {
    throw new Error(`トースト同期の更新に失敗しました: ${error.message}`);
  }

  if (!data?.length) {
    throw new Error(
      "トースト同期の更新に失敗しました: プロフィールが更新できませんでした（行が0件）"
    );
  }
}
