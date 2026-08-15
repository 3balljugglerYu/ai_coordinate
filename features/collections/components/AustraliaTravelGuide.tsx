"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* eslint-disable @next/next/no-page-custom-font -- 日本語の動的サブセットを使うため意図的に <link> で読み込む */

// うちの子のオーストラリア旅行(book / sequential / 全8種)の遊び方ページ。
// イタリア旅行(ItalyTravelGuide)と同じ構成・トーンを踏襲しつつ、
// 赤い大地(オーカー)と海の青(グレートバリアリーフ)の世界観に寄せる。
//
// イタリアとの最大の違い: 10日間の旅程を8枚に集約しているため、
// **Day 番号とページ番号が 1 対 1 ではない**(Day1-2 / Day6-7 / Day8-9 が2日分で1枚)。
// そのため Day ラベルは index から計算せず PAGES 定数で持つ。

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const HEADING_FONT = "'Zen Maru Gothic', system-ui, sans-serif";

// アクセント: ウルルの赤土 / グレートバリアリーフの海
const AU_OCHRE = "#C2551F";
const AU_OCEAN = "#0F7FA8";

/**
 * 中身ページ(表紙を除く7枚)の Day ラベルと英字タイトル。
 *
 * DB のプリセット名は運用の並べ替え用に「2_青い海から始まる旅」のような
 * 数字プレフィックスが付くため、表示用の情報はここで持つ。
 * 並びは style_presets.sort_order 昇順(表紙の次から)と一致させること。
 */
const PAGES: { day: string; en: string }[] = [
  { day: "Day 1-2", en: "Cairns & Great Barrier Reef" },
  { day: "Day 3", en: "Daintree Rainforest" },
  { day: "Day 4", en: "Uluru Night" },
  { day: "Day 5", en: "Uluru & Kata Tjuta" },
  { day: "Day 6-7", en: "Hello, Sydney !!" },
  { day: "Day 8-9", en: "Sydney Adventure" },
  { day: "Day 10", en: "See You Again, Australia" },
];

/**
 * Xシェア抽選の表示値。
 * 実際の応募ボタンの文面は features/campaigns/x-lottery-campaign.ts が正本なので、
 * 賞品・人数・タグを変えるときは**両方**を揃えること。
 */
const LOTTERY = {
  prizeLabel: "Amazonギフト券 2,000円分",
  winnersLabel: "5名様",
  hashtags: ["うちの子のオーストラリア旅行", "PerstaAI"],
  /** 主催(当選連絡のDM送信元)。応募ポストのメンション先でもある。 */
  mention: "mickey_fuku",
  /** コラボ相手。今回はこちらもフォローを応募条件にしている。 */
  collaborator: "kyouchanlio",
  periodLabel: "8/22(土) 8:00 〜 8/30(日) 21:59",
  rulesPath: "/campaigns/australia-lottery",
} as const;

/** 「2_青い海から始まる旅」→「青い海から始まる旅」。運用用の数字プレフィックスを落とす。 */
function stripOrderPrefix(title: string): string {
  return title.replace(/^\d+[_.\-\s]\s*/, "");
}

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
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
        transform: shown ? "none" : "translateY(28px)",
        transition: `opacity 900ms ${EASE} ${delay}ms, transform 900ms ${EASE} ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * 赤い大地 → 白 → 海の青 の細いリボン。
 * イタリアは国旗の3色を使ったが、豪州国旗は3分割にできないため
 * 企画のモチーフ(赤い大地と青い海)を帯にしている。
 */
function OutbackRibbon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-1.5 w-16 overflow-hidden rounded-full ${className ?? ""}`}
    >
      <span className="h-full flex-1" style={{ background: AU_OCHRE }} />
      <span className="h-full flex-1 bg-white" />
      <span className="h-full flex-1" style={{ background: AU_OCEAN }} />
    </span>
  );
}

