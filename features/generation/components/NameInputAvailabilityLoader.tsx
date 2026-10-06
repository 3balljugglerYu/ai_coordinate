import { cookies } from "next/headers";
import { getUser } from "@/lib/auth";
import { isNameInputAvailable, isNameInputPubliclyEnabled } from "@/lib/env";
import { NameInputAvailabilityUpgrade } from "./NameInputAvailabilityProvider";

/**
 * 段階公開中に「この人は運営か」をサーバーで判定し、クライアント側の名前の欄の可否を
 * true へ昇格させる(admin ID リストはサーバー秘匿)。
 *
 * **必ず独立した Suspense の中に置くこと。** ここは認証を待つため、ページ本体と同じ
 * 境界に置くと全ページが認証待ちになる。`UserStylesAvailabilityLoader` と同じ構造。
 */
export async function NameInputAvailabilityLoader() {
  // 一般公開後はクライアント側の初期値で確定している(無駄な認証往復を増やさない)
  if (isNameInputPubliclyEnabled()) {
    return null;
  }
  // 未ログインなら運営ではありえない。cookie を見るだけで済ませる
  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore.getAll().some((cookie) => cookie.name.startsWith("sb-"));
  if (!hasAuthCookie) {
    return null;
  }
  const user = await getUser();
  if (!isNameInputAvailable(user?.id)) {
    return null;
  }
  return <NameInputAvailabilityUpgrade />;
}
