import { OriginalKindTabs } from "@/features/style-presets/components/OriginalKindTabs";
import { isUserStylesPubliclyEnabled } from "@/lib/env";

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
 * ⭐ **認証を引かないこと。** `isUserStylesPubliclyEnabled()` は環境変数を見るだけの
 * 純粋な判定で、リクエストに依存しない。`isUserStylesAvailable`（運営を含む方）を
 * 呼ぶとこのレイアウト配下が丸ごとリクエスト依存になり、`/styles` の静的シェルと
 * 初期 HTML の JSON-LD という前提が崩れる。
 *
 * どのタブを選択中にするか・そもそも出すかは、トグル側が `usePathname()` で決める
 * （`/styles/[slug]` では出さない）。
 */
export default function StylesCatalogLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <OriginalKindTabs publiclyEnabled={isUserStylesPubliclyEnabled()} />
      {children}
    </>
  );
}