/** X(旧Twitter)プロフィールへのリンクボタン。 */
function XLink({ handle, url }: { handle: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full bg-[#1d1d1f] px-3 py-1.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      {handle}
    </a>
  );
}

interface GuidePreset {
  id: string;
  title: string;
  thumbnailImageUrl: string;
}

export function AustraliaTravelGuide({
  threshold,
  presets,
}: {
  threshold: number;
  presets: GuidePreset[];
}) {
  // 先頭 = 表紙(旅のはじまり)。残り = 中身(Day1-2 〜 Day10)。
  const cover = presets[0] ?? null;
  const days = presets.slice(1);

  const steps: { n: string; t: string; b: string }[] = [
    {
      n: "01",
      t: "表紙「旅のはじまり」を生成",
      b: "まずは旅のはじまり。One-Tap Style で「いざ、オーストラリアへ！」を選んで、うちの子の旅行日記の表紙をつくろう。",
    },
    {
      n: "02",
      t: "1ページずつ解放されていく",
      b: "生成するたびに、次のページがひらきます。ケアンズの海 → 熱帯雨林 → ウルル → シドニーと、旅が進んでいきます。",
    },
    {
      n: "03",
      t: `全${threshold}種そろえてコンプリート`,
      b: "表紙とすべてのページをそろえると、10日間の旅の記録がコンプリート！",
    },
    {
      n: "04",
      t: "めくれる旅行日記が完成",
      b: "完成すると、1ページずつ“めくれる”旅行日記(本)に。そのままシェアして旅の思い出を自慢しよう！",
    },
  ];

  return (
    <main className="overflow-x-hidden bg-[#FBF5E9] text-[#5b4b3a]">
      <style>{`
        @keyframes au-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-9px) } }
        .au-float { animation: au-float 7s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){ .au-float { animation:none } }
      `}</style>
      <link
        href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700&display=swap"
        rel="stylesheet"
      />

      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden px-6 pb-14 pt-12 text-center">
        <Reveal>
          <span
            className="inline-flex items-center gap-2 rounded-full border-2 border-dashed px-4 py-1 text-xs font-bold"
            style={{
              borderColor: AU_OCHRE,
              color: AU_OCHRE,
              background: "rgba(255,255,255,0.7)",
              fontFamily: HEADING_FONT,
            }}
          >
            🇦🇺 全{threshold}種 ✦ うちの子のオーストラリア旅行
          </span>
        </Reveal>
        <Reveal delay={100}>
          <h1
            className="mt-5 text-3xl leading-[1.4] sm:text-4xl"
            style={{
              fontFamily: HEADING_FONT,
              background: `linear-gradient(90deg, ${AU_OCHRE}, #b08d57, ${AU_OCEAN})`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            うちの子の
            <br />
            オーストラリア旅行
          </h1>
        </Reveal>
        <Reveal delay={180}>
          <div className="mt-4 flex justify-center">
            <OutbackRibbon />
          </div>
        </Reveal>

        {/* 会期(切符風) */}
        <Reveal delay={210}>
          <div
            className="mx-auto mt-6 w-full max-w-[330px] rounded-2xl border-2 border-dashed bg-white/75 px-5 py-3 text-center shadow-[0_4px_14px_rgba(120,90,50,0.10)]"
            style={{ borderColor: AU_OCHRE }}
          >
            <div
              className="text-[11px] font-bold tracking-[0.22em]"
              style={{ color: AU_OCEAN, fontFamily: HEADING_FONT }}
            >
              ✦ コラボ期間 ✦
            </div>
            <div
              className="mt-1 flex items-center justify-center gap-2 whitespace-nowrap text-[15px] font-bold leading-snug text-[#5b4a36]"
              style={{ fontFamily: HEADING_FONT }}
            >
              <span>
                2026/8/22
                <span className="text-[11px] font-medium text-[#9a8a78]">(土)</span>{" "}
                8:00
              </span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke={AU_OCHRE}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="h-4 w-4 shrink-0"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <span>
                8/30
                <span className="text-[11px] font-medium text-[#9a8a78]">(日)</span>{" "}
                21:59
              </span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={240}>
          <p className="mt-4 text-sm leading-loose text-[#7a6a58]">
            うちの子と、オーストラリアをめぐる10日間。
            <br />
            1ページずつあつめて、めくれる旅行日記を完成させよう。
          </p>
        </Reveal>

        {/* 表紙プレビュー(旅のはじまり) */}
        {cover ? (
          <Reveal delay={300}>
            <div className="mx-auto mt-8 w-full max-w-[260px]">
              <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-[#e3d4b5] bg-white shadow-[0_8px_24px_rgba(120,90,50,0.16)]">
                <Image
                  src={cover.thumbnailImageUrl}
                  alt="表紙「旅のはじまり」のサンプル"
                  fill
                  sizes="(max-width: 480px) 70vw, 260px"
                  className="object-cover"
                />
                <span
                  className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow"
                  style={{ background: AU_OCHRE }}
                >
                  表紙 ・ 旅のはじまり
                </span>
              </div>
              <p className="mt-2 text-xs text-[#9a8a78]">＼ 10日間のわくわく旅日記 ／</p>
            </div>
          </Reveal>
        ) : null}

        <Reveal delay={380}>
          <Link
            href="/style"
            className="mt-9 inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-base font-bold text-white shadow-[0_5px_0_rgba(194,85,31,0.3)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
            style={{ background: AU_OCHRE, fontFamily: HEADING_FONT }}
          >
            いますぐはじめる
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <p className="mt-3 text-xs text-[#9a8a78]">
            企画がスタートしたら対象の「オーストラリア旅行」シリーズが表示されます！
          </p>
        </Reveal>
      </section>

      {/* ===== コラボ クレジット ===== */}
      <section className="px-6 pb-6">
        <Reveal>
          <div
            className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border bg-white/80 px-5 py-4 text-center"
            style={{ borderColor: "rgba(194,85,31,0.3)" }}
          >
            <span
              className="text-xs font-bold tracking-[0.2em]"
              style={{ color: AU_OCHRE, fontFamily: HEADING_FONT }}
            >
              ✦ COLLABORATION ✦
            </span>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-[#9a8a78]">旅行企画案・監修</span>
                <Image
                  src="/collections/italy/user-icons/chanlio-icon.jpeg"
                  alt="@kyouchanlio のアイコン"
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-full border border-[#f0d8c4] object-cover shadow-sm"
                />
                <XLink handle="@kyouchanlio" url="https://x.com/kyouchanlio" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-[#9a8a78]">企画・主催</span>
                <Image
                  src="/collections/wafer/user-icons/mikifuku-icon.webp"
                  alt="@mickey_fuku のアイコン"
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-full border border-[#f0d8c4] object-cover shadow-sm"
                />
                <XLink handle="@mickey_fuku" url="https://x.com/mickey_fuku" />
              </div>
            </div>
            <span className="text-xs font-bold" style={{ color: AU_OCHRE }}>
              フォローしてね！いいことあるかも！
            </span>
          </div>
        </Reveal>
      </section>

      {/* ===== あつめるページたち ===== */}
      {days.length > 0 ? (
        <section className="bg-white/70 px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <Reveal>
              <h2 className="text-center text-2xl text-[#4a3b2c]" style={{ fontFamily: HEADING_FONT }}>
                あつめる、10日間の旅
              </h2>
            </Reveal>
            <Reveal delay={100}>
              <p className="mt-2 text-center text-sm text-[#7a6a58]">
                表紙のあと、順番に解放されます。1ページずつめくる楽しみを。
              </p>
            </Reveal>

            <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {days.map((d, i) => {
                const page = PAGES[i];
                return (
                  <Reveal key={d.id} delay={i * 70}>
                    <div className="relative rounded-2xl border border-[#ecdcc0] bg-white p-3 shadow-[0_6px_18px_rgba(120,90,50,0.08)]">
                      <span
                        className="absolute -top-2 left-1/2 h-5 w-16 -translate-x-1/2 -rotate-3 rounded-sm"
                        style={{ background: "rgba(194,85,31,0.18)" }}
                        aria-hidden
                      />
                      <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-[#e3d4b5] bg-[#faf3e6]">
                        <Image
                          src={d.thumbnailImageUrl}
                          alt={stripOrderPrefix(d.title)}
                          fill
                          sizes="(max-width: 640px) 44vw, 200px"
                          className="object-cover"
                        />
                      </div>
                      <p
                        className="mt-3 text-center text-xs font-bold tracking-widest"
                        style={{ color: AU_OCHRE }}
                      >
                        {page?.day ?? `Page ${i + 2}`}
                      </p>
                      {/* イタリアは「Day1 旅行日記」と短かったが、こちらは
                          「またいつか、オーストラリアへ」等が入るので2行まで許す。 */}
                      <p
                        className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-center text-sm leading-tight text-[#4a3b2c]"
                        style={{ fontFamily: HEADING_FONT }}
                      >
                        {stripOrderPrefix(d.title)}
                      </p>
                      {page ? (
                        <p className="mt-0.5 line-clamp-1 text-center text-[10px] tracking-wide text-[#9a8a78]">
                          {page.en}
                        </p>
                      ) : null}
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* ===== シェアして応募(Xシェア抽選) ===== */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-md">
          <Reveal>
            <p
              className="text-center text-[11px] font-bold uppercase tracking-[0.45em]"
              style={{ color: AU_OCEAN }}
            >
              Present
            </p>
            <h2
              className="mt-2 text-center text-2xl text-[#4a3b2c]"
              style={{ fontFamily: HEADING_FONT }}
            >
              シェアして応募、抽選でギフト券
            </h2>
          </Reveal>

          <Reveal delay={120}>
            <div
              className="mx-auto mt-8 rounded-2xl border-2 border-dashed bg-white/80 p-6 text-center"
              style={{ borderColor: AU_OCHRE }}
            >
              <p className="text-[10px] font-bold tracking-[0.3em] text-[#9a8a78]">
                PRIZE
              </p>
              <p
                className="mt-2 text-2xl font-bold text-[#4a3b2c]"
                style={{ fontFamily: HEADING_FONT }}
              >
                {LOTTERY.prizeLabel}
              </p>
              <p className="mt-1 text-sm text-[#7a6a58]">
                抽選で{" "}
                <span className="font-bold" style={{ color: AU_OCHRE }}>
                  {LOTTERY.winnersLabel}
                </span>{" "}
                に
              </p>
            </div>
          </Reveal>

          <Reveal delay={180}>
            <p className="mt-8 text-[10px] font-bold tracking-[0.3em] text-[#9a8a78]">
              ENTRY
            </p>
            <ol className="mt-3 space-y-7 border-l border-[#e3d4b5] pl-5">
              <li className="text-sm leading-loose text-[#7a6a58]">
                <span className="font-bold text-[#4a3b2c]">
                  1. 旅行日記をコンプリート
                </span>
                <br />
                表紙から最終ページまで全8種を生成して、めくれる旅行日記を完成させます。
                <span className="mt-3 block">
                  <Image
                    src="/collections/australia/entry-step1.webp"
                    alt="コンプリート直後の画面。「シェアページへ」ボタンが表示される"
                    width={640}
                    height={1043}
                    sizes="(max-width: 640px) 60vw, 230px"
                    className="mx-auto h-auto w-full max-w-[230px] rounded-lg border border-[#ecdcc0] shadow-[0_6px_24px_rgba(120,90,40,0.16)]"
                  />
                  <span className="mt-2 block text-center text-[11px] tracking-wide text-[#9a8a78]">
                    コンプリートすると、この画面が出ます
                  </span>
                </span>
              </li>
              <li className="text-sm leading-loose text-[#7a6a58]">
                <span className="font-bold text-[#4a3b2c]">
                  2. 完成した日記をXで公開ポスト
                </span>
                <br />
                応募ポストに必要なものは、次の4つです。
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    この企画で生成したイラスト
                    <span className="font-bold">1枚以上</span>
                    （8種のうちどれでもOK）
                  </li>
                  <li>完成ページのシェアURL</li>
                  <li>
                    <span className="font-bold">@{LOTTERY.mention}</span>{" "}
                    のメンション
                  </li>
                  <li>
                    <span className="font-bold">
                      {LOTTERY.hashtags.map((h) => `#${h}`).join(" ")}
                    </span>{" "}
                    のハッシュタグ
                  </li>
                </ul>
                <p className="mt-2">
                  「Xで応募する」ボタンを使うと、シェアURL・メンション・ハッシュタグの3つは自動で入ります。
                  <span className="font-bold text-[#4a3b2c]">
                    イラストは自動では添付されないため、投稿画面でお好きな1枚を添付してください。
                  </span>
                </p>
                <span className="mt-3 block">
                  <Image
                    src="/collections/australia/entry-step2.webp"
                    alt="シェアページの「Xで応募する」ボタン。選択すると必要な情報が入った状態で投稿できる"
                    width={645}
                    height={1064}
                    sizes="(max-width: 640px) 60vw, 230px"
                    className="mx-auto h-auto w-full max-w-[230px] rounded-lg border border-[#ecdcc0] shadow-[0_6px_24px_rgba(120,90,40,0.16)]"
                  />
                  <span className="mt-2 block text-center text-[11px] tracking-wide text-[#9a8a78]">
                    シェアページの「Xで応募する」から投稿
                  </span>
                </span>
              </li>
              <li className="text-sm leading-loose text-[#7a6a58]">
                <span className="font-bold text-[#4a3b2c]">
                  3. 2つのアカウントをフォロー
                </span>
                <br />
                当選のご連絡をXのDMでお送りするため、主催の {`@${LOTTERY.mention}`}{" "}
                のフォローをお願いしています(フォロー外だとDMが届かない設定の方が多いためです)。
                あわせて、企画を一緒につくった {`@${LOTTERY.collaborator}`} さんもフォローしてください。
                <span className="mt-4 grid grid-cols-2 gap-3">
                  {[
                    {
                      role: "企画・主催",
                      handle: LOTTERY.mention,
                      icon: "/collections/wafer/user-icons/mikifuku-icon.webp",
                    },
                    {
                      role: "旅行企画案・監修",
                      handle: LOTTERY.collaborator,
                      icon: "/collections/italy/user-icons/chanlio-icon.jpeg",
                    },
                  ].map((account) => (
                    <span
                      key={account.handle}
                      className="flex flex-col items-center gap-2 rounded-2xl border border-[#ecdcc0] bg-white/70 px-3 py-4 text-center"
                    >
                      <span className="text-[11px] text-[#9a8a78]">
                        {account.role}
                      </span>
                      <Image
                        src={account.icon}
                        alt={`@${account.handle} のアイコン`}
                        width={64}
                        height={64}
                        className="h-14 w-14 rounded-full border border-[#f0d8c4] object-cover shadow-sm"
                      />
                      <XLink
                        handle={`@${account.handle}`}
                        url={`https://x.com/${account.handle}`}
                      />
                    </span>
                  ))}
                </span>
              </li>
            </ol>
          </Reveal>

          <Reveal delay={260}>
            <div className="mt-6 border-t border-[#ecdcc0] pt-4 text-xs leading-relaxed text-[#9a8a78]">
              <p>
                応募期間: {LOTTERY.periodLabel} ／ 応募は無料です。
                ペルコインの購入有無は当選確率に影響しません。
              </p>
              <p className="mt-2">
                抽選と当選のご連絡は、企画終了後
                <span className="font-bold">約1週間を目処</span>
                に、XのDMで行います。
              </p>
              <p className="mt-2">
                <Link
                  href={LOTTERY.rulesPath}
                  className="underline underline-offset-2 hover:text-[#7a6a58]"
                >
                  応募規約・注意事項の全文をみる
                </Link>
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== あそびかた ===== */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <h2 className="text-center text-2xl text-[#4a3b2c]" style={{ fontFamily: HEADING_FONT }}>
              あそびかた
            </h2>
          </Reveal>
          <div className="mt-10 space-y-4">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 80}>
                <div className="flex items-start gap-4 rounded-3xl border border-[#ecdcc0] bg-white/80 p-5">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg text-white"
                    style={{ background: AU_OCHRE, fontFamily: HEADING_FONT }}
                  >
                    {s.n}
                  </span>
                  <div>
                    <p className="text-lg text-[#4a3b2c]" style={{ fontFamily: HEADING_FONT }}>
                      {s.t}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[#7a6a58]">{s.b}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="bg-white/70 px-6 pb-20 pt-14 text-center">
        <Reveal>
          <div className="mx-auto flex justify-center">
            <OutbackRibbon />
          </div>
        </Reveal>
        <Reveal delay={70}>
          <p
            className="mx-auto mb-6 mt-5 max-w-md text-base font-bold"
            style={{ color: AU_OCHRE, fontFamily: HEADING_FONT }}
          >
            うちの子の旅行日記、つくってシェアしよう！
          </p>
        </Reveal>
        <Reveal delay={140}>
          <Link
            href="/style"
            className="inline-flex items-center gap-2 rounded-full px-10 py-4 text-lg font-bold text-white shadow-[0_5px_0_rgba(194,85,31,0.3)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
            style={{ background: AU_OCHRE, fontFamily: HEADING_FONT }}
          >
            いますぐはじめる
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </Reveal>
        <Reveal delay={100}>
          <p className="mx-auto mt-6 max-w-sm text-xs leading-relaxed text-[#9a8a78]">
            ※ あつめる・日記の保存にはログインが必要です。
          </p>
        </Reveal>
      </section>

      {/* ===== クリエイター相談(控えめなフッターリンク) ===== */}
      <div className="px-6 pb-10 text-center">
        <Link
          href="/creators"
          className="text-xs text-[#b3a794] underline underline-offset-2 transition-colors hover:text-[#8a7c66]"
        >
          コラボご希望の方・プロンプト掲載のご相談はこちら ›
        </Link>
      </div>
    </main>
  );
}
