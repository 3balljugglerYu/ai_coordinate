"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles, User } from "lucide-react";
import { usageCountBucket } from "../lib/constants";

/** 引用サムネイルの一辺。X の引用リポストと同じく正方形にトリミングする。 */
const QUOTE_THUMBNAIL_PX = 56;

/**
 * 引用元ブロックの種類。
 *
 * - `root`: 投稿自身のプロンプトが公開されている（原作＝この投稿）。
 *   引用ではなく「生成できますよ」というお知らせなので、サムネイルも作者名も出さない。
 *   すぐ上にある投稿本体と同じものを繰り返すことになり、情報量が無いため。
 * - `derived`: 他人のプロンプトで生成した投稿。ここが本来の引用にあたる。
 * - `style`: One-Tap Style のプリセットで生成した投稿。
 */
export type FeedSourceQuoteVariant = "root" | "derived" | "style";

interface FeedSourceQuoteProps {
  variant: FeedSourceQuoteVariant;
  /** 引用元のサムネイル。正方形にトリミングして出す（root では使わない）。 */
  thumbnailUrl?: string | null;
  /** 引用元の名前（原作者名 / プリセット名）。 */
  title?: string;
  /** 原作者のアイコン。プリセット引用では出さない。 */
  avatarUrl?: string | null;
  /** 引用元の説明（原作のキャプション等）。1行で切る。 */
  description?: string | null;
  /** 引用元へのリンク。無いときはリンクにしない（未公開プリセット等）。 */
  href?: string | null;
  /** 累計利用回数。下限に届かないときは出さない。 */
  usageCount?: number;
  /**
   * 企画の会期が終了していて、もう生成できない状態。
   * リンクが無いだけだと「押しても反応しないカード」になるため理由を出す。
   */
  isEnded?: boolean;
  /** 行動ボタン。原作が使えるときだけ渡す。 */
  action?: React.ReactNode;
}

/**
 * 投稿画像の下に置く「これで生成しました / これで生成できます」のブロック。
 *
 * 派生投稿では X の引用リポスト相当になる。投稿の**下**に従属的に置くのは、
 * 上に置いたり大きく出したりすると投稿者自身の作品が「借り物」に見えるため。
 * 主役はあくまで投稿者のうちの子で、ここは出典と次の導線を示すだけにとどめる。
 *
 * ## ⭐ 見出しは「何をしたか」ではなく「誰のものか」を出す
 *
 * 以前は3種とも手順の説明だった（このスタイルで生成しました / このプロンプトで
 * 生成しました / このプロンプトで生成してみる）。**結果物の2つが「〜しました」で
 * 揃ってしまい、違いが読み取れない**という指摘を受けている。読んでも
 * 「運営のスタイルなのか、他人のプロンプトなのか」が分からないのが原因だった。
 *
 * そこで結果物の見出しを出どころのクレジットに変えた。
 *
 * | variant | 見出し | 意味 |
 * |---|---|---|
 * | `style` | `Persta.AI ORIGINAL` | 運営が作ったスタイルを使った |
 * | `derived` | `ORIGINAL` | 誰かが作ったプロンプトを使った（名前は直下の行） |
 * | `root` | このプロンプトで生成してみる | **据え置き** |
 *
 * ⭐ **root を変えないのは、3つのうち root だけが「招待」だから。** 他2つが
 * 出どころの表示になったので、文の形が違うこと自体が見分けの手がかりになる。
 * 全部を `ORIGINAL` で揃えると、今度は root と derived が衝突する。
 *
 * ⭐ **`derived` の見出しに作者名を入れてはいけない。** 一度
 * `ORIGINAL by {name}` にしたが、**すぐ下の名前行と隣接して同じ名前が2回**並び、
 * 明らかに冗長だった。名前を出す役目は名前行が持つ（そちらはリンクの実体で、
 * 押すと原作の投稿へ飛ぶ）。見出しは種別を示すだけでよい。
 *
 * `style` にだけ `Persta.AI` が入るのは非対称に見えるが、こちらは名前行が
 * プリセット名なので、**運営名義を書く場所が見出し以外に無い**ため。
 *
 * ⭐ 見出しは全ロケールで同じ英字のまま（`messages/*.ts` 15言語すべて同一）。
 * `ORIGINAL` はブランドのロックアップとして扱い、翻訳しない。
 *
 * 一方、**行動を促す文言は従来どおり「生成」で統一する**（CTA と root の見出し）。
 * 「使う」は目的語が曖昧で、閲覧者に「自分の何かが使われるのか」と読まれ得る。
 *
 * サムネイルは縦長・横長にかかわらず**正方形にトリミング**する。原作の比率に
 * 従わせるとカードの高さが投稿ごとにばらつき、フィードが読みづらくなる。
 *
 * 利用回数は `usageCountBucket` で丸めて出す。下限に届くまでは出さない
 * （少ない数字は社会的証明にならず、逆に「誰も使っていない」証明になる）。
 * 丸めた値なので文言は必ず「◯回以上」側を使うこと。
 */
