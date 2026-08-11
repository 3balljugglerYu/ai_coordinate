"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles, User } from "lucide-react";
import { shouldShowUsageCount } from "../lib/constants";

/** 引用サムネイルの一辺。X の引用リポストと同じく正方形にトリミングする。 */
const QUOTE_THUMBNAIL_PX = 56;

interface FeedSourceQuoteProps {
  /** 引用元のサムネイル。正方形にトリミングして出す。 */
  thumbnailUrl: string | null;
  /** 引用元の見出し（原作者名 / プリセット名）。 */
  title: string;
  /** 原作者のアイコン。プリセット引用では出さない。 */
  avatarUrl?: string | null;
  /** 引用元の説明（原作のキャプション等）。1行で切る。 */
  description?: string | null;
  /** 引用元へのリンク。無いときはリンクにしない（未公開プリセット等）。 */
  href?: string | null;
  /** 累計利用回数。下限に届かないときは出さない。 */
  usageCount?: number;
  /**
   * 利用回数の文言をどちらの対象向けにするか。
   * プロンプトは「使われた」、スタイルは「つくられた」。
   * `style` は /style の探索シートが既に使っている文言をそのまま再利用する
   * (同じ意味の文言を2箇所で持たない)。
   */
  usageVariant?: "prompt" | "style";
  /** 行動ボタン。原作が使えるときだけ渡す。 */
  action?: React.ReactNode;
}

/**
 * 引用元ブロック（X の引用リポスト相当）。
 *
 * 投稿の画像の**下**に、従属的に置く。上に置いたり大きく出したりすると
 * 投稿者自身の作品が「借り物」に見えてしまう。主役はあくまで投稿者のうちの子で、
 * ここは出典と次の導線を示すだけにとどめる。
 *
 * サムネイルは縦長・横長にかかわらず**正方形にトリミング**する。原作の比率に
 * 従わせるとカードの高さが投稿ごとにばらつき、フィードが読みづらくなる。
 * X の引用リポストも同じ扱いになっている。
 *
 * 利用回数は下限（`USAGE_COUNT_DISPLAY_THRESHOLD`）に届くまで出さない。
 */
export function FeedSourceQuote({
  thumbnailUrl,
  title,
  avatarUrl,
  description,
  href,
  usageCount = 0,
  usageVariant = "prompt",
  action,
}: FeedSourceQuoteProps) {
  const t = useTranslations("posts");
  const styleT = useTranslations("style");

  const header = (
    <div className="flex min-w-0 items-center gap-1.5">
      {avatarUrl !== undefined ? (
        avatarUrl ? (
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
        )
      ) : (
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-pink-500" aria-hidden="true" />
      )}
      <span className="truncate text-xs font-bold text-slate-900">{title}</span>
    </div>
  );

  const body = (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
      {header}
      {description ? (
        <p className="truncate text-xs leading-tight text-muted-foreground">
          {description}
        </p>
      ) : null}
      {shouldShowUsageCount(usageCount) ? (
        <p className="text-[11px] leading-tight text-muted-foreground">
          {usageVariant === "style"
            ? styleT("styleUsageCount", { count: usageCount })
            : t("sourcePromptUsageCount", { count: usageCount })}
        </p>
      ) : null}
    </div>
  );

  const thumbnail = (
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
  );

  const inner = (
    <div className="flex items-center gap-2.5">
      {thumbnail}
      {body}
    </div>
  );

  return (
    <div
      className="rounded-xl border bg-white/60 p-2.5"
      data-testid="feed-source-quote"
    >
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {t("feedSourceQuoteLabel")}
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
