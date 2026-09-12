"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * 「うちの子のファッション雑誌：秋」企画LP。
 *
 * ## 設計の方針（2026-09-12 に作り直し）
 *
 * 初稿は月・ススキ・うさぎのイラストを敷き詰めた「季節のあいさつ状」になり、
 * 運営から「とてもダサい」と差し戻された。原因は**写真が無い余白を装飾で埋めた**こと。
 *
 * 作り直しにあたり、アパレルブランドの季節ルックブック(B:MING by BEAMS の
 * 2021 AUTUMN)を参照した。あちらの作りは:
 *
 *   - 写真が面積の 7〜8 割。寄り(手元・足元)と引き(全身)を交互に流す
 *   - 罫線・囲み・飾りが**ゼロ**。地は生成りに近い白で、写真の余白と地続き
 *   - 文字は最小限。大きな欧文の見出し + 小さな和文
 *   - リード文は**縦組み**で写真の余白に沿わせる
 *   - 章見出しは頭文字だけ大きく組む
 *   - 商品リストは `JACKET ¥17,600` のように淡々と左揃え
 *
 * ⭐ **読ませるページではなく、見せるページにする。**
 * 迷ったら文字と線を減らし、写真を大きくする。
 *
 * 企画固有値はこのファイル冒頭の定数に集約(終了後の差し替えを1箇所に)。
 */

const CAMPAIGN = {
  issueLabel: "AUTUMN ISSUE 2026",
  title: "うちの子のファッション雑誌",
  seasonLabel: "秋号",
  periodLabel: "9.19 FRI — 9.25 THU",
  pageCount: 7,
  prizeLabel: "Amazonギフト券 5,000円分",
  winnersLabel: "1名様",
  hashtag: "うちの子のファッション雑誌_秋",
  /** 2026年の中秋の名月。企画の最終日と一致する。 */
  moonNight: "9.25 中秋の名月",
  rulesPath: "/campaigns/fashion-magazine-autumn-selection",
} as const;

/**
 * 秋のルック。第1週(9/12〜9/18)に毎朝1つ公開するコーデと対応する。
 *
 * `image` は LP 用に選んだ作例。プリセットのサムネイルとは別に持つ
 * (LP は編集物なので、誌面として見せたい1枚を選べるようにする)。
 */
const LOOKS: readonly {
  key: string;
  initial: string;
  rest: string;
  labelJa: string;
  copy: string;
  image: string;
}[] = [
  {
    key: "casual",
    initial: "C",
    rest: "ASUAL",
    labelJa: "カジュアル",
    copy: "ニットとチェック。肩の力を抜いた、いつもの秋。",
    image: "/collections/fashion-magazine-autumn/looks/casual.webp",
  },
  {
    key: "elegant",
    initial: "E",
    rest: "LEGANT",
    labelJa: "エレガント",
    copy: "ブラウスとロングスカート。落ち葉の街を、静かに。",
    image: "/collections/fashion-magazine-autumn/looks/elegant.webp",
  },
  {
    key: "feminine",
    initial: "F",
    rest: "EMININE",
    labelJa: "フェミニン・ガーリー",
    copy: "花柄とフリル。やわらかい色で、秋をまとう。",
    image: "/collections/fashion-magazine-autumn/looks/feminine.webp",
  },
  {
    key: "street",
    initial: "S",
    rest: "TREET",
    labelJa: "ストリート・モード",
    copy: "レザーとチェック。夜の街に、少しの棘を。",
    image: "/collections/fashion-magazine-autumn/looks/street.webp",
  },
  {
    key: "dress",
    initial: "D",
    rest: "RESS",
    labelJa: "ドレス",
    copy: "紅のシフォン。今夜だけの、特別な階段。",
    image: "/collections/fashion-magazine-autumn/looks/dress.webp",
  },
  {
    key: "wafuku",
    initial: "W",
    rest: "AFUKU",
    labelJa: "和装",
    copy: "ススキとうさぎの着物で、月を待つ。",
    image: "/collections/fashion-magazine-autumn/looks/wafuku.webp",
  },
  {
    key: "ethnic",
    initial: "E",
    rest: "THNIC",
    labelJa: "民族・エスニック",
    copy: "刺繍と織り。遠い国の秋を、少しだけ。",
    image: "/collections/fashion-magazine-autumn/looks/ethnic.webp",
  },
];

/** 誌面の構成(スタイルプリセット7種と対応)。 */
const CONTENTS: readonly { no: string; label: string }[] = [
  { no: "01", label: "COVER" },
  { no: "02", label: "OPENING" },
  { no: "03", label: "MAIN VISUAL" },
  { no: "04", label: "DETAILS" },
  { no: "05", label: "STORY" },
  { no: "06", label: "KEYWORDS" },
  { no: "07", label: "BACK COVER" },
];

