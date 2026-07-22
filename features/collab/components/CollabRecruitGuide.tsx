"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* eslint-disable @next/next/no-page-custom-font -- 日本語の動的サブセットを使うため意図的に <link> で読み込む */

// やわらかい登場アニメ(やりすぎない) — /creators と同じトーン
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
// 手づくり感のある丸ゴシック見出し
const HEADING_FONT = "'Zen Maru Gothic', system-ui, sans-serif";

// ===== 相談導線(X DM) =====
const APPLY_X_URL = "https://x.com/mickey_fuku";

export interface CollabWorkImage {
  src: string;
  alt: string;
}

/** これまでのコラボ実績。イタリア旅行の作品画像のみ DB 由来のため props で受け取る。 */
export interface PastCollab {
  name: string;
  xHandle: string;
  xUrl: string;
  iconSrc: string;
  projectTitle: string;
  description: string;
  works: CollabWorkImage[];
  guideHref: string;
  guideLabel: string;
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

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 0c.6 5.4 2.6 7.4 8 8-5.4.6-7.4 2.6-8 8-.6-5.4-2.6-7.4-8-8 5.4-.6 7.4-2.6 8-8Z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function ConsultButton({
  size = "lg",
  label = "コラボの相談をする",
}: {
  size?: "lg" | "sm";
  label?: string;
}) {
  const pad = size === "lg" ? "px-9 py-4 text-lg" : "px-6 py-3 text-sm";
  return (
    <a
      href={APPLY_X_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-full bg-rose-500 font-bold text-white shadow-[0_5px_0_rgba(190,18,60,0.3)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200 ${pad}`}
      style={{ fontFamily: HEADING_FONT }}
    >
      <XIcon className="h-5 w-5" />
      {label}
    </a>
  );
}

export function CollabRecruitGuide({
  pastCollabs,
}: {
  pastCollabs: PastCollab[];
}) {
  const [barShown, setBarShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setBarShown(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Hero のタイルは実績3企画の作品から代表を混ぜて見せる
  const heroTiles = pastCollabs
    .flatMap((collab) => collab.works.slice(0, 2))
    .slice(0, 6);

  const benefits: { title: string; body: string; icon: ReactNode }[] = [
    {
      title: "ひとつの“企画”として大きく展開",
      body: "単発の掲載ではなく、「うちの子の◯◯」のような特設企画として一緒に作ります。専用ページ・バナー・SNS告知までセットです。",
      icon: (
        <path d="M12 .6 9.2 7.6 1.7 8.1l5.7 4.8L5.5 20l6.5-3.9L18.5 20l-1.9-7.1 5.7-4.8-7.5-.5L12 .6Z" />
      ),
    },
    {
      title: "あなたの名前とファン導線を明記",
      body: "企画ページ・作品カードにアイコンとお名前、X へのリンクを掲載。企画を楽しんだ人が、あなたのもとへ届きます。",
      icon: (
        <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6Z" />
      ),
    },
    {
      title: "プロンプトやイラストは保護",
      body: "公開されるのは生成された“画像だけ”。プロンプトや元データは非公開のまま、あなたの作品として守られます。",
      icon: (
        <path d="M6 10V7a6 6 0 1 1 12 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1Zm2 0h8V7a4 4 0 1 0-8 0v3Z" />
      ),
    },
    {
      title: "“あつめて完成”の体験まで一緒に",
      body: "全種コンプリートで特典画像が完成するコレクション形式など、参加したくなる仕掛けを運営が一緒に設計します。",
      icon: (
        <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm12.5 0L13 20h7l-3.5-7Z" />
      ),
    },
  ];

  const steps = [
    {
      no: "01",
      title: "相談する",
      body: "X(DM)から「コラボしてみたい / 話を聞きたい」とご連絡ください。作品やSNSを見せていただけるとスムーズです。",
      tape: "bg-pink-200/80",
    },
    {
      no: "02",
      title: "企画を一緒に考える",
      body: "あなたの世界観に合わせて、テーマ・点数・見せ方を一緒に決めます。無理のないペースで大丈夫です。",
      tape: "bg-rose-200/80",
    },
    {
      no: "03",
      title: "制作 & 特設ページ公開",
      body: "作品をお預かりして、クレジット付きの特設企画として公開。バナーやSNSでも告知します。",
      tape: "bg-fuchsia-200/80",
    },
    {
      no: "04",
      title: "みんなのうちの子が参加",
      body: "全国のうちの子があなたの企画で変身し、SNSでシェア。あなたの名前と作品が広がります。",
      tape: "bg-purple-200/80",
    },
  ];

  const faqs = [
    {
      q: "誰でも相談できますか？",
      a: "はい、大歓迎です。イラストレーター・プロンプト制作者・企画を一緒に考えたい方など、「うちの子文化が好き」ならどなたでもどうぞ。",
    },
    {
      q: "何を用意すればいいですか？",
      a: "最初は何もなくて大丈夫です。ご相談のなかで、テーマや必要な素材を一緒に決めていきます。",
    },
    {
      q: "作品の権利は誰のものですか？",
      a: "あなたのものです。企画ページ・作品カードにはクレジット(お名前・アイコン)を明記します。",
    },
    {
      q: "プロンプトやイラストは公開されますか？",
      a: "いいえ。公開されるのは生成された“画像だけ”です。プロンプトや元データは非公開で保護されます。",
    },
    {
      q: "報酬はありますか？",
      a: "現在は、クレジット掲載と特設企画としての露出が中心です。条件は個別にご相談ください。",
    },
    {
      q: "期間やスケジュールは？",
      a: "企画の規模に合わせて柔軟に決めています。過去のコラボも、それぞれのペースで進めてきました。",
    },
  ];

  return (
    <main className="overflow-x-hidden bg-[#FDF4F7] text-[#5b3a4a]">
      <style>{`
        @keyframes pe-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
        .pe-float { animation: pe-float 7s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){
          .pe-float { animation: none; }
        }
      `}</style>
      <link
        href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700&display=swap"
        rel="stylesheet"
      />

      {/* ===== 追従CTAバー ===== */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-rose-100 bg-white/90 px-4 py-3 backdrop-blur transition-transform duration-300"
        style={{ transform: barShown ? "translateY(0)" : "translateY(120%)" }}
      >
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <p
            className="text-sm font-bold text-[#6b4756]"
            style={{ fontFamily: HEADING_FONT }}
          >
            あなたと、次のコラボを。
          </p>
          <ConsultButton size="sm" label="相談する" />
        </div>
      </div>

      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden px-6 pb-16 pt-12 text-center">
        <Sparkle className="pe-float absolute left-8 top-10 h-5 w-5 text-pink-300" />
        <Sparkle className="pe-float absolute right-10 top-16 h-7 w-7 text-rose-400" />
        <div className="relative">
          <Reveal>
            <span
              className="inline-block rounded-full border-2 border-dashed border-rose-300 bg-white/70 px-4 py-1 text-xs font-bold text-rose-600"
              style={{ fontFamily: HEADING_FONT }}
            >
              一緒にコラボしてくれる方、募集！
            </span>
          </Reveal>
          <Reveal delay={100}>
            <h1
              className="mt-5 bg-gradient-to-b from-pink-500 to-rose-600 bg-clip-text text-3xl leading-[1.45] text-transparent sm:text-4xl"
              style={{ fontFamily: HEADING_FONT }}
            >
              あなたの世界観が、
              <br />
              次のコラボ企画になる。
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-4 text-sm leading-loose text-[#7a5868]">
              神コレクション、イタリア旅行、ことわざ辞典——。
              <br />
              ペルスタの人気企画は、クリエイターさんとのコラボから生まれました。
              <br />
              次の企画を、あなたと一緒に作りたいです。
            </p>
          </Reveal>

          {/* 実績作品タイル */}
          {heroTiles.length > 0 && (
            <Reveal delay={300}>
              <div className="mx-auto mt-8 grid max-w-md grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
                {heroTiles.map((look, i) => (
                  <div
                    key={`${look.src}-${i}`}
                    className={`pe-float relative aspect-square overflow-hidden rounded-xl border border-rose-200/70 shadow-sm ${
                      i % 2 ? "translate-y-2" : ""
                    }`}
                    style={{ animationDelay: `${i * 0.35}s` }}
                  >
                    <Image
                      src={look.src}
                      alt={look.alt}
                      fill
                      sizes="120px"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            </Reveal>
          )}

          <Reveal delay={400}>
            <div className="mt-9">
              <ConsultButton />
              <p className="mt-3 text-xs text-[#9a7888]">
                X(DM)から気軽にどうぞ。「ちょっと話を聞きたい」だけでも大歓迎です。
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== これまでのコラボ ===== */}
      <section className="bg-white px-6 py-16">
        <div className="mx-auto max-w-md">
          <Reveal>
            <h2
              className="text-center text-2xl text-[#5b3a4a]"
              style={{ fontFamily: HEADING_FONT }}
            >
              これまでのコラボ
            </h2>
            <p className="mt-3 text-center text-sm leading-relaxed text-[#7a5868]">
              3つの企画が、コラボから生まれてたくさんのうちの子に楽しまれています。
            </p>
          </Reveal>

          <div className="mt-8 grid gap-6">
            {pastCollabs.map((collab, i) => (
              <Reveal key={collab.name} delay={i * 100}>
                <div className="overflow-hidden rounded-3xl border border-rose-100 bg-[#FDF4F7] shadow-[0_6px_20px_rgba(190,18,60,0.07)]">
                  <div className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="relative h-12 w-12 overflow-hidden rounded-full border border-rose-200">
                        <Image
                          src={collab.iconSrc}
                          alt={`${collab.name}のアイコン`}
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-sm font-bold text-[#5b3a4a]"
                          style={{ fontFamily: HEADING_FONT }}
                        >
                          {collab.name}
                        </p>
                        <a
                          href={collab.xUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#1d1d1f] px-3 py-1 text-xs font-bold text-white transition-transform hover:-translate-y-0.5"
                        >
                          <XIcon className="h-3 w-3" />
                          {collab.xHandle}
                        </a>
                      </div>
                    </div>
                    <p
                      className="mt-4 text-base font-bold text-rose-600"
                      style={{ fontFamily: HEADING_FONT }}
                    >
                      {collab.projectTitle}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-[#7a5868]">
                      {collab.description}
                    </p>
                    {collab.works.length > 0 && (
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        {collab.works.slice(0, 3).map((work) => (
                          <div
                            key={work.src}
                            className="relative aspect-square overflow-hidden rounded-xl border border-rose-100 bg-white"
                          >
                            <Image
                              src={work.src}
                              alt={work.alt}
                              fill
                              sizes="(max-width: 768px) 30vw, 140px"
                              className="object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    <Link
                      href={collab.guideHref}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-4 py-2 text-sm font-bold text-rose-700 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                    >
                      {collab.guideLabel}
                      <ArrowIcon className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== コラボでできること ===== */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-md">
          <Reveal>
            <h2
              className="text-center text-2xl leading-snug text-[#5b3a4a]"
              style={{ fontFamily: HEADING_FONT }}
            >
              コラボでできること
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-5">
            {benefits.map((b, i) => (
              <Reveal key={b.title} delay={i * 80}>
                <div className="flex gap-4 rounded-3xl border border-rose-100 bg-white p-5 shadow-[0_6px_20px_rgba(190,18,60,0.06)]">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-400 to-rose-500 text-white shadow-sm">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-6 w-6">
                      {b.icon}
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h3
                      className="text-base font-bold text-[#5b3a4a]"
                      style={{ fontFamily: HEADING_FONT }}
                    >
                      {b.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#7a5868]">
                      {b.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== コラボの流れ ===== */}
      <section className="bg-white px-6 py-16">
        <div className="mx-auto max-w-md">
          <Reveal>
            <h2
              className="text-center text-2xl text-[#5b3a4a]"
              style={{ fontFamily: HEADING_FONT }}
            >
              コラボの流れ
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-5">
            {steps.map((s, i) => (
              <Reveal key={s.no} delay={i * 80}>
                <div className="relative rounded-3xl border border-rose-100 bg-[#FDF4F7] p-5 pt-7">
                  <span
                    className={`absolute -top-2 left-6 rounded-sm px-3 py-0.5 text-xs font-bold text-[#5b3a4a] ${s.tape}`}
                    style={{ fontFamily: HEADING_FONT }}
                  >
                    STEP {s.no}
                  </span>
                  <h3
                    className="text-base font-bold text-[#5b3a4a]"
                    style={{ fontFamily: HEADING_FONT }}
                  >
                    {s.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#7a5868]">
                    {s.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-md">
          <Reveal>
            <h2
              className="text-center text-2xl text-[#5b3a4a]"
              style={{ fontFamily: HEADING_FONT }}
            >
              よくある質問
            </h2>
          </Reveal>
          <div className="mt-8 grid gap-3">
            {faqs.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <details className="group rounded-2xl border border-rose-100 bg-white p-4 open:shadow-[0_6px_20px_rgba(190,18,60,0.06)]">
                  <summary
                    className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-[#5b3a4a]"
                    style={{ fontFamily: HEADING_FONT }}
                  >
                    {f.q}
                    <span className="shrink-0 text-rose-400 transition-transform group-open:rotate-45">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden className="h-4 w-4">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-[#7a5868]">
                    {f.a}
                  </p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 締めCTA ===== */}
      <section className="relative overflow-hidden px-6 pb-28 pt-10 text-center">
        <Sparkle className="pe-float absolute left-10 top-6 h-5 w-5 text-pink-300" />
        <Sparkle className="pe-float absolute right-8 top-14 h-6 w-6 text-rose-400" />
        <Reveal>
          <h2
            className="bg-gradient-to-b from-pink-500 to-rose-600 bg-clip-text text-2xl leading-snug text-transparent"
            style={{ fontFamily: HEADING_FONT }}
          >
            次の企画を、
            <br />
            あなたと一緒に作りたい。
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-4 text-sm leading-relaxed text-[#7a5868]">
            「こんな企画はできる？」の段階でも大丈夫。
            <br />
            まずは気軽にお話ししましょう。
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="mt-8">
            <ConsultButton />
          </div>
        </Reveal>
        <Reveal delay={320}>
          <p className="mt-8 text-xs text-[#9a7888]">
            プロンプトの掲載(One-Tap Style クリエイター)をお考えの方は{" "}
            <Link href="/creators" className="font-bold text-rose-600 underline underline-offset-2">
              こちら
            </Link>
          </p>
        </Reveal>
      </section>
    </main>
  );
}
