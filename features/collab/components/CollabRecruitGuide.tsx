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
      body: "単発の掲載ではなく、「うちの子の◯◯」という特設企画として展開します。専用ページ・バナー・SNS告知までセットでご用意します。",
      icon: (
        <path d="M12 .6 9.2 7.6 1.7 8.1l5.7 4.8L5.5 20l6.5-3.9L18.5 20l-1.9-7.1 5.7-4.8-7.5-.5L12 .6Z" />
      ),
    },
    {
      title: "あなたの名前とファン導線を明記",
      body: "企画ページ・作品カードに、アイコン、お名前、Xリンクを掲載します。さらに参加者へのリポストにもお名前とXリンクが載り続けるので、企画を楽しんだ方があなたのもとへ届きます。",
      icon: (
        <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6Z" />
      ),
    },
    {
      title: "“あつめて完成”の体験まで一緒に",
      body: "全種コンプリートで特典画像が完成するコレクション形式など、参加したくなる仕掛けを運営が一緒に設計します。公開されるのは生成された画像だけで、プロンプトは非公開のまま守られます。",
      icon: (
        <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm12.5 0L13 20h7l-3.5-7Z" />
      ),
    },
    {
      title: "毎日の運用は、運営と一緒に",
      body: "開催中の告知・ポスト文の作成・参加者への返信やリポスト・スケジュール管理は、運営が中心となって担当します。「毎日投稿を考えるのが大変そう」という心配はいりません。あなたは作品づくりに集中できます。",
      icon: (
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4a1 1 0 0 1 1 1v4.6l3 1.7a1 1 0 1 1-1 1.7l-3.5-2a1 1 0 0 1-.5-.9V7a1 1 0 0 1 1-1Z" />
      ),
    },
  ];

  const steps: {
    no: string;
    title: string;
    body: string;
    tape: string;
    note?: string;
    roles?: { label: string; text: string }[];
    schedule?: { label: string; text: string }[];
    footnote?: string;
  }[] = [
    {
      no: "01",
      title: "相談する",
      body: "X(DM)から「コラボしてみたい / 話を聞きたい」とご連絡ください。作品やSNSを見せていただけるとスムーズです。",
      note: "目安：基本的に当日〜3日ほどでお返事します（時期により前後します）。",
      tape: "bg-pink-200/80",
    },
    {
      no: "02",
      title: "企画を一緒に考える",
      body: "あなたの世界観に合わせて、テーマ・プロンプト・スケジュールを決めていきます。無理のないペースで大丈夫です。",
      tape: "bg-rose-200/80",
    },
    {
      no: "03",
      title: "制作 & 特設ページ公開",
      body: "運営が制作し、確認していただいたのち公開します。",
      roles: [
        { label: "あなた", text: "作品・プロンプトの共有、運営とSNS告知を実施" },
        { label: "運営", text: "ページ制作・バナー・SNS告知" },
      ],
      note: "目安：数週間程度、ペースはご相談ください。",
      tape: "bg-fuchsia-200/80",
    },
    {
      no: "04",
      title: "開催中",
      body: "開催中は、こんな流れで進みます。",
      schedule: [
        {
          label: "朝",
          text: "あなたと運営が、その日のテーマを告知（ポスト文・画像は基本的に運営が用意）",
        },
        {
          label: "日中",
          text: "参加者のうちの子が続々投稿。あなたと運営で、できるだけ一件ずつ返信＆リポスト（運営からはあなたのお名前を明記）",
        },
        {
          label: "夜",
          text: "朝のテーマ告知ポストを引用して、その日の投稿を振り返りつつ再告知。まだ参加していない方にも届けます",
        },
      ],
      footnote:
        "特設ページは会期後も残ります。人気が出れば、続編や第2弾へ展開することもあります。",
      tape: "bg-purple-200/80",
    },
  ];

  const faqs: { q: string; a: string[] }[] = [
    {
      q: "誰でも相談できますか？",
      a: [
        "イラストレーター・プロンプト制作者・企画を考えたい方など、うちの子文化が好きならどなたでも歓迎です。",
      ],
    },
    {
      q: "何を用意すればいいですか？",
      a: [
        "最初は何もなくて大丈夫です。ご相談のなかで、テーマや素材を一緒に決めていきます。",
      ],
    },
    {
      q: "企画が始まったら、毎日大変じゃないですか？",
      a: [
        "ポスト案は基本的に運営が担当します。もちろん中身を変えていただいてOKです。あなたのアカウントから出す用の文面も、こちらで作成します。",
        "毎日の投稿は簡単ではありませんが、その分、あなたのお名前が広まり認知されていきます。無理のないペースで大丈夫ですので、一緒に進めていきましょう。",
      ],
    },
    {
      q: "フォロワーが少なくても、実績がなくても大丈夫ですか？",
      a: [
        "大丈夫です。フォロワー数や実績よりも、“うちの子への愛”と世界観を大切にしています。",
        "ご相談の際にXでの投稿内容を拝見したうえで、一緒に進め方を考えていきます。",
      ],
    },
    {
      q: "報酬はありますか？",
      a: [
        "クレジット掲載と、特設企画としての露出が中心です。参加者へのリポストにお名前とXリンクが載り、新しいファンとの出会いに繋がります。条件は個別にご相談ください。",
      ],
    },
    {
      q: "期間やスケジュールは？",
      a: [
        "企画の規模に合わせて柔軟に決めています。過去のコラボも、それぞれのペースで進行しました。",
      ],
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

                  {/* 役割分担(あなた / 運営) */}
                  {s.roles ? (
                    <dl className="mt-3 grid gap-2">
                      {s.roles.map((role) => (
                        <div
                          key={role.label}
                          className="flex gap-2 rounded-xl bg-white/70 p-3"
                        >
                          <dt
                            className="shrink-0 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700"
                            style={{ fontFamily: HEADING_FONT }}
                          >
                            {role.label}
                          </dt>
                          <dd className="text-sm leading-relaxed text-[#7a5868]">
                            {role.text}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  {/* 開催中の時間割(朝 / 日中) */}
                  {s.schedule ? (
                    <ul className="mt-3 grid gap-2">
                      {s.schedule.map((item) => (
                        <li
                          key={item.label}
                          className="flex gap-2 rounded-xl bg-white/70 p-3"
                        >
                          <span
                            className="shrink-0 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700"
                            style={{ fontFamily: HEADING_FONT }}
                          >
                            {item.label}
                          </span>
                          <span className="text-sm leading-relaxed text-[#7a5868]">
                            {item.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {s.note ? (
                    <p className="mt-3 text-xs text-[#9a7888]">{s.note}</p>
                  ) : null}

                  {s.footnote ? (
                    <p className="mt-3 text-xs leading-relaxed text-[#9a7888]">
                      {s.footnote}
                    </p>
                  ) : null}
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
                  <div className="mt-3 grid gap-2">
                    {f.a.map((paragraph, pi) => (
                      <p
                        key={pi}
                        className="text-sm leading-relaxed text-[#7a5868]"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
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
