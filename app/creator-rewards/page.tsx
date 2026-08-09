import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createCanonicalAlternates } from "@/lib/metadata";
import { getPercoinDefaultsForDisplay } from "@/features/credits/lib/get-percoin-defaults";
import { CreatorRewardsGuide } from "@/features/credits/components/CreatorRewardsGuide";

// クリエイター還元の紹介ページ。
// 付与額は admin(`/admin/percoin-defaults`) の設定を毎回サーバー側で読むため、
// 運営が額を変えると表示も追従する(文言に数字を埋め込まない)。
// 両方 0 = 停止中のときは notFound。もらえないのに「もらえます」と告知しない。

const PAGE_TITLE =
  "あなたのプロンプトが、ペルコインになる｜クリエイター還元 | Persta.AI";
const PAGE_DESCRIPTION =
  "あなたが作ったプロンプトやスタイルが他のユーザーに使われるたびに、ペルコインが還元されます。もらえるまでの流れ・対象になる条件・還元されないケースをまとめました。";

// TODO: OGP画像はイラスト支給後に /og/ 配下へ配置して images を追加する
// (画像なしの間は images を省略し、タイトル/説明のみのカードにフォールバック)。
export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: createCanonicalAlternates("/creator-rewards"),
  openGraph: {
    title: "あなたのプロンプトが、ペルコインになる｜クリエイター還元",
    description:
      "作った作品が誰かに使われるたびに、ペルコインが還元されます。もらえるまでの3ステップを紹介。",
    type: "website",
    siteName: "Persta.AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "あなたのプロンプトが、ペルコインになる｜クリエイター還元",
    description:
      "作った作品が誰かに使われるたびに、ペルコインが還元されます。もらえるまでの3ステップを紹介。",
  },
};

export default async function CreatorRewardsPage() {
  await connection();

  // サブスク倍率は掛けない(還元は利用者側の行動で発生し、受け手のプラン特典ではない)。
  // API ルート(/api/percoin/usage-reward)と同じく "free" で取得する。
  const defaults = await getPercoinDefaultsForDisplay("free");
  const promptUsageRewardAmount = defaults.promptUsageRewardAmount;
  const styleUsageRewardAmount = defaults.styleUsageRewardAmount;

  if (promptUsageRewardAmount <= 0 && styleUsageRewardAmount <= 0) {
    notFound();
  }

  return (
    <CreatorRewardsGuide
      promptUsageRewardAmount={promptUsageRewardAmount}
      styleUsageRewardAmount={styleUsageRewardAmount}
    />
  );
}
