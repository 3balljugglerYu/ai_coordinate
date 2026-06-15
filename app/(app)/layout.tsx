import { GenerationModeTabs } from "@/components/GenerationModeTabs";

/**
 * (app) ルート群の共通レイアウト。
 *
 * GenerationModeTabs(coordinate ⇄ style の切替タブ)をここに置くことで、
 * /coordinate ⇄ /style のナビゲーション中もタブのインスタンスが保持される
 * (レイアウトは loading.tsx で差し替わらない)。これにより:
 *  - 遷移中もタブが消えず、ピルが滑らかにスライドして即座に切り替わる
 *  - 差し替わるのは下のページ本文だけで、(app)/loading.tsx のスケルトンが
 *    タブの下に表示される(= 全画面が真っ白なローディングにならない)
 *
 * タブ自体は /coordinate・/style 以外のルートでは null を返して非表示になる。
 */
export default function AppGroupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <GenerationModeTabs />
      {children}
    </>
  );
}
