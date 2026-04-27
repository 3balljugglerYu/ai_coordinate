"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * 現在のクライアント側 URL（pathname + search）を組み立てて返す。
 * `AuthModal` の `redirectTo` に渡すため、検索パラメータを含む完全な URL を保つ。
 *
 * 例:
 *  - /style?style=foo → "/style?style=foo"
 *  - /coordinate     → "/coordinate"
 *
 * UCL-018 / 計画書 ADR の Minor #9 を参照。
 *
 * SSR では window が無いため、サーバーで呼ばれた場合は pathname のみを返す。
 */
export function useCurrentUrlForRedirect(): string {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return useMemo(() => {
    const search = searchParams?.toString() ?? "";
    if (!pathname) {
      return "/";
    }
    return search.length > 0 ? `${pathname}?${search}` : pathname;
  }, [pathname, searchParams]);
}

/**
 * フック外で同等の組み立てを行う純粋関数。
 * テストや非 React 環境からも使えるようにエクスポート。
 */
export function buildCurrentUrl(
  pathname: string | null,
  searchParams: URLSearchParams | null
): string {
  if (!pathname) {
    return "/";
  }
  const search = searchParams?.toString() ?? "";
  return search.length > 0 ? `${pathname}?${search}` : pathname;
}
