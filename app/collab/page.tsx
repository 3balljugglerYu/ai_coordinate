import type { Metadata } from "next";
import { connection } from "next/server";
import {
  CollabRecruitGuide,
  type PastCollab,
} from "@/features/collab/components/CollabRecruitGuide";
import { listPublishedStylePresets } from "@/features/style-presets/lib/style-preset-repository";

const OGP_IMAGE = "/collections/wafer/god-share.webp";
const PAGE_TITLE =
  "一緒にコラボしませんか？｜コラボ企画パートナー募集 | Persta.AI";
const PAGE_DESCRIPTION =
  "神コレクション・イタリア旅行・ことわざ辞典——Persta.AI の人気企画はクリエイターとのコラボから生まれました。あなたの世界観で“うちの子”の新しい企画を一緒に作りませんか？コラボパートナー募集中！";

// イタリア旅行の作品画像は静的アセットが無いため、公開プリセットのサムネから取る
const ITALY_CATEGORY_KEY = "travel_to_italy";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: "一緒にコラボしませんか？｜コラボ企画パートナー募集",
    description:
      "Persta.AI の人気企画はコラボから生まれました。あなたの世界観で新しい企画を一緒に。",
    type: "website",
    siteName: "Persta.AI",
    images: [
      {
        url: OGP_IMAGE,
        width: 1200,
        height: 630,
        alt: "コラボ企画パートナー募集 | Persta.AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "一緒にコラボしませんか？｜コラボ企画パートナー募集",
    description:
      "Persta.AI の人気企画はコラボから生まれました。あなたの世界観で新しい企画を一緒に。",
    images: [OGP_IMAGE],
  },
};

export default async function CollabRecruitPage() {
  await connection();

  // イタリア旅行のみ静的アセットが無いためプリセットのサムネを使う。
  // 企画は表示期間外のため通常の公開一覧からは除外される。特設ページ
  // (/collections/italy) と同様に includeAdminOnly で取得する
  // (それでも取れない場合はアイコン+説明のみで表示する)。
  const presets = await listPublishedStylePresets({
    includeAdminOnly: true,
  }).catch(() => []);
  const italyWorks = presets
    .filter(
      (preset) =>
        preset.category.key === ITALY_CATEGORY_KEY &&
        Boolean(preset.thumbnailImageUrl),
    )
    .slice(0, 3)
    .map((preset) => ({
      src: preset.thumbnailImageUrl,
      alt: preset.title || "うちの子のイタリア旅行日記の作例",
    }));

  const pastCollabs: PastCollab[] = [
    {
      name: "mario さん",
      xHandle: "@mario335599",
      xUrl: "https://x.com/mario335599",
      iconSrc: "/collections/wafer/user-icons/mario-icon.webp",
      projectTitle: "うちの子の神コレクション",
      description:
        "女神・神さまに変身する全6種のコレクション企画。ウエハースシール風の特典画像もあわせて、たくさんのうちの子が変身し、SNSでシェアされました。",
      works: [
        { src: "/collections/wafer/god/zeus.webp", alt: "神コレクション ゼウス" },
        { src: "/collections/wafer/god/athena.webp", alt: "神コレクション アテナ" },
        {
          src: "/collections/wafer/god/aphrodite.webp",
          alt: "神コレクション アフロディーテ",
        },
      ],
      guideHref: "/collections/wafer",
      guideLabel: "神コレの特設ページを見る",
    },
    {
      name: "ちゃんりお さん",
      xHandle: "@kyouchanlio",
      xUrl: "https://x.com/kyouchanlio",
      iconSrc: "/collections/italy/user-icons/chanlio-icon.jpeg",
      projectTitle: "うちの子のイタリア旅行日記",
      description:
        "表紙「はじまり」から Day1・Day2…と1つずつ解放して全9種。あつめると“めくれる旅行日記”が完成する、物語仕立てのコラボ企画です。",
      works: italyWorks,
      guideHref: "/collections/italy",
      guideLabel: "イタリア旅行の特設ページを見る",
    },
    {
      name: "雑葉 さん",
      xHandle: "@sacher10610",
      xUrl: "https://x.com/sacher10610",
      iconSrc: "/collections/kotowaza/user-icons/zatsuha-icon.webp",
      projectTitle: "うちの子のことわざ辞典",
      description:
        "「虎の威を借る狐」「鶴の一声」など、ことわざの世界にうちの子が入り込む全6種。全部あつめると“ことわざ辞典”が完成します。",
      works: [
        {
          src: "/collections/kotowaza/tora-no-i.webp",
          alt: "ことわざ辞典 虎の威を借る狐",
        },
        {
          src: "/collections/kotowaza/tsuru-no-hitokoe.webp",
          alt: "ことわざ辞典 鶴の一声",
        },
        {
          src: "/collections/kotowaza/neko-no-te.webp",
          alt: "ことわざ辞典 猫の手も借りたい",
        },
      ],
      guideHref: "/collections/kotowaza",
      guideLabel: "ことわざ辞典の特設ページを見る",
    },
  ];

  return <CollabRecruitGuide pastCollabs={pastCollabs} />;
}
