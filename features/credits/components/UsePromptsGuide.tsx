"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { setHomeViewMode } from "@/features/posts/lib/home-view-preference";
import type { UsablePromptShowcaseItem } from "../lib/get-usable-prompt-showcase";
import { ImageSlot, PopIn, ScreenshotSlot, Sparkle } from "./reward-guide";
import { ShowcaseLeaveDialog } from "./ShowcaseLeaveDialog";

/**
 * プロンプト利用ミッションの紹介ページ本体(= **つかう側**)。
 *
 * 対になる `/creator-rewards` は**あげる側**で、あちらは暖色。
 * こちらは寒色にして、2枚並んだときに役割が色で分かるようにする。
 * ただし**ペルコインの金色だけは共通**に残す(別企画ではなく同シリーズ)。
 * 見出しの書体も `/creator-rewards` と同じものを使う。
 *
 * ## このページが解こうとしている問題
 *
 * プロンプトを出す人は10人いるのに、使ったことがある人は7人しかいない
 * (2026-08-21 時点)。足りていないのは説明ではなく「使っていいのか」という
 * ためらいの解除なので、**仕組みの説明より先に「使って、いいんです」を置く**。
 *
 * ## 額を文言に埋め込まないこと
 *
 * 3つの額はすべて props(= admin 設定のサーバー読み)。運営が変えたら表示も
 * 変わる。0 は「停止中」を意味し、その行ごと出さない。
 *
 * ## 文言は付与RPCと一致させること
 *
 * 「もらえないケース」は `grant_prompt_use_daily_bonus` の分岐そのもの。
 * 実装を変えたらここも直す(逆も同じ)。ズレると問い合わせになる。
 */

const PERCOIN_ICON = "/percoin.png";
const HERO_SP = "/use-prompts/hero-sp.webp";
const HERO_PC = "/use-prompts/hero-pc.webp";
/**
 * 各ステップの実画面スクショ。
 *
 * 寸法は**ここが正本**。ステップ定義側にも持たせると、画像を差し替えたときに
 * 片方だけ直して比率が狂う。書き出した実寸をそのまま書くこと。
 */
const STEP_SUBS = [
  { src: "/use-prompts/step1-sub.webp", width: 640, height: 551 },
  { src: "/use-prompts/step2-sub.webp", width: 640, height: 495 },
  { src: "/use-prompts/step3-sub.webp", width: 560, height: 921 },
  { src: "/use-prompts/step4-sub.webp", width: 640, height: 390 },
] as const;

const STEP_IMAGES = [
  "/use-prompts/step1.webp",
  "/use-prompts/step2.webp",
  "/use-prompts/step3.webp",
  "/use-prompts/step4.webp",
] as const;

/** 支給待ちのあいだだけ見えるプレースホルダの配色(このページは寒色)。 */
const PLACEHOLDER_CLASS = "border-sky-300 bg-white/70 text-sky-500";

/**
 * ヒーローの見出し。accent の部分だけ色を変える。
 * 下の HERO_TITLE_TEXT / HERO_FONT_HREF をここから導出しているので、
 * 文言を変えれば読み込むフォントの文字セットも自動で追従する
 * (手で URL を書くと、増えた文字だけ別フォントになる事故が起きる)。
 */
const HERO_TITLE_LINES: readonly (readonly {
  text: string;
  accent?: boolean;
}[])[] = [
  [{ text: "ユーザーの" }, { text: "プロンプト", accent: true }, { text: "で" }],
  [{ text: "生成＆投稿して、" }],
  [{ text: "ペルコイン", accent: true }, { text: "GET！" }],
];

const HERO_TITLE_TEXT = HERO_TITLE_LINES.flat()
  .map((part) => part.text)
  .join("");

/**
 * 見出し用のポップな日本語書体。`/creator-rewards` と同じ書体を使う。
 * text= で「実際に使う文字だけ」を切り出して配信させるため、実体は数 KB に収まる
 * (日本語フォント全体だと数 MB になり、見出しのために読むには重すぎる)。
 */
const HERO_FONT_HREF = `https://fonts.googleapis.com/css2?family=Mochiy+Pop+One&text=${encodeURIComponent(
  HERO_TITLE_TEXT,
)}&display=swap`;

