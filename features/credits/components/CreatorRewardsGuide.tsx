"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * クリエイター還元の紹介ページ本体。
 *
 * 付与額は運営が admin (`/admin/percoin-defaults`) で変更するため、
 * サーバー側で読んだ値を props で受け取って表示する(文言に数字を埋め込まない)。
 * 額が 0 のもの(= 停止中)は、その行ごと出さない。両方 0 のときはページ自体を
 * 出さない(ページ側で notFound)。
 *
 * トーン: chibi キャラのイラストに合わせたポップで元気な見た目。
 * 出現は「ぽん」と跳ねる pop-in、コインや装飾はふわふわ浮かせて、
 * 読んでいて「やってみたくなる」勢いを出す(演出は globals.css の
 * .reward-* ユーティリティ。prefers-reduced-motion では自動で静止する)。
 *
 * 画像はユーザー支給待ち。届くまで ImageSlot がプレースホルダを描画する。
 */

const PERCOIN_ICON = "/percoin.png";
const HERO_SP = "/creator-rewards/hero-sp.webp";
const HERO_PC = "/creator-rewards/hero-pc.webp";

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
  [{ text: "あなたの" }, { text: "プロンプト", accent: true }, { text: "が" }],
  [{ text: "ペルコイン", accent: true }, { text: "に！" }],
];

const HERO_TITLE_TEXT = HERO_TITLE_LINES.flat()
  .map((part) => part.text)
  .join("");

/**
 * 見出し用のポップな日本語書体(丸ゴシック系のディスプレイフォント)。
 * text= で「実際に使う文字だけ」を切り出して配信させるため、実体は数 KB に収まる
 * (日本語フォント全体だと数 MB になり、見出し1行のために読むには重すぎる)。
 */
const HERO_FONT_HREF = `https://fonts.googleapis.com/css2?family=Mochiy+Pop+One&text=${encodeURIComponent(
  HERO_TITLE_TEXT,
)}&display=swap`;

const HERO_FONT_FAMILY =
  "'Mochiy Pop One', 'Hiragino Maru Gothic ProN', 'Yu Gothic', sans-serif";

/**
 * 画像の枠。src が未指定(= 支給待ち)の間はプレースホルダを描く。
 * 画像が届いたら src を渡すだけで差し替わる。
 */
