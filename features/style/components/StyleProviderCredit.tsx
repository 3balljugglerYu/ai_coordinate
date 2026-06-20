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
  /** リンク/ラベルのラッパに付与する追加 class(主に絶対配置の位置指定用)。 */
  className?: string;
}

/**
 * /style とホームのスタイルカードに出す「提供 <nickname>」クレジット。
 * 提供者は preset_categories.provider_user_id (= profiles) からライブ取得した
 * nickname / avatar_url を表示する。href 指定時はプロフィールへの別タブリンクになる。
 */
export function StyleProviderCredit({
  nickname,
  avatarUrl,
  href,
  locale = "ja",
  className,
}: StyleProviderCreditProps) {
  const prefix = locale === "en" ? "by" : "提供";
  const labelText = `${prefix} ${nickname}`;

  const chip = (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-white shadow-sm backdrop-blur-[1px]">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={14}
          height={14}
          className="h-3.5 w-3.5 rounded-full object-cover"
        />
      ) : null}
      <span className="max-w-[88px] truncate">{labelText}</span>
    </span>
  );

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
        {chip}
      </Link>
    );
  }

  return (
    <span aria-label={labelText} className={className}>
      {chip}
    </span>
  );
}
