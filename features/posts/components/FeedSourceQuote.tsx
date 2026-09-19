"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles, User } from "lucide-react";
import { usageCountBucket } from "../lib/constants";

/** 引用サムネイルの一辺。X の引用リポストと同じく正方形にトリミングする。 */
const QUOTE_THUMBNAIL_PX = 56;

/** 引用行の作者アイコン。ニックネームと同じ行に並ぶので名前の高さに合わせる。 */
const QUOTE_AVATAR_PX = 20;

/**
 * root の作者アイコン。**ニックネームと利用回数の2行分**の高さにする。
 *
 * root にはサムネイルが無く、ここが唯一の図像になる。引用行と同じ 20px では
 * 「作成者」の主張が弱く、見出しのラベルだけが浮いて見える。
 */
const CREATOR_AVATAR_PX = 40;

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

/**
 * 作者アイコン。未設定なら人型のプレースホルダを出す。
 *
 * 引用行(20px)と root(40px)で大きさが変わるので、Tailwind の固定クラスではなく
 * inline style で受ける（動的なクラス名は Tailwind が拾えない）。
 */
function CreatorAvatar({ url, size }: { url?: string | null; size: number }) {
  const box = { width: size, height: size };

  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={size}
        height={size}
        style={box}
        className="shrink-0 rounded-full object-cover ring-1 ring-black/10"
        data-testid="feed-source-quote-avatar"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={box}
      className="flex shrink-0 items-center justify-center rounded-full bg-gray-200 ring-1 ring-black/10"
      data-testid="feed-source-quote-avatar"
    >
      <User style={{ width: size * 0.5, height: size * 0.5 }} className="text-gray-500" />
    </span>
  );
}