export function FeedSourceQuote({
  variant,
  thumbnailUrl,
  title,
  avatarUrl,
  description,
  href,
  usageCount = 0,
  isEnded = false,
  action,
}: FeedSourceQuoteProps) {
  const t = useTranslations("posts");
  const styleT = useTranslations("style");

  const heading =
    variant === "root"
      ? t("feedQuoteRootTitle")
      : variant === "style"
        ? t("feedQuoteStyleTitle")
        : t("feedQuoteDerivedTitle");

  // 生の回数ではなく丸めた値を渡す。文言が「◯回以上」で固定なので、
  // 素の数字を渡すと表示が嘘になる。
  const usageBucket = usageCountBucket(usageCount);
  const usageText =
    usageBucket !== null
      ? variant === "style"
        ? styleT("styleUsageCount", { count: usageBucket })
        : t("sourcePromptUsageCount", { count: usageBucket })
      : null;

  /*
    root は引用ではなくお知らせ。サムネイルも作者名も出さず、
    「誰のプロンプトで何ができるか」を1文で説明するだけにする。
  */
  if (variant === "root") {
    return (
      <div className="rounded-xl border bg-white/60 p-2.5" data-testid="feed-source-quote">
        <p
          className="flex items-center gap-1 text-xs font-bold text-slate-900"
          data-testid="feed-source-quote-heading"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-pink-500" aria-hidden="true" />
          {heading}
        </p>
        {title ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("feedQuoteRootDescription", { name: title })}
          </p>
        ) : null}
        {usageText ? (
          <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{usageText}</p>
        ) : null}
        {action ? <div className="mt-2.5">{action}</div> : null}
      </div>
    );
  }

  const inner = (
    <div className="flex items-center gap-2.5">
      <div
        className="relative shrink-0 overflow-hidden rounded-lg bg-gray-100"
        style={{ width: QUOTE_THUMBNAIL_PX, height: QUOTE_THUMBNAIL_PX }}
        data-testid="feed-source-quote-thumbnail"
      >
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt=""
            fill
            sizes={`${QUOTE_THUMBNAIL_PX}px`}
            // 縦長でも横長でも正方形に収める。顔が切れないよう上寄せ
            className="object-cover object-top"
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {variant === "style" ? (
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-pink-500" aria-hidden="true" />
          ) : avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-black/10"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 ring-1 ring-black/10"
            >
              <User className="h-3 w-3 text-gray-500" />
            </span>
          )}
          <span className="truncate text-xs font-bold text-slate-900">{title}</span>
        </div>
        {description ? (
          <p className="truncate text-xs leading-tight text-muted-foreground">
            {description}
          </p>
        ) : null}
        {isEnded ? (
          <p
            className="text-[11px] leading-tight text-muted-foreground"
            data-testid="feed-source-quote-ended"
          >
            {t("feedQuoteEndedNote")}
          </p>
        ) : usageText ? (
          <p className="text-[11px] leading-tight text-muted-foreground">{usageText}</p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border bg-white/60 p-2.5" data-testid="feed-source-quote">
      <p
        className="mb-1.5 text-[11px] font-bold tracking-wide text-slate-900"
        data-testid="feed-source-quote-heading"
      >
        {heading}
      </p>
      {href ? (
        <Link
          href={href}
          className="block rounded-lg transition hover:bg-gray-50"
          data-testid="feed-source-quote-link"
        >
          {inner}
        </Link>
      ) : (
        inner
      )}
      {action ? <div className="mt-2.5">{action}</div> : null}
    </div>
  );
}
