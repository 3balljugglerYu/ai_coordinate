import { getSiteUrlForClient } from "@/lib/public-env";
import { localizePublicPath, type Locale } from "@/i18n/config";

export function getPostDetailPath(postId: string): string {
  return `/posts/${encodeURIComponent(postId)}`;
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
