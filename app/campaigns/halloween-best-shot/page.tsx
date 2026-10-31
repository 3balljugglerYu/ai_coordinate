import type { Metadata } from "next";
import { Lilita_One, M_PLUS_Rounded_1c } from "next/font/google";
import { HalloweenBestShotPage } from "@/features/campaigns/halloween/components/HalloweenBestShotPage";
import { HALLOWEEN_BEST_SHOT } from "@/features/campaigns/halloween/halloween-best-shot";
import { getCampaignSubmissionPages } from "@/features/campaigns/hashtag-campaign/get-submission-pages";
import { createCanonicalAlternates } from "@/lib/metadata";

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
  // 企画が終わったので、募集の呼びかけから終わったあとの説明に差し替えた(2026-11-01 ユーザー決定)
  description:
    "ペルスタのハロウィン企画「うちの子のベストショット with Halloween Magic」は終了しました。集まった対象作品と、賞品・結果発表の予定を載せています。",
  // 検索に出す(2026-10-17 ユーザー指示。中身の確認が済んだため noindex を外した)。
  // 広告などの目印が付いた URL を別のページと数えさせないよう、正規の URL を自分自身にする
  alternates: createCanonicalAlternates(HALLOWEEN_BEST_SHOT.path),
};

export default async function Page() {
  // キャンペーン対象の投稿。数分ごとに読み直す(use cache)。読めなければ空で、区画ごと出さない
  const submissionPages = await getCampaignSubmissionPages(HALLOWEEN_BEST_SHOT.campaignKey);
  return (
    <div className={`${roundedBody.variable} ${display.variable}`}>
      {/*
        企画は 2026-10-31 23:59 に終わった。終わったあとの表示で固定する(2026-11-01 ユーザー指示)。
        時刻で切り替えないのは、この変更が終了のあとに出て、開催中に戻ることはないため。
        このページは前もって描いておく作りで(人ごとのデータを読まない)、サーバーで時刻を読むには
        毎回描く作りに変える必要がある。ブラウザで切り替えると、開催中の表示が一瞬出る
      */}
      <HalloweenBestShotPage submissionPages={submissionPages} ended />
    </div>
  );
}
