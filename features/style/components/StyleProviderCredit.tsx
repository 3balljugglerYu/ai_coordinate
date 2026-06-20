"use client";

import Image from "next/image";
import Link from "next/link";

interface StyleProviderCreditProps {
  /** 提供者の表示名(profiles.nickname をライブ取得した値)。 */
  nickname: string;
  /** 提供者のアバター URL(profiles.avatar_url)。null なら名前のみ表示。 */
  avatarUrl: string | null;
  /**
   * 設定するとチップ全体が提供者プロフィール (/users/[id]) へのリンクになる。
   * 省略/null のときは非リンクの静的ラベルとして表示する
   * (例: ホーム/一覧カードは内側がボタンのため非リンク)。
   */
  href?: string | null;
  /** "提供" / "by" の接頭辞を選ぶための locale。省略時は 'ja'。 */
  locale?: "ja" | "en";
  /** ラッパに付与する追加 class(主に絶対配置の位置指定用)。 */
  className?: string;
  /**
   * true のときアバターアイコンのみ表示する(名前テキストを出さない)。
   * 小さな一覧カード向け。avatarUrl が無い場合は名前ピルにフォールバックする。
   */
  iconOnly?: boolean;
  /** 表示サイズ。'sm'(既定, カード)/ 'lg'(/style の選択画像オーバーレイ用)。 */
  size?: "sm" | "lg";
}

/**
 * /style とホームのスタイルカードに出す提供者クレジット。
 * 提供者は preset_categories.provider_user_id (= profiles) からライブ取得した
 * nickname / avatar_url を表示する。href 指定時はプロフィールへの別タブリンクになる。
 */
export function StyleProviderCredit({
  nickname,
  avatarUrl,
  href,
  locale = "ja",
  className,
  iconOnly = false,
  size = "sm",
}: StyleProviderCreditProps) {
  const prefix = locale === "en" ? "by" : "提供";
  const labelText = `${prefix} ${nickname}`;
  const isLarge = size === "lg";

  let content;
  if (iconOnly && avatarUrl) {
    // アイコンのみ。アクセシブル名は alt が担う。薄いフチで白背景でも輪郭が出る。
    const px = isLarge ? 28 : 20;
    content = (
      <Image
        src={avatarUrl}
        // href 経由でリンク化する場合、親 Link の aria-label と二重読み上げになるため alt を空にする。
        alt={href ? "" : labelText}
        width={px}
        height={px}
        className="rounded-full object-cover ring-1 ring-black/10"
      />
    );
  } else {
    // アバター + 名前のピル(可視表示は名前のみ。「提供/by」はリンクの aria-label が担う)。
    const px = isLarge ? 20 : 14;
    content = (
      <span
        className={`inline-flex items-center rounded-full bg-black/55 font-semibold leading-tight text-white shadow-sm backdrop-blur-[1px] ${
          isLarge ? "gap-1.5 px-2.5 py-1 text-xs" : "gap-1 px-1.5 py-0.5 text-[10px]"
        }`}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            width={px}
            height={px}
            className="rounded-full object-cover"
          />
        ) : null}
        <span className={isLarge ? "max-w-[180px] truncate" : "max-w-[88px] truncate"}>
          {nickname}
        </span>
      </span>
    );
  }

  if (href) {
    return (
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        // 親(画像カード等)のクリック・選択ハンドラと競合させない。
        onClick={(event) => event.stopPropagation()}
        aria-label={labelText}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return <span className={className}>{content}</span>;
}
