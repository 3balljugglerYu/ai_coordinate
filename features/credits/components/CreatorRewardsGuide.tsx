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
 * 画像はユーザー支給待ち。届くまで ImageSlot がプレースホルダを描画する。
 */

const PERCOIN_ICON = "/percoin.png";

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
}: {
  src?: string;
  alt: string;
  /** プレースホルダに出す説明(支給待ちの間だけ見える) */
  label: string;
  /** 例: "1 / 1", "9 / 16" */
  ratio: string;
  className?: string;
}) {
  if (!src) {
    return (
      <div
        style={{ aspectRatio: ratio }}
        className={`flex w-full items-center justify-center rounded-2xl border-2 border-dashed border-pink-200 bg-pink-50/60 px-4 text-center text-xs leading-relaxed text-pink-400 ${className ?? ""}`}
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
      className={`w-full rounded-2xl object-cover ${className ?? ""}`}
      sizes="(max-width: 640px) 100vw, 480px"
    />
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
        transform: shown ? "none" : "translateY(20px)",
        transition: `opacity 700ms ease-out ${delay}ms, transform 700ms ease-out ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/** 金額バッジ(コイン画像 + 数字)。額は props 由来で、文言には埋め込まない。 */
function AmountBadge({ amount }: { amount: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-3 py-1 text-sm font-bold text-white">
      <Image
        src={PERCOIN_ICON}
        alt=""
        width={16}
        height={16}
        className="h-4 w-4"
        aria-hidden
      />
      +{amount}
    </span>
  );
}

export function CreatorRewardsGuide({
  promptUsageRewardAmount,
  styleUsageRewardAmount,
}: {
  /** /free のプロンプトが使われたときの1回あたり付与額。0 なら停止中。 */
  promptUsageRewardAmount: number;
  /** One-Tap Style が使われたときの1回あたり付与額。0 なら停止中。 */
  styleUsageRewardAmount: number;
}) {
  const hasPrompt = promptUsageRewardAmount > 0;
  const hasStyle = styleUsageRewardAmount > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50/60 via-white to-white">
      {/* ============ ヒーロー ============ */}
      <header className="px-6 pb-12 pt-10 text-center">
        <Reveal>
          <p className="text-xs font-bold tracking-[0.2em] text-pink-500">
            CREATOR REWARDS
          </p>
          <h1 className="mt-3 text-2xl font-bold leading-relaxed text-gray-900 sm:text-3xl">
            あなたのプロンプトが、
            <br />
            ペルコインになる。
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-loose text-gray-600">
            あなたが作った作品が誰かに使われるたびに、
            <br className="hidden sm:block" />
            ペルコインが還元されます。
          </p>
        </Reveal>

        <Reveal delay={120}>
          <div className="mx-auto mt-8 max-w-xs">
            <ImageSlot
              ratio="1 / 1"
              alt="自分のプロンプトが使われ、ペルコインが返ってくる循環のイラスト"
              label="イラスト①（ヒーロー：還元の循環）"
            />
          </div>
        </Reveal>

        <Reveal delay={240}>
          <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3">
            {hasPrompt && (
              <div className="flex items-center justify-between rounded-2xl border border-pink-100 bg-white px-5 py-4 shadow-sm">
                <span className="text-sm font-medium text-gray-700">
                  あなたのプロンプトが使われる
                </span>
                <AmountBadge amount={promptUsageRewardAmount} />
              </div>
            )}
            {hasStyle && (
              <div className="flex items-center justify-between rounded-2xl border border-pink-100 bg-white px-5 py-4 shadow-sm">
                <span className="text-sm font-medium text-gray-700">
                  あなたの One-Tap Style が使われる
                </span>
                <AmountBadge amount={styleUsageRewardAmount} />
              </div>
            )}
            <p className="text-xs text-gray-500">1回使われるごとの還元です</p>
          </div>
        </Reveal>
      </header>

      {/* ============ 仕組み3ステップ ============ */}
      <section className="bg-white px-6 py-14">
        <Reveal>
          <h2 className="text-center text-xl font-bold text-gray-900">
            もらえるまでの3ステップ
          </h2>
        </Reveal>

        <div className="mx-auto mt-10 flex max-w-sm flex-col gap-12">
          {[
            {
              no: "01",
              title: "プロンプトを作って投稿する",
              body: "「じゆうモード」で好きな言葉を書いて生成し、投稿するときに「プロンプトを公開する」を選びます。これで、あなたのプロンプトが他の人にも使えるようになります。",
              label: "イラスト②（作る：言葉から作品が生まれる）",
            },
            {
              no: "02",
              title: "フォロワーがそのプロンプトで作る",
              body: "投稿を見た人が「このプロンプトで作る」を選ぶと、同じプロンプトで自分のうちの子を生成できます。プロンプトの本文を見せずに、使ってもらうことができます。",
              label: "イラスト③（使われる：みんなに広がる）",
            },
            {
              no: "03",
              title: "使われるたびにペルコインが届く",
              body: "誰かに使われるたびに、あなたにペルコインが還元されます。その日の分はまとめてお知らせで届き、履歴からも確認できます。",
              label: "イラスト④（もらえる：コインが届く）",
            },
          ].map((s, i) => (
            <Reveal key={s.no} delay={i * 80}>
              <div className="flex flex-col gap-4">
                <ImageSlot ratio="1 / 1" alt={s.title} label={s.label} />
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-pink-400">
                      {s.no}
                    </span>
                    <h3 className="text-base font-bold text-gray-900">
                      {s.title}
                    </h3>
                  </div>
                  <p className="mt-2 text-sm leading-loose text-gray-600">
                    {s.body}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ============ どう届くか(実画面) ============ */}
      <section className="px-6 py-14">
        <Reveal>
          <h2 className="text-center text-xl font-bold text-gray-900">
            こんなふうに届きます
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-center text-sm leading-loose text-gray-600">
            還元があった日は、まとめてお知らせが届きます。
          </p>
        </Reveal>

        <div className="mx-auto mt-8 flex max-w-md items-start justify-center gap-4">
          <Reveal delay={100} className="w-1/2">
            <ImageSlot
              ratio="9 / 16"
              alt="還元のお知らせが届いた画面"
              label="キャプチャ⑥（お知らせ：本日の還元通知）"
            />
            <p className="mt-2 text-center text-xs text-gray-500">お知らせ</p>
          </Reveal>
          <Reveal delay={200} className="w-1/2">
            <ImageSlot
              ratio="9 / 16"
              alt="ペルコインの取引履歴に還元が並んでいる画面"
              label="キャプチャ⑦（ペルコイン履歴）"
            />
            <p className="mt-2 text-center text-xs text-gray-500">履歴</p>
          </Reveal>
        </div>
      </section>

      {/* ============ フォロワーとの関係 ============ */}
      {hasPrompt && (
        <section className="bg-gradient-to-b from-white to-pink-50/60 px-6 py-14">
          <Reveal>
            <h2 className="text-center text-xl font-bold text-gray-900">
              フォロワーが増えるほど、使われる
            </h2>
            <div className="mx-auto mt-6 max-w-sm space-y-4 text-sm leading-loose text-gray-600">
              <p>
                あなたが公開したプロンプトを使えるのは、
                <span className="font-bold text-gray-900">
                  あなたをフォローしている人
                </span>
                です。フォロワーが増えるほど、使ってもらえる機会も増えていきます。
              </p>
              <p>
                プロフィールや投稿をきっかけにフォローしてもらえると、
                そのぶん還元も積み上がっていきます。
              </p>
            </div>
          </Reveal>
        </section>
      )}

      {/* ============ 対象外になるケース ============ */}
      <section className="bg-white px-6 py-14">
        <Reveal>
          <h2 className="text-center text-xl font-bold text-gray-900">
            還元されないケース
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-center text-sm text-gray-600">
            あとで「あれ？」とならないように、先にお伝えします。
          </p>
        </Reveal>

        <Reveal delay={120}>
          <ul className="mx-auto mt-6 max-w-sm space-y-3">
            {[
              {
                title: "自分で自分のプロンプトを使ったとき",
                body: "ご自身の利用は還元の対象になりません。",
              },
              {
                title: "プロンプトをコピーして貼り付けて生成したとき",
                body: "アプリ内の「このプロンプトで作る」から使われた場合が対象です。文字をコピーして自分で貼り付けた生成は、利用としてカウントされません。",
              },
              {
                title: "無料ペルコインの残高が上限に達しているとき",
                body: "受け取る側の無料ペルコイン残高が上限に達している場合は、還元されません。",
              },
            ].map((item) => (
              <li
                key={item.title}
                className="rounded-2xl border border-gray-200 bg-gray-50/60 px-5 py-4"
              >
                <p className="text-sm font-bold text-gray-900">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
          <p className="mx-auto mt-4 max-w-sm text-center text-xs leading-relaxed text-gray-500">
            還元の額は運営が変更する場合があります。最新の額はこのページとミッション画面に表示されます。
          </p>
        </Reveal>
      </section>

      {/* ============ CTA ============ */}
      <section className="px-6 pb-20 pt-10 text-center">
        <Reveal>
          <h2 className="text-xl font-bold text-gray-900">
            さっそく作ってみませんか？
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-loose text-gray-600">
            あなたの言葉が、誰かのうちの子を変えていきます。
          </p>
          <div className="mt-8">
            <Link
              href="/free"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-10 py-4 text-sm font-bold text-white shadow-[0_4px_0_rgba(236,72,153,0.35)] transition-transform hover:-translate-y-0.5"
            >
              じゆうモードで作る
            </Link>
          </div>
          <div className="mt-6">
            <Link
              href="/challenge"
              className="text-xs text-gray-500 underline hover:text-gray-700"
            >
              ほかのペルコインの貯め方をみる
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
