import { toSafeRedirectPath } from "@/lib/security/safe-redirect-path";

/**
 * 運営が書くリンク(ホームのバナー・ポップアップのバナー・お知らせ)の行き先を、
 * 「https:// の URL」か「このサイトの中のパス」だけにする。合わなければ null。
 *
 * このサイトの中のパスは、ログインのあとの移る先と同じ決まり(toSafeRedirectPath)で確かめる。
 * "/" で始まっていても、よそへ移るものがあるため("/\\evil.com" はブラウザが "//evil.com" と読む・
 * タブや改行はブラウザが読み飛ばす・"/..//evil.com" は読み直すと "//evil.com" に縮む)。
 * 返すのは、読み直したあとのパス。
 */
export function toSafeLinkUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (url === "") return null;
  if (url.startsWith("https://")) {
    // 空白・制御文字・"\\" の入った URL は、ブラウザが読み替えるので断る
    if (/[\u0000- \u007f\\]/.test(url)) return null;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname !== "" ? url : null;
    } catch {
      return null;
    }
  }
  const path = toSafeRedirectPath(url, "");
  return path === "" ? null : path;
}
