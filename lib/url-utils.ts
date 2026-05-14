import { getSiteUrlForClient } from "@/lib/public-env";
import { localizePublicPath, type Locale } from "@/i18n/config";

export function getPostDetailPath(postId: string): string {
  return `/posts/${encodeURIComponent(postId)}`;
}

/**
 * 投稿詳細へのロケール付きパス（例: `/ja/posts/xxx`）を返す。
 *
 * `/posts/[id]` は公開ルートのため proxy（middleware）でロケール付き URL に
 * リダイレクトされる。`<Link>` には最初からロケール付きパスを渡すことで、
 * 遷移時の 307 リダイレクト 1 ホップ分のラウンドトリップを省く。
 */
export function getPostDetailLocalizedPath(
  postId: string,
  locale: Locale
): string {
  return localizePublicPath(getPostDetailPath(postId), locale);
}

export function getPostDetailUrl(postId: string, locale?: Locale): string {
  const path = getPostDetailPath(postId);
  const localizedPath = locale ? localizePublicPath(path, locale) : path;
  const baseUrl = getSiteUrlForClient();

  if (!baseUrl) {
    return localizedPath;
  }

  return `${baseUrl.replace(/\/+$/, "")}${localizedPath}`;
}
