import type { Metadata } from "next";
import { Lilita_One, M_PLUS_Rounded_1c } from "next/font/google";
import { AutumnMomentPage } from "@/features/campaigns/autumn-moment/components/AutumnMomentPage";
import { AUTUMN_MOMENT } from "@/features/campaigns/autumn-moment/autumn-moment";
import { getCampaignSubmissionPages } from "@/features/campaigns/hashtag-campaign/get-submission-pages";
import { createCanonicalAlternates } from "@/lib/metadata";

/**
 * このページだけで使うポップな書体(ハロウィン企画と同じ。他のページの Geist には影響しない。CSS 変数で渡す)。
 * - M PLUS Rounded 1c: 本文・見出し(日本語の丸ゴシック)
 * - Lilita One: 英語の飾り見出し
 */
const roundedBody = M_PLUS_Rounded_1c({
  weight: ["500", "700", "800"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-autumn-moment-body",
});

const display = Lilita_One({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-autumn-moment-display",
});

export const metadata: Metadata = {
  title: `${AUTUMN_MOMENT.titleJp} | Persta.AI`,
  description: `CREATEで、うちの子の秋のひとときのプロンプトをつくって投稿しよう。気に入った作品で、うちの子を生成して楽しめます。${AUTUMN_MOMENT.prizes[0].name}には${AUTUMN_MOMENT.prizeTotalLabel}。`,
  // 広告などの目印が付いた URL を別のページと数えさせないよう、正規の URL を自分自身にする
  alternates: createCanonicalAlternates(AUTUMN_MOMENT.path),
};

export default async function Page() {
  // 応募作品。数分ごとに読み直す(use cache)。読めなければ空で、区画ごと出さない
  const submissionPages = await getCampaignSubmissionPages(AUTUMN_MOMENT.campaignKey);
  return (
    <div className={`${roundedBody.variable} ${display.variable}`}>
      <AutumnMomentPage submissionPages={submissionPages} />
    </div>
  );
}
