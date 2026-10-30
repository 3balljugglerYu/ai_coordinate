/**
 * アイコンの URL から、消してよい古いファイルの置き場所(バケットの中のパス)を取り出す。
 *
 * 消してよいのは、その人のフォルダ(avatars/<本人の ID>/)の中のファイルだけ。
 * profiles.avatar_url は前は利用者が自分で書き換えられたので、ほかの人のファイルや
 * フォルダの外を指していることがある(..・ほかの人の ID・別のバケット)。そのときは null を返し、消さない。
 * Google などの外の URL も null(消す物が無い)。storageOrigin を渡したら、そのサイト(うちの Supabase)の
 * URL だけを見る。
 */
export function ownAvatarStoragePath(
  avatarUrl: string | null | undefined,
  userId: string,
  bucket: string,
  storageOrigin?: string,
): string | null {
  if (!avatarUrl || !avatarUrl.includes("/storage/v1/object/")) {
    return null;
  }

  let path: string;
  try {
    const url = new URL(avatarUrl);
    if (storageOrigin && url.origin !== new URL(storageOrigin).origin) {
      return null;
    }
    const segments = url.pathname.split(`/${bucket}/`);
    if (segments.length !== 2) {
      return null;
    }
    path = decodeURIComponent(segments[1]);
  } catch {
    return null;
  }

  const parts = path.split("/");
  if (parts.length !== 3 || parts[0] !== "avatars" || parts[1] !== userId) {
    return null;
  }
  if (!parts[2] || parts[2] === "." || parts[2] === "..") {
    return null;
  }
  return path;
}
