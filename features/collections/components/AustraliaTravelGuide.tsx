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
 * 背景は「旅程の順」に色が変わる。
 *
 * 全面ベージュだと単調で、しかも8枚が“旅”であることがページから伝わらない。
 * 観光素材を散りばめる案もあったが、プリセット画像自体が
 * 「写真4枚＋マステ＋切手＋手書きメモ」の高密度コラージュなので、
 * 装飾を足すと主役と competing して安く見える。背景色で語る方を選んだ。
 *
 *   ヒーロー   海の青   ケアンズ / グレートバリアリーフ
 *   一覧(上)   森の緑   デインツリー熱帯雨林
 *   一覧(下)   赤い大地 ウルル / カタ・ジュタ
 *   応募       港の青   シドニー
 *   CTA        夕焼け   帰国「またいつか」
 *
 * 隣り合うセクションの端の色を合わせて、境目が出ないようにしている。
 * サムネが主役なので、いずれも彩度を落とした淡い色に留める。
 */
const BG = {
  sea: "#CDECF7",
  cream: "#FFF8EC",
  forest: "#D9F0D6",
  ochre: "#FFE3CB",
  harbour: "#D6EAFA",
  sunset: "#FFE6CE",
} as const;

const HERO_SP = "/collections/australia/hero-sp.webp";
const HERO_PC = "/collections/australia/hero-pc.webp";

/**
 * 企画のキービジュアル。
 *
 * 縦長(スマホ 1024x1536)と横長(PC 1536x1024)を <picture> の media で出し分ける
 * (next/image はアートディレクション非対応で、CSS 出し分けだと両方
 * ダウンロードされうるため素の picture を使う。creator-rewards と同じ作法)。
 *
 * creator-rewards と違い、**タイトルは画像に焼き込まれている**ので HTML では重ねない。
 * 見出しは h1 として持つが視覚的には隠し、読み上げと SEO だけで拾う。
 */
function HeroVisual() {
  return (
    <div className="relative w-full">
      <picture>
        <source media="(min-width: 640px)" srcSet={HERO_PC} width={1536} height={1024} />
        <img
          src={HERO_SP}
          alt="うちの子のオーストラリア旅行 旅のはじまり — ケアンズ、デインツリー熱帯雨林、ウルル、シドニー、ブルーマウンテンズをめぐる10日間のわくわく旅日記"
          width={1024}
          height={1536}
          fetchPriority="high"
          className="block w-full"
        />
      </picture>
    </div>
  );
}

/** 背景モチーフ共通の props。style はアニメーションの遅延をずらすのに使う。 */
interface MotifProps {
  className?: string;
  style?: React.CSSProperties;
}

/** 波(ケアンズ・グレートバリアリーフ)。 */
function WaveMotif({ className, style }: MotifProps) {
  return (
    <svg viewBox="0 0 400 120" aria-hidden className={className} style={style} fill="none">
      <path
        d="M0 60c40-30 80-30 120 0s80 30 120 0 80-30 120 0 80 30 120 0"
        stroke={AU_OCEAN}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M0 95c40-30 80-30 120 0s80 30 120 0 80-30 120 0 80 30 120 0"
        stroke={AU_OCEAN}
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** ユーカリの枝(デインツリー熱帯雨林)。 */
function EucalyptusMotif({ className, style }: MotifProps) {
  return (
    <svg viewBox="0 0 200 260" aria-hidden className={className} style={style}>
      <path
        d="M100 255V25"
        stroke="#2F6B3A"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {[0, 1, 2, 3, 4].map((i) => {
        const y = 45 + i * 42;
        return (
          <g key={i}>
            <ellipse cx="66" cy={y} rx="34" ry="16" fill="#2F6B3A" transform={`rotate(-24 66 ${y})`} />
            <ellipse cx="134" cy={y + 20} rx="34" ry="16" fill="#2F6B3A" transform={`rotate(24 134 ${y + 20})`} />
          </g>
        );
      })}
    </svg>
  );
}

/** ウルルのシルエット(赤い大地)。 */
function UluruMotif({ className, style }: MotifProps) {
  return (
    <svg viewBox="0 0 480 180" aria-hidden className={className} style={style}>
      <path
        d="M0 180c18-14 44-52 78-74 30-20 66-34 118-36 62-3 108 10 146 30 34 18 78 58 100 80 8 8 22 0 38 0v0H0z"
        fill={AU_OCHRE}
      />
    </svg>
  );
}

/** 南十字星(星降る夜のウルル)。 */
function SouthernCrossMotif({ className, style }: MotifProps) {
  const stars: { x: number; y: number; r: number }[] = [
    { x: 100, y: 18, r: 9 },
    { x: 118, y: 92, r: 13 },
    { x: 46, y: 74, r: 8 },
    { x: 150, y: 138, r: 7 },
    { x: 92, y: 176, r: 11 },
  ];
  return (
    <svg viewBox="0 0 200 200" aria-hidden className={className} style={style}>
      {stars.map((s) => (
        <circle key={`${s.x}-${s.y}`} cx={s.x} cy={s.y} r={s.r} fill={AU_OCEAN} />
      ))}
    </svg>
  );
}

/** キラキラ(4方向に伸びる星)。ポップさの主役なので彩度は落とさない。 */
function Sparkle({ className, style }: MotifProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} style={style} fill="currentColor">
      <path d="M12 0c.6 5.6 5.8 10.8 12 12-6.2 1.2-11.4 6.4-12 12-.6-5.6-5.8-10.8-12-12C6.2 10.8 11.4 5.6 12 0z" />
    </svg>
  );
}

