import type { Metadata } from "next";
import { Lilita_One, M_PLUS_Rounded_1c } from "next/font/google";
import { KimePosePage } from "@/features/campaigns/kime-pose/components/KimePosePage";
import { KIME_POSE } from "@/features/campaigns/kime-pose/kime-pose";
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
  variable: "--font-kime-pose-body",
});

const display = Lilita_One({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-kime-pose-display",
});

export const metadata: Metadata = {
  title: `${KIME_POSE.titleJp} | Persta.AI`,
  description:
    "CREATEで、うちの子の決めポーズのプロンプトをつくって投稿しよう。投票は、気に入った決めポーズで生成するだけ。いちばん使われた決めポーズにはAmazonギフトカード5,000円分。",
  // 広告などの目印が付いた URL を別のページと数えさせないよう、正規の URL を自分自身にする
  alternates: createCanonicalAlternates(KIME_POSE.path),
};

export default async function Page() {
  // 応募作品。数分ごとに読み直す(use cache)。読めなければ空で、区画ごと出さない
  const submissionPages = await getCampaignSubmissionPages(KIME_POSE.campaignKey);
  return (
    <div className={`${roundedBody.variable} ${display.variable}`}>
      <KimePosePage submissionPages={submissionPages} />
    </div>
  );
}
