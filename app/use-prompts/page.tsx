import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createCanonicalAlternates } from "@/lib/metadata";
import { getUser } from "@/lib/auth";
import { isAdminViewer, isLocalPreviewAllowed } from "@/lib/env";
import { getPromptUseGuideAmounts } from "@/features/credits/lib/get-prompt-use-guide-amounts";
import { getUsablePromptShowcase } from "@/features/credits/lib/get-usable-prompt-showcase";
import { UsePromptsGuide } from "@/features/credits/components/UsePromptsGuide";
import {
  NOT_ELIGIBLE_CASES,
  USE_PROMPTS_STEPS,
} from "@/features/credits/lib/use-prompts-content";
import { getSiteUrl } from "@/lib/env";

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
/*
  ページ本文・OGP と言い回しを揃える(「借りて/つくれます」→「生成できます」)。

  ただし**「プロンプト」は必ず残す**こと。検索でこのページに来る人はまず
  この語で探す。言い回しを整えるつもりで消すと、検索結果の抜粋から
  手がかりが無くなる。
*/
const PAGE_DESCRIPTION =
  "気に入った作品を、うちの子で生成できます。プロンプトが非公開でも使えます。生成して投稿するとペルコインがもらえて、原作者にも還元が届きます。使い方・もらえる条件・対象外のケースをまとめました。";

const OGP_IMAGE = "/use-prompts/ogp.jpg";
const OGP_TITLE = "ユーザーのプロンプトで生成＆投稿して、ペルコインGET！";
const OGP_DESCRIPTION =
  "気に入った作品を、うちの子で生成できます。もらえるまでの4ステップを紹介。";

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
        // 画像内の文言をそのまま書く。読み上げ環境ではここが本文の代わりになる
        alt: "「ユーザーのプロンプトで生成＆投稿して、ペルコインGET！」と書かれた、ペルコインを抱えた猫耳の女の子のイラスト",
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

/**
 * 停止中の下見で額を仮置きする上限。`prompt_use_daily` の CHECK と同じ 1〜1000。
 * 実際の付与とは無関係で、**表示だけ**に使う。
 */
const PREVIEW_AMOUNT_MAX = 1000;

/**
 * `?amount=` を下見用の仮の額として読む。運営が停止中に見ているときだけ有効。
 *
 * 停止中は額が 0 なので、額カードや「別々にもらえます」のセクションが
 * 出ない(0 の項目は行ごと出さない)。それでは**公開後の見た目を確認できない**。
 * かといって確認のために admin の額を入れると、その瞬間にミッションが
 * 全ユーザーへ公開されて付与も走る = 周知より先に実施してしまう。
 *
 * そこで表示だけを差し替える逃げ道を用意する。DB は一切触らない。
 */
function parsePreviewAmount(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return Math.min(parsed, PREVIEW_AMOUNT_MAX);
}


const PAGE_PATH = "/use-prompts";

/**
 * 構造化データ。**ページに見えているものを機械可読にしたもの**で、
 * 文言は `use-prompts-content.ts` と共有している(片方だけ直すと、
 * 書いてあることと申告している内容が食い違う)。
 *
 * ## リッチリザルトは期待しないこと
 *
 * HowTo は 2023-09、FAQPage は 2026-05-07 に Google の検索結果から
 * **表示されなくなった**。それでも置くのは、Bing や AI 系のクローラが
 * 今も読むため。「順位が上がる」「表示が広がる」ものではない。
 *
 * BreadcrumbList は別で、**いまも検索結果に出る**(URL の代わりに階層が
 * 表示される)。見た目に効くのはこれだけ。
 */
function buildJsonLd(siteUrl: string) {
  const pageUrl = `${siteUrl}${PAGE_PATH}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Persta.AI",
          item: siteUrl,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "プロンプト利用",
          item: pageUrl,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "他の人のプロンプトで生成して投稿し、ペルコインをもらう方法",
      description: PAGE_DESCRIPTION,
      totalTime: "PT3M",
      step: USE_PROMPTS_STEPS.map((step, index) => ({
        "@type": "HowToStep",
        position: index + 1,
        name: step.title,
        text: step.body,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      /*
        質問文はページに書いてある見出しをそのまま使う。言い回しを整えて
        「〜はもらえますか？」にすると、**ページに無い文言を申告する**ことに
        なる(構造化データは見えている内容と一致していること、が要件)。
      */
      mainEntity: NOT_ELIGIBLE_CASES.map((item) => ({
        "@type": "Question",
        name: item.title,
        acceptedAnswer: { "@type": "Answer", text: item.body },
      })),
    },
  ];
}

export default async function UsePromptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();

  const [amounts, user, params] = await Promise.all([
    getPromptUseGuideAmounts(),
    getUser(),
    searchParams,
  ]);

  const isLive = amounts.promptUseBonusAmount > 0;
  /*
    `?amount=` は開発サーバーでも通す。

    ログインできない立場(自動でブラウザを動かして確認する側)からは、
    このページを一度も開けなかった。確認のたびに使い捨ての入口ページを
    作っていたが、そこは props を手で渡すので**本物とは別物**しか見られない。

    合図(`?amount=`)を必須にしているのは、素で開いたときに
    「一般ユーザーには 404」という本来の見え方も確認できるようにするため。
    本番・Vercel プレビューは NODE_ENV が production なので開かない。
  */
  const localPreview = isLocalPreviewAllowed() && Boolean(params.amount);
  const canPreview = isAdminViewer(user?.id) || localPreview;

  if (!isLive && !canPreview) {
    notFound();
  }

  // 仮の額は停止中の下見にだけ効く。稼働中は常に実際の設定値を出す
  const previewAmount = isLive ? null : parsePreviewAmount(params.amount);
  const displayAmount = previewAmount ?? amounts.promptUseBonusAmount;

  // 404 が確定してから引く(出さないページのためにDBを叩かない)
  const showcase = await getUsablePromptShowcase();

  const siteUrl = getSiteUrl();

  return (
    <>
      {/* 生成元はこのファイルと use-prompts-content.ts の定数のみ(ユーザー入力を含まない) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(siteUrl)) }}
      />
      <UsePromptsGuide
      promptUseBonusAmount={displayAmount}
      freePostBonusAmount={amounts.freePostBonusAmount}
      oneTapPostBonusAmount={amounts.oneTapPostBonusAmount}
      creatorRewardAmount={amounts.creatorRewardAmount}
      showcase={showcase}
      isPreview={!isLive}
      previewAmount={previewAmount}
      hasHeroImage
      />
    </>
  );
}
