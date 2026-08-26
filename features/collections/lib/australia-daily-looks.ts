/**
 * オーストラリア企画「旅のあいだ」(2026-08-19〜08-28) に毎朝公開するコーデ。
 *
 * 専用カテゴリを作らず コーディネート2.0(`coordinate_2`) に登録する運用のため、
 * どれが企画のコーデかを DB からは判別できない。ここに ID を明示する。
 *
 * **運用**: 毎朝プリセットを公開したら、この配列に1行足してデプロイする。
 * 公開日の昇順(Day1 → Day10)に並べること。表示順はこの配列の順そのまま。
 *
 * ID が未登録・未公開・非公開カテゴリのものは、ページ側で**黙って落とす**
 * (存在しない ID を書いてもページは壊れない)。
 */
export interface AustraliaDailyLookRef {
  /** カードに出す見出し。旅程の Day 番号。 */
  day: string;
  /** style_presets.id。/style?style=<id> の遷移先になる。 */
  presetId: string;
}

export const AUSTRALIA_DAILY_LOOKS: AustraliaDailyLookRef[] = [
  // Cairns Esplanade Tropical White Dress Look
  { day: "Day 1", presetId: "b8fd5b8d-51ef-47eb-adea-b7c35aaa61c6" },
  // Great Barrier Reef Stripe Shirt Travel Look
  { day: "Day 2", presetId: "e5bce0ee-281d-4794-ab5a-13bde62da0ad" },
  // Daintree Rainforest Safari Look
  { day: "Day 3", presetId: "ee4e8a7f-8e5d-427f-883f-44ba0564264e" },
  // Uluru Starry Night Midnight Gradient Gown Look
  { day: "Day 4", presetId: "b73e84f9-9374-4e19-ba69-c21fc6de52a1" },
  // Kata Tjuta Terracotta Gradient Dress Look
  { day: "Day 5", presetId: "90648849-19c9-4153-a9bc-41636c406527" },
  // Sydney Harbour Navy Pleated Marine Look
  { day: "Day 6", presetId: "80dcdf5e-6ec7-4355-9f94-42a02e7b1642" },
  // Harbour Bridge Aqua Cami & Wrap Skirt Look
  { day: "Day 7", presetId: "3212b40c-63a6-4290-93c2-1383ab553a50" },
  // Blue Mountains Terracotta & Ivory Travel Look
  { day: "Day 8", presetId: "9bc15744-0675-4ff9-a98e-d6b8b30112a1" },
  // Sydney University Navy Polo & Tartan Mini Look
  { day: "Day 9", presetId: "f42aaa5e-a00c-4d62-812b-acba13411dbc" },
];

/** ページに渡す解決済みの1件。 */
export interface AustraliaDailyLook {
  id: string;
  day: string;
  title: string;
  thumbnailImageUrl: string;
}

/**
 * スクラップブック企画(後半)の開始日時。
 *
 * DB の表示期間(`collection_display_starts_at` = 8/17)とは**意図的に違う**。
 * 前半「旅のあいだ」の案内を先に見せるため、表示期間だけ早く開けているため。
 * ガイドページの会期表記が JSX 直書きなのと同じ方針で、ここに持つ。
 */
export const AUSTRALIA_SCRAPBOOK_STARTS_AT = "2026-08-29T00:00:00+09:00";

/**
 * スクラップブック企画が始まっているか。未開始のあいだは
 * 「あつめる、10日間の旅」のサムネイルをぼかす。
 *
 * 判定はサーバー(キャッシュ境界の外)で行って props で渡すこと。
 * クライアントで `new Date()` を読むと SSR とズレて hydration 警告になる。
 */
export function hasAustraliaScrapbookStarted(now: Date = new Date()): boolean {
  return now.getTime() >= Date.parse(AUSTRALIA_SCRAPBOOK_STARTS_AT);
}
