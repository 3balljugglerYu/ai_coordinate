import "server-only";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";

/**
 * 管理画面のページの先頭で呼ぶ。管理者でなければ / へ戻す。
 *
 * ⚠️ app/(app)/admin/layout.tsx でも同じ確認をしているが、それだけでは足りない。
 * Next.js はレイアウトとページを同時に描くので、レイアウトが redirect する前に、
 * ページが読み込んだデータが応答(RSC の中身)に流れ出る。
 * 2026-10-26、未ログインで /admin を開くと、売上・利用者のニックネームなどが
 * 応答に含まれていた。データを読むページは、読む前に必ずこれを呼ぶこと。
 */
export async function ensureAdminPage() {
  const user = await getUser();
  const adminUserIds = getAdminUserIds();
  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }
  return user;
}
