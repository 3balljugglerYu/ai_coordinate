"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { isAdPixelExcludedPath, isAdPixelHost } from "@/features/analytics/lib/ad-pixels";

const subscribeNothing = () => () => {};

/**
 * 広告の Pixel(X・Meta)を読み込んでよいかの、共通の門。
 * - 本番のサイト(www.persta.ai)だけ。サーバーでは false(本番かどうかは、ブラウザの URL でしか分からない)。
 * - 管理画面から開いたときは、そのあとほかのページへ移っても読み込まない
 *   (「ページを読み込んだときだけ送る」を守るため・最初に開いたページで決める)。
 */
export function useAdPixelGate(): { enabled: boolean; pathname: string } {
  const pathname = usePathname() ?? "/";
  const isProductionHost = useSyncExternalStore(
    subscribeNothing,
    () => isAdPixelHost(window.location.hostname),
    () => false,
  );
  const [openedOnExcludedPath] = useState(() => isAdPixelExcludedPath(pathname));
  return { enabled: isProductionHost && !openedOnExcludedPath, pathname };
}
