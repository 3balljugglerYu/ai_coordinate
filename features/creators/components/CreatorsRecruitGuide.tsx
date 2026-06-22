"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* eslint-disable @next/next/no-page-custom-font -- 日本語の動的サブセットを使うため意図的に <link> で読み込む */

// やわらかい登場アニメ(やりすぎない)
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
// 手づくり感のある丸ゴシック見出し
const HEADING_FONT = "'Zen Maru Gothic', system-ui, sans-serif";

// ===== 応募導線(X DM) =====
const APPLY_X_HANDLE = "@mickey_fuku";
const APPLY_X_URL = "https://x.com/mickey_fuku";

export interface GalleryImage {
  src: string;
  alt: string;
}

// ギャラリー/タイルが空のときのフォールバック(神コレ画像)
const FALLBACK_LOOKS: GalleryImage[] = [
  { src: "/collections/wafer/god/aphrodite.webp", alt: "作例" },
  { src: "/collections/wafer/god/zeus.webp", alt: "作例" },
  { src: "/collections/wafer/god/isis.webp", alt: "作例" },
  { src: "/collections/wafer/god/athena.webp", alt: "作例" },
  { src: "/collections/wafer/god/artemis.webp", alt: "作例" },
  { src: "/collections/wafer/god/odin.webp", alt: "作例" },
];

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

function ConsultButton({
  size = "lg",
  label = "気軽に相談する",
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
      className={`inline-flex items-center gap-2 rounded-full bg-orange-500 font-bold text-white shadow-[0_5px_0_rgba(234,88,12,0.3)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200 ${pad}`}
      style={{ fontFamily: HEADING_FONT }}
    >
      <XIcon className="h-5 w-5" />
      {label}
    </a>
  );
}

