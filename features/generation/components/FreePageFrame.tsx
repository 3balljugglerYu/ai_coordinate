"use client";

import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";

/**
 * Free Style（/free）の背景と余白の入れ物。
 *
 * ⭐ 一般の利用者には今と同じ HTML を出す（背景 bg-gray-50・上余白 pt-6 / md:pt-8）。
 *
 * カタログ刷新（公開前は運営だけ）では /free は「カタログをつくる」のタブになるので、
 * /styles・/user-styles（`StylesCatalogMain`）と同じく背景を白にし、上の余白をなくす。
 * タブの白い帯とページの間に境目を出さない（2026-09-29 ユーザー指示）。
 *
 * ページ本体はサーバーコンポーネントのまま、中身は children として受け取る。
 */
export function FreePageFrame({ children }: { children: React.ReactNode }) {
  const isCatalogRevamp = useStylesCatalogRevamp();

  if (!isCatalogRevamp) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="pt-6 md:pt-8 pb-8 px-4">{children}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="pt-0 pb-8 px-4">{children}</div>
    </div>
  );
}