interface FeedSourceQuoteProps {
  variant: FeedSourceQuoteVariant;
  /** 引用元のサムネイル。正方形にトリミングして出す（root では使わない）。 */
  thumbnailUrl?: string | null;
  /** 引用元の名前（原作者名 / プリセット名）。 */
  title?: string;
  /** 作者のアイコン。root では 2 行分の大きさで出す。プリセット引用では出さない。 */
  avatarUrl?: string | null;
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
  /**
   * `root` のクレジット（枠・見出し・アイコン・名前・利用回数）を出さず、
   * **行動ボタンだけ**にする。
   *
   * ⭐ 一覧そのものが「その人が作った原作」だけで構成されている面
   * （`/user-styles`）用。あそこでは投稿者＝原作者なので、このクレジットは
   * すぐ上の**作者行の繰り返し**にしかならず、枠のぶんだけカードが伸びる。
   *
   * ⭐ **ホーム（root と派生が混ざる）では使わないこと。** あちらは
   * 「これは誰のプロンプトか」を毎回示す必要がある。既定は false で、
   * 渡さなければ挙動は変わらない。
   */
  hideRootCredit?: boolean;
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
 * | `root` | `プロンプト作成者` | この人が作った（＝原作がこの投稿） |
 *
 * ⭐ **軸は「使った側」と「作った側」**。`ORIGINAL` は借りてきた出どころの表示、
 * `プロンプト作成者` は原作者のクレジット。root にも `ORIGINAL` を使うと、
 * 同じ語が「これを使った」と「これが原作」の両方を指してしまい衝突する。
 *
 * ⭐ **root の見出しは以前「このプロンプトで生成してみる」だった。**
 * すぐ下の CTA が「このプロンプトで生成する」なので**ほぼ同じ文が2回**並び、
 * 見出しが場所を取るだけになっていた。説明文も「生成することができます」で、
 * 1枚のカードに「生成」が3回出ていた。見出しを作成者のクレジットに寄せ、
 * **説明文は丸ごと落とした**（「誰が作ったか」は見出し＋アイコン＋名前で足り、
 * 「生成できます」は CTA が言う）。いまカード内の「生成」は CTA の1回だけ。
 *
 * ## ⭐ 作者の出し方（root / derived）
 *
 * ```
 * root                      derived
 * ───────────────────       ─────────────────────────────────
 * プロンプト作成者           ORIGINAL
 *                           ┌──────┐ プロンプト作成者
 * (顔40px) ニックネーム      │ 原作  │ (顔20px) ニックネーム
 *          利用回数          └──────┘ 利用回数
 * ```
 *
 * どちらも `プロンプト作成者` と名乗るが、置き場所が違う。root はカード全体が
 * 作成者の話なので**見出し**、derived は引用の中の一要素なので**サムネイルの横**。
 *
 * ⭐ derived のラベルは**アイコンの上**に置く。名前の横に並べると先に名前が
 * 目に入り、ラベルが飾りになる。
 *
 * ⭐ アイコンの大きさが違うのは、隣に何があるかが違うため。root はサムネイルが
 * 無くここが唯一の図像なので 2 行分(40px)、derived はサムネイルが figure の役を
 * 担うので名前の高さ(20px)に留める。**derived で 40px にするとサムネイルと
 * 合わせて右の幅が 200px しか残らず、利用回数が2行に折り返す**（実測）。
 *
 * `プロンプト作成者` の文字列は root の見出しと**同じキー**を使う
 * (`feedQuotePromptCreator`)。同じことを指すので、別キーにすると片方だけ
 * 直されて食い違う。
 *
 * ⭐ 3種とも見出しは同じ体裁（11px / bold / `tracking-wide`）。
 * 見分けは体裁ではなく**中身**で付ける。root の見出しに付けていた ✨ は
 * 「試してみて」という誘いに添えたもので、クレジットには合わないので外した。
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
  href,
  usageCount = 0,
  isEnded = false,
  action,
  hideRootCredit = false,
}: FeedSourceQuoteProps) {
  const t = useTranslations("posts");
  const styleT = useTranslations("style");

  const heading =
    variant === "root"
      ? t("feedQuotePromptCreator")
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
    root は引用ではなく作成者のクレジット。

    ⭐ **サムネイルは出さない。** 原作＝この投稿なので、すぐ上の投稿本体と
    同じ画像を繰り返すことになり情報量がゼロになる。アイコンは別で、
    「誰が作ったか」という顔が付くぶん意味がある。

    ⭐ 説明文（「{name}さんが作ったプロンプトです」）は**見出しと重複する**ので
    置かない。見出しが「プロンプト作成者」と言っている以上、続けて
    「作ったプロンプトです」と書くのは同じことの二度言いになる。
    アイコンの横はニックネームと利用回数の2行に絞る。
  */
  if (variant === "root") {
    /*
      クレジットを出さない面では、枠ごと落として行動ボタンだけにする。
      見出しもアイコンも名前も、カード上部の作者行と同じものを繰り返すだけなので、
      残すと「同じ人が2回出てくる」ことになる。
    */
    if (hideRootCredit) {
      return action ? <>{action}</> : null;
    }
    return (
      <div className="rounded-xl border bg-white/60 p-2.5" data-testid="feed-source-quote">
        <p
          className="mb-1.5 text-[11px] font-bold tracking-wide text-slate-900"
          data-testid="feed-source-quote-heading"
        >
          {heading}
        </p>
        <div className="flex items-center gap-2.5">
          <CreatorAvatar url={avatarUrl} size={CREATOR_AVATAR_PX} />
          {/* 利用回数が下限に届かない投稿では1行になる。アイコンは中央に揃える */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            {title ? (
              <span className="truncate text-xs font-bold text-slate-900">{title}</span>
            ) : null}
            {usageText ? (
              <span className="text-[11px] leading-tight text-muted-foreground">{usageText}</span>
            ) : null}
          </div>
        </div>
        {action ? <div className="mt-2.5">{action}</div> : null}
      </div>
    );
  }

  /** 利用回数 or 終了案内。どちらも出ないことがある（下限未満・開催中）。 */
  const metaLine = isEnded ? (
    <p
      className="text-[11px] leading-tight text-muted-foreground"
      data-testid="feed-source-quote-ended"
    >
      {t("feedQuoteEndedNote")}
    </p>
  ) : usageText ? (
    <p className="text-[11px] leading-tight text-muted-foreground">{usageText}</p>
  ) : null;

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
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        {variant === "derived" ? (
          /*
            ⭐ ラベルは**アイコンの上**に置く。名前の横に並べると、先に名前が
            目に入ってラベルが飾りになり、「この人が作った人だ」が伝わらない。
          */
          <span className="text-[11px] leading-tight text-muted-foreground">
            {t("feedQuotePromptCreator")}
          </span>
        ) : null}
        <div className="flex min-w-0 items-center gap-1.5">
          {variant === "style" ? (
            /* 引用先が人ではなくプリセットなので、顔ではなく ✨ を添える */
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-pink-500" aria-hidden="true" />
          ) : (
            <CreatorAvatar url={avatarUrl} size={QUOTE_AVATAR_PX} />
          )}
          <span className="truncate text-xs font-bold text-slate-900">{title}</span>
        </div>
        {metaLine}
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
