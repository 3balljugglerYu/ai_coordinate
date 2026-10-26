import { toSafeRedirectPath } from "@/lib/security/safe-redirect-path";

/**
 * 運営が書くリンク(ホームのバナー・ポップアップのバナー・お知らせ・プッシュの全体配信)の行き先を、
 * 「https:// の URL」か「このサイトの中のパス」だけにする。合わなければ null、合えば前後の空白を外した値。
 *
 * このサイトの中のパスは、ログインのあとの移る先と同じ決まり(toSafeRedirectPath)で確かめる。
 * "/" で始まっていても、よそへ移るものがあるため("/\\evil.com" はブラウザが "//evil.com" と読む・
 * タブや改行はブラウザが読み飛ばす・"/..//evil.com" は読み直すと "//evil.com" に縮む)。
 * ⭐ 確かめるのは読み直したあとの値だが、返すのは書いた値のまま(日本語を %E3… に変えると、
 *    GA4 の home_banner_click の link_url の形が変わり、バナーごとの数が分かれてしまう)。
 */
export function toSafeLinkUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (url === "") return null;
  if (url.startsWith("https://")) {
    // よそのサイトへの https のリンクは、もともと許している。URL として読めることだけ確かめる
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname !== "" ? url : null;
    } catch {
      return null;
    }
  }
  return toSafeRedirectPath(url, "") === "" ? null : url;
}
