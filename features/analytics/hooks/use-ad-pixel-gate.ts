"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { isAdPixelExcludedPath, isAdPixelHost } from "@/features/analytics/lib/ad-pixels";

const subscribeNothing = () => () => {};

/**
 * 広告の Pixel(X・Meta)を読み込んでよいかの、共通の門。
 * - 本番のサイト(www.persta.ai)だけ。サーバーでは false(本番かどうかは、ブラウザの URL でしか分からない)。
 * - 管理画面から開いたタブでは、そのあとほかのページへ移っても読み込まない(最初に開いたページで決める)。
 *   X は読み込んだときの1回しか送らないので、最初のページが管理画面だと、その URL で送ってしまう。
 *   Meta は移るたびに送るが、管理画面から始めるのは運営なので、運営の操作を広告の数に入れないために同じにする。
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
