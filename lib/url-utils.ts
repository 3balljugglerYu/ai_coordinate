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

/**
 * フィードカード(PostCard)のタップ先パスを返す。
 * 完走フィード投稿も通常投稿と同じ詳細ページへ遷移する(詳細でいいね・
 * コメントができ、没入シェアページへは詳細内の CTA から1タップ)。
 */
export function getPostCardHref(
  post: {
    id?: string | null;
    completion_id?: string | null;
    completion_view_mode?: "mount" | "book" | null;
  },
  locale: Locale
): string {
  return getPostDetailLocalizedPath(post.id ?? "", locale);
}

/**
 * 完走フィード投稿の没入シェアページ(`/m/<token>`、book は `/m/<token>/book`)の
 * パスを返す。詳細ページの CTA「めくって見る／カードを見る」の遷移先。
 */
export function getCompletionImmersivePath(
  completionId: string,
  viewMode: "mount" | "book" | null | undefined
): string {
  return viewMode === "book"
    ? `/m/${completionId}/book`
    : `/m/${completionId}`;
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
