"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * 「うちの子のファッション雑誌：夏」企画LP。
 *
 * 神コレ(WaferGuide)のポップ路線とは意図的に別方向のエディトリアルデザイン:
 * アイボリーの紙地 × 墨色の明朝/セリフ × 差し色1色(バーントオレンジ)。
 * 誌面の目次・クレジット表記など「雑誌のお作法」をUIの語彙として使う。
 *
 * 期間・賞品などの企画固有値はこのファイル冒頭の定数に集約(終了後の差し替えを1箇所に)。
 */

const CAMPAIGN = {
  issueLabel: "SUMMER ISSUE 2026",
  title: "うちの子のファッション雑誌：夏",
  periodLabel: "8/8(土) 19:00 〜 8/16(日) 21:59",
  pageCount: 8,
  prizeLabel: "Amazonギフト券 2,000円分",
  winnersLabel: "5名様",
  hashtag: "うちの子のファッション雑誌",
  mention: "mickey_fuku",
  rulesPath: "/campaigns/fashion-magazine-lottery",
} as const;

/** 誌面の目次(スタイルプリセット8種と対応)。 */
const CONTENTS: readonly { no: string; label: string; note: string }[] = [
  { no: "P.1", label: "COVER", note: "表紙 — うちの子が今号の顔に" },
  { no: "P.2", label: "OPENING", note: "オープニング・目次ページ" },
  { no: "P.3", label: "MAIN VISUAL", note: "メインファッション・ビジュアル特集" },
  { no: "P.4", label: "DETAILS", note: "衣装・スタイリングのディテール解説" },
  { no: "P.5", label: "STORY", note: "ファッションストーリー特集" },
  { no: "P.6", label: "KEYWORDS", note: "スタイルキーワード特集" },
  { no: "P.7", label: "EDITOR'S NOTE", note: "エディトリアルノート" },
  { no: "P.8", label: "BACK COVER", note: "エンディング・裏表紙" },
];

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      queueMicrotask(() => setShown(true));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(24px)",
        transition: `opacity 800ms ${EASE} ${delay}ms, transform 800ms ${EASE} ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/** 誌面風の区切り線(細線+中央の小さな菱形)。 */
function Rule() {
  return (
    <div className="flex items-center justify-center gap-3" aria-hidden>
      <span className="h-px w-16 bg-stone-300" />
      <span className="h-1.5 w-1.5 rotate-45 bg-stone-400" />
      <span className="h-px w-16 bg-stone-300" />
    </div>
  );
}

export function FashionMagazineGuide() {
  return (
    <div
      className="min-h-screen bg-[#faf8f4] text-[#1c1917]"
      style={{ fontFamily: "'Shippori Mincho', 'Hiragino Mincho ProN', serif" }}
    >
      {/* LP専用フォント。WaferGuide と同じく link で読み込む(サイト全体には影響しない)。
          このLPだけで使う書体のため、_document への追加はしない。 */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Shippori+Mincho:wght@500;600;700&display=swap"
        rel="stylesheet"
      />

      {/* ============ 表紙(ヒーロー) ============ */}
      <header className="px-6 pb-16 pt-10 text-center">
        <Reveal>
          <p
            className="text-[11px] uppercase tracking-[0.5em] text-stone-500"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Persta.AI presents
          </p>
          <h1 className="mx-auto mt-3 max-w-md text-xl font-bold leading-relaxed tracking-wide sm:text-2xl">
            {CAMPAIGN.title}
          </h1>
        </Reveal>

        <Reveal delay={120}>
          <div className="mx-auto mt-6 max-w-md">
            <Image
              src="/collections/fashion-magazine/hero.webp"
              alt={`${CAMPAIGN.title}のメインビジュアル。あなたのうちの子が表紙モデルの雑誌をつくる企画。${CAMPAIGN.prizeLabel}が抽選で${CAMPAIGN.winnersLabel}に当たるキャンペーンを${CAMPAIGN.periodLabel}に開催`}
              width={1000}
              height={1333}
              priority
              sizes="(max-width: 640px) 100vw, 448px"
              className="h-auto w-full rounded-sm shadow-[0_10px_40px_rgba(120,90,40,0.18)]"
            />
          </div>
        </Reveal>

        <Reveal delay={240}>
          <p className="mx-auto mt-6 max-w-sm text-sm leading-loose text-stone-600">
            全{CAMPAIGN.pageCount}ページの誌面を、ぜんぶ「うちの子」で。
            <br />
            表紙から裏表紙まで揃えると、
            <br className="sm:hidden" />
            めくって読める1冊が完成します。
          </p>
          <div className="mt-7">
            <Link
              href="/style"
              className="inline-flex items-center gap-2 bg-[#1c1917] px-10 py-4 text-sm font-bold tracking-[0.2em] text-[#faf8f4] transition-transform hover:-translate-y-0.5"
            >
              誌面づくりをはじめる
            </Link>
          </div>
          <p className="mt-3 text-[11px] text-stone-500">
            開催期間 {CAMPAIGN.periodLabel}
          </p>
        </Reveal>
      </header>

      {/* ============ 目次(できあがるもの) ============ */}
      <section className="px-6 py-14">
        <Reveal>
          <p
            className="text-center text-[11px] uppercase tracking-[0.45em] text-stone-500"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Contents
          </p>
          <h2 className="mt-2 text-center text-xl font-bold tracking-wide">
            今号の誌面構成
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-center text-sm leading-loose text-stone-600">
            {CAMPAIGN.pageCount}
            種類のスタイルが、そのまま雑誌の{CAMPAIGN.pageCount}
            ページに。順番どおりに集めると1冊になります。
          </p>
        </Reveal>

        <div className="mx-auto mt-8 max-w-md border-t border-stone-300">
          {CONTENTS.map((c, i) => (
            <Reveal key={c.no} delay={i * 60}>
              <div className="flex items-baseline gap-4 border-b border-stone-200 py-3.5">
                <span
                  className="w-10 shrink-0 text-sm text-[#c2410c]"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  {c.no}
                </span>
                <span
                  className="shrink-0 text-xs uppercase tracking-[0.2em] text-stone-800"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  {c.label}
                </span>
                <span className="ml-auto text-right text-xs leading-relaxed text-stone-500">
                  {c.note}
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <Rule />

      {/* ============ 作例(表紙・裏表紙) ============ */}
      <section className="overflow-hidden px-6 py-14">
        <Reveal>
          <p
            className="text-center text-[11px] uppercase tracking-[0.45em] text-stone-500"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Sample Pages
          </p>
          <h2 className="mt-2 text-center text-xl font-bold tracking-wide">
            たとえば、こんな1冊に
          </h2>
        </Reveal>

        <div className="mx-auto mt-10 flex max-w-md items-center justify-center gap-4">
          <Reveal delay={100} className="w-1/2">
            <figure>
              <Image
                src="/collections/fashion-magazine/cover-sample.webp"
                alt="表紙の作例。誌名 Persta Style と夏のリゾートを背景にしたモデルの誌面デザイン"
                width={720}
                height={953}
                sizes="(max-width: 640px) 45vw, 210px"
                className="h-auto w-full -rotate-2 rounded-sm shadow-[0_8px_30px_rgba(120,90,40,0.22)]"
              />
              <figcaption className="mt-3 text-center text-[11px] tracking-[0.2em] text-stone-500">
                P.1 表紙
              </figcaption>
            </figure>
          </Reveal>
          <Reveal delay={220} className="w-1/2">
            <figure>
              <Image
                src="/collections/fashion-magazine/back-cover-sample.webp"
                alt="裏表紙の作例。バーコードや奥付が入った雑誌の裏表紙デザイン"
                width={720}
                height={953}
                sizes="(max-width: 640px) 45vw, 210px"
                className="h-auto w-full rotate-2 rounded-sm shadow-[0_8px_30px_rgba(120,90,40,0.22)]"
              />
              <figcaption className="mt-3 text-center text-[11px] tracking-[0.2em] text-stone-500">
                P.8 裏表紙
              </figcaption>
            </figure>
          </Reveal>
        </div>

        <Reveal delay={300}>
          <p className="mx-auto mt-8 max-w-sm text-center text-sm leading-loose text-stone-600">
            表紙も裏表紙も、写真1枚から生成。
            <br />
            モデルはすべて、あなたのうちの子に置き換わります。
          </p>
        </Reveal>
      </section>

      <Rule />

      {/* ============ 遊び方 ============ */}
      <section className="px-6 py-14">
        <Reveal>
          <p
            className="text-center text-[11px] uppercase tracking-[0.45em] text-stone-500"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            How to
          </p>
          <h2 className="mt-2 text-center text-xl font-bold tracking-wide">
            1冊できるまで、3ステップ
          </h2>
        </Reveal>

        <div className="mx-auto mt-10 flex max-w-md flex-col gap-10">
          {[
            {
              step: "01",
              title: "うちの子の写真を1枚えらぶ",
              body: "スタイル画面で写真をアップロード。イラストでも写真でもOKです。",
            },
            {
              step: "02",
              title: "8種類のスタイルで生成する",
              body: "表紙・特集・裏表紙…と、誌面ごとのスタイルが用意されています。1ページずつ、うちの子が誌面の主役になります。",
            },
            {
              step: "03",
              title: "コンプリートで1冊が完成",
              body: "8ページ揃うと、めくって読めるデジタル雑誌ができあがります。完成した雑誌はそのままXでシェアできます。",
            },
          ].map((s, i) => (
            <Reveal key={s.step} delay={i * 100}>
              <div className="flex gap-5">
                <span
                  className="text-4xl font-medium leading-none text-stone-300"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  {s.step}
                </span>
                <div>
                  <h3 className="text-base font-bold tracking-wide">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-loose text-stone-600">
                    {s.body}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <Rule />

      {/* ============ キャンペーン ============ */}
      <section className="px-6 py-14">
        <Reveal>
          <p
            className="text-center text-[11px] uppercase tracking-[0.45em] text-[#c2410c]"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Present
          </p>
          <h2 className="mt-2 text-center text-xl font-bold tracking-wide">
            シェアして応募、抽選でギフト券
          </h2>
        </Reveal>

        <Reveal delay={120}>
          <div className="mx-auto mt-8 max-w-md border border-stone-900 p-6 text-center">
            <p className="text-[10px] tracking-[0.3em] text-stone-500">
              PRIZE
            </p>
            <p className="mt-2 text-2xl font-bold tracking-wide">
              {CAMPAIGN.prizeLabel}
            </p>
            <p className="mt-1 text-sm text-stone-600">
              抽選で <span className="font-bold text-[#c2410c]">{CAMPAIGN.winnersLabel}</span> に
            </p>
          </div>
        </Reveal>

        <div className="mx-auto mt-8 max-w-md">
          <Reveal delay={180}>
            <p className="text-[10px] tracking-[0.3em] text-stone-500">
              ENTRY
            </p>
            <ol className="mt-3 space-y-8 border-l border-stone-300 pl-5">
              <li className="text-sm leading-loose text-stone-700">
                <span className="font-bold text-stone-900">
                  1. 雑誌をコンプリート
                </span>
                <br />
                8ページすべてを生成して、1冊を完成させます。
                <span className="mt-3 block">
                  <Image
                    src="/collections/fashion-magazine/entry-step1.webp"
                    alt="コンプリート直後の画面。「シェアページへ」ボタンが表示される"
                    width={640}
                    height={1043}
                    sizes="(max-width: 640px) 60vw, 230px"
                    className="mx-auto h-auto w-full max-w-[230px] rounded-lg border border-stone-200 shadow-[0_6px_24px_rgba(120,90,40,0.16)]"
                  />
                  <span className="mt-2 block text-center text-[11px] tracking-wide text-stone-500">
                    コンプリートすると、この画面が出ます
                  </span>
                </span>
              </li>
              <li className="text-sm leading-loose text-stone-700">
                <span className="font-bold text-stone-900">
                  2. 完成した雑誌をXで公開ポスト
                </span>
                <br />
                完成ページの「Xで応募する」ボタンから投稿すると、応募に必要な「
                <span className="font-bold">@{CAMPAIGN.mention}</span> のメンション」と「
                <span className="font-bold">#{CAMPAIGN.hashtag}</span>
                」が自動で入ります。
                <span className="mt-3 block">
                  <Image
                    src="/collections/fashion-magazine/entry-step2.webp"
                    alt="シェアページの「Xで応募する」ボタン。選択すると必要な情報が入った状態で投稿できる"
                    width={645}
                    height={1064}
                    sizes="(max-width: 640px) 60vw, 230px"
                    className="mx-auto h-auto w-full max-w-[230px] rounded-lg border border-stone-200 shadow-[0_6px_24px_rgba(120,90,40,0.16)]"
                  />
                  <span className="mt-2 block text-center text-[11px] tracking-wide text-stone-500">
                    シェアページの「Xで応募する」から投稿
                  </span>
                </span>
              </li>
              <li className="text-sm leading-loose text-stone-700">
                <span className="font-bold text-stone-900">
                  3. @{CAMPAIGN.mention} をフォロー
                </span>
                <br />
                当選のご連絡をXのDMでお送りするため、フォローをお願いしています(フォロー外だとDMが届かない設定の方が多いためです)。
                <span className="mt-4 flex flex-col items-center gap-2.5 border border-stone-200 bg-white/60 px-5 py-5">
                  <Image
                    src="/collections/fashion-magazine/mikifuku-icon.webp"
                    alt="@mickey_fuku のアイコン"
                    width={160}
                    height={160}
                    className="h-16 w-16 rounded-full border border-stone-300 object-cover shadow-sm"
                  />
                  <span className="text-sm font-bold text-stone-900">
                    みきふく | Persta.AI
                  </span>
                  <a
                    href={`https://x.com/${CAMPAIGN.mention}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#1d1d1f] px-4 py-2 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden
                      className="h-3.5 w-3.5"
                    >
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    @{CAMPAIGN.mention}
                  </a>
                </span>
              </li>
            </ol>
          </Reveal>

          <Reveal delay={260}>
            <div className="mt-6 border-t border-stone-200 pt-4 text-xs leading-relaxed text-stone-500">
              <p>
                応募期間: {CAMPAIGN.periodLabel} ／
                応募は無料です。ペルコインの購入有無は当選確率に影響しません。
              </p>
              <p className="mt-2">
                <Link
                  href={CAMPAIGN.rulesPath}
                  className="underline hover:text-stone-700"
                >
                  応募規約・注意事項の全文をみる
                </Link>
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 締めのCTA ============ */}
      <section className="px-6 pb-20 pt-10 text-center">
        <Reveal>
          <Rule />
          <p
            className="mt-10 text-3xl font-medium leading-snug"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Your model,
            <br />
            your magazine.
          </p>
          <p className="mt-4 text-sm leading-loose text-stone-600">
            今号の表紙を飾るのは、あなたのうちの子です。
          </p>
          <div className="mt-8">
            <Link
              href="/style"
              className="inline-flex items-center gap-2 bg-[#1c1917] px-10 py-4 text-sm font-bold tracking-[0.2em] text-[#faf8f4] transition-transform hover:-translate-y-0.5"
            >
              誌面づくりをはじめる
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
