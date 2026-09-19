import { cookies } from "next/headers";
import { getUser } from "@/lib/auth";
import { isUserStylesAvailable, isUserStylesPubliclyEnabled } from "@/lib/env";
import { UserStylesAvailabilityUpgrade } from "./UserStylesAvailabilityProvider";

/**
 * 段階公開中に「この人は運営か」をサーバーで判定し、クライアント側の
 * User ORIGINAL の可否を true へ昇格させる（admin ID リストはサーバー秘匿）。
 *
 * **必ず独立した Suspense の中に置くこと。** ここは認証を待つため、
 * ページ本体と同じ境界に置くと全ページが認証待ちになる。
 *
 * 🔥人気タブの `PopularPromptsAvailabilityLoader` と同じ構造にしてある。
 */
export async function UserStylesAvailabilityLoader() {
  // 一般公開後はクライアント側の初期値で確定している。
  // ここで認証を引くと、全ページに無駄な認証往復が増えるだけになる。
  if (isUserStylesPubliclyEnabled()) {
    return null;
  }

  // 未ログインなら運営ではありえない。cookie を見るだけで済ませ、
  // 大半の閲覧者（ログインしていない人）に認証往復を発生させない。
  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-"));
  if (!hasAuthCookie) {
    return null;
  }

  const user = await getUser();
  if (!isUserStylesAvailable(user?.id)) {
    return null;
  }

  return <UserStylesAvailabilityUpgrade />;
}
