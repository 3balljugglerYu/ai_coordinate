import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createCanonicalAlternates } from "@/lib/metadata";
import { getUser } from "@/lib/auth";
import { isAdminViewer } from "@/lib/env";
import { getPromptUseGuideAmounts } from "@/features/credits/lib/get-prompt-use-guide-amounts";
import { getUsablePromptShowcase } from "@/features/credits/lib/get-usable-prompt-showcase";
import { UsePromptsGuide } from "@/features/credits/components/UsePromptsGuide";

/**
 * プロンプト利用ミッションの紹介ページ(= **つかう側**)。
 * 対になる `/creator-rewards` は**あげる側**。
 *
 * 額は admin(`/admin/percoin-defaults`) の設定を毎回サーバー側で読むため、
 * 運営が額を変えると表示も追従する(文言に数字を埋め込まない)。
 *
 * ## 停止中(額 0)の扱いが `/creator-rewards` と違う理由
 *
 * あちらは額 0 で無条件に notFound。ここは**運営にだけ見せる**。
 * このページは「周知してから実施する」ための資料で、額を入れる前に
 * 中身を確認する工程が要る。無条件 404 だと自分で確認できない。
 * 一般ユーザーには 404 のまま(もらえないのに「もらえます」と告知しない)。
 */

const PAGE_TITLE =
  "みんなのプロンプトで、うちの子をつくる｜プロンプト利用 | Persta.AI";
const PAGE_DESCRIPTION =
  "気に入った作品のプロンプトを借りて、あなたのうちの子でつくれます。作って投稿するとペルコインがもらえて、原作者にも還元が届きます。使い方・もらえる条件・対象外のケースをまとめました。";

const OGP_IMAGE = "/use-prompts/ogp.jpg";
const OGP_TITLE = "ユーザーのプロンプトで生成＆投稿して、ペルコインGET！";
const OGP_DESCRIPTION =
  "気に入った作品の作り方を借りて、うちの子でつくれます。もらえるまでの4ステップを紹介。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: createCanonicalAlternates("/use-prompts"),
  openGraph: {
    title: OGP_TITLE,
    description: OGP_DESCRIPTION,
    type: "website",
    siteName: "Persta.AI",
    images: [
      {
        url: OGP_IMAGE,
        width: 1200,
        height: 630,
        alt: "ペルコインを掲げて喜ぶ、うちの子のイラスト",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: OGP_TITLE,
    description: OGP_DESCRIPTION,
    images: [OGP_IMAGE],
  },
};

export default async function UsePromptsPage() {
  await connection();

  const [amounts, user] = await Promise.all([
    getPromptUseGuideAmounts(),
    getUser(),
  ]);

  const isLive = amounts.promptUseBonusAmount > 0;
  const canPreview = isAdminViewer(user?.id);

  if (!isLive && !canPreview) {
    notFound();
  }

  // 404 が確定してから引く(出さないページのためにDBを叩かない)
  const showcase = await getUsablePromptShowcase();

  return (
    <UsePromptsGuide
      promptUseBonusAmount={amounts.promptUseBonusAmount}
      freePostBonusAmount={amounts.freePostBonusAmount}
      creatorRewardAmount={amounts.creatorRewardAmount}
      showcase={showcase}
      isPreview={!isLive}
      /*
        ヒーロー画像はユーザー支給待ち。`public/use-prompts/hero-sp.webp` と
        `hero-pc.webp` を置いたら true にする(それまでは寒色のグラデーションで
        見出しだけ成立させる)。
      */
      hasHeroImage={false}
    />
  );
}
