"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CollectionProgressRing } from "./CollectionProgressRing";

/* eslint-disable @next/next/no-page-custom-font -- 日本語の動的サブセットを使うため意図的に <link> で読み込む */

// やわらかい登場アニメ(やりすぎない)
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
// 手づくり感のある丸ゴシック見出し
const HEADING_FONT = "'Zen Maru Gothic', system-ui, sans-serif";

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

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 0c.6 5.4 2.6 7.4 8 8-5.4.6-7.4 2.6-8 8-.6-5.4-2.6-7.4-8-8 5.4-.6 7.4-2.6 8-8Z" />
    </svg>
  );
}

const CHARS = [
  {
    no: "01",
    src: "/collections/wafer/ajisai.webp",
    name: "あじさいノアナ",
    theme: "梅雨もごきげん、青むらさきのワンピース",
    cardBg: "bg-violet-50",
    tape: "bg-violet-200/80",
  },
  {
    no: "02",
    src: "/collections/wafer/hibiscus.webp",
    name: "ハイビスカスノアナ",
    theme: "常夏アロハで元気いっぱい",
    cardBg: "bg-rose-50",
    tape: "bg-rose-200/80",
  },
  {
    no: "03",
    src: "/collections/wafer/china.webp",
    name: "チャイナノアナ",
    theme: "あでやかチャイナドレス",
    cardBg: "bg-red-50",
    tape: "bg-red-200/80",
  },
  {
    no: "04",
    src: "/collections/wafer/himawari.webp",
    name: "ひまわりノアナ",
    theme: "夏のおひさまカラー",
    cardBg: "bg-amber-50",
    tape: "bg-amber-200/80",
  },
];

const STAGES = [0, 0.25, 0.5, 0.75, 1];

