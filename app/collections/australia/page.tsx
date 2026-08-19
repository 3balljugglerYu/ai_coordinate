import type { Metadata } from "next";
import { connection } from "next/server";
import { SignupSourceCapture } from "@/features/auth/components/SignupSourceCapture";
import { createCanonicalAlternates } from "@/lib/metadata";
import { getPresetCategoryByKey } from "@/features/style-presets/lib/preset-category-repository";
import { listPublishedStylePresets } from "@/features/style-presets/lib/style-preset-repository";
import { AustraliaTravelGuide } from "@/features/collections/components/AustraliaTravelGuide";
import {
  AUSTRALIA_DAILY_LOOKS,
  hasAustraliaScrapbookStarted,
  type AustraliaDailyLook,
} from "@/features/collections/lib/australia-daily-looks";

// うちの子のオーストラリア旅行(表紙 + 7ページ の全8種)。ちゃんりおさんとのコラボ企画。
// イタリア(travel_to_italy)と違い、10日間の旅程を8枚に集約しているため
// Day 番号とページ番号は 1 対 1 ではない(Day1-2 / Day6-7 / Day8-9 が2日分で1枚)。
const AUSTRALIA_KEY = "travel_to_australia";

const PAGE_TITLE =
  "うちの子のオーストラリア旅行｜8種そろえてめくれる旅行日記をつくろう | Persta.AI";
const PAGE_DESCRIPTION =
  "うちの子をオーストラリア10日間の旅へ。表紙「旅のはじまり」からケアンズ・ウルル・シドニーと1つずつ解放して全8種をあつめると、1ページずつめくれる旅行日記(本)が完成。ダウンロードして SNS でシェア！";

const OG_IMAGE = "/collections/australia/ogp.jpg";
const OG_TITLE = "うちの子のオーストラリア旅行｜めくれる旅行日記をつくろう";
const OG_DESCRIPTION =
  "うちの子をオーストラリアへ。全8種をあつめて、めくれる旅行日記をつくろう。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: createCanonicalAlternates("/collections/australia"),
  openGraph: {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    type: "website",
    siteName: "Persta.AI",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "うちの子のオーストラリア旅行 — 10日間のわくわく旅日記",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export default async function AustraliaCollectionGuidePage() {
  await connection();

  // admin_only 期間中もプレビューできるよう includeAdminOnly で取得。
  const [category, allPresets] = await Promise.all([
    getPresetCategoryByKey(AUSTRALIA_KEY),
    listPublishedStylePresets({ includeAdminOnly: true }),
  ]);

  const threshold = category?.completionThreshold ?? 8;

  /*
    「旅のあいだ」の毎朝のコーデ。コーディネート2.0 に登録する運用なので
    DB からは判別できず、ID の明示リストで拾う(australia-daily-looks.ts)。
    未登録・未公開の ID は落とす。書き間違えてもページは壊れない。
  */
  const dailyLooks: AustraliaDailyLook[] = AUSTRALIA_DAILY_LOOKS.flatMap(
    ({ day, presetId }) => {
      const preset = allPresets.find((p) => p.id === presetId);
      return preset
        ? [
            {
              id: preset.id,
              day,
              title: preset.title,
              thumbnailImageUrl: preset.thumbnailImageUrl,
            },
          ]
        : [];
    }
  );

  /*
    スクラップブック企画は 8/29 開始。それまで「あつめる」のサムネイルはぼかす。
    判定はここ(キャッシュ境界の外・connection() 済み)で解決して props で渡す。
    クライアントで時刻を読むと SSR とズレて hydration 警告になる。
  */
  const hasScrapbookStarted = hasAustraliaScrapbookStarted();
  // sort_order 昇順(表紙 → Day1-2 → … → Day10)で取得済み。
  const presets = allPresets
    .filter((p) => p.category.key === AUSTRALIA_KEY)
    .map((p) => ({
      id: p.id,
      title: p.title,
      thumbnailImageUrl: p.thumbnailImageUrl,
    }));

  return (
    <>
      {/* この企画ページに着地した時点で流入元は確定している。X の投稿リンクに
          毎回手でタグを付けなくても、企画経由の登録を数えられるようにする。 */}
      <SignupSourceCapture fallbackSource={AUSTRALIA_KEY} />
      <AustraliaTravelGuide
        threshold={threshold}
        presets={presets}
        dailyLooks={dailyLooks}
        hasScrapbookStarted={hasScrapbookStarted}
      />
    </>
  );
}
