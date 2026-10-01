"use client";

import type { ReactNode } from "react";
import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";

/**
 * カタログ刷新後(公開前は運営だけ)は描かない。
 *
 * 刷新後の /style は本体(StylePageBody)が /styles へ移す。本体はストリーミングで
 * 届くので、それまで静的な見出しだけが一瞬出てしまう。移る前の画面を見せないために使う。
 */
export function HiddenWhenCatalogRevamp({ children }: { children: ReactNode }) {
  const isCatalogRevamp = useStylesCatalogRevamp();
  return isCatalogRevamp ? null : <>{children}</>;
}