const HERO_FONT_FAMILY =
  "'Mochiy Pop One', 'Hiragino Maru Gothic ProN', 'Yu Gothic', sans-serif";

/** ホームへ送るリンク。グリッド表示のままだと導線が見えないのでフィードに切り替える。 */
function HomeCtaLink({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <Link
      href="/"
      /*
        ミッション一覧の行と同じ作法。**グリッド表示のままだと
        「このプロンプトで生成する」の導線がカードに出ない**ので、
        遷移前にフィード表示へ切り替えてから着地させる。
      */
      onClick={() => setHomeViewMode("feed")}
      className={className}
    >
      {children}
    </Link>
  );
}

/**
 * ヒーローの大きなキービジュアル(画面幅いっぱい)。
 *
 * 縦長(スマホ)と横長(PC)で別画像を <picture> の media で出し分ける
 * (next/image はアートディレクション非対応で、CSS 出し分けだと両方
 * ダウンロードされうるため素の picture を使う)。
 *
 * タイトルは画像に焼き込まず HTML で重ねる。文字サイズが画面幅に追従し、
 * 文言の修正に画像の作り直しが要らず、読み上げ・SEO でもそのまま拾えるため。
 *
 * 画像が未支給のあいだは、空の枠ではなく**寒色のグラデーションを敷いて**
 * 見出しだけで成立させる(プレースホルダの点線がヒーローに出ると興ざめのため)。
 */
function HeroVisual({ hasImage }: { hasImage: boolean }) {
  return (
    <div className="relative w-full">
      {hasImage ? (
        <picture>
          <source
            media="(min-width: 640px)"
            srcSet={HERO_PC}
            width={1536}
            height={1024}
          />
          <img
            src={HERO_SP}
            alt="海辺でペルコインを掲げて笑う、うちの子のイラスト"
            width={1024}
            height={1536}
            fetchPriority="high"
            className="block w-full"
          />
        </picture>
      ) : (
        <div
          aria-hidden
          className="block w-full bg-gradient-to-br from-sky-300 via-cyan-200 to-teal-200"
          style={{ aspectRatio: "1024 / 1100" }}
        />
      )}

      {/* 見出し用フォント。このページの見出しにしか使わないので
          サイト全体のフォント読み込みには足さない */}
      <link href={HERO_FONT_HREF} rel="stylesheet" />

      {/* 文字を載せる帯。白フチで可読性は確保できるので、絵が見えるよう薄めにする */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[46%] bg-gradient-to-b from-white/75 via-white/35 to-transparent sm:h-[52%]"
      />

      <div className="absolute inset-x-0 top-0 px-6 pt-5 sm:pt-9">
        <h1
          className="mx-auto max-w-[22rem] text-[7.2vw] leading-[1.28] text-sky-700 sm:max-w-[36rem] sm:text-[3.2vw]"
          style={{
            fontFamily: HERO_FONT_FAMILY,
            // 白フチ(縁取り)を文字の内側ではなく外側に出してポップな見出しにする
            WebkitTextStroke: "0.14em #ffffff",
            paintOrder: "stroke fill",
            filter: "drop-shadow(0 3px 0 rgba(14,165,233,0.25))",
          }}
        >
          {HERO_TITLE_LINES.map((line, lineIndex) => (
            <span key={lineIndex} className="block">
              {line.map((part) => (
                <span
                  key={part.text}
                  /* アクセントは金色。2ページで唯一そろえている色 */
                  className={part.accent ? "text-amber-500" : undefined}
                >
                  {part.text}
                </span>
              ))}
            </span>
          ))}
        </h1>
      </div>
    </div>
  );
}

/** 付与額を大きく見せるバッジ。額は props 由来で、文言には埋め込まない。 */
function AmountCard({ amount }: { amount: number }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border-4 border-white bg-gradient-to-br from-sky-500 via-cyan-500 to-teal-400 reward-gradient-shift px-6 py-5 text-center shadow-[0_10px_0_rgba(14,165,233,0.25)]">
      <p className="text-[11px] font-bold tracking-wide text-white/85">
        投稿すると、1日1回
      </p>
      <p className="mt-1 flex items-center justify-center gap-2">
        <Image
          src={PERCOIN_ICON}
          alt=""
          width={40}
          height={40}
          className="h-9 w-9 reward-float"
          aria-hidden
        />
        <span className="text-4xl font-black text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.15)]">
          +{amount}
        </span>
        <span className="text-base font-bold text-white/95">ペルコイン！</span>
      </p>
    </div>
  );
}

