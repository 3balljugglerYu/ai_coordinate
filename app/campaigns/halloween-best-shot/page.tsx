import type { Metadata } from "next";
import { Lilita_One, M_PLUS_Rounded_1c } from "next/font/google";
import { HalloweenBestShotPage } from "@/features/campaigns/halloween/components/HalloweenBestShotPage";
import { HALLOWEEN_BEST_SHOT } from "@/features/campaigns/halloween/halloween-best-shot";
import { getCampaignSubmissionPages } from "@/features/campaigns/hashtag-campaign/get-submission-pages";

/**
 * このページだけで使うポップな書体(他のページの Geist には影響しない。CSS 変数で渡す)。
 * - M PLUS Rounded 1c: 本文・見出し(日本語の丸ゴシック)
 * - Lilita One: 英語の飾り見出し
 */
const roundedBody = M_PLUS_Rounded_1c({
  weight: ["500", "700", "800"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-halloween-body",
});

const display = Lilita_One({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-halloween-display",
});

export const metadata: Metadata = {
  title: `${HALLOWEEN_BEST_SHOT.titleJp} ${HALLOWEEN_BEST_SHOT.titleEn} | Persta.AI`,
  description:
    "CREATEでハロウィンのプロンプトをつくって投稿しよう。だれの子で生成しても素敵に仕上がるプロンプトを募集。最優秀賞はAmazonギフト券1万円分。",
  // 中身(審査のポイント等)の最終確認が済むまでは検索に載せない
  robots: { index: false, follow: true },
};

export default async function Page() {
  // キャンペーン対象の投稿。数分ごとに読み直す(use cache)。読めなければ空で、区画ごと出さない
  const submissionPages = await getCampaignSubmissionPages(HALLOWEEN_BEST_SHOT.campaignKey);
  return (
    <div className={`${roundedBody.variable} ${display.variable}`}>
      <HalloweenBestShotPage submissionPages={submissionPages} />
    </div>
  );
}
