import { GeneralUserGenerationModeTabs } from "@/components/GeneralUserGenerationModeTabs";

/**
 * (app) ルート群の共通レイアウト。
 *
 * GenerationModeTabs(style ⇄ free の切替タブ)をここに置くことで、
 * /style ⇄ /free のナビゲーション中もタブのインスタンスが保持される
 * (レイアウトは loading.tsx で差し替わらない)。これにより:
 *  - 遷移中もタブが消えず、ピルが滑らかにスライドして即座に切り替わる
 *  - 差し替わるのは下のページ本文だけで、(app)/loading.tsx のスケルトンが
 *    タブの下に表示される(= 全画面が真っ白なローディングにならない)
 *
 * タブ自体は /style・/free 以外のルートでは null を返して非表示になる。
 *
 * ⭐ ここから出すのは一般の利用者(カタログ刷新の前)の分だけ。刷新後(公開前は運営だけ)の
 * 人には app/[locale]/layout.tsx の TopTabsSlot がタブを出すので、
 * GeneralUserGenerationModeTabs はその人には何も出さない(二重にしない)。
 * 一般公開のあとは、この置き場所ごと消す
 * (docs/planning/catalog-three-tabs-implementation-plan.md Phase 6)。
 */
export default function AppGroupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <GeneralUserGenerationModeTabs />
      {children}
    </>
  );
}
