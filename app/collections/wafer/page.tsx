import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getPresetCategoryByKey } from "@/features/style-presets/lib/preset-category-repository";
import { buildPublicGeneratedImageUrl } from "@/features/collections/lib/public-mount-server-api";
import { CollectionProgressRing } from "@/features/collections/components/CollectionProgressRing";

const WAFER_KEY = "collectible_wafer_sticker";

export const metadata: Metadata = {
  title: "うちの子のウエハースシール｜遊び方 | Persta.AI",
  description:
    "うちの子を平成レトロなウエハースのおまけシール風イラストに。違う衣装を集めると円が埋まり、そろえるとコンプリート台紙が完成！SNSでシェアしよう。",
  openGraph: {
    title: "うちの子のウエハースシール｜遊び方",
    description:
      "うちの子をウエハースシール風に。集めてコンプリート台紙を作ろう。",
    type: "website",
    siteName: "Persta.AI",
  },
};

const STAGES = [0, 0.25, 0.5, 0.75, 1];

export default async function WaferCollectionGuidePage() {
  await connection();

  const category = await getPresetCategoryByKey(WAFER_KEY);
  const threshold = category?.completionThreshold ?? 4;
  const characterUrl = buildPublicGeneratedImageUrl(
    category?.collectionCharacterPath ?? null,
  );

  const steps = [
    {
      no: "1",
      title: "うちの子をシール風に生成",
      body: "style画面でウエハースシール風の衣装を選び、うちの子を1タップで生成します。",
    },
    {
      no: "2",
      title: "違う衣装を集める",
      body: `衣装ちがいを集めるたびに、中央の円が時計回りに埋まっていきます（全${threshold}種）。`,
    },
    {
      no: "3",
      title: "そろえてコンプリート",
      body: `${threshold}種そろうと「コンプリート台紙」が自動で完成。載せる画像も選べます。`,
    },
    {
      no: "4",
      title: "シェア＆コレクション",
      body: "台紙はSNSでワンタップ共有。マイページでいつでも見返せます。",
    },
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {/* ヒーロー */}
      <section className="text-center">
        <p className="text-sm font-medium text-amber-500">コレクション企画</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
          うちの子のウエハースシール
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          平成レトロなおまけシール風に。集めてコンプリート台紙を作ろう。
        </p>
      </section>

      {/* リング演出(0→100%) */}
      <section className="mt-8 rounded-2xl bg-gradient-to-b from-amber-50 to-white p-5">
        <h2 className="mb-4 text-center text-base font-semibold text-gray-800">
          集めるほど円が埋まる
        </h2>
        <div className="flex flex-wrap items-end justify-center gap-3">
          {STAGES.map((ratio) => (
            <div key={ratio} className="flex flex-col items-center gap-1">
              <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-white">
                {Math.round(ratio * 100)}%
              </span>
              <CollectionProgressRing
                ratio={ratio}
                complete={ratio >= 1}
                imageUrl={characterUrl}
                className="w-20"
              >
                {!characterUrl && ratio >= 1 ? (
                  <span className="text-xs font-bold text-amber-500">完成</span>
                ) : null}
              </CollectionProgressRing>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-gray-500">
          達成するたびに色が増えて、100%でフルカラーに！
        </p>
      </section>

      {/* 遊び方ステップ */}
      <section className="mt-8">
        <h2 className="mb-4 text-base font-semibold text-gray-800">遊び方</h2>
        <ol className="space-y-3">
          {steps.map((s) => (
            <li
              key={s.no}
              className="flex gap-3 rounded-xl border border-gray-200 bg-white p-4"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-white">
                {s.no}
              </span>
              <div>
                <p className="font-medium text-gray-900">{s.title}</p>
                <p className="mt-0.5 text-sm text-gray-600">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 注意・ログイン誘導 */}
      <section className="mt-6 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
        <p>
          ※ 集める・台紙の保存にはログインが必要です（未ログインでも1枚お試し生成できます）。
        </p>
      </section>

      {/* CTA */}
      <section className="mt-8 text-center">
        <Link
          href="/style"
          className="inline-block rounded-full bg-primary px-8 py-3 text-base font-bold text-white hover:opacity-90"
        >
          うちの子で作ってみる
        </Link>
      </section>
    </main>
  );
}
