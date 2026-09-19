import { OriginalKindTabs } from "@/features/style-presets/components/OriginalKindTabs";

/**
 * スタイルカタログ（`/styles` ⇄ `/user-styles`）の共通レイアウト。
 *
 * ⭐ **トグルをここに置くことが目的のレイアウト。**
 * ページの中に置くと遷移のたびに remount され、ピルがスライドせず瞬間移動し、
 * タブ自体も一度消えてから出直す。layout に置けばインスタンスが保持され、
 *
 *  - ピルが滑らかにスライドする
 *  - 遷移中もタブが残り、差し替わるのは下の本文だけになる
 *    （`loading.tsx` のスケルトンがタブの下に出る）
 *
 * `(app)/layout.tsx` の `GenerationModeTabs`（/style・/free・/coordinate）と
 * まったく同じ考え方。あちらのコメントが理由の正本。
 *
 * ⭐ **ここで認証を引かないこと。** 引くとこのレイアウト配下が丸ごとリクエスト依存に
 * なり、`/styles` の静的シェルと初期 HTML の JSON-LD という前提が崩れる。
 * 段階公開中に運営へだけトグルを出す判定は、`UserStylesAvailabilityProvider`
 * （LocaleShell に置いた context）が後から昇格させる形で行う。
 *
 * どのタブを選択中にするか・そもそも出すかは、トグル側が `usePathname()` で決める
 * （`/styles/[slug]` では出さない）。
 */
export default function StylesCatalogLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <OriginalKindTabs />
      {children}
    </>
  );
}
