"use client";

import { useUserStylesAvailable } from "@/features/user-styles/components/UserStylesAvailabilityProvider";

/**
 * スタイルカタログの刷新を出してよいか。
 *
 * 刷新の中身:
 *  - `/styles` の見出しを「Persta.AI ORIGINAL」と新しい説明文にする
 *  - 「すべて」を「✨すべて（新着順）」にし、「✨新着」チップをなくす
 *    （`/styles` と `/style` の探索シートの両方）
 *  - `/styles`・`/user-styles` でスクロールに合わせてヘッダーを隠し、チップ列を上部に固定する
 *  - カタログを3つのタブ（Persta のカタログ / みんなのカタログ / カタログをつくる = `/free`）
 *    にし、ナビの生成の入口を「カタログ」1つにまとめる
 *    （docs/planning/catalog-three-tabs-implementation-plan.md）
 *
 * ⭐ **User ORIGINAL と同じ段階公開に乗せる。** 見出しの「Persta.AI ORIGINAL」は
 * User ORIGINAL と対になる名前で、片方だけ公開されると意味が通らない。
 * 公開前は運営だけ true、`NEXT_PUBLIC_USER_STYLES_ENABLED` を立てれば全員 true になる。
 * 切り離したくなったら、この関数の中身だけ差し替えればよい。
 */
export function useStylesCatalogRevamp(): boolean {
  return useUserStylesAvailable();
}
