"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* eslint-disable @next/next/no-page-custom-font -- 日本語の動的サブセットを使うため意図的に <link> で読み込む */

// やわらかい登場アニメ(WaferGuide と同じ控えめな設定)
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
// 辞典らしい明朝の見出し
const HEADING_FONT = "'Shippori Mincho', 'Hiragino Mincho ProN', serif";

// 和のパレット: 和紙 #F8F4EA / 墨 #3B3630 / 朱 #B54434 / 藍 #33538C
const INK = "#3b3630";
const SUMI_SUB = "#6f675c";
const SHU = "#b54434";

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
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof IntersectionObserver === "undefined"
    ) {
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

function XLink({ handle, url }: { handle: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full bg-[#1d1d1f] px-3 py-1.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b54434]/40"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      {handle}
    </a>
  );
}

export interface KotowazaEntry {
  no: string;
  /** ことわざ名(見出し語)。 */
  name: string;
  /** よみがな。 */
  reading: string;
  /** 意味・ひとこと解説。 */
  meaning: string;
  /** イラスト(サムネ)のパス。未確定の間は null で「準備中」表示。 */
  src: string | null;
}

// ことわざ6語(雑葉さん提供イラスト)。公開前ティザーとして先頭3語のみ公開し、
// 04〜06 は「？？？」で伏せる(名前・読みも bundle に載せない)。
// 企画スタート時に下の3項を差し替えて全公開する:
//   04 鶴の一声【つるのひとこえ】議論をぴたりとまとめる、力のあるひとこと
//      src: /collections/kotowaza/tsuru-no-hitokoe.webp
//   05 猿も木から落ちる【さるもきからおちる】名人でも、ときには失敗するということ
//      src: /collections/kotowaza/saru-mo-ki.webp
//   06 牛の歩みも千里【うしのあゆみもせんり】歩みはおそくても、こつこつ続ければ遠くまで行けること
//      src: /collections/kotowaza/ushi-no-ayumi.webp
const KOTOWAZA_ENTRIES: KotowazaEntry[] = [
  {
    no: "01",
    name: "猫の手も借りたい",
    reading: "ねこのてもかりたい",
    meaning: "とてもいそがしくて、どんな手伝いでもほしいようす",
    src: "/collections/kotowaza/neko-no-te.webp",
  },
  {
    no: "02",
    name: "馬の耳に念仏",
    reading: "うまのみみにねんぶつ",
    meaning: "いくら言い聞かせても、まるで効き目がないこと",
    src: "/collections/kotowaza/uma-no-mimi.webp",
  },
  {
    no: "03",
    name: "虎の威を借る狐",
    reading: "とらのいをかるきつね",
    meaning: "強いものの力をかさに着て、いばること",
    src: "/collections/kotowaza/tora-no-i.webp",
  },
  {
    no: "04",
    name: "？？？",
    reading: "きんじつこうかい",
    meaning: "どんなことわざかは、企画スタートのお楽しみ！",
    src: null,
  },
  {
    no: "05",
    name: "？？？",
    reading: "きんじつこうかい",
    meaning: "どんなことわざかは、企画スタートのお楽しみ！",
    src: null,
  },
  {
    no: "06",
    name: "？？？",
    reading: "きんじつこうかい",
    meaning: "どんなことわざかは、企画スタートのお楽しみ！",
    src: null,
  },
];

const PERIOD_LABEL = "企画期間：7/18 (土) 18:00 〜 7/26 (日) 21:59";

export function KotowazaGuide({
  threshold,
  entries = KOTOWAZA_ENTRIES,
}: {
  threshold: number;
  entries?: KotowazaEntry[];
}) {
  const steps: {
    n: string;
    t: string;
    b: string;
    href?: string;
  }[] = [
    {
      n: "01",
      t: "ことわざのスタイルで生成",
      b: "One-Tap Style ページで「ことわざ辞典」シリーズのスタイルを選んで、ことわざの世界のうちの子を生成！",
      href: "/style",
    },
    {
      n: "02",
      t: "あつめて辞典の項を埋める",
      b: "生成するたびに、コレクションカードの枠がひとつずつ埋まっていきます。",
    },
    {
      n: "03",
      t: `【上巻】${threshold}語そろえてコンプリート`,
      b: `${threshold}種類そろえると、${threshold}枚を飾れる限定コンプリートカードが完成！`,
    },
    {
      n: "04",
      t: "コンプリートで【下巻】解放！",
      b: `【上巻】の${threshold}語をそろえると、あたらしい${threshold}語の【下巻】が出現。下巻もそろえて、全${threshold * 2}語の辞典を完成させよう！`,
    },
    {
      n: "05",
      t: "ダウンロード＆シェア",
      b: "完成したカードはそのまま画像でダウンロード。SNS でシェアして自慢しよう！",
    },
  ];

  return (
    <main className="overflow-x-hidden bg-[#f8f4ea] text-[#3b3630]">
      <style>{`
        @keyframes kw-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
        .kw-float { animation: kw-float 7s ease-in-out infinite; }
        /* 和紙の目のような、ごく薄い斜めの地紋 */
        .kw-washi {
          background-image: repeating-linear-gradient(
            -45deg,
            rgba(59, 54, 48, 0.025) 0 1px,
            transparent 1px 9px
          );
        }
        @media (prefers-reduced-motion: reduce){ .kw-float { animation:none } }
      `}</style>
      <link
        href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;600;700&display=swap"
        rel="stylesheet"
      />

      {/* ===== Hero ===== */}
      <section className="kw-washi relative overflow-hidden px-6 pb-14 pt-12 text-center">
        {/* 朱の落款(らっかん)風あしらい */}
        <span
          className="kw-float absolute right-8 top-10 flex h-12 w-12 rotate-6 items-center justify-center rounded-md border-2 text-lg font-bold"
          style={{ borderColor: SHU, color: SHU, fontFamily: HEADING_FONT }}
          aria-hidden
        >
          諺
        </span>
        <Reveal>
          <span
            className="inline-block rounded-full border-2 border-dashed px-4 py-1 text-xs font-bold"
            style={{ borderColor: "#c9b8a0", color: SHU, backgroundColor: "rgba(255,255,255,0.7)", fontFamily: HEADING_FONT }}
          >
            【上巻】全{threshold}語 ✦ ことわざ辞典
          </span>
        </Reveal>
        <Reveal delay={100}>
          <h1
            className="mt-5 text-3xl leading-[1.5] sm:text-4xl"
            style={{ color: INK, fontFamily: HEADING_FONT }}
          >
            うちの子の
            <br />
            ことわざ辞典
          </h1>
        </Reveal>
        <Reveal delay={160}>
          {/* 辞書の見出し語風 */}
          <p className="mt-3 text-sm tracking-[0.35em]" style={{ color: SUMI_SUB, fontFamily: HEADING_FONT }}>
            【こと-わざ・じてん】
          </p>
        </Reveal>
        <Reveal delay={200}>
          <p className="mt-4 text-sm leading-loose" style={{ color: SUMI_SUB }}>
            うちの子が、ことわざの世界の住人に。
            <br />
            全{threshold}語あつめて、じぶんだけの辞典をコンプリート。
          </p>
        </Reveal>
        <Reveal delay={220}>
          {/* 下巻の存在だけを予告(中身はシークレット)。/style では上巻完走まで
              下巻カテゴリが一切表示されないため、ここで匂わせておく。 */}
          <p
            className="mx-auto mt-3 max-w-sm rounded-2xl border border-dashed px-4 py-2 text-xs leading-relaxed"
            style={{ borderColor: "#dccdb6", color: SHU, backgroundColor: "rgba(255,255,255,0.6)" }}
          >
            さらに──【上巻】をコンプリートすると、秘密の
            <span className="font-bold">【下巻】</span>（{threshold}語）が解放。
            <br />
            あわせて<span className="font-bold">全{threshold * 2}語</span>の大辞典に！
          </p>
        </Reveal>
        <Reveal delay={250}>
          <p
            className="mt-4 inline-block rounded-full border bg-white/80 px-5 py-1.5 text-sm font-bold"
            style={{ borderColor: "#dccdb6", color: SHU, fontFamily: HEADING_FONT }}
          >
            {PERIOD_LABEL}
          </p>
        </Reveal>

        {/* ことわざ勢ぞろい(6コマ) */}
        <Reveal delay={300}>
          <div className="mx-auto mt-8 grid max-w-md grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
            {entries.map((k, i) => (
              <div
                key={k.no}
                className="kw-float relative aspect-[4/5] overflow-hidden rounded-xl border shadow-sm"
                style={{ borderColor: "#dccdb6", backgroundColor: "#fffdf8", animationDelay: `${i * 0.35}s` }}
              >
                {k.src ? (
                  <Image src={k.src} alt={k.name} fill sizes="120px" className="object-cover" />
                ) : (
                  <span
                    className="flex h-full w-full items-center justify-center text-2xl font-bold"
                    style={{ color: "#d8c9b2", fontFamily: HEADING_FONT }}
                    aria-hidden
                  >
                    ？
                  </span>
                )}
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={400}>
          <Link
            href="/style"
            className="mt-9 inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-base font-bold text-white shadow-[0_5px_0_rgba(122,38,26,0.35)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#b54434]/30"
            style={{ backgroundColor: SHU, fontFamily: HEADING_FONT }}
          >
            いますぐあつめる
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <p className="mt-3 text-xs" style={{ color: "#9c9184" }}>
            企画がスタートしたら対象の「ことわざ辞典」シリーズが表示されます！
          </p>
        </Reveal>
      </section>

      {/* ===== コラボ クレジット ===== */}
      <section className="px-6 pb-6">
        <Reveal>
          <div
            className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border bg-white/80 px-5 py-4 text-center"
            style={{ borderColor: "#dccdb6" }}
          >
            <span
              className="text-xs font-bold tracking-[0.2em]"
              style={{ color: SHU, fontFamily: HEADING_FONT }}
            >
              ✦ COLLABORATION ✦
            </span>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs" style={{ color: "#9c9184" }}>プロンプト提供</span>
                <Image
                  src="/collections/kotowaza/user-icons/zatsuha-icon.webp"
                  alt="雑葉(@sacher10610) のアイコン"
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-full border object-cover shadow-sm"
                  style={{ borderColor: "#dccdb6" }}
                />
                <XLink handle="@sacher10610" url="https://x.com/sacher10610" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs" style={{ color: "#9c9184" }}>企画・主催</span>
                <Image
                  src="/collections/wafer/user-icons/mikifuku-icon.webp"
                  alt="@mickey_fuku のアイコン"
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-full border object-cover shadow-sm"
                  style={{ borderColor: "#dccdb6" }}
                />
                <XLink handle="@mickey_fuku" url="https://x.com/mickey_fuku" />
              </div>
            </div>
            <span
              className="text-xs font-bold"
              style={{ color: SHU, fontFamily: HEADING_FONT }}
            >
              フォローしてね！いいことあるかも！
            </span>
          </div>
        </Reveal>
      </section>

      {/* ===== 6語のことわざ ===== */}
      <section className="bg-white/70 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-center text-2xl" style={{ color: INK, fontFamily: HEADING_FONT }}>
              あつめる、{threshold}語のことわざ
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mt-2 text-center text-sm" style={{ color: SUMI_SUB }}>
              ことわざの世界のうちの子を集めよう！ぜんぶで{threshold}語！
            </p>
          </Reveal>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {entries.map((k, i) => (
              <Reveal key={k.no} delay={i * 80}>
                {/* 国語辞典の「項」風カード */}
                <div className="relative rounded-3xl border bg-white p-5 shadow-[0_6px_18px_rgba(75,60,40,0.08)]" style={{ borderColor: "#e8ddc9" }}>
                  {/* 朱の項番ラベル(辞書のツメ風) */}
                  <span
                    className="absolute -top-2 left-6 rounded-sm px-2 py-0.5 text-[11px] font-bold text-white"
                    style={{ backgroundColor: SHU, fontFamily: HEADING_FONT }}
                  >
                    其の{k.no}
                  </span>
                  <div
                    className="relative mx-auto aspect-[4/5] w-44 overflow-hidden rounded-2xl border-2 border-dashed"
                    style={{ borderColor: "#dccdb6", backgroundColor: "#faf7f0" }}
                  >
                    {k.src ? (
                      <Image src={k.src} alt={k.name} fill sizes="176px" className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1" style={{ color: "#c9b8a0" }}>
                        <span className="text-4xl font-bold" style={{ fontFamily: HEADING_FONT }} aria-hidden>？</span>
                        <span className="text-xs font-bold">お楽しみに</span>
                      </div>
                    )}
                  </div>
                  <p className="mt-4 text-center text-xs font-bold tracking-widest" style={{ color: SHU }}>
                    No.{k.no} / {threshold.toString().padStart(2, "0")}
                  </p>
                  {/* 見出し語 + よみ(辞書レイアウト) */}
                  <p className="mt-1 text-center text-lg" style={{ color: INK, fontFamily: HEADING_FONT }}>
                    {k.name}
                  </p>
                  <p className="mt-0.5 text-center text-[11px] tracking-[0.2em]" style={{ color: "#9c9184" }}>
                    【{k.reading}】
                  </p>
                  <p className="mt-1 text-center text-sm" style={{ color: SUMI_SUB }}>{k.meaning}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== あそびかた ===== */}
      <section className="kw-washi px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <h2 className="text-center text-2xl" style={{ color: INK, fontFamily: HEADING_FONT }}>
              あそびかた
            </h2>
          </Reveal>
          <div className="mt-10 space-y-4">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 80}>
                <div className="flex items-start gap-4 rounded-3xl border bg-white/80 p-5" style={{ borderColor: "#e8ddc9" }}>
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg text-white"
                    style={{ backgroundColor: SHU, fontFamily: HEADING_FONT }}
                  >
                    {s.n}
                  </span>
                  <div>
                    <p className="text-lg" style={{ color: INK, fontFamily: HEADING_FONT }}>
                      {s.t}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed" style={{ color: SUMI_SUB }}>{s.b}</p>
                    {s.href ? (
                      <>
                        <Link
                          href={s.href}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b54434]/40"
                          style={{ backgroundColor: "#f3e6d8", color: SHU, fontFamily: HEADING_FONT }}
                        >
                          Style ページをひらく
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4">
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </Link>
                        <p className="mt-2 text-xs" style={{ color: "#9c9184" }}>
                          企画がスタートしたら対象の「ことわざ辞典」シリーズが表示されます！
                        </p>
                      </>
                    ) : null}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 完成イメージ + DL/シェア訴求 ===== */}
      <section className="bg-white/70 px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <div
              className="rounded-[2rem] border-2 border-dashed bg-white p-6 text-center shadow-[0_8px_24px_rgba(75,60,40,0.08)] sm:p-8"
              style={{ borderColor: "#d8c9b2" }}
            >
              <h2 className="text-2xl leading-relaxed" style={{ color: INK, fontFamily: HEADING_FONT }}>
                そろえたら、特別なカードをGET！
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm leading-loose" style={{ color: SUMI_SUB }}>
                {threshold}語そろえると、あなただけの特別なコンプリートカードが完成。
                そのまま画像でダウンロードして、SNS でシェアして自慢しよう！
                <br />
                <span className="font-bold" style={{ color: SHU }}>
                  【上巻】【下巻】それぞれでカードが作れます。
                </span>
              </p>
              <div
                className="relative mx-auto mt-6 aspect-[4/5] w-full max-w-[280px] overflow-hidden rounded-2xl border shadow-[0_6px_18px_rgba(75,60,40,0.12)]"
                style={{ borderColor: "#e8ddc9" }}
              >
                {/* 公開前ティザー: 画像内に伏せ字中のことわざが写り込むため、
                    強めのぼかし+オーバーレイでシークレット表示にする。
                    企画スタート時に blur とオーバーレイを外して全公開する。 */}
                <Image
                  src="/collections/kotowaza/complete-sample.webp"
                  alt=""
                  fill
                  sizes="(max-width: 480px) 75vw, 280px"
                  className="scale-110 object-cover blur-lg"
                  aria-hidden
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/45">
                  <span
                    className="text-5xl font-bold"
                    style={{ color: SHU, fontFamily: HEADING_FONT }}
                    aria-hidden
                  >
                    ？
                  </span>
                  <span
                    className="rounded-full px-4 py-1.5 text-xs font-bold text-white shadow"
                    style={{ backgroundColor: SHU, fontFamily: HEADING_FONT }}
                  >
                    企画スタートでお披露目！
                  </span>
                </div>
              </div>
              <p className="mt-3 text-xs" style={{ color: "#9c9184" }}>
                ＼ 完成イメージはシークレット ／<br />※ 画像はイメージです。実際のカードとはデザイン・収録語が異なります。
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="kw-washi px-6 pb-20 pt-12 text-center">
        <Reveal>
          <p
            className="mx-auto mb-6 max-w-md text-base font-bold"
            style={{ color: SHU, fontFamily: HEADING_FONT }}
          >
            完成したカードは、SNSでシェアして自慢しよう！
          </p>
        </Reveal>
        <Reveal delay={140}>
          <Link
            href="/style"
            className="inline-flex items-center gap-2 rounded-full px-10 py-4 text-lg font-bold text-white shadow-[0_5px_0_rgba(122,38,26,0.35)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#b54434]/30"
            style={{ backgroundColor: SHU, fontFamily: HEADING_FONT }}
          >
            いますぐあつめる
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <p className="mt-3 text-xs" style={{ color: "#9c9184" }}>
            企画がスタートしたら対象の「ことわざ辞典」シリーズが表示されます！
          </p>
        </Reveal>
        <Reveal delay={100}>
          <p className="mx-auto mt-6 max-w-sm text-xs leading-relaxed" style={{ color: "#9c9184" }}>
            ※ あつめる・カードの保存にはログインが必要です。
          </p>
        </Reveal>
      </section>

      {/* ===== クリエイター相談(控えめなフッターリンク) ===== */}
      <div className="px-6 pb-10 text-center">
        <Link
          href="/creators"
          className="text-xs underline underline-offset-2 transition-colors"
          style={{ color: "#b3a794" }}
        >
          コラボご希望の方・プロンプト掲載のご相談はこちら ›
        </Link>
      </div>
    </main>
  );
}
