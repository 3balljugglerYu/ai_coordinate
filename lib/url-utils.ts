import { getSiteUrlForClient } from "@/lib/env";

export function getPostDetailPath(postId: string): string {
  return `/posts/${encodeURIComponent(postId)}`;
}

export function getPostDetailUrl(postId: string): string {
  const path = getPostDetailPath(postId);
  const baseUrl = getSiteUrlForClient();

  if (!baseUrl) {
    return path;
  }

  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

