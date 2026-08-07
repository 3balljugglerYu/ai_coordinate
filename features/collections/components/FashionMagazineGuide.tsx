"use client";

import { useEffect, useRef, useState } from "react";
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
      {/* LP専用フォント。WaferGuide と同じく link で読み込む(サイト全体には影響しない) */}
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Shippori+Mincho:wght@500;600;700&display=swap"
        rel="stylesheet"
      />

      {/* ============ 表紙(ヒーロー) ============ */}
      <header className="relative overflow-hidden px-6 pb-16 pt-14 text-center">
        {/* 誌面の外枠 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-3 border border-stone-300 sm:inset-5"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-4 border border-stone-200 sm:inset-6"
        />

        <Reveal>
          <p
            className="text-[11px] uppercase tracking-[0.5em] text-stone-500"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Persta.AI presents
          </p>
          <p
            className="mt-6 text-5xl font-semibold leading-none tracking-tight sm:text-6xl"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            SUMMER
            <br />
            ISSUE
          </p>
          <p className="mt-2 text-[11px] tracking-[0.35em] text-[#c2410c]">
            {CAMPAIGN.issueLabel}
          </p>
        </Reveal>

        <Reveal delay={150}>
          <h1 className="mx-auto mt-8 max-w-md text-2xl font-bold leading-relaxed tracking-wide sm:text-3xl">
            {CAMPAIGN.title}
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-loose text-stone-600">
            全{CAMPAIGN.pageCount}ページの誌面を、ぜんぶ「うちの子」で。
            <br />
            表紙から裏表紙まで揃えると、
            <br className="sm:hidden" />
            めくって読める1冊が完成します。
          </p>
        </Reveal>

        <Reveal delay={300}>
          <div className="mt-8 inline-flex flex-col items-center gap-1 border-y border-stone-300 px-8 py-3">
            <p className="text-[10px] tracking-[0.3em] text-stone-500">
              開催期間
            </p>
            <p className="text-base font-bold tracking-wider">
              {CAMPAIGN.periodLabel}
            </p>
          </div>
          <div className="mt-8">
            <Link
              href="/style"
              className="inline-flex items-center gap-2 bg-[#1c1917] px-10 py-4 text-sm font-bold tracking-[0.2em] text-[#faf8f4] transition-transform hover:-translate-y-0.5"
            >
              誌面づくりをはじめる
            </Link>
          </div>
          <p className="mt-3 text-[11px] text-stone-500">
            Xシェアで {CAMPAIGN.prizeLabel} が抽選で{CAMPAIGN.winnersLabel}に
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
            <ol className="mt-3 space-y-4 border-l border-stone-300 pl-5">
              <li className="text-sm leading-loose text-stone-700">
                <span className="font-bold text-stone-900">
                  1. 雑誌をコンプリート
                </span>
                <br />
                8ページすべてを生成して、1冊を完成させます。
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
              </li>
              <li className="text-sm leading-loose text-stone-700">
                <span className="font-bold text-stone-900">
                  3. @{CAMPAIGN.mention} をフォロー
                </span>
                <br />
                当選のご連絡をXのDMでお送りするため、フォローをお願いしています(フォロー外だとDMが届かない設定の方が多いためです)。
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