/**
 * 運営が停止中に見ているときの帯。一般ユーザーには 404 なので出ない。
 *
 * `?amount=` で額を仮置きしているときは、**そう明記する**。
 * 書いていないと「もう 20 になっている」と読めてしまい、
 * 実施済みかどうかの判断を誤らせる。
 */
function PreviewBanner({ previewAmount }: { previewAmount: number | null }) {
  return (
    <div className="bg-slate-900 px-6 py-3 text-center">
      <p className="text-xs font-bold leading-relaxed text-amber-300">
        準備中：このページは運営にだけ見えています
      </p>
      <p className="mt-1 text-[11px] font-medium leading-relaxed text-white/70">
        {previewAmount === null ? (
          <>
            ミッションはまだ動いていません。
            <br />
            admin の「プロンプト利用」を 1 以上にすると公開されます。
            <br />
            <span className="text-white/55">
              額を入れた状態の見た目は ?amount=20 で下見できます。
            </span>
          </>
        ) : (
          <>
            表示している <span className="font-bold">+{previewAmount}</span>{" "}
            は下見用の仮の額です。
            <br />
            実際の設定は 0（停止中）のままで、付与は動いていません。
          </>
        )}
      </p>
    </div>
  );
}

export function UsePromptsGuide({
  promptUseBonusAmount,
  freePostBonusAmount,
  creatorRewardAmount,
  showcase = [],
  isPreview = false,
  previewAmount = null,
  hasHeroImage = false,
}: {
  /** 他の人のプロンプトで作った作品を投稿したときの付与額。0 = 停止中。 */
  promptUseBonusAmount: number;
  /** 自分で書いたプロンプトで投稿したときの付与額。0 なら比較の行を出さない。 */
  freePostBonusAmount: number;
  /** 使われた側(原作者)に入る還元額。0 なら還元の案内を出さない。 */
  creatorRewardAmount: number;
  /** いま使えるプロンプトの実データ。空ならセクションごと出さない。 */
  showcase?: UsablePromptShowcaseItem[];
  /** 停止中を運営が見ているか。true のとき準備中バナーを出す。 */
  isPreview?: boolean;
  /** `?amount=` で仮置きした額。null なら実際の設定値を出している。 */
  previewAmount?: number | null;
  /** ヒーロー画像が支給済みか。未支給のあいだはグラデーションで代替する。 */
  hasHeroImage?: boolean;
}) {
  const hasCreatorReward = creatorRewardAmount > 0;
  /** 確認モーダルで開いている作品。null なら閉じている。 */
  const [pendingItem, setPendingItem] =
    useState<UsablePromptShowcaseItem | null>(null);
  const hasFreePostBonus = freePostBonusAmount > 0;
  // 「1日に両方やったら」の合計。片方が停止中なら比較そのものを出さない
  const bothDayTotal = promptUseBonusAmount + freePostBonusAmount;

  return (
    <div className="min-h-screen overflow-hidden bg-gradient-to-b from-sky-50 via-cyan-50 to-white">
      {isPreview && <PreviewBanner previewAmount={previewAmount} />}

      {/* ============ ヒーロー ============ */}
      <header className="relative pb-14 text-center">
        <HeroVisual hasImage={hasHeroImage} />

        <PopIn delay={80} rotate={0}>
          <p className="mx-auto mt-8 max-w-sm px-6 text-sm font-medium leading-loose text-slate-600">
            気に入った作品の作り方を借りて、
            <br />
            あなたのうちの子でつくれます。
          </p>
        </PopIn>

        {promptUseBonusAmount > 0 && (
          <PopIn delay={200} rotate={-4}>
            <div className="mx-auto mt-6 max-w-sm px-6">
              <AmountCard amount={promptUseBonusAmount} />
            </div>
          </PopIn>
        )}

        <PopIn delay={420} rotate={0}>
          <div className="mt-8 px-6">
            <HomeCtaLink className="reward-breathe inline-flex items-center gap-2 rounded-full bg-slate-900 px-9 py-4 text-base font-black text-white shadow-[0_6px_0_rgba(0,0,0,0.2)] transition-transform active:translate-y-1 active:shadow-[0_2px_0_rgba(0,0,0,0.2)]">
              プロンプトをさがす →
            </HomeCtaLink>
          </div>
        </PopIn>
      </header>

      {/* ============ 使って、いいんです ============ */}
      <section className="relative bg-white px-6 py-16">
        <Sparkle className="right-7 top-9 text-xl" delay={200} />

        <PopIn rotate={0}>
          <h2 className="text-center text-2xl font-black leading-tight text-slate-900">
            使って、
            <span className="text-sky-500">いいんです。</span>
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-center text-sm font-medium leading-loose text-slate-500">
            「人のプロンプトを使うのは気が引ける」
            <br />
            そう思って止まっている方へ。
          </p>
        </PopIn>

        <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3">
          {[
            hasCreatorReward
              ? {
                  emoji: "🎁",
                  title: "原作者にも、届きます",
                  /*
                    額は書かない。ここで伝わってほしいのは「作った人にも
                    届く」であって金額ではない。数字を書くと、変えたときに
                    このページだけが古い額を言い続ける。
                    `creatorRewardAmount` は 0 のとき項目ごと出さない判定に使う。
                  */
                  body: "あなたが使うと、プロンプトを作った人にもペルコインが還元されます。使うことが、そのままお返しになります。",
                }
              : null,
            {
              emoji: "🏷️",
              title: "「原作 ◯◯さん」が必ず付きます",
              body: "あなたの作品には、元をたどれるクレジットが表示されます。誰の作り方なのかが、ちゃんと残ります。",
            },
            {
              emoji: "🔒",
              title: "中身は見えないままで大丈夫",
              body: "プロンプトを非公開にしている人の作品も使えます。文章を読まなくても、同じプロンプトであなたのうちの子がつくれます。",
            },
          ]
            .filter((item) => item !== null)
            .map((item, i) => (
              <PopIn key={item.title} delay={i * 70} rotate={i % 2 === 0 ? -3 : 3}>
                <div className="rounded-2xl border-4 border-sky-100 bg-sky-50/60 px-5 py-4">
                  <p className="text-sm font-black text-slate-900">
                    <span className="mr-1.5">{item.emoji}</span>
                    {item.title}
                  </p>
                  <p className="mt-1.5 text-xs font-medium leading-relaxed text-slate-600">
                    {item.body}
                  </p>
                </div>
              </PopIn>
            ))}
        </div>
      </section>

      {/* ============ 4ステップ ============ */}
      <section className="relative bg-gradient-to-b from-white to-sky-50/60 px-6 py-16">
        <Sparkle className="left-6 top-12 text-xl" delay={500} />

        <PopIn rotate={0}>
          <h2 className="text-center text-2xl font-black text-slate-900">
            もらえるまで、
            <span className="text-sky-500">4ステップ</span>
          </h2>
          <p className="mt-2 text-center text-sm font-medium text-slate-500">
            むずかしい設定はありません！
          </p>
        </PopIn>

        <div className="mx-auto mt-12 flex max-w-sm flex-col gap-14">
          {[
            {
              no: "1",
              emoji: "👀",
              title: "気になる作品を見つける",
              /*
                「カード」とは書かない。画面にその文字は出ないので、
                読者は何を探せばよいのか分からない。ここでは**隣のスクショに
                実際に写っているもの**(画像左下の「Free Style」表示)を指す。
                プロンプトを使う欄の話はステップ2で実物とともに出す。
              */
              body: "ホームを眺めて「この作り方いいな」と思う作品をさがしましょう。使えるのは Free Style でつくられた作品です。画像の左下に「Free Style」と出ているのが目印です。",
              label: "イラスト①（ホームで作品をさがす／chibi）",
              color: "from-sky-500 to-cyan-400",
              sub: {
                alt: "ホームのフィード。投稿の下に原作のプロンプトを使うカードが表示されている",
                caption: "実際のホーム画面",
              },
            },
            {
              no: "2",
              emoji: "🤝",
              title: "フォローして、生成する",
              body: "カードの「フォローして生成する」を押すと、フォローと生成の準備がいっぺんに終わります。プロンプトを使えるのは、その人をフォローしている人だけです。",
              label: "イラスト②（フォローする／chibi）",
              color: "from-cyan-500 to-teal-400",
              sub: {
                alt: "原作カードの「フォローして生成する」ボタン",
                caption: "実際のボタン",
              },
            },
            {
              no: "3",
              emoji: "🐾",
              title: "うちの子の画像を入れる",
              body: "プロンプトの中身は伏せられたままで大丈夫。あなたのうちの子の画像を選んで生成すると、同じプロンプトであなたの作品ができます。",
              label: "イラスト③（うちの子で生成する／chibi）",
              color: "from-teal-500 to-emerald-400",
              sub: {
                alt: "うちの子の画像を入れた生成画面。プロンプト欄は「プロンプトは非公開です」と伏せられたまま",
                caption: "実際の生成画面",
              },
            },
            {
              no: "4",
              emoji: "🪙",
              title: "投稿すると、ペルコイン！",
              body: "その日つくった作品を投稿すると、1日1回ペルコインが届きます。生成しただけでは届かないので、忘れずに投稿しましょう。",
              label: "イラスト④（投稿してコインを受け取る／chibi）",
              color: "from-amber-400 to-orange-400",
              sub: {
                alt: "投稿直後に出るペルコイン付与のモーダル",
                caption: "実際に出るお知らせ",
              },
            },
          ].map((s, i) => (
            <PopIn key={s.no} delay={i * 60} rotate={i % 2 === 0 ? -5 : 5}>
              <div className="relative">
                <div
                  className={`absolute -left-1 -top-4 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br ${s.color} text-2xl font-black text-white shadow-[0_4px_0_rgba(0,0,0,0.15)]`}
                >
                  {s.no}
                </div>
                <div className="rounded-3xl border-4 border-slate-900/5 bg-gradient-to-b from-sky-50/70 to-white p-5 pt-8 shadow-[0_6px_0_rgba(0,0,0,0.05)]">
                  <ImageSlot
                    ratio="1 / 1"
                    alt={s.title}
                    label={s.label}
                    src={STEP_IMAGES[i]}
                    className="mx-auto max-w-[240px]"
                    placeholderClassName={PLACEHOLDER_CLASS}
                    float
                  />
                  <h3 className="mt-4 text-center text-lg font-black text-slate-900">
                    <span className="mr-1">{s.emoji}</span>
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm font-medium leading-loose text-slate-600">
                    {s.body}
                  </p>
                  <ScreenshotSlot
                    alt={s.sub.alt}
                    caption={s.sub.caption}
                    src={STEP_SUBS[i].src}
                    width={STEP_SUBS[i].width}
                    height={STEP_SUBS[i].height}
                    placeholderClassName={PLACEHOLDER_CLASS}
                  />
                </div>
              </div>
            </PopIn>
          ))}
        </div>
      </section>

      {/* ============ フォローすると使えるプロンプト ============ */}
      {showcase.length > 0 && (
        <section className="relative bg-white px-6 py-16">
          <Sparkle className="right-8 top-10 text-xl" delay={350} />

          <PopIn rotate={0}>
            <h2 className="text-center text-2xl font-black leading-tight text-slate-900">
              フォローすると
              <br />
              <span className="text-sky-500">使えるプロンプト</span>
            </h2>
            <p className="mx-auto mt-3 max-w-sm text-center text-sm font-medium leading-loose text-slate-500">
              いま投稿されている作品から。
              <br />
              タップすると投稿のページへ移動します。
            </p>
          </PopIn>

          <div className="mx-auto mt-8 grid max-w-sm grid-cols-3 gap-3">
            {showcase.map((item, i) => (
              <PopIn key={item.postId} delay={i * 50} rotate={i % 2 === 0 ? -3 : 3}>
                {/*
                  `Link` のまま onClick で受け止める。button に替えると
                  href が消えて、長押しの「新しいタブで開く」も、
                  クローラのたどり先も失われる。
                */}
                <Link
                  href={`/posts/${encodeURIComponent(item.postId)}`}
                  onClick={(event) => {
                    // 修飾キー・中クリックは本来の挙動(別タブ)に任せる
                    if (
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    ) {
                      return;
                    }
                    event.preventDefault();
                    setPendingItem(item);
                  }}
                  className="group block focus-visible:outline-none"
                >
                  <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border-4 border-white bg-sky-50 shadow-[0_4px_0_rgba(14,165,233,0.15)] transition group-hover:shadow-[0_6px_0_rgba(14,165,233,0.25)] group-focus-visible:ring-2 group-focus-visible:ring-sky-400">
                    <Image
                      src={item.thumbnailUrl}
                      alt={`${item.authorName}さんの作品`}
                      fill
                      sizes="(min-width: 640px) 120px, 30vw"
                      className="object-cover transition group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <p className="mt-1.5 truncate text-center text-[11px] font-bold text-slate-600">
                    {item.authorName}
                  </p>
                  {/*
                    利用回数は閾値未満なら null で来る(投稿詳細と同じ規則)。
                    少ない数字は「誰も使っていない」という逆の証明になる。
                  */}
                  {item.usageCount !== null && (
                    <p className="truncate text-center text-[10px] font-bold text-sky-500">
                      {item.usageCount}回使われました
                    </p>
                  )}
                </Link>
              </PopIn>
            ))}
          </div>

          {/*
            ⭐ 並べ方の説明は**サムネイルの下**に置く。

            見出しのすぐ下に置くと、肝心の作品にたどり着く前に説明を
            読ませることになる。この文が要るのは、並んでいるものを見て
            「なぜ自分のが載っているのか」と思った人で、その人はもう
            サムネイルを見たあとにいる。

            「運営が選んでいるわけではない」とは書かない。**条件と
            「自動で」だけで足りる**という判断。わざわざ否定を置く方が、
            かえって身構えさせる。

            条件は `getUsablePromptShowcase` の絞り込みと対になっている。
            あちらを変えるときは、この文も必ず合わせること。
          */}
          <p className="mx-auto mt-6 max-w-sm rounded-2xl bg-slate-50 px-4 py-3 text-center text-xs font-medium leading-relaxed text-slate-500">
            Free Style で投稿され、Before / After が載っている作品を、
            <span className="font-bold text-slate-600">新しい順に自動で</span>
            表示しています。新しい投稿があれば入れ替わります。
          </p>

          <ShowcaseLeaveDialog
            item={pendingItem}
            onOpenChange={(open) => {
              if (!open) setPendingItem(null);
            }}
          />
        </section>
      )}

      {/* ============ 自分で書いたぶんとは別 ============ */}
      {hasFreePostBonus && promptUseBonusAmount > 0 && (
        <section className="relative bg-white px-6 py-16">
          <PopIn rotate={0}>
            <h2 className="text-center text-2xl font-black leading-tight text-slate-900">
              自分で書いたぶんとは、
              <br />
              <span className="text-teal-500">別々にもらえます</span>
            </h2>
          </PopIn>

          <div className="mx-auto mt-7 flex max-w-sm flex-col gap-3">
            {[
              {
                label: "自分で書いて投稿",
                note: "Free Style であなたが考えたプロンプト",
                amount: freePostBonusAmount,
              },
              {
                label: "他の人のプロンプトで投稿",
                note: "「このプロンプトで生成する」から作った作品",
                amount: promptUseBonusAmount,
              },
            ].map((row, i) => (
              <PopIn key={row.label} delay={i * 70} rotate={i % 2 === 0 ? -2 : 2}>
                <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-slate-200 bg-white px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900">
                      {row.label}
                    </p>
                    <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-500">
                      {row.note}
                    </p>
                  </div>
                  <span className="shrink-0 text-lg font-black text-sky-600">
                    +{row.amount}
                  </span>
                </div>
              </PopIn>
            ))}
          </div>

          <PopIn delay={180} rotate={0}>
            {/*
              1投稿で 40 もらえると誤解されると、そのまま問い合わせになる。
              付与RPC は派生投稿をフリー投稿ボーナスから明示的に除外している。
            */}
            <p className="mx-auto mt-5 max-w-sm rounded-2xl bg-sky-50 px-5 py-4 text-xs font-medium leading-relaxed text-slate-600">
              1つの投稿でもらえるのは、
              <span className="font-black text-slate-900">どちらか一方</span>
              です。1日に両方やった日は、合わせて
              <span className="font-black text-sky-600">+{bothDayTotal}</span>
              ペルコインになります。
            </p>
          </PopIn>
        </section>
      )}

      {/* ============ もらえないケース ============ */}
      <section className="bg-gradient-to-b from-white to-slate-50 px-6 py-16">
        <PopIn rotate={0}>
          <h2 className="text-center text-xl font-black text-slate-900">
            もらえないケース
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-center text-sm font-medium text-slate-500">
            あとで「あれ？」とならないために
          </p>
        </PopIn>

        <div className="mx-auto mt-6 flex max-w-sm flex-col gap-3">
          {[
            {
              title: "自分のプロンプトを使ったとき",
              body: "ご自身の作品を使った生成は対象になりません。",
            },
            {
              title: "プロンプトをコピーして貼り付けたとき",
              body: "アプリ内の「このプロンプトで生成する」から使った場合が対象です。文章をコピーして貼り付けて作ったものは、あなたにも原作者にも付きません。",
            },
            {
              title: "生成しただけで、投稿していないとき",
              body: "投稿してはじめて受け取れます。生成した日のうちなら、あとから投稿しても間に合います。",
            },
            {
              title: "前の日につくった作品を投稿したとき",
              body: "その日つくった作品が対象です。",
            },
            {
              title: "その日すでに受け取っているとき",
              body: "1日1回までです。翌日また受け取れます。",
            },
          ].map((item, i) => (
            <PopIn key={item.title} delay={i * 50} rotate={i % 2 === 0 ? -2 : 2}>
              <div className="rounded-2xl border-2 border-slate-200 bg-white px-5 py-4">
                <p className="text-sm font-black text-slate-900">{item.title}</p>
                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                  {item.body}
                </p>
              </div>
            </PopIn>
          ))}
        </div>

        <PopIn delay={220} rotate={0}>
          <p className="mx-auto mt-5 max-w-sm text-center text-xs font-medium leading-relaxed text-slate-400">
            付与の額は運営が変更する場合があります。最新の額はこのページとミッション画面に表示されます。
          </p>
        </PopIn>
      </section>

      {/* ============ CTA ============ */}
      <section className="relative bg-gradient-to-b from-sky-500 via-cyan-500 to-teal-400 reward-gradient-shift px-6 pb-20 pt-16 text-center">
        <Sparkle className="left-8 top-8 text-2xl" />
        <Sparkle className="right-10 top-16 text-xl" delay={700} />

        <PopIn rotate={0}>
          <h2 className="text-2xl font-black leading-tight text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.12)]">
            気になるあの作品を、
            <br />
            うちの子で。
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm font-bold leading-loose text-white/95">
            借りた作り方が、
            <br />
            あなたの1枚に変わります。
          </p>
          <div className="mt-8">
            <HomeCtaLink className="reward-breathe inline-flex items-center gap-2 rounded-full bg-white px-10 py-4 text-base font-black text-sky-600 shadow-[0_6px_0_rgba(0,0,0,0.18)] transition-transform active:translate-y-1 active:shadow-[0_2px_0_rgba(0,0,0,0.18)]">
              プロンプトをさがす →
            </HomeCtaLink>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/creator-rewards"
              className="text-xs font-bold text-white/85 underline hover:text-white"
            >
              自分のプロンプトを使ってもらう方法をみる
            </Link>
            <Link
              href="/challenge"
              className="text-xs font-bold text-white/85 underline hover:text-white"
            >
              ほかのペルコインの貯め方をみる
            </Link>
          </div>
        </PopIn>
      </section>
    </div>
  );
}
