/**
 * スタイルカタログ（`/styles`・`/user-styles`）の共通レイアウト。
 *
 * カタログのタブ（OriginalKindTabs）は、もうここには置かない。`/free`（カタログをつくる）
 * も同じタブの仲間になり、`/free` は `(app)` の枠にあるので、3つに共通の親の
 * `app/[locale]/layout.tsx`（TopTabsSlot）から出す。ここにも置くと、
 * `/styles`・`/user-styles` でタブと h1 が2つずつになる
 * （docs/planning/catalog-three-tabs-implementation-plan.md ADR-001）。
 *
 * レイアウトの位置は変えない。`loading.tsx` のスケルトンは今までどおり、
 * このレイアウトの下（= タブの下）に出る。
 *
 * ⭐ **ここで認証を引かないこと。** 引くとこのレイアウト配下が丸ごとリクエスト依存に
 * なり、`/styles` の静的シェルと初期 HTML の JSON-LD という前提が崩れる。
 */
export default function StylesCatalogLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