/** 紙飛行機(旅立ち)。点線の航路とセットで使う。 */
function PlaneMotif({ className, style }: MotifProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={className} style={style} fill="currentColor">
      <path d="M45 4 3 22l14 5 4 15 6-10 12 10z" />
    </svg>
  );
}

/** カンガルーのシルエット。 */
function KangarooMotif({ className, style }: MotifProps) {
  return (
    <svg viewBox="0 0 120 140" aria-hidden className={className} style={style} fill="currentColor">
      <path d="M74 12c5-6 12-8 15-3 3 4 0 10-4 14 6 8 8 18 6 28-2 9-8 16-8 24 0 7 6 12 14 16 5 3 3 9-3 9H62c-6 0-9-4-9-9 0-8-4-13-11-18-9-6-16-14-16-25 0-8 4-15 10-20l-16-6c-5-2-4-8 2-8l24 1c6-5 14-7 22-6 2-6 4-11 6-14z" />
    </svg>
  );
}

/** ハーバーブリッジのアーチ(シドニー)。 */
function HarbourArchMotif({ className, style }: MotifProps) {
  return (
    <svg viewBox="0 0 420 180" aria-hidden className={className} style={style} fill="none">
      <path d="M10 165h400" stroke={AU_OCEAN} strokeWidth="7" strokeLinecap="round" />
      <path
        d="M28 165C28 78 106 28 210 28s182 50 182 137"
        stroke={AU_OCEAN}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path d="M78 165V96M140 165V56M210 165V32M280 165V56M342 165V96" stroke={AU_OCEAN} strokeWidth="5" />
    </svg>
  );
}

/**
 * あつめる全8枚(表紙 + 中身7枚)の Day ラベルと英字タイトル。
 *
 * 当初はヒーロー画像が表紙そのものだったため一覧から表紙を外していたが、
 * ヒーローをコラボのキービジュアル(2人)へ差し替えて表紙と別物になったので、
 * 表紙もあつめる対象として並べる。これで一覧の枚数が completion_threshold(8) と揃う。
 *
 * DB のプリセット名は運用の並べ替え用に「2_青い海から始まる旅」のような
 * 数字プレフィックスが付くため、表示用の情報はここで持つ。
 * 並びは style_presets.sort_order 昇順(表紙から)と一致させること。
 */
