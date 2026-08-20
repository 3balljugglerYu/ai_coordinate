import type { Metadata } from "next";
import {
  createCanonicalAlternates,
  getDefaultOpenGraphImages,
} from "@/lib/metadata";
import { getSiteUrl } from "@/lib/env";
import { SignupSourceCapture } from "@/features/auth/components/SignupSourceCapture";
import { ImageSplitTool } from "@/features/tools/components/ImageSplitTool";
import { ImageSplitSourcePreset } from "@/features/tools/components/ImageSplitSourcePreset";
import { IMAGE_SPLIT_SIGNUP_SOURCE } from "@/features/tools/lib/tool-signup-sources";
import { getPublishedStylePresetById } from "@/features/style-presets/lib/style-preset-repository";

// 画像4分割ツール(未ログインで使える公開ページ)。
// 処理はすべてブラウザ内で完結し、サーバーには何も送らない。

const PAGE_PATH = "/tools/image-split";

/**
 * 分割の材料をつくるための One-Tap Style「横長16:9 へ拡張」。
 *
 * このツールの入力は横長画像なので、/style のトップではなく
 * 16:9 を作れるプリセットを直接開く。
 */
const SOURCE_PRESET_ID = "8d6d595a-2b1b-4181-af82-cbec04e56fe3";

/*
  検索される語は「画像 4分割」「画像 分割 無料」「写真 4分割」あたりで、
  X はそのうちの一用途にすぎない。以前はタイトルを「X用」から始めていたため
  一般的な分割ニーズの検索と噛み合っていなかった。
  一般語を先頭に置き、用途(X・SNS)は後ろに回す。
*/
const PAGE_TITLE =
  "画像4分割ツール｜無料・登録不要で縦4分割・横4分割・2×2 | Persta.AI";
const PAGE_DESCRIPTION =
  "画像を4分割できる無料ツール。横長画像の縦4分割、縦長画像の横4分割、2×2分割に対応。X（旧Twitter）の連続投稿やSNS用の分割画像がブラウザだけで作れます。画像はサーバーにアップロードされないので安心。登録不要・インストール不要でスマホからも使えます。";

const OG_TITLE = "画像4分割ツール｜無料・登録不要（縦4分割・横4分割・2×2）";
const OG_DESCRIPTION =
  "画像を4分割できる無料ツール。X の連続投稿用の縦4分割にも対応。ブラウザ内で処理するのでアップロード不要・登録不要。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: createCanonicalAlternates(PAGE_PATH),
  openGraph: {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    type: "website",
    siteName: "Persta.AI",
    url: PAGE_PATH,
    images: getDefaultOpenGraphImages(),
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
  },
};

/** 使い方(HowTo 構造化データと本文で同じ内容を使う)。 */
const HOW_TO_STEPS = [
  {
    name: "画像を選ぶ",
    text: "分割したい画像を選ぶか、ドラッグ&ドロップします。処理はブラウザ内で行われ、画像はサーバーに送信されません。",
  },
  {
    name: "分割方法を選ぶ",
    text: "縦に4分割（横長画像向け）、横に4分割（縦長画像向け）、2×2に4分割から選びます。切り替えるとすぐに再分割されます。",
  },
  {
    name: "保存する",
    text: "4枚まとめて、または1枚ずつ保存します。スマホでは共有シートから「4枚の画像を保存」を選ぶと写真アプリに入ります。",
  },
];

/** よくある質問(FAQPage 構造化データと本文で同じ内容を使う)。 */
const FAQ_ITEMS = [
  {
    q: "画像はアップロードされますか？",
    a: "いいえ。分割はすべてお使いのブラウザ内で行われ、画像がサーバーに送信されることはありません。通信が発生しないため、オフラインでも動作します。",
  },
  {
    q: "無料ですか？登録は必要ですか？",
    a: "無料です。会員登録もインストールも必要ありません。ページを開いて画像を選ぶだけで使えます。",
  },
  {
    q: "スマホでも使えますか？",
    a: "使えます。iPhone・Android のブラウザで動作します。スマホでは共有シートから「4枚の画像を保存」を選ぶと、写真アプリに4枚とも保存されます。",
  },
  {
    q: "X（旧Twitter）で分割画像を投稿するには？",
    a: "4枚を写真に保存したあと、X アプリの投稿画面で1枚目から4枚目の順に選んで投稿します。タイムラインでは2×2に並び、タップしてスワイプすると1枚ずつつながって見えます。",
  },
  {
    q: "対応している画像形式は？",
    a: "JPEG・PNG・WebP など、ブラウザが表示できる一般的な画像形式に対応しています。出力はPNGです。iPhone の HEIC 形式は、ブラウザによっては読み込めない場合があります。",
  },
  {
    q: "分割した画像の境目にズレは出ませんか？",
    a: "出ません。4等分できないサイズの画像でも、余りを最後の1枚が引き受けるように計算しているため、隙間や重なりは生じません。",
  },
];