export function WaferGuide({
  characterUrl,
  threshold,
}: {
  characterUrl: string | null;
  threshold: number;
}) {
  const steps = [
    {
      n: "01",
      t: "シール風スタイルで生成",
      b: "One-Tap Style ページで「ウエハースシール風」タグのスタイルを選んで、うちの子シールを生成！",
    },
    {
      n: "02",
      t: "あつめて枠を埋める",
      b: "生成するたびに、コレクション枠がひとつずつ埋まっていきます。",
    },
    {
      n: "03",
      t: "そろえてコンプリート",
      b: `${threshold}種類そろえると、${threshold}枚を飾れる限定コレクション台紙をプレゼント！`,
    },
    {
      n: "04",
      t: "SNSでシェア",
      b: "完成したうちの子コレクションを SNS でシェアしよう！",
    },
  ];

  return (
    <main className="overflow-x-hidden bg-[#FBF6EE] text-[#5b4b3a]">
      <style>{`
        @keyframes pe-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
        .pe-float { animation: pe-float 7s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){ .pe-float{ animation:none } }
      `}</style>
      <link
        href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700&display=swap"
        rel="stylesheet"
      />

      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden px-6 pb-16 pt-12 text-center">
        <Sparkle className="pe-float absolute left-8 top-10 h-5 w-5 text-amber-300" />
        <Sparkle className="pe-float absolute right-10 top-16 h-7 w-7 text-rose-300" />
        <Reveal>
          <span
            className="inline-block rounded-full border-2 border-dashed border-amber-300 bg-white/70 px-4 py-1 text-xs font-bold text-amber-600"
            style={{ fontFamily: HEADING_FONT }}
          >
            全{threshold}種 あつめてコンプリート
          </span>
        </Reveal>
        <Reveal delay={100}>
          <h1
            className="mt-5 text-3xl leading-[1.4] text-[#4a3b2c] sm:text-4xl"
            style={{ fontFamily: HEADING_FONT }}
          >
            うちの子の
            <br />
            ウエハースシール
          </h1>
        </Reveal>
        <Reveal delay={200}>
          <p className="mt-4 text-sm leading-loose text-[#7a6a58]">
            平成レトロな“おまけシール”風に。
            <br />
            あつめて、キラキラ台紙をつくろう。
          </p>
        </Reveal>

        {/* なかま勢ぞろい */}
        <Reveal delay={300}>
          <div className="mt-8 flex items-end justify-center gap-1 sm:gap-3">
            {CHARS.map((c, i) => (
              <div
                key={c.no}
                className={`pe-float relative h-20 w-20 sm:h-28 sm:w-28 ${i % 2 ? "translate-y-2" : ""}`}
                style={{ animationDelay: `${i * 0.4}s` }}
              >
                <Image src={c.src} alt={c.name} fill sizes="120px" className="object-contain" />
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={400}>
          <Link
            href="/style"
            className="mt-9 inline-flex items-center gap-2 rounded-full bg-orange-500 px-8 py-3.5 text-base font-bold text-white shadow-[0_5px_0_rgba(234,88,12,0.3)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
            style={{ fontFamily: HEADING_FONT }}
          >
            いますぐつくってみる
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </Reveal>
      </section>

      {/* ===== なかま紹介(4キャラ カード) ===== */}
      <section className="bg-white/70 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-center text-2xl text-[#4a3b2c]" style={{ fontFamily: HEADING_FONT }}>
              あつめる、なかまたち
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mt-2 text-center text-sm text-[#7a6a58]">
              衣装ちがいのうちの子（ノアナ）。ぜんぶで{threshold}種類！
            </p>
          </Reveal>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {CHARS.map((c, i) => (
              <Reveal key={c.no} delay={i * 90}>
                <div className="relative rounded-3xl border border-amber-100 bg-white p-5 shadow-[0_6px_18px_rgba(120,90,50,0.08)]">
                  {/* マスキングテープ風 */}
                  <span
                    className={`absolute -top-2 left-1/2 h-5 w-20 -translate-x-1/2 -rotate-3 rounded-sm ${c.tape}`}
                    aria-hidden
                  />
                  <div className={`relative mx-auto aspect-square w-40 overflow-hidden rounded-2xl border-2 border-dashed border-amber-200 ${c.cardBg}`}>
                    <Image src={c.src} alt={c.name} fill sizes="160px" className="object-contain p-1" />
                  </div>
                  <p className="mt-4 text-center text-xs font-bold tracking-widest text-amber-500">
                    No.{c.no} / {threshold.toString().padStart(2, "0")}
                  </p>
                  <p className="mt-1 text-center text-lg text-[#4a3b2c]" style={{ fontFamily: HEADING_FONT }}>
                    {c.name}
                  </p>
                  <p className="mt-1 text-center text-sm text-[#7a6a58]">{c.theme}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== あつめると満ちる(リング) ===== */}
      <section className="relative overflow-hidden px-6 py-16">
        <Sparkle className="pe-float absolute right-8 top-10 h-6 w-6 text-violet-300" />
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-center text-2xl text-[#4a3b2c]" style={{ fontFamily: HEADING_FONT }}>
              あつめるほど、満ちていく
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mt-2 text-center text-sm text-[#7a6a58]">
              一種あつめるたびに、まんなかの円がくるりと色づくよ
            </p>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-8">
              {STAGES.map((ratio) => (
                <div key={ratio} className="flex flex-col items-center gap-2">
                  <span
                    className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-0.5 text-xs font-bold text-white"
                    style={{ fontFamily: HEADING_FONT }}
                  >
                    {Math.round(ratio * 100)}%
                  </span>
                  <CollectionProgressRing
                    ratio={ratio}
                    complete={ratio >= 1}
                    imageUrl={characterUrl}
                    className="w-[84px]"
                  >
                    {!characterUrl && ratio >= 1 ? (
                      <span className="text-[10px] font-bold text-amber-500">完成</span>
                    ) : null}
                  </CollectionProgressRing>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={300}>
            <p className="mt-9 text-center text-sm font-bold text-amber-600">
              100% で、フルカラー＆ピカーン！
            </p>
          </Reveal>
        </div>
      </section>

      {/* ===== あそびかた ===== */}
      <section className="bg-white/70 px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <h2 className="text-center text-2xl text-[#4a3b2c]" style={{ fontFamily: HEADING_FONT }}>
              あそびかた
            </h2>
          </Reveal>
          <div className="mt-10 space-y-4">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 80}>
                <div className="flex items-start gap-4 rounded-3xl border border-amber-100 bg-[#FBF6EE] p-5">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-400 text-lg text-white"
                    style={{ fontFamily: HEADING_FONT }}
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

      {/* ===== 台紙 ===== */}
      <section className="relative px-6 py-16">
        <div className="pe-float pointer-events-none absolute -left-2 bottom-4 z-20 h-28 w-28 drop-shadow-[0_6px_10px_rgba(120,90,50,0.25)] sm:h-36 sm:w-36" aria-hidden>
          <Image src={CHARS[3].src} alt="" fill sizes="144px" className="object-contain" />
        </div>
        <div className="pe-float pointer-events-none absolute -right-2 top-4 z-20 h-28 w-28 drop-shadow-[0_6px_10px_rgba(120,90,50,0.25)] sm:h-36 sm:w-36" style={{ animationDelay: "1s" }} aria-hidden>
          <Image src={CHARS[1].src} alt="" fill sizes="144px" className="object-contain" />
        </div>
        <div className="relative z-10 mx-auto max-w-2xl">
          <Reveal>
            <div className="rounded-[2rem] border-2 border-dashed border-amber-300 bg-white p-6 text-center shadow-[0_8px_24px_rgba(120,90,50,0.08)] sm:p-8">
              <h2 className="text-2xl leading-relaxed text-[#4a3b2c]" style={{ fontFamily: HEADING_FONT }}>
                そろえたら、台紙をGET！
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm leading-loose text-[#7a6a58]">
                あつめたシールが並ぶ、ホログラム風のコンプリート台紙。
                SNSでそっとじまんして、マイページでいつでも見返せます。
              </p>
              <div className="relative mx-auto mt-6 aspect-[525/612] w-full max-w-xs overflow-hidden rounded-2xl border border-amber-100 shadow-[0_6px_18px_rgba(120,90,50,0.12)]">
                <Image
                  src="/collections/wafer/complete-sample.webp"
                  alt="コンプリート台紙のサンプル(全4種のシールが並んだ夏ファッションコレクション)"
                  fill
                  sizes="(max-width: 480px) 80vw, 320px"
                  className="object-cover"
                />
              </div>
              <p className="mt-3 text-xs text-[#9a8a78]">＼ 完成イメージ ／</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="px-6 pb-20 pt-4 text-center">
        <Reveal>
          <Link
            href="/style"
            className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-10 py-4 text-lg font-bold text-white shadow-[0_5px_0_rgba(234,88,12,0.3)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
            style={{ fontFamily: HEADING_FONT }}
          >
            うちの子で作ってみる
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </Reveal>
        <Reveal delay={100}>
          <p className="mx-auto mt-6 max-w-sm text-xs leading-relaxed text-[#9a8a78]">
            ※ あつめる・台紙の保存にはログインが必要です（未ログインでも一枚お試し生成できます）。
          </p>
        </Reveal>
      </section>
    </main>
  );
}