export function CreatorsRecruitGuide({
  galleryImages = [],
}: {
  galleryImages?: GalleryImage[];
}) {
  const [barShown, setBarShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setBarShown(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const looks = galleryImages.length > 0 ? galleryImages : FALLBACK_LOOKS;
  const heroTiles = looks.slice(0, 6);
  const marquee = looks.slice(0, 12);

  const benefits: {
    title: string;
    body: string;
    icon: ReactNode;
    image?: GalleryImage;
  }[] = [
    {
      title: "あなたの名前とアイコンを常に表示",
      body: "あなたの作品は、ニックネームとアイコン付きで掲載。使った人はあなたのプロフィールへ飛べます。",
      icon: (
        <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6Z" />
      ),
      image: {
        src: "/creators/benefit-credit-4.jpg",
        alt: "Style画面で提供者(mario さん)のアイコンと名前がカードに表示されている様子",
      },
    },
    {
      title: "プロンプトは非公開で守られる",
      body: "公開されるのは“画像だけ”。生成プロンプト(レシピ)は秘匿され、まねされません。ペルスタだけの仕組みです。",
      icon: (
        <path d="M6 10V7a6 6 0 1 1 12 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1Zm2 0h8V7a4 4 0 1 0-8 0v3Z" />
      ),
    },
    {
      title: "公開も非公開も、あなた次第",
      body: "掲載のオン・オフは運営と相談しながらコントロール。あくまであなたの作品です。",
      icon: (
        <path d="M12 1 3 5v6c0 5 3.8 9.7 9 11 5.2-1.3 9-6 9-11V5l-9-4Zm0 10.9h7c-.5 3.8-3.1 7.2-7 8.4V12H5V6.3l7-3.1V11.9Z" />
      ),
    },
    {
      title: "プロンプトが、みんなの定番になる",
      body: "一度載れば、何人ものうちの子に使われ続ける。あなたのプロンプトが“資産”として積み上がります。",
      icon: (
        <path d="M12 .6 9.2 7.6 1.7 8.1l5.7 4.8L5.5 20l6.5-3.9L18.5 20l-1.9-7.1 5.7-4.8-7.5-.5L12 .6Z" />
      ),
    },
  ];

  const steps = [
    {
      no: "01",
      title: "相談する",
      body: "X(DM)から「掲載したい / 話を聞きたい」とご連絡ください。作品やSNSを見せていただけるとスムーズです。",
      tape: "bg-amber-200/80",
    },
    {
      no: "02",
      title: "一緒に決める",
      body: "どのように載せるかを一緒に決めましょう。",
      tape: "bg-rose-200/80",
    },
    {
      no: "03",
      title: "One-Tap Style に掲載",
      body: "あなたのクレジット付きで公開。ファンがあなたを見つけられます。",
      tape: "bg-teal-200/80",
    },
    {
      no: "04",
      title: "みんながワンタップで使う",
      body: "全国のうちの子が、あなたのプロンプトで変身。使われるほど、あなたの名前が広がります。",
      tape: "bg-violet-200/80",
    },
  ];

  const faqs = [
    {
      q: "誰でも応募できますか？",
      a: "はい、基本オープンに歓迎しています。特に魅力的なプロンプト・シリーズは「神コレ」のような特別コラボ枠として大きくフィーチャーすることもあります。",
    },
    {
      q: "私のプロンプト(レシピ)は公開されますか？",
      a: "いいえ。公開されるのは生成された“画像だけ”です。生成プロンプトは非公開で保護され、第三者にまねされません。",
    },
    {
      q: "作品の権利は誰のものですか？",
      a: "あなたのものです。掲載時はクレジット(ニックネーム・アイコン)を明記します。",
    },
    {
      q: "途中で公開を止めたくなったら？",
      a: "運営と相談のうえ、いつでも非公開にできます。掲載のコントロールはあなたが持っています。",
    },
    {
      q: "報酬はありますか？",
      a: "現在は、名前・アイコンの掲載とファンへの露出が中心です。条件は個別にご相談ください。",
    },
    {
      q: "どんなプロンプトが向いていますか？",
      a: "「うちの子に使ってみたい！」と思わせる、魅力的なプロンプトや世界観。あなたらしい個性が一番の武器です。",
    },
  ];

  return (
    <main className="overflow-x-hidden bg-[#FBF6EE] text-[#5b4b3a]">
      <style>{`
        @keyframes pe-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
        .pe-float { animation: pe-float 7s ease-in-out infinite; }
        @keyframes cr-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .cr-marquee-track { animation: cr-marquee 32s linear infinite; }
        @media (prefers-reduced-motion: reduce){
          .pe-float, .cr-marquee-track { animation: none; }
        }
      `}</style>
      <link
        href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700&display=swap"
        rel="stylesheet"
      />

      {/* ===== 追従CTAバー ===== */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-100 bg-white/90 px-4 py-3 backdrop-blur transition-transform duration-300"
        style={{ transform: barShown ? "translateY(0)" : "translateY(120%)" }}
      >
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <p
            className="text-sm font-bold text-[#6b5a47]"
            style={{ fontFamily: HEADING_FONT }}
          >
            あなたのプロンプトを、ペルスタに。
          </p>
          <ConsultButton size="sm" />
        </div>
      </div>

      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden px-6 pb-16 pt-12 text-center">
        <Sparkle className="pe-float absolute left-8 top-10 h-5 w-5 text-amber-300" />
        <Sparkle className="pe-float absolute right-10 top-16 h-7 w-7 text-yellow-400" />
        <div className="relative">
          <Reveal>
            <span
              className="inline-block rounded-full border-2 border-dashed border-amber-300 bg-white/70 px-4 py-1 text-xs font-bold text-amber-600"
              style={{ fontFamily: HEADING_FONT }}
            >
              あなたのプロンプトを掲載しませんか！？
            </span>
          </Reveal>
          <Reveal delay={100}>
            <h1
              className="mt-5 bg-gradient-to-b from-amber-500 to-orange-600 bg-clip-text text-3xl leading-[1.45] text-transparent sm:text-4xl"
              style={{ fontFamily: HEADING_FONT }}
            >
              あなたの“プロンプト”が、
              <br />
              みんなのワンタップに。
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-4 text-sm leading-loose text-[#7a6a58]">
              あなたが作ったプロンプトを、Persta.AI の One-Tap Style に掲載。
              <br />
              全国のうちの子が、あなたのプロンプトでワンタップ変身できるように。
            </p>
          </Reveal>

          {/* 作例タイル */}
          <Reveal delay={300}>
            <div className="mx-auto mt-8 grid max-w-md grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
              {heroTiles.map((look, i) => (
                <div
                  key={`${look.src}-${i}`}
                  className={`pe-float relative aspect-square overflow-hidden rounded-xl border border-amber-200/70 shadow-sm ${
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

          <Reveal delay={400}>
            <div className="mt-9">
              <ConsultButton />
              <p className="mt-3 text-xs text-[#9a8a78]">
                X(DM)から気軽にどうぞ。「ちょっと話を聞きたい」だけでも大歓迎です。
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== 掲載されたクリエイター ===== */}
      <section className="px-6 py-14">
        <div className="mx-auto max-w-md">
          <Reveal>
            <h2
              className="text-center text-2xl text-[#5b4b3a]"
              style={{ fontFamily: HEADING_FONT }}
            >
              掲載されたクリエイター
            </h2>
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-6 rounded-3xl border border-amber-100 bg-white p-5 shadow-[0_6px_20px_rgba(120,90,50,0.08)]">
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 overflow-hidden rounded-full border border-amber-200">
                  <Image
                    src="/collections/wafer/user-icons/mario-icon.webp"
                    alt="mario さんのアイコン"
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-bold text-[#5b4b3a]"
                    style={{ fontFamily: HEADING_FONT }}
                  >
                    mario さん
                  </p>
                  <a
                    href="https://x.com/mario335599"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#1d1d1f] px-3 py-1 text-xs font-bold text-white transition-transform hover:-translate-y-0.5"
                  >
                    <XIcon className="h-3 w-3" />
                    @mario335599
                  </a>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[#7a6a58]">
                「うちの子の神コレクション」(全6種)は mario さんとのコラボ企画。
                女神・神さまに変身するプロンプトが、たくさんのうちの子に使われ、SNSでシェアされました。
              </p>
              <div className="mt-4 overflow-hidden rounded-2xl border border-amber-100">
                <Image
                  src="/collections/wafer/god-share.webp"
                  alt="神コレクション全6種のシェアイメージ"
                  width={1000}
                  height={525}
                  sizes="(max-width: 768px) 88vw, 420px"
                  className="h-auto w-full"
                />
              </div>
              <Link
                href="/collections/wafer"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                神コレの特設ページを見る
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== ベネフィット ===== */}
      <section className="bg-white px-6 py-16">
        <div className="mx-auto max-w-md">
          <Reveal>
            <h2
              className="text-center text-2xl leading-snug text-[#5b4b3a]"
              style={{ fontFamily: HEADING_FONT }}
            >
              One-Tap Style ページに“あなた”の名前を
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[#7a6a58]">
              掲載されると、One-Tap Style ページに、あなたのアイコンとニックネームが表示されます。タップするとあなたのプロフィールページにアクセスできます。自己紹介に X の URL を掲載することも可能です。
            </p>
            <div className="mt-5 text-center">
              <Link
                href="/style"
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-6 py-3 text-sm font-bold text-amber-700 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                style={{ fontFamily: HEADING_FONT }}
              >
                One-Tap Style へ
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </Reveal>
          <div className="mt-10 grid gap-5">
            {benefits.map((b, i) => (
              <Reveal key={b.title} delay={i * 80}>
                <div className="overflow-hidden rounded-3xl border border-amber-100 bg-[#FBF6EE]">
                  <div className="flex gap-4 p-5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-6 w-6">
                        {b.icon}
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h3
                        className="text-base font-bold text-[#5b4b3a]"
                        style={{ fontFamily: HEADING_FONT }}
                      >
                        {b.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-[#7a6a58]">
                        {b.body}
                      </p>
                    </div>
                  </div>
                  {b.image ? (
                    <div className="border-t border-amber-100 bg-white px-5 py-4">
                      <Image
                        src={b.image.src}
                        alt={b.image.alt}
                        width={900}
                        height={500}
                        sizes="(max-width: 768px) 88vw, 420px"
                        className="mx-auto h-auto w-full rounded-xl border border-amber-100"
                      />
                    </div>
                  ) : null}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 没入ギャラリー(現状のStyle登録コンテンツ) ===== */}
      <section className="overflow-hidden py-14">
        <Reveal>
          <p
            className="px-6 text-center text-2xl text-[#5b4b3a]"
            style={{ fontFamily: HEADING_FONT }}
          >
            プロンプト登録されているのは70種類以上
          </p>
        </Reveal>
        <div className="relative mt-8">
          <div className="flex w-max cr-marquee-track gap-4 px-4">
            {[...marquee, ...marquee].map((look, i) => (
              <div
                key={`${look.src}-${i}`}
                className="relative h-44 w-32 shrink-0 overflow-hidden rounded-2xl border border-amber-200/70 shadow-[0_6px_18px_rgba(120,90,50,0.12)]"
              >
                <Image
                  src={look.src}
                  alt={look.alt}
                  fill
                  sizes="128px"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </div>
        <Reveal delay={120}>
          <p className="mt-6 px-6 text-center text-sm leading-relaxed text-[#7a6a58]">
            あなたのプロンプトが何人ものうちの子に。
            <br />
            使われるほど、あなたの名前が広がっていきます。
          </p>
        </Reveal>
      </section>

      {/* ===== 掲載までの流れ ===== */}
      <section className="bg-white px-6 py-16">
        <div className="mx-auto max-w-md">
          <Reveal>
            <h2
              className="text-center text-2xl text-[#5b4b3a]"
              style={{ fontFamily: HEADING_FONT }}
            >
              掲載までの流れ
            </h2>
            <p className="mt-2 text-center text-sm text-[#7a6a58]">
              むずかしいことはありません。運営が伴走します。
            </p>
          </Reveal>
          <div className="mt-10 grid gap-5">
            {steps.map((s, i) => (
              <Reveal key={s.no} delay={i * 80}>
                <div className="relative rounded-3xl border border-amber-100 bg-[#FBF6EE] p-5 pt-7">
                  <span
                    className={`absolute -top-2 left-6 h-5 w-16 -rotate-3 rounded-sm ${s.tape}`}
                    aria-hidden
                  />
                  <div className="flex items-baseline gap-3">
                    <span
                      className="bg-gradient-to-b from-amber-500 to-orange-600 bg-clip-text text-2xl font-bold text-transparent"
                      style={{ fontFamily: HEADING_FONT }}
                    >
                      {s.no}
                    </span>
                    <h3
                      className="text-base font-bold text-[#5b4b3a]"
                      style={{ fontFamily: HEADING_FONT }}
                    >
                      {s.title}
                    </h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[#7a6a58]">
                    {s.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 募集の見せ方(オープン + 特別枠) ===== */}
      <section className="px-6 py-14">
        <div className="mx-auto grid max-w-md gap-4">
          <Reveal>
            <div className="rounded-3xl border-2 border-dashed border-amber-300 bg-white p-5 text-center">
              <p
                className="text-base font-bold text-amber-600"
                style={{ fontFamily: HEADING_FONT }}
              >
                どなたでも歓迎です
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#7a6a58]">
                プロンプトで「うちの子をこう見せたい」を形にできる方なら、はじめての方も大歓迎。
              </p>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="relative overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5">
              <Sparkle className="absolute right-4 top-4 h-5 w-5 text-amber-300" />
              <p
                className="text-center text-base font-bold text-orange-600"
                style={{ fontFamily: HEADING_FONT }}
              >
                ✦ 特別コラボ枠 ✦
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[#7a6a58]">
                ご提供いただいたプロンプトの中で、コレクション要素として面白そうと感じたものは、一緒にコラボ企画をしましょう。
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[#7a6a58]">
                盛り上げるために、私だけでなく提供者さまにも X でのポストや、ユーザーさんへのリプライ・引用リポストを積極的にお願いすることがあります。とはいえ進め方は、私がある程度リードしますのでご安心ください。
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="bg-white px-6 py-16">
        <div className="mx-auto max-w-md">
          <Reveal>
            <h2
              className="text-center text-2xl text-[#5b4b3a]"
              style={{ fontFamily: HEADING_FONT }}
            >
              よくある質問
            </h2>
          </Reveal>
          <div className="mt-8 grid gap-3">
            {faqs.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <details className="group rounded-2xl border border-amber-100 bg-[#FBF6EE] p-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-[#5b4b3a]">
                    <span style={{ fontFamily: HEADING_FONT }}>{f.q}</span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      className="h-4 w-4 shrink-0 text-amber-500 transition-transform group-open:rotate-180"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-[#7a6a58]">
                    {f.a}
                  </p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== ラスト大CTA ===== */}
      <section className="relative overflow-hidden px-6 pb-28 pt-16 text-center">
        <div className="relative">
          <Reveal>
            <Sparkle className="mx-auto h-8 w-8 text-amber-400" />
            <h2
              className="mt-4 bg-gradient-to-b from-amber-500 to-orange-600 bg-clip-text text-3xl leading-[1.45] text-transparent"
              style={{ fontFamily: HEADING_FONT }}
            >
              あなたのプロンプトを、
              <br />
              Persta.AI に。
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-4 text-sm leading-loose text-[#7a6a58]">
              「私も載せてみたいかも」と思ったら、それが相談のタイミングです。
            </p>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-8 flex flex-col items-center gap-3">
              <ConsultButton />
              <p className="mt-1 text-xs text-[#9a8a78]">
                X の {APPLY_X_HANDLE} まで、お気軽にDMください。
              </p>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
