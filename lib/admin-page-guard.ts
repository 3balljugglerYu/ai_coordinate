import "server-only";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { isFullAdmin } from "@/lib/env";

/**
 * 管理画面のレイアウトとページの先頭で呼ぶ。管理者でなければ / へ戻す。
 *
 * ⚠️ レイアウトだけで確かめても足りない。Next.js はレイアウトとページを同時に描くので、
 * レイアウトが redirect する前に、ページが読み込んだデータが応答(RSC の中身)に流れ出る。
 * 2026-10-26、未ログインで /admin を開くと、売上・利用者のニックネームなどが
 * 応答に含まれていた。データを読むページは、読む前に必ずこれを呼ぶこと。
 *
 * proxy.ts でも /admin を先に止めている(1つ目の関門)。ただし proxy は cookie を
 * 署名の確認なしに読む(getSession)ので、ここで getUser により確かめ直す。
 */
export async function ensureAdminPage() {
  const user = await getUser();
  if (!isFullAdmin(user?.id)) {
    redirect("/");
  }
  return user;
}
