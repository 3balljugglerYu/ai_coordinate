"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import type { CollectionUnlockAnnouncement } from "@/features/collections/lib/collection-unlock-announcement";

// ぷち神の進捗モーダル(#C670FF / #F3E0FF)に合わせた爽やかな紫基調の配色(デフォルト)。
// admin がカテゴリ単位で上書きできる(未設定ならこの値にフォールバック)。
// 動的色は Tailwind の固定 arbitrary class では表現できないため、CSS 変数(--ann-*)を
// inline style で注入し、クラス側は bg-[var(--ann-accent)] のように静的参照する(JIT セーフ)。
const DEFAULT_ACCENT = "#C670FF";
const DEFAULT_ACCENT_HOVER = "#B14DF0";
const DEFAULT_TITLE_COLOR = "#8B3DC9";
const DEFAULT_SOFT_BG = "#F3E0FF";

/** 初回モーダルの固定ヒーロー画像(admin 未設定時のフォールバック)。 */
const DEFAULT_HERO_IMAGE = "/collections/petit-unlock-hero.png";

/** 初回モーダルの本文(admin 未設定時のフォールバック)。 */
const DEFAULT_INITIAL_BODY =
  "コンプリート報酬の新しいスタイルが登場。さっそく作ってみましょう。";

/** 解放お知らせの配色(admin 上書き可)。null の項目はデフォルトにフォールバック。 */
export interface UnlockAnnouncementColors {
  accent: string | null;
  accentHover: string | null;
  title: string | null;
  soft: string | null;
}

/** 配色 props を CSS 変数 style + 見出し色に解決する。 */
function resolveColors(colors?: UnlockAnnouncementColors): {
  cssVars: CSSProperties;
  titleColor: string;
} {
  const accent = colors?.accent ?? DEFAULT_ACCENT;
  const accentHover = colors?.accentHover ?? DEFAULT_ACCENT_HOVER;
  const title = colors?.title ?? DEFAULT_TITLE_COLOR;
  const soft = colors?.soft ?? DEFAULT_SOFT_BG;
  return {
    cssVars: {
      "--ann-accent": accent,
      "--ann-accent-hover": accentHover,
      "--ann-soft": soft,
    } as CSSProperties,
    titleColor: title,
  };
}

/** モーダル右上の閉じる(×)ボタン。 */
function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="閉じる"
      className="absolute right-3 top-3 rounded-full p-1.5 text-[#B388D9] transition hover:bg-[var(--ann-soft)]"
    >
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M4 4l8 8M12 4l-8 8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

/** NEW ピル(紫)。 */
function NewPill() {
  return (
    <span
      className="inline-block rounded-full px-3 py-1 text-xs font-bold tracking-wide"
      style={{
        backgroundColor: "var(--ann-soft)",
        color: "var(--ann-accent-hover)",
      }}
    >
      NEW
    </span>
  );
}

/** 「つくりに行く」/「あとで」の CTA。 */
function UnlockModalActions({ onClose }: { onClose: () => void }) {
  return (
    <div className="mt-6 flex flex-col gap-2">
      <Link
        href="/style"
        onClick={onClose}
        className="rounded-full bg-[var(--ann-accent)] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--ann-accent-hover)]"
      >
        つくりに行く
      </Link>
      <button
        type="button"
        onClick={onClose}
        className="rounded-full px-4 py-2 text-sm font-medium text-[#9B7AB5] transition hover:bg-[var(--ann-soft)]"
      >
        あとで
      </button>
    </div>
  );
}

/** A: 初回解放モーダル(解放キャラのステッカー画像を見せる)。 */
export function InitialUnlockModal({
  title,
  onClose,
  heroImageUrl,
  body,
  colors,
}: {
  title: string;
  onClose: () => void;
  /** ヒーロー画像 URL(未指定なら固定画像にフォールバック)。 */
  heroImageUrl?: string | null;
  /** 本文(未指定なら標準文にフォールバック)。 */
  body?: string | null;
  /** 配色(未指定なら標準の紫基調)。 */
  colors?: UnlockAnnouncementColors;
}) {
  const { cssVars, titleColor } = resolveColors(colors);
  const heroSrc = heroImageUrl ?? DEFAULT_HERO_IMAGE;
  const bodyText = body ?? DEFAULT_INITIAL_BODY;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-b from-[#F8EEFF] to-white p-6 text-center shadow-2xl"
        style={cssVars}
        onClick={(event) => event.stopPropagation()}
      >
        <CloseButton onClose={onClose} />
        <NewPill />
        <h2 className="mt-2 text-lg font-bold" style={{ color: titleColor }}>
          {title}が解放されました！
        </h2>

        <div className="mx-auto mt-4 w-52 overflow-hidden rounded-2xl shadow-md ring-1 ring-[#E6C8FF]">
          <Image
            src={heroSrc}
            alt={title}
            width={600}
            height={600}
            className="h-auto w-full"
            priority
          />
        </div>

        <p className="mt-4 text-sm text-[#7A5A93]">{bodyText}</p>

        <UnlockModalActions onClose={onClose} />
      </div>
    </div>
  );
}

/** B: 段階解放のお祝いモーダル(新たに解放されたサムネを表示)。 */
export function UnlockDripModal({
  title,
  newlyUnlocked,
  onClose,
  body,
  colors,
}: {
  title: string;
  newlyUnlocked: CollectionUnlockAnnouncement["unlockedPresets"];
  onClose: () => void;
  /** 本文(未指定なら標準文にフォールバック)。 */
  body?: string | null;
  /** 配色(未指定なら標準の紫基調)。 */
  colors?: UnlockAnnouncementColors;
}) {
  const { cssVars, titleColor } = resolveColors(colors);
  const count = newlyUnlocked.length;
  const bodyText = body ?? `${title}の続きが登場しました。`;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-b from-[#F8EEFF] to-white p-6 text-center shadow-2xl"
        style={cssVars}
        onClick={(event) => event.stopPropagation()}
      >
        <CloseButton onClose={onClose} />
        <NewPill />
        <h2 className="mt-2 text-lg font-bold" style={{ color: titleColor }}>
          新たに{count}体 解放！
        </h2>
        <p className="mt-1 text-sm text-[#7A5A93]">{bodyText}</p>

        {count > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {newlyUnlocked.map((preset) => (
              <div key={preset.id} className="w-20">
                <div className="relative aspect-square overflow-hidden rounded-xl bg-[#F8EEFF] ring-1 ring-[#E6C8FF]">
                  <Image
                    src={preset.thumbnailUrl}
                    alt={preset.title}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
                <p className="mt-1 truncate text-[11px] text-[#7A5A93]">
                  {preset.title}
                </p>
              </div>
            ))}
          </div>
        )}

        <UnlockModalActions onClose={onClose} />
      </div>
    </div>
  );
}
