import { cookies } from "next/headers";
import { getUser } from "@/lib/auth";
import {
  isNanoBanana21Available,
  isNanoBanana21PublicFlagEnabled,
} from "@/lib/env";
import { NanoBanana21AvailabilityUpgrade } from "./NanoBanana21AvailabilityProvider";

/**
 * 段階公開中に「この人は運営か」をサーバーで判定し、クライアントの
 * Nano Banana 2.1 の可否を true へ昇格させる。
 *
 * **必ず独立した Suspense の中に置くこと。** ここは認証を待つため、
 * ページ本体と同じ境界に置くと全ページが認証待ちになる。
 *
 * `GptImage25AvailabilityLoader` と同じ構造にしてある。
 */
export async function NanoBanana21AvailabilityLoader() {
  // 一般公開後はクライアント側の初期値で確定している。
  // ここで認証を引くと、全ページに無駄な認証往復が増えるだけになる。
  // ⚠️ ここでは日時を見ない(cookies() より前に時刻を読むと静的シェルの生成で落ちる)。
  // 公開の日時を過ぎたかは、下の isNanoBanana21Available とクライアント側が見る。
  if (isNanoBanana21PublicFlagEnabled()) {
    return null;
  }

  // 未ログインなら運営ではありえない。cookie を見るだけで済ませ、
  // 大半の閲覧者(ログインしていない人)に認証往復を発生させない。
  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-"));
  if (!hasAuthCookie) {
    return null;
  }

  const user = await getUser();
  if (!isNanoBanana21Available(user?.id)) {
    return null;
  }

  return <NanoBanana21AvailabilityUpgrade />;
}