const PAGES: { day: string; en: string }[] = [
  { day: "表紙", en: "The Journey Begins" },
  { day: "Day 1-2", en: "Cairns & Great Barrier Reef" },
  { day: "Day 3", en: "Daintree Rainforest" },
  { day: "Day 4", en: "Uluru Night" },
  { day: "Day 5", en: "Uluru & Kata Tjuta" },
  { day: "Day 6-7", en: "Hello, Sydney !!" },
  { day: "Day 8-9", en: "Sydney Adventure" },
  { day: "Day 10", en: "See You Again, Australia" },
];

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
  // 表紙(旅のはじまり)を含む全8枚をグリッドに並べる。
  // ヒーローはコラボのキービジュアルで表紙とは別物なので、表紙もここで見せる。
  const pages = presets;

  const steps: { n: string; t: string; b: string }[] = [
    {
      n: "01",
      t: "表紙「旅のはじまり」を生成",
      b: "まずは旅のはじまり。One-Tap Style で「うちの子のオーストラリア旅行」を選んで、うちの子の旅行日記の表紙をつくろう。",
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
    <main className="overflow-x-hidden text-[#5b4b3a]" style={{ background: BG.cream }}>
      <style>{`
        @keyframes au-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
        .au-float { animation: au-float 6s ease-in-out infinite; }
        @keyframes au-twinkle { 0%,100% { opacity:.35; transform: scale(.85) rotate(0deg) } 50% { opacity:1; transform: scale(1.15) rotate(20deg) } }
        .au-twinkle { animation: au-twinkle 3.2s ease-in-out infinite; }
        @keyframes au-drift { 0% { transform: translate(0,0) rotate(-6deg) } 50% { transform: translate(10px,-12px) rotate(2deg) } 100% { transform: translate(0,0) rotate(-6deg) } }
        .au-drift { animation: au-drift 9s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){
          .au-float, .au-twinkle, .au-drift { animation:none }
        }
      `}</style>
      <link
        href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700&display=swap"
        rel="stylesheet"
      />

      {/*
        ヒーローは画面幅いっぱいに上詰めで置く。
        画像自体が紙のコラージュで完結しているので、上に背景色を覗かせない。
        青(海)の背景は**この画像の下から**始める。
      */}
      <HeroVisual />

      {/* ===== Hero(テキスト部) ===== */}
      <section
        className="relative overflow-hidden px-6 pb-14 pt-8 text-center"
        style={{ background: `linear-gradient(180deg, ${BG.sea} 0%, ${BG.cream} 62%)` }}
      >
        <WaveMotif className="pointer-events-none absolute -left-10 top-16 w-[78%] opacity-25" />
        <SouthernCrossMotif className="au-twinkle pointer-events-none absolute -right-4 top-16 w-28 opacity-40" />
        <Sparkle className="au-twinkle pointer-events-none absolute left-7 top-6 h-5 w-5 text-amber-400" />
        <Sparkle className="au-twinkle pointer-events-none absolute right-4 top-28 h-7 w-7 text-sky-400" />
        <Sparkle className="au-twinkle pointer-events-none absolute left-5 bottom-24 h-5 w-5 text-orange-400" />
        <PlaneMotif className="au-drift pointer-events-none absolute right-7 top-4 h-9 w-9 text-sky-500/70" />

        {/*
          モチーフは absolute なので、何もしないと static なテキストより前面に描かれる。
          波がバッジの上を横切って文字が読みにくくなったため、本文側を z-10 で持ち上げる。
        */}
        <div className="relative z-10">

          {/*
            タイトルはヒーロー画像に焼き込まれているため、見出しは視覚的に出さない。
            ただし h1 が無いと読み上げと検索で拾えないので sr-only で持つ。
          */}
          <h1 className="sr-only">
            うちの子のオーストラリア旅行 — 旅のはじまり。全{threshold}種をあつめて、めくれる旅行日記をつくろう
          </h1>
          <Reveal>
            <span
              className="inline-flex items-center gap-2 rounded-full border-2 border-dashed px-4 py-1 text-xs font-bold"
              style={{
                borderColor: AU_OCHRE,
                color: AU_OCHRE,
                background: "#ffffff",
                fontFamily: HEADING_FONT,
              }}
            >
              🇦🇺 全{threshold}種 ✦ あつめてめくれる旅行日記
            </span>
          </Reveal>
          <Reveal delay={120}>
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
                  2026/8/29
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
                  9/6
                  <span className="text-[11px] font-medium text-[#9a8a78]">(日)</span>{" "}
                  21:59
                </span>
              </div>
            </div>
          </Reveal>

          {/*
            企画(スクラップブック)は 8/29 開始だが、その前の10日間は
            コーデ用プロンプトを毎朝公開する(企画ではなく通常の共有)。
            前半に来た人が「今は何をすればいいのか」で迷わないよう2段構成を示す。
            旅程が10日間なので 8/19〜8/28 が Day1〜Day10 に対応する。
          */}
          <Reveal delay={230}>
            <div className="mx-auto mt-5 w-full max-w-[330px] space-y-2 text-left">
              <div
                className="rounded-2xl border bg-white/85 px-4 py-3"
                style={{ borderColor: "rgba(15,127,168,0.35)" }}
              >
                <p
                  className="text-[11px] font-bold tracking-wide"
                  style={{ color: AU_OCEAN, fontFamily: HEADING_FONT }}
                >
                  8/19(水)〜8/28(金) ・ 旅のあいだ
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#7a6a58]">
                  オーストラリアをめぐる
                  <strong className="font-bold text-[#4a3b2c]">コーデのプロンプトを毎朝公開</strong>
                  。10日間の旅を楽しんでください。
                </p>
              </div>
              <div
                className="rounded-2xl border-2 bg-white px-4 py-3"
                style={{ borderColor: AU_OCHRE }}
              >
                <p
                  className="text-[11px] font-bold tracking-wide"
                  style={{ color: AU_OCHRE, fontFamily: HEADING_FONT }}
                >
                  8/29(土)〜9/6(日) ・ 旅のあと
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#7a6a58]">
                  思い出を振り返って、
                  <strong className="font-bold text-[#4a3b2c]">めくれる旅行日記をつくる企画</strong>
                  がはじまります。
                </p>
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
              日記づくりの企画は 8/29(土) 8:00 から。それまでは毎朝のコーデプロンプトをお楽しみください！
            </p>
          </Reveal>
        </div>
      </section>

      {/* ===== コラボ クレジット ===== */}
      <section
        className="px-6 pb-10"
        style={{ background: `linear-gradient(180deg, ${BG.cream} 0%, ${BG.forest} 100%)` }}
      >
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
      {pages.length > 0 ? (
        <section
          className="relative overflow-hidden px-6 py-16"
          style={{ background: `linear-gradient(180deg, ${BG.forest} 0%, ${BG.ochre} 68%, ${BG.ochre} 100%)` }}
        >
          <EucalyptusMotif className="au-float pointer-events-none absolute -left-8 top-8 w-40 opacity-30" />
          <KangarooMotif className="au-float pointer-events-none absolute right-4 top-6 w-16 text-[#B5651D] opacity-35" style={{ animationDelay: "1.2s" }} />
          <UluruMotif className="pointer-events-none absolute inset-x-0 bottom-0 w-full opacity-30" />
          <Sparkle className="au-twinkle pointer-events-none absolute right-16 top-28 h-5 w-5 text-amber-400" />
          <div className="relative mx-auto max-w-3xl">
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
              {pages.map((d, i) => {
                const page = PAGES[i];
                return (
                  <Reveal key={d.id} delay={i * 70}>
                    <div
                      className={`au-float relative rounded-2xl border-2 border-white bg-white p-3 shadow-[0_6px_0_rgba(194,85,31,0.18)] ${i % 2 ? "sm:translate-y-3" : ""}`}
                      style={{ animationDelay: `${i * 0.4}s` }}
                    >
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
                        {page?.day ?? `Page ${i + 1}`}
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

      {/* ===== あそびかた ===== */}
      {/*
        抽選セクションを廃止した際、そこが担っていた「港の青(シドニー)」を
        このセクションに引き継いだ。旅程で色が変わる設計を崩さないため。
      */}
      <section
        className="relative overflow-hidden px-6 py-16"
        style={{ background: `linear-gradient(180deg, ${BG.ochre} 0%, ${BG.harbour} 38%, ${BG.cream} 100%)` }}
      >
        <HarbourArchMotif className="pointer-events-none absolute -right-16 top-24 w-[72%] opacity-25" />
        <Sparkle className="au-twinkle pointer-events-none absolute left-6 top-10 h-6 w-6 text-sky-400" />
        <div className="relative mx-auto max-w-2xl">
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
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg text-white shadow-[0_4px_0_rgba(194,85,31,0.3)]"
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
      <section
        className="relative overflow-hidden px-6 pb-20 pt-14 text-center"
        style={{ background: `linear-gradient(180deg, ${BG.cream} 0%, ${BG.sunset} 100%)` }}
      >
        <Sparkle className="au-twinkle pointer-events-none absolute left-8 top-8 h-6 w-6 text-amber-400" />
        <Sparkle className="au-twinkle pointer-events-none absolute right-10 top-16 h-8 w-8 text-orange-400" style={{ animationDelay: "0.9s" }} />
        <KangarooMotif className="au-float pointer-events-none absolute -left-2 bottom-6 w-20 text-[#B5651D] opacity-30" />
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
      <div className="px-6 pb-10 text-center" style={{ background: BG.sunset }}>
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