/**
 * 構造化データ。
 *
 * - `SoftwareApplication`: 無料のWebツールであることを検索エンジンに伝える
 * - `HowTo` / `FAQPage`: 本文と同じ内容を機械可読にする
 *   (本文に無いことをここだけに書かない。ガイドライン違反になる)
 */
function buildJsonLd(siteUrl: string) {
  const pageUrl = `${siteUrl}${PAGE_PATH}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "画像4分割ツール",
      url: pageUrl,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      description: PAGE_DESCRIPTION,
      offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
      featureList: [
        "縦に4分割（横長画像向け）",
        "横に4分割（縦長画像向け）",
        "2×2に4分割",
        "ブラウザ内で処理（アップロード不要）",
        "登録不要・無料",
      ],
      publisher: { "@type": "Organization", name: "Persta.AI", url: siteUrl },
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "画像を4分割してSNSに投稿する方法",
      description:
        "画像4分割ツールを使って、横長画像を縦4分割し、X などのSNSに連続投稿する手順です。",
      totalTime: "PT1M",
      step: HOW_TO_STEPS.map((step, index) => ({
        "@type": "HowToStep",
        position: index + 1,
        name: step.name,
        text: step.text,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ];
}

export default async function ImageSplitPage() {
  const siteUrl = getSiteUrl() || "https://persta.ai";
  /*
    サムネイルは DB から引く(タイトル・画像を焼き込むと差し替えに追従できない)。
    未公開・非公開カテゴリになったら null が返り、カードごと出さない。
  */
  const preset = await getPublishedStylePresetById(SOURCE_PRESET_ID);
  const sourcePreset = preset?.thumbnailImageUrl
    ? {
        id: preset.id,
        title: preset.title,
        thumbnailImageUrl: preset.thumbnailImageUrl,
      }
    : null;

  return (
    <main className="min-h-screen bg-gray-50">
      {/*
        このページに着地した時点で流入元は確定している。CTA を押した人だけでなく、
        ツールを使って後から登録した人も「ツール経由」として数えるために、
        first-touch のタグをここで立てる(URL に明示のタグがあればそちらが優先)。
      */}
      <SignupSourceCapture fallbackSource={IMAGE_SPLIT_SIGNUP_SOURCE} />
      <script
        type="application/ld+json"
        // 生成元は同ファイル内の定数のみでユーザー入力を含まない
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildJsonLd(siteUrl)),
        }}
      />

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-8">
        <header className="mb-6 space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">画像4分割ツール</h1>
          <p className="text-sm leading-6 text-slate-600">
            画像を4分割して保存できる無料ツールです。横長画像の
            <strong>縦4分割</strong>、縦長画像の<strong>横4分割</strong>、
            <strong>2×2分割</strong>に対応。X（旧Twitter）に連続投稿すると、
            タイムラインでは2×2に並び、タップしてスワイプするとパノラマのように
            つながって見えます。
            <strong>登録不要・無料</strong>で、画像はサーバーにアップロードされません。
          </p>
        </header>

        <ImageSplitTool />

        {/*
          ツールだけのページは検索エンジンから見ると内容が薄い。
          利用者にとっても意味のある情報(使い方・用途・FAQ)を本文として置く。
          構造化データはここと同じ内容を機械可読にしたもの。
        */}
        <section className="mt-12 space-y-3">
          <h2 className="text-lg font-bold text-slate-900">使い方</h2>
          <ol className="space-y-2 text-sm leading-6 text-slate-700">
            {HOW_TO_STEPS.map((step, index) => (
              <li key={step.name} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pink-100 text-xs font-bold text-pink-700">
                  {index + 1}
                </span>
                <span>
                  <strong className="text-slate-900">{step.name}</strong>
                  <br />
                  {step.text}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-bold text-slate-900">
            分割する画像をつくる
          </h2>
          <p className="text-sm leading-6 text-slate-600">
            分割したい横長画像が手元にないときは、手持ちのイラストを
            16:9の横長に広げるところから始められます。広げた画像をこのページで
            縦4分割すれば、そのままXに投稿できます。
          </p>
          <ImageSplitSourcePreset preset={sourcePreset} />
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-bold text-slate-900">
            どんなときに使えるか
          </h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-slate-700">
            <li>
              <strong>Xの連続投稿</strong>
              ：16:9などの横長イラストを縦4分割して、スワイプでつながる投稿にする
            </li>
            <li>
              <strong>縦長イラストの分割</strong>
              ：縦に長い立ち絵やコマ割りを横4分割して、順番に見せる
            </li>
            <li>
              <strong>2×2の分割</strong>
              ：1枚の画像を4枚に割って、SNSのグリッド表示に合わせる
            </li>
            <li>
              <strong>大きい画像の切り分け</strong>
              ：解像度の高い画像を4枚に分けて扱いやすくする
            </li>
          </ul>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-bold text-slate-900">よくある質問</h2>
          <dl className="space-y-4">
            {FAQ_ITEMS.map((item) => (
              <div key={item.q} className="space-y-1">
                <dt className="text-sm font-bold text-slate-900">{item.q}</dt>
                <dd className="text-sm leading-6 text-slate-600">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </main>
  );
}
