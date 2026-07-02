"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* eslint-disable @next/next/no-page-custom-font -- 日本語の動的サブセットを使うため意図的に <link> で読み込む */

// うちの子のイタリア旅行日記(book / sequential / 全9種)の遊び方ページ。
// 神コレ(WaferGuide)と同じトーン(手づくり感の丸ゴシック + Reveal アニメ)を踏襲しつつ、
// イタリア🇮🇹(グリーン/ホワイト/レッド)+ 旅日記(セピア・地図)の世界観に寄せる。

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const HEADING_FONT = "'Zen Maru Gothic', system-ui, sans-serif";

// イタリア国旗の3色(アクセント)
const IT_GREEN = "#0E8A4F";
const IT_RED = "#CE2B37";

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

/** イタリア国旗の細いリボン(緑/白/赤)。 */
function FlagRibbon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-1.5 w-16 overflow-hidden rounded-full ${className ?? ""}`}
    >
      <span className="h-full flex-1" style={{ background: IT_GREEN }} />
      <span className="h-full flex-1 bg-white" />
      <span className="h-full flex-1" style={{ background: IT_RED }} />
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
      className="inline-flex items-center gap-1.5 rounded-full bg-[#1d1d1f] px-3 py-1.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
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

export function ItalyTravelGuide({
  threshold,
  presets,
}: {
  threshold: number;
  presets: GuidePreset[];
}) {
  // 先頭 = 表紙(はじまり)。残り = 中身(Day1〜)。
  const cover = presets[0] ?? null;
  const days = presets.slice(1);

  const steps: { n: string; t: string; b: string }[] = [
    {
      n: "01",
      t: "表紙「はじまり」を生成",
      b: "まずは旅のはじまり。One-Tap Style で「はじまり」を選んで、うちの子の旅行日記の表紙をつくろう。",
    },
    {
      n: "02",
      t: "1日ずつ解放されていく",
      b: "生成するたびに、次の1日(Day)がひらきます。Day1 → Day2 …と、順番に旅が進んでいきます。",
    },
    {
      n: "03",
      t: `全${threshold}種そろえてコンプリート`,
      b: `表紙(はじまり)+ Day1〜Day${Math.max(1, threshold - 1)} をそろえると、旅の記録がコンプリート！`,
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
        @keyframes it-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-9px) } }
        .it-float { animation: it-float 7s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){ .it-float { animation:none } }
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
            style={{ borderColor: IT_GREEN, color: IT_GREEN, background: "rgba(255,255,255,0.7)", fontFamily: HEADING_FONT }}
          >
            🇮🇹 全{threshold}種 ✦ うちの子のイタリア旅行
          </span>
        </Reveal>
        <Reveal delay={100}>
          <h1
            className="mt-5 text-3xl leading-[1.4] sm:text-4xl"
            style={{
              fontFamily: HEADING_FONT,
              background: `linear-gradient(90deg, ${IT_GREEN}, #b08d57, ${IT_RED})`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            うちの子の
            <br />
            イタリア旅行日記
          </h1>
        </Reveal>
        <Reveal delay={180}>
          <div className="mt-4 flex justify-center">
            <FlagRibbon />
          </div>
        </Reveal>

        {/* 会期(イタリア切符風) */}
        <Reveal delay={210}>
          <div
            className="mx-auto mt-6 w-full max-w-[330px] rounded-2xl border-2 border-dashed bg-white/75 px-5 py-3 text-center shadow-[0_4px_14px_rgba(120,90,50,0.10)]"
            style={{ borderColor: IT_GREEN }}
          >
            <div
              className="text-[11px] font-bold tracking-[0.22em]"
              style={{ color: IT_RED, fontFamily: HEADING_FONT }}
            >
              ✦ コラボ期間 ✦
            </div>
            <div
              className="mt-1 flex items-center justify-center gap-2 whitespace-nowrap text-[15px] font-bold leading-snug text-[#5b4a36]"
              style={{ fontFamily: HEADING_FONT }}
            >
              <span>
                2026/7/3
                <span className="text-[11px] font-medium text-[#9a8a78]">(金)</span>{" "}
                19:00
              </span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke={IT_GREEN}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="h-4 w-4 shrink-0"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <span>
                7/12
                <span className="text-[11px] font-medium text-[#9a8a78]">(日)</span>{" "}
                21:59
              </span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={240}>
          <p className="mt-4 text-sm leading-loose text-[#7a6a58]">
            うちの子と、イタリアをめぐる小さな旅。
            <br />
            1日ずつあつめて、めくれる旅行日記を完成させよう。
          </p>
        </Reveal>

        {/* 表紙プレビュー(はじまり) */}
        {cover ? (
          <Reveal delay={300}>
            <div className="mx-auto mt-8 w-full max-w-[260px]">
              <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-[#e3d4b5] bg-white shadow-[0_8px_24px_rgba(120,90,50,0.16)]">
                <Image
                  src={cover.thumbnailImageUrl}
                  alt="表紙「はじまり」のサンプル"
                  fill
                  sizes="(max-width: 480px) 70vw, 260px"
                  className="object-cover"
                />
                <span
                  className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow"
                  style={{ background: IT_GREEN }}
                >
                  表紙 ・ はじまり
                </span>
              </div>
              <p className="mt-2 text-xs text-[#9a8a78]">＼ 旅のはじまり ／</p>
            </div>
          </Reveal>
        ) : null}

        <Reveal delay={380}>
          <Link
            href="/style"
            className="mt-9 inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-base font-bold text-white shadow-[0_5px_0_rgba(14,138,79,0.3)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
            style={{ background: IT_GREEN, fontFamily: HEADING_FONT }}
          >
            いますぐはじめる
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <p className="mt-3 text-xs text-[#9a8a78]">
            企画がスタートしたら対象の「イタリア旅行」シリーズが表示されます！
          </p>
        </Reveal>
      </section>

      {/* ===== コラボ クレジット ===== */}
      <section className="px-6 pb-6">
        <Reveal>
          <div
            className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border bg-white/80 px-5 py-4 text-center"
            style={{ borderColor: "rgba(14,138,79,0.3)" }}
          >
            <span
              className="text-xs font-bold tracking-[0.2em]"
              style={{ color: IT_GREEN, fontFamily: HEADING_FONT }}
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
                  className="h-16 w-16 rounded-full border border-[#cfe7d8] object-cover shadow-sm"
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
                  className="h-16 w-16 rounded-full border border-[#cfe7d8] object-cover shadow-sm"
                />
                <XLink handle="@mickey_fuku" url="https://x.com/mickey_fuku" />
              </div>
            </div>
            <span
              className="text-xs font-bold"
              style={{ color: IT_GREEN }}
            >
              フォローしてね！いいことあるかも！
            </span>
          </div>
        </Reveal>
      </section>

      {/* ===== あつめる Day たち ===== */}
      {days.length > 0 ? (
        <section className="bg-white/70 px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <Reveal>
              <h2 className="text-center text-2xl text-[#4a3b2c]" style={{ fontFamily: HEADING_FONT }}>
                あつめる、{days.length}日間の旅
              </h2>
            </Reveal>
            <Reveal delay={100}>
              <p className="mt-2 text-center text-sm text-[#7a6a58]">
                表紙のあと、Day1 から順番に解放されます。1日ずつめくる楽しみを。
              </p>
            </Reveal>

            <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {days.map((d, i) => (
                <Reveal key={d.id} delay={i * 70}>
                  <div className="relative rounded-2xl border border-[#ecdcc0] bg-white p-3 shadow-[0_6px_18px_rgba(120,90,50,0.08)]">
                    <span
                      className="absolute -top-2 left-1/2 h-5 w-16 -translate-x-1/2 -rotate-3 rounded-sm"
                      style={{ background: "rgba(14,138,79,0.18)" }}
                      aria-hidden
                    />
                    <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-[#e3d4b5] bg-[#faf3e6]">
                      <Image
                        src={d.thumbnailImageUrl}
                        alt={d.title}
                        fill
                        sizes="(max-width: 640px) 44vw, 200px"
                        className="object-cover"
                      />
                    </div>
                    <p className="mt-3 text-center text-xs font-bold tracking-widest" style={{ color: IT_GREEN }}>
                      Day {String(i + 1).padStart(2, "0")}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-center text-sm text-[#4a3b2c]" style={{ fontFamily: HEADING_FONT }}>
                      {d.title}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}

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
                    style={{ background: IT_GREEN, fontFamily: HEADING_FONT }}
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
            <FlagRibbon />
          </div>
        </Reveal>
        <Reveal delay={70}>
          <p
            className="mx-auto mb-6 mt-5 max-w-md text-base font-bold"
            style={{ color: IT_GREEN, fontFamily: HEADING_FONT }}
          >
            うちの子の旅行日記、つくってシェアしよう！
          </p>
        </Reveal>
        <Reveal delay={140}>
          <Link
            href="/style"
            className="inline-flex items-center gap-2 rounded-full px-10 py-4 text-lg font-bold text-white shadow-[0_5px_0_rgba(14,138,79,0.3)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
            style={{ background: IT_GREEN, fontFamily: HEADING_FONT }}
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