/** 写真の色を邪魔しない地。参考LPと同じく、ほぼ白。 */
const COLOR = {
  paper: "#f7f5f1",
  ink: "#1a1a1a",
  sub: "#8a8279",
} as const;

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * 縦中横(たてちゅうよこ)。縦組みの中で数字を正立させる。
 *
 * `writing-mode: vertical-rl` では欧文・数字が既定で 90 度倒れる。
 * 日本語組版では 1〜2 桁の数字は正立させるのが普通で、その指定が
 * `text-combine-upright: all`。組版の作法なので専用の部品にしておく。
 */
function Tcy({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ textCombineUpright: "all" } as React.CSSProperties}>
      {children}
    </span>
  );
}

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
        if (entries[0]?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "-8% 0px" }
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
        transform: shown ? "none" : "translateY(16px)",
        transition: `opacity 900ms ${EASE} ${delay}ms, transform 900ms ${EASE} ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * ルック1件。写真は全幅、文字は写真の下に小さく。
 * 未入稿(image が空)のあいだは枠だけ置いて、順番が分かるようにする。
 */
function LookBlock({
  look,
  index,
}: {
  look: (typeof LOOKS)[number];
  index: number;
}) {
  return (
    <section className="mt-16 first:mt-0">
      <Reveal>
        {look.image ? (
          <Image
            src={look.image}
            alt={`${look.labelJa}の秋コーデ作例`}
            width={1100}
            height={1650}
            sizes="(max-width: 768px) 100vw, 768px"
            priority={index === 0}
            className="h-auto w-full"
          />
        ) : (
          <div
            className="flex aspect-[2/3] w-full items-center justify-center"
            style={{ background: "#eae6df" }}
          >
            <span
              className="text-[10px] tracking-[0.4em]"
              style={{ color: COLOR.sub, fontFamily: "'Jost', sans-serif" }}
            >
              COMING SOON
            </span>
          </div>
        )}
      </Reveal>

      <Reveal delay={80}>
        <div className="px-6 pt-5">
          <h3 className="flex items-baseline">
            <span
              className="text-[34px] leading-none"
              style={{ fontFamily: "'Jost', sans-serif", fontWeight: 300 }}
            >
              {look.initial}
            </span>
            <span
              className="ml-0.5 text-[13px] tracking-[0.22em]"
              style={{ fontFamily: "'Jost', sans-serif", fontWeight: 400 }}
            >
              {look.rest}
            </span>
          </h3>
          <p className="mt-1 text-[11px] tracking-[0.2em]" style={{ color: COLOR.sub }}>
            {look.labelJa}
          </p>
          <p className="mt-3 text-[13px] leading-[2]">{look.copy}</p>
        </div>
      </Reveal>
    </section>
  );
}

export function FashionMagazineAutumnGuide() {
  const hero = LOOKS.find((l) => l.key === "wafuku");

  return (
    <div
      className="min-h-screen"
      style={{
        background: COLOR.paper,
        color: COLOR.ink,
        fontFamily:
          "'Zen Kaku Gothic New', 'Hiragino Sans', 'Noto Sans JP', sans-serif",
      }}
    >
      {/* LP専用フォント。欧文は幾何学サンセリフ(Jost)、和文はゼンカクゴシック。
          明朝をやめたのは、参考LPが欧文サンセリフ主体で軽いため。 */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500&family=Zen+Kaku+Gothic+New:wght@400;500&display=swap"
        rel="stylesheet"
      />

      {/* ============ 表紙 ============ */}
      <header className="relative">
        {hero?.image ? (
          <Image
            src={hero.image}
            alt="うちの子のファッション雑誌 秋号のメインビジュアル。満月の夜、ススキとうさぎの着物をまとったモデル"
            width={1100}
            height={1650}
            priority
            sizes="100vw"
            className="h-auto w-full"
          />
        ) : null}

        {/*
          誌名は写真の上に重ねる。参考LPと同じく、大きな欧文 + 小さな和文。
          ⚠️ 白文字を写真に直接置いたら背景に負けて読めなかった(試作で確認)。
          下から黒のグラデーションを敷いて、文字の下だけ暗くする。
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.32) 45%, rgba(0,0,0,0) 100%)",
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-6 pb-8">
          <p
            className="text-[10px] tracking-[0.45em] text-white/85"
            style={{ fontFamily: "'Jost', sans-serif" }}
          >
            {CAMPAIGN.issueLabel}
          </p>
          <h1
            className="mt-2 text-[30px] leading-[1.15] text-white"
            style={{ fontFamily: "'Jost', sans-serif", fontWeight: 300 }}
          >
            BRAND NEW
            <br />
            AUTUMN
          </h1>
          <p className="mt-3 text-[12px] tracking-[0.2em] text-white/90">
            {CAMPAIGN.title}・{CAMPAIGN.seasonLabel}
          </p>
        </div>
      </header>

      {/*
        リード(縦組み)。
        ⚠️ 高さを固定したら行が下に溢れ、ボトムナビに隠れた。
        縦組みは「行の長さ = 高さ」なので、`height` ではなく
        `max-height` で頭打ちにして、内容にあわせて縮む形にする。
      */}
      <section className="flex justify-end px-6 py-14">
        <Reveal>
          <p
            className="text-[13px] leading-[2.4] tracking-[0.12em]"
            style={{
              writingMode: "vertical-rl",
              maxHeight: "17rem",
            }}
          >
            日が短くなって、風のにおいが変わるころ。
            <br />
            うちの子に、秋の服を。
            <br />
            全<Tcy>{CAMPAIGN.pageCount}</Tcy>ページの誌面がそろうと、
            <br />
            めくって読める<Tcy>1</Tcy>冊になります。
          </p>
        </Reveal>
      </section>

      {/* ============ ルック ============ */}
      <div className="pb-4">
        {LOOKS.map((look, i) => (
          <LookBlock key={look.key} look={look} index={i} />
        ))}
      </div>

      {/* ============ 誌面構成 ============ */}
      <section className="px-6 pt-20">
        <Reveal>
          <h2 className="flex items-baseline">
            <span
              className="text-[34px] leading-none"
              style={{ fontFamily: "'Jost', sans-serif", fontWeight: 300 }}
            >
              C
            </span>
            <span
              className="ml-0.5 text-[13px] tracking-[0.22em]"
              style={{ fontFamily: "'Jost', sans-serif" }}
            >
              ONTENTS
            </span>
          </h2>
          <p className="mt-1 text-[11px] tracking-[0.2em]" style={{ color: COLOR.sub }}>
            今号の誌面構成
          </p>

          <ul className="mt-6 space-y-2.5">
            {CONTENTS.map((c) => (
              <li
                key={c.no}
                className="flex items-baseline gap-4 text-[12px] tracking-[0.14em]"
                style={{ fontFamily: "'Jost', sans-serif" }}
              >
                <span style={{ color: COLOR.sub }}>{c.no}</span>
                <span>{c.label}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* ============ 応募 ============ */}
      <section className="px-6 pt-20">
        <Reveal>
          <h2 className="flex items-baseline">
            <span
              className="text-[34px] leading-none"
              style={{ fontFamily: "'Jost', sans-serif", fontWeight: 300 }}
            >
              P
            </span>
            <span
              className="ml-0.5 text-[13px] tracking-[0.22em]"
              style={{ fontFamily: "'Jost', sans-serif" }}
            >
              RESENT
            </span>
          </h2>

          <ul className="mt-6 space-y-2.5 text-[12px] tracking-[0.14em]">
            <li className="flex items-baseline gap-4">
              <span style={{ color: COLOR.sub, minWidth: "5.5rem" }}>賞品</span>
              <span>{CAMPAIGN.prizeLabel}</span>
            </li>
            <li className="flex items-baseline gap-4">
              <span style={{ color: COLOR.sub, minWidth: "5.5rem" }}>当選</span>
              <span>運営が選出・{CAMPAIGN.winnersLabel}</span>
            </li>
            <li className="flex items-baseline gap-4">
              <span style={{ color: COLOR.sub, minWidth: "5.5rem" }}>応募方法</span>
              <span>#{CAMPAIGN.hashtag} を付けてXでシェア</span>
            </li>
            <li className="flex items-baseline gap-4">
              <span style={{ color: COLOR.sub, minWidth: "5.5rem" }}>会期</span>
              <span style={{ fontFamily: "'Jost', sans-serif" }}>
                {CAMPAIGN.periodLabel}
              </span>
            </li>
          </ul>

          <p className="mt-6 text-[11px] leading-[2]" style={{ color: COLOR.sub }}>
            ご応募は無料です。ペルコインのご購入は選出に一切影響しません。
            <br />
            <Link href={CAMPAIGN.rulesPath} className="underline underline-offset-4">
              応募規約
            </Link>
          </p>
        </Reveal>
      </section>

      {/* ============ 締め ============ */}
      <section className="px-6 pb-24 pt-20 text-center">
        <Reveal>
          <p
            className="text-[11px] tracking-[0.4em]"
            style={{ color: COLOR.sub, fontFamily: "'Jost', sans-serif" }}
          >
            {CAMPAIGN.moonNight}
          </p>
          <p className="mt-4 text-[13px] leading-[2]">
            今年の十五夜は、うちの子と。
          </p>
          <Link
            href="/style"
            className="mt-8 inline-block border-b pb-1 text-[12px] tracking-[0.3em]"
            style={{ borderColor: COLOR.ink, fontFamily: "'Jost', sans-serif" }}
          >
            START STYLING
          </Link>
        </Reveal>
      </section>
    </div>
  );
}
