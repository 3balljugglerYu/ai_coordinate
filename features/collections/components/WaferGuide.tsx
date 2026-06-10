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

function XLink({ handle, url }: { handle: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full bg-[#1d1d1f] px-3 py-1.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      {handle}
    </a>
  );
}

// 完成台紙(complete.PNG)の並び順に合わせる:
// オーディン → ゼウス → イシス → アテナ → アルテミス → アフロディーテ
const GODS = [
  {
    no: "01",
    src: "/collections/wafer/god/odin.webp",
    name: "オーディン",
    theme: "北欧神話の主神。漆黒の鎧と魔槍をまとって",
    cardBg: "bg-slate-50",
    tape: "bg-slate-300/80",
  },
  {
    no: "02",
    src: "/collections/wafer/god/zeus.webp",
    name: "ゼウス",
    theme: "全能の雷神。黄金のトーガと稲妻のマント",
    cardBg: "bg-amber-50",
    tape: "bg-amber-200/80",
  },
  {
    no: "03",
    src: "/collections/wafer/god/isis.webp",
    name: "イシス",
    theme: "豊穣と魔法の女神。黄金の冠とアンク",
    cardBg: "bg-teal-50",
    tape: "bg-teal-200/80",
  },
  {
    no: "04",
    src: "/collections/wafer/god/athena.webp",
    name: "アテナ",
    theme: "知と戦の女神。月桂冠とふくろうのマント",
    cardBg: "bg-stone-50",
    tape: "bg-stone-300/80",
  },
  {
    no: "05",
    src: "/collections/wafer/god/artemis.webp",
    name: "アルテミス",
    theme: "月と狩りの女神。三日月の髪飾りと白銀の衣",
    cardBg: "bg-sky-50",
    tape: "bg-sky-200/80",
  },
  {
    no: "06",
    src: "/collections/wafer/god/aphrodite.webp",
    name: "アフロディーテ",
    theme: "愛と美の女神。薔薇と純白のドレス",
    cardBg: "bg-rose-50",
    tape: "bg-rose-200/80",
  },
];

export function WaferGuide({
  characterUrl,
  threshold,
}: {
  characterUrl: string | null;
  threshold: number;
}) {
  // 0 →… → threshold が満ちていく様子(4ステップ)
  const ringStages = [0, Math.round(threshold / 3), Math.round((threshold * 2) / 3), threshold];

  const steps = [
    {
      n: "01",
      t: "神コレのスタイルで生成",
      b: "One-Tap Style ページで「神コレ」シリーズのスタイル（オーディン・ゼウスなど）を選んで、うちの子の神シールを生成！",
    },
    {
      n: "02",
      t: "あつめて枠を埋める",
      b: "生成するたびに、コレクション台紙の枠がひとつずつ埋まっていきます。",
    },
    {
      n: "03",
      t: `${threshold}柱そろえてコンプリート`,
      b: `${threshold}種類そろえると、${threshold}枚を飾れる限定コンプリート台紙が完成！`,
    },
    {
      n: "04",
      t: "ダウンロード＆シェア",
      b: "完成した台紙はそのまま画像でダウンロード。SNS でシェアして自慢しよう！",
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
      <section className="relative overflow-hidden px-6 pb-14 pt-12 text-center">
        <Sparkle className="pe-float absolute left-8 top-10 h-5 w-5 text-amber-300" />
        <Sparkle className="pe-float absolute right-10 top-16 h-7 w-7 text-yellow-400" />
        <Reveal>
          <span
            className="inline-block rounded-full border-2 border-dashed border-amber-300 bg-white/70 px-4 py-1 text-xs font-bold text-amber-600"
            style={{ fontFamily: HEADING_FONT }}
          >
            全{threshold}種 ✦ 神コレクション
          </span>
        </Reveal>
        <Reveal delay={100}>
          <h1
            className="mt-5 bg-gradient-to-b from-amber-500 to-orange-600 bg-clip-text text-3xl leading-[1.4] text-transparent sm:text-4xl"
            style={{ fontFamily: HEADING_FONT }}
          >
            うちの子の
            <br />
            神コレクション
          </h1>
        </Reveal>
        <Reveal delay={200}>
          <p className="mt-4 text-sm leading-loose text-[#7a6a58]">
            うちの子が、神話の女神・神さまに。
            <br />
            全{threshold}種あつめて、きらめく台紙をコンプリート。
          </p>
        </Reveal>

        {/* 神さま勢ぞろい */}
        <Reveal delay={300}>
          <div className="mx-auto mt-8 grid max-w-md grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
            {GODS.map((g, i) => (
              <div
                key={g.no}
                className={`pe-float relative aspect-square overflow-hidden rounded-xl border border-amber-200/70 shadow-sm ${i % 2 ? "translate-y-2" : ""}`}
                style={{ animationDelay: `${i * 0.35}s` }}
              >
                <Image src={g.src} alt={g.name} fill sizes="120px" className="object-cover" />
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

      {/* ===== コラボ クレジット ===== */}
      <section className="px-6 pb-6">
        <Reveal>
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-amber-200/70 bg-white/80 px-5 py-4 text-center">
            <span
              className="text-xs font-bold tracking-[0.2em] text-amber-500"
              style={{ fontFamily: HEADING_FONT }}
            >
              ✦ COLLABORATION ✦
            </span>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs text-[#9a8a78]">イラスト・キャラデザ</span>
                <XLink handle="@mario335599" url="https://x.com/mario335599" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs text-[#9a8a78]">企画・主催</span>
                <XLink handle="@mickey_fuku" url="https://x.com/mickey_fuku" />
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ===== 6柱の神たち ===== */}
      <section className="bg-white/70 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-center text-2xl text-[#4a3b2c]" style={{ fontFamily: HEADING_FONT }}>
              あつめる、{threshold}柱の神たち
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mt-2 text-center text-sm text-[#7a6a58]">
              神話の姿になったうちの子（ノアナ）。ぜんぶで{threshold}種類！
            </p>
          </Reveal>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {GODS.map((g, i) => (
              <Reveal key={g.no} delay={i * 80}>
                <div className="relative rounded-3xl border border-amber-100 bg-white p-5 shadow-[0_6px_18px_rgba(120,90,50,0.08)]">
                  {/* マスキングテープ風 */}
                  <span
                    className={`absolute -top-2 left-1/2 h-5 w-20 -translate-x-1/2 -rotate-3 rounded-sm ${g.tape}`}
                    aria-hidden
                  />
                  <div className={`relative mx-auto aspect-square w-44 overflow-hidden rounded-2xl border-2 border-dashed border-amber-200 ${g.cardBg}`}>
                    <Image src={g.src} alt={g.name} fill sizes="176px" className="object-cover" />
                  </div>
                  <p className="mt-4 text-center text-xs font-bold tracking-widest text-amber-500">
                    No.{g.no} / {threshold.toString().padStart(2, "0")}
                  </p>
                  <p className="mt-1 text-center text-lg text-[#4a3b2c]" style={{ fontFamily: HEADING_FONT }}>
                    {g.name}
                  </p>
                  <p className="mt-1 text-center text-sm text-[#7a6a58]">{g.theme}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== あつめると満ちる(リング) ===== */}
      <section className="relative overflow-hidden px-6 py-16">
        <Sparkle className="pe-float absolute right-8 top-10 h-6 w-6 text-amber-300" />
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
              {ringStages.map((count, idx) => {
                const ratio = threshold > 0 ? count / threshold : 0;
                return (
                  <div key={idx} className="flex flex-col items-center gap-2">
                    <span
                      className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-0.5 text-xs font-bold text-white"
                      style={{ fontFamily: HEADING_FONT }}
                    >
                      {count}/{threshold}
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
                );
              })}
            </div>
          </Reveal>
          <Reveal delay={300}>
            <p className="mt-9 text-center text-sm font-bold text-amber-600">
              {threshold}柱コンプリートで、フルカラー＆ピカーン！
            </p>
          </Reveal>
        </div>
      </section>

      {/* ===== 集まっていく(生成モーダルのプレビュー) ===== */}
      <section className="bg-white/70 px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <h2 className="text-center text-2xl text-[#4a3b2c]" style={{ fontFamily: HEADING_FONT }}>
              集まっていく、その瞬間
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mt-2 text-center text-sm text-[#7a6a58]">
              生成するたびに、台紙の枠がひとつずつ埋まっていく演出も。
            </p>
          </Reveal>
          <Reveal delay={200}>
            <div className="relative mx-auto mt-8 w-full max-w-[320px] overflow-hidden rounded-3xl border border-amber-100 shadow-[0_10px_30px_rgba(120,90,50,0.14)]">
              <Image
                src="/collections/wafer/god-modal-preview.webp"
                alt="生成時に表示される神コレクションの進捗モーダル。6つの枠が埋まっていく様子"
                width={700}
                height={900}
                sizes="(max-width: 480px) 88vw, 320px"
                className="h-auto w-full"
              />
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
                <div className="flex items-start gap-4 rounded-3xl border border-amber-100 bg-white/80 p-5">
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

      {/* ===== 完成イメージ + DL/シェア訴求 ===== */}
      <section className="relative bg-white/70 px-6 py-16">
        <div className="pe-float pointer-events-none absolute -left-2 bottom-4 z-20 h-24 w-24 overflow-hidden rounded-2xl border border-amber-200/70 shadow-md sm:h-32 sm:w-32" aria-hidden>
          <Image src={GODS[1].src} alt="" fill sizes="128px" className="object-cover" />
        </div>
        <div className="pe-float pointer-events-none absolute -right-2 top-4 z-20 h-24 w-24 overflow-hidden rounded-2xl border border-amber-200/70 shadow-md sm:h-32 sm:w-32" style={{ animationDelay: "1s" }} aria-hidden>
          <Image src={GODS[5].src} alt="" fill sizes="128px" className="object-cover" />
        </div>
        <div className="relative z-10 mx-auto max-w-2xl">
          <Reveal>
            <div className="rounded-[2rem] border-2 border-dashed border-amber-300 bg-white p-6 text-center shadow-[0_8px_24px_rgba(120,90,50,0.08)] sm:p-8">
              <h2 className="text-2xl leading-relaxed text-[#4a3b2c]" style={{ fontFamily: HEADING_FONT }}>
                そろえたら、特別な台紙をGET！
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm leading-loose text-[#7a6a58]">
                {threshold}種そろえると、あなただけの特別なコンプリート台紙が完成。
                そのまま画像でダウンロードして、SNS でシェアして自慢しよう！
              </p>
              <div className="relative mx-auto mt-6 aspect-[1024/1608] w-full max-w-[260px] overflow-hidden rounded-2xl border border-amber-100 shadow-[0_6px_18px_rgba(120,90,50,0.12)]">
                <Image
                  src="/collections/wafer/god-complete-sample.webp"
                  alt="神コレクションのコンプリート台紙サンプル(6柱の神シールが並んだ完成イメージ)"
                  fill
                  sizes="(max-width: 480px) 70vw, 260px"
                  className="object-cover"
                />
              </div>
              <p className="mt-3 text-xs text-[#9a8a78]">＼ 完成イメージ ／</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="px-6 pb-20 pt-12 text-center">
        <Reveal>
          <p
            className="mx-auto mb-6 max-w-md text-base font-bold text-amber-600"
            style={{ fontFamily: HEADING_FONT }}
          >
            完成した台紙は、SNSでシェアして自慢しよう！
          </p>
        </Reveal>
        <Reveal delay={80}>
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