function ImageSlot({
  src,
  alt,
  label,
  ratio,
  className,
  float = false,
}: {
  src?: string;
  alt: string;
  /** プレースホルダに出す説明(支給待ちの間だけ見える) */
  label: string;
  /** 例: "1 / 1", "9 / 16" */
  ratio: string;
  className?: string;
  /** chibi イラストをふわふわ浮かせる */
  float?: boolean;
}) {
  const floatClass = float ? "reward-float" : "";
  if (!src) {
    return (
      <div
        style={{ aspectRatio: ratio }}
        className={`flex w-full items-center justify-center rounded-3xl border-[3px] border-dashed border-pink-300 bg-white/70 px-4 text-center text-xs font-bold leading-relaxed text-pink-400 ${floatClass} ${className ?? ""}`}
      >
        {label}
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={1024}
      height={1024}
      style={{ aspectRatio: ratio }}
      className={`w-full object-contain ${floatClass} ${className ?? ""}`}
      sizes="(max-width: 640px) 100vw, 480px"
    />
  );
}

/**
 * ヒーローの大きなキービジュアル(画面幅いっぱい)。
 *
 * 縦長(スマホ)と横長(PC)で別画像を <picture> の media で出し分ける
 * (next/image はアートディレクション非対応で、CSS 出し分けだと両方
 * ダウンロードされうるため素の picture を使う)。
 * width/height は <source> 側にも持たせ、PC 表示時のレイアウトシフトを防ぐ。
 *
 * タイトルは画像に焼き込まず HTML で重ねる。文字サイズが画面幅に追従し、
 * 文言の修正に画像の作り直しが要らず、読み上げ・SEO でもそのまま拾えるため。
 * 背景の空が明るいので、上部に白のグラデーション(スクリム)を敷いて可読性を確保する。
 */
function HeroVisual() {
  return (
    <div className="relative w-full">
      <picture>
        <source
          media="(min-width: 640px)"
          srcSet={HERO_PC}
          width={1536}
          height={1024}
        />
        <img
          src={HERO_SP}
          alt="ペルコインを掲げて喜ぶ、うちの子のイラスト"
          width={1024}
          height={1536}
          fetchPriority="high"
          className="block w-full"
        />
      </picture>

      {/* 見出し用フォント。このページの見出し1行にしか使わないので
          サイト全体のフォント読み込みには足さない */}
      <link href={HERO_FONT_HREF} rel="stylesheet" />

      {/* 文字を載せる帯。白フチで可読性は確保できるので、絵が見えるよう薄めにする */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-white/75 via-white/35 to-transparent sm:h-[48%]"
      />

      <div className="absolute inset-x-0 top-0 px-6 pt-5 sm:pt-9">
        <h1
          className="mx-auto max-w-[22rem] text-[7.6vw] leading-[1.25] text-pink-600 sm:max-w-[36rem] sm:text-[3.4vw]"
          style={{
            fontFamily: HERO_FONT_FAMILY,
            // 白フチ(縁取り)を文字の内側ではなく外側に出してポップな見出しにする
            WebkitTextStroke: "0.14em #ffffff",
            paintOrder: "stroke fill",
            filter: "drop-shadow(0 3px 0 rgba(236,72,153,0.25))",
          }}
        >
          {HERO_TITLE_LINES.map((line, lineIndex) => (
            <span key={lineIndex} className="block">
              {line.map((part) => (
                <span
                  key={part.text}
                  className={part.accent ? "text-orange-500" : undefined}
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

/**
 * 画面に入ったら「ぽん」と跳ねて現れる。
 * 従来のスライド+フェードより、勢いのあるポップな出方にする。
 */
function PopIn({
  children,
  delay = 0,
  rotate = -4,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  /** 出てくるときの傾き(度)。連続配置で交互にすると賑やかになる */
  rotate?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${shown ? "reward-pop-in" : "opacity-0"} ${className ?? ""}`}
      style={
        {
          animationDelay: `${delay}ms`,
          "--reward-pop-rotate": `${rotate}deg`,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

/** 装飾のキラキラ。読み物の余白に散らして賑やかさを出す。 */
function Sparkle({
  className,
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute reward-sparkle select-none ${className ?? ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      ✨
    </span>
  );
}

/**
 * 現在の還元額を大きく見せるバッジ。
 * 額は props 由来で、文言には埋め込まない(運営が変えたら表示も変わる)。
 */
function CurrentAmountCard({
  label,
  amount,
  delay,
}: {
  label: string;
  amount: number;
  delay: number;
}) {
  return (
    <PopIn delay={delay} rotate={delay % 200 === 0 ? -5 : 5}>
      <div className="relative overflow-hidden rounded-3xl border-4 border-white bg-gradient-to-br from-pink-500 via-rose-400 to-orange-400 reward-gradient-shift px-6 py-5 text-center shadow-[0_10px_0_rgba(236,72,153,0.25)]">
        <p className="text-sm font-bold leading-relaxed text-white/95">
          {label}
        </p>
        <p className="mt-1 text-[11px] font-bold tracking-wide text-white/80">
          現在の還元
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
    </PopIn>
  );
}

export function CreatorRewardsGuide({
  promptUsageRewardAmount,
  styleUsageRewardAmount,
}: {
  /** Free Style のプロンプトが使われたときの1回あたり付与額。0 なら停止中。 */
  promptUsageRewardAmount: number;
  /** One-Tap Style が使われたときの1回あたり付与額。0 なら停止中。 */
  styleUsageRewardAmount: number;
}) {
  const hasPrompt = promptUsageRewardAmount > 0;
  const hasStyle = styleUsageRewardAmount > 0;

  return (
    <div className="min-h-screen overflow-hidden bg-gradient-to-b from-amber-50 via-pink-50 to-white">
      {/* ============ ヒーロー ============ */}
      <header className="relative pb-14 text-center">
        <HeroVisual />

        <PopIn delay={80} rotate={0}>
          <p className="mx-auto mt-8 max-w-sm px-6 text-sm font-medium leading-loose text-gray-600">
            つくった作品が誰かに使われるたびに、
            <br />
            ペルコインがあなたに届きます。
          </p>
        </PopIn>

        <div className="mx-auto mt-6 flex max-w-sm flex-col gap-4 px-6">
          {hasPrompt && (
            <CurrentAmountCard
              label="あなたのプロンプトが使われる度に、ペルコインが付与されます"
              amount={promptUsageRewardAmount}
              delay={200}
            />
          )}
          {hasStyle && (
            <CurrentAmountCard
              label="あなたの One-Tap Style が使われる度に、ペルコインが付与されます"
              amount={styleUsageRewardAmount}
              delay={300}
            />
          )}
        </div>

        <PopIn delay={420} rotate={0}>
          <div className="mt-8 px-6">
            <Link
              href="/free"
              className="reward-breathe inline-flex items-center gap-2 rounded-full bg-gray-900 px-9 py-4 text-base font-black text-white shadow-[0_6px_0_rgba(0,0,0,0.2)] transition-transform active:translate-y-1 active:shadow-[0_2px_0_rgba(0,0,0,0.2)]"
            >
              Free Style でつくる →
            </Link>
          </div>
        </PopIn>
      </header>

      {/* ============ 仕組み3ステップ ============ */}
      <section className="relative bg-white px-6 py-16">
        <Sparkle className="right-6 top-10 text-xl" delay={300} />

        <PopIn rotate={0}>
          <h2 className="text-center text-2xl font-black text-gray-900">
            もらえるまで、
            <span className="text-pink-500">3ステップ</span>
          </h2>
          <p className="mt-2 text-center text-sm font-medium text-gray-500">
            むずかしい設定はありません！
          </p>
        </PopIn>

        <div className="mx-auto mt-12 flex max-w-sm flex-col gap-14">
          {[
            {
              no: "1",
              emoji: "✍️",
              title: "プロンプトをつくって投稿！",
              body: "Free Style で好きな言葉を書いて生成。投稿するときに「プロンプトを公開する」を選ぶと、ほかの人も使えるようになります。",
              label: "イラスト②（作る：言葉から作品が生まれる／chibi）",
              color: "from-pink-500 to-rose-400",
            },
            {
              no: "2",
              emoji: "🎉",
              title: "フォロワーが使ってくれる！",
              body: "あなたの投稿を見た人が「このプロンプトで作る」をタップ。プロンプトの中身は見せずに、うちの子づくりを楽しんでもらえます。",
              label: "イラスト③（使われる：みんなに広がる／chibi）",
              color: "from-orange-400 to-amber-400",
            },
            {
              no: "3",
              emoji: "🪙",
              title: "ペルコインが届く！",
              body: "使われるたびにペルコインが還元されます。その日の分はまとめてお知らせで届き、履歴からも確認できます。",
              label: "イラスト④（もらえる：コインが届く／chibi）",
              color: "from-fuchsia-500 to-pink-500",
            },
          ].map((s, i) => (
            <PopIn key={s.no} delay={i * 60} rotate={i % 2 === 0 ? -5 : 5}>
              <div className="relative">
                <div
                  className={`absolute -left-1 -top-4 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br ${s.color} text-2xl font-black text-white shadow-[0_4px_0_rgba(0,0,0,0.15)]`}
                >
                  {s.no}
                </div>
                <div className="rounded-3xl border-4 border-gray-900/5 bg-gradient-to-b from-pink-50/70 to-white p-5 pt-8 shadow-[0_6px_0_rgba(0,0,0,0.05)]">
                  <ImageSlot
                    ratio="1 / 1"
                    alt={s.title}
                    label={s.label}
                    className="mx-auto max-w-[240px]"
                    float
                  />
                  <h3 className="mt-4 text-center text-lg font-black text-gray-900">
                    <span className="mr-1">{s.emoji}</span>
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm font-medium leading-loose text-gray-600">
                    {s.body}
                  </p>
                </div>
              </div>
            </PopIn>
          ))}
        </div>
      </section>

      {/* ============ どう届くか(実画面) ============ */}
      <section className="relative bg-gradient-to-b from-white to-amber-50 px-6 py-16">
        <PopIn rotate={0}>
          <h2 className="text-center text-2xl font-black text-gray-900">
            こんなふうに届きます
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-center text-sm font-medium text-gray-500">
            還元があった日は、まとめてお知らせでお届け！
          </p>
        </PopIn>

        <div className="mx-auto mt-8 flex max-w-md items-start justify-center gap-4">
          <PopIn delay={80} rotate={-6} className="w-1/2">
            <ImageSlot
              ratio="9 / 16"
              alt="還元のお知らせが届いた画面"
              label="キャプチャ⑥（お知らせ：本日の還元通知）"
              className="rounded-2xl border-4 border-white shadow-[0_6px_0_rgba(0,0,0,0.06)]"
            />
            <p className="mt-2 text-center text-xs font-bold text-gray-500">
              お知らせ
            </p>
          </PopIn>
          <PopIn delay={180} rotate={6} className="w-1/2">
            <ImageSlot
              ratio="9 / 16"
              alt="ペルコインの取引履歴に還元が並んでいる画面"
              label="キャプチャ⑦（ペルコイン履歴）"
              className="rounded-2xl border-4 border-white shadow-[0_6px_0_rgba(0,0,0,0.06)]"
            />
            <p className="mt-2 text-center text-xs font-bold text-gray-500">
              履歴
            </p>
          </PopIn>
        </div>
      </section>

      {/* ============ フォロワーとの関係 ============ */}
      {hasPrompt && (
        <section className="relative bg-white px-6 py-16">
          <Sparkle className="left-8 top-12 text-xl" delay={900} />
          <PopIn rotate={0}>
            <h2 className="text-center text-2xl font-black leading-tight text-gray-900">
              フォロワーが増えるほど、
              <br />
              <span className="text-orange-500">どんどん使われる！</span>
            </h2>
          </PopIn>
          <PopIn delay={120} rotate={-3}>
            <div className="mx-auto mt-6 max-w-sm rounded-3xl border-4 border-orange-100 bg-orange-50/60 p-5">
              <p className="text-sm font-medium leading-loose text-gray-700">
                あなたが公開したプロンプトを使えるのは、
                <span className="font-black text-orange-600">
                  あなたをフォローしている人
                </span>
                です。フォロワーが増えるほど使ってもらえる機会も増えて、還元もどんどん積み上がっていきます。
              </p>
            </div>
          </PopIn>
        </section>
      )}

      {/* ============ 対象外になるケース ============ */}
      <section className="bg-gradient-to-b from-white to-gray-50 px-6 py-16">
        <PopIn rotate={0}>
          <h2 className="text-center text-xl font-black text-gray-900">
            還元されないケース
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-center text-sm font-medium text-gray-500">
            あとで「あれ？」とならないように、先にお伝えします
          </p>
        </PopIn>

        <div className="mx-auto mt-6 flex max-w-sm flex-col gap-3">
          {[
            {
              title: "自分で自分のプロンプトを使ったとき",
              body: "ご自身の利用は還元の対象になりません。",
            },
            {
              title: "プロンプトをコピーして貼り付けたとき",
              body: "アプリ内の「このプロンプトで作る」から使われた場合が対象です。文字をコピーして自分で貼り付けた生成は、利用としてカウントされません。",
            },
            {
              title: "無料ペルコインの残高が上限のとき",
              body: "受け取る側の無料ペルコイン残高が上限に達している場合は、還元されません。",
            },
          ].map((item, i) => (
            <PopIn key={item.title} delay={i * 50} rotate={i % 2 === 0 ? -2 : 2}>
              <div className="rounded-2xl border-2 border-gray-200 bg-white px-5 py-4">
                <p className="text-sm font-black text-gray-900">{item.title}</p>
                <p className="mt-1 text-xs font-medium leading-relaxed text-gray-600">
                  {item.body}
                </p>
              </div>
            </PopIn>
          ))}
        </div>
        <PopIn delay={200} rotate={0}>
          <p className="mx-auto mt-5 max-w-sm text-center text-xs font-medium leading-relaxed text-gray-400">
            還元の額は運営が変更する場合があります。最新の額はこのページとミッション画面に表示されます。
          </p>
        </PopIn>
      </section>

      {/* ============ CTA ============ */}
      <section className="relative bg-gradient-to-b from-pink-500 via-rose-400 to-orange-400 reward-gradient-shift px-6 pb-20 pt-16 text-center">
        <Sparkle className="left-8 top-8 text-2xl" />
        <Sparkle className="right-10 top-16 text-xl" delay={700} />

        <PopIn rotate={0}>
          <h2 className="text-2xl font-black leading-tight text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.12)]">
            さっそく、つくってみよう！
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm font-bold leading-loose text-white/95">
            あなたの言葉が、
            <br />
            誰かのうちの子を変えていきます。
          </p>
          <div className="mt-8">
            <Link
              href="/free"
              className="reward-breathe inline-flex items-center gap-2 rounded-full bg-white px-10 py-4 text-base font-black text-pink-600 shadow-[0_6px_0_rgba(0,0,0,0.18)] transition-transform active:translate-y-1 active:shadow-[0_2px_0_rgba(0,0,0,0.18)]"
            >
              Free Style でつくる →
            </Link>
          </div>
          <div className="mt-6">
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
