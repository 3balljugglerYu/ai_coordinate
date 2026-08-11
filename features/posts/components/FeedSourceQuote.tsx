"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles, User } from "lucide-react";
import { shouldShowUsageCount } from "../lib/constants";

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
 * 文言は「生成」で統一する。「使う」は目的語が曖昧で、閲覧者に「自分の何かが
 * 使われるのか」と読まれ得る。アプリの他の文言（還元の説明など）も
 * 「このプロンプトで生成する」と言っている。
 *
 * サムネイルは縦長・横長にかかわらず**正方形にトリミング**する。原作の比率に
 * 従わせるとカードの高さが投稿ごとにばらつき、フィードが読みづらくなる。
 *
 * 利用回数は下限（`USAGE_COUNT_DISPLAY_THRESHOLD`）に届くまで出さない。
 * 少ない数字は社会的証明にならず、逆に「誰も使っていない」証明になってしまう。
 */
export function FeedSourceQuote({
  variant,
  thumbnailUrl,
  title,
  avatarUrl,
  description,
  href,
  usageCount = 0,
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

  const usageText = shouldShowUsageCount(usageCount)
    ? variant === "style"
      ? styleT("styleUsageCount", { count: usageCount })
      : t("sourcePromptUsageCount", { count: usageCount })
    : null;

  /*
    root は引用ではなくお知らせ。サムネイルも作者名も出さず、
    「誰のプロンプトで何ができるか」を1文で説明するだけにする。
  */
  if (variant === "root") {
    return (
      <div className="rounded-xl border bg-white/60 p-2.5" data-testid="feed-source-quote">
        <p className="flex items-center gap-1 text-xs font-bold text-slate-900">
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
        {usageText ? (
          <p className="text-[11px] leading-tight text-muted-foreground">{usageText}</p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border bg-white/60 p-2.5" data-testid="feed-source-quote">
      <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">{heading}</p>
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
