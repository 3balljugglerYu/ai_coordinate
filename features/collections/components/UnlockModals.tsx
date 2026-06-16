"use client";

import Image from "next/image";
import Link from "next/link";
import type { CollectionUnlockAnnouncement } from "@/features/collections/lib/collection-unlock-announcement";

// ぷち神の進捗モーダル(#C670FF / #F3E0FF)に合わせた爽やかな紫基調の配色。
// ボタン背景/hover は Tailwind の arbitrary class(bg-[#C670FF] hover:bg-[#B14DF0])で指定する。
const ACCENT_HOVER = "#B14DF0";
const ACCENT_TEXT = "#8B3DC9";
const ACCENT_SOFT_BG = "#F3E0FF";

/** モーダル右上の閉じる(×)ボタン。 */
function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="閉じる"
      className="absolute right-3 top-3 rounded-full p-1.5 text-[#B388D9] transition hover:bg-[#F3E0FF]"
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
      style={{ backgroundColor: ACCENT_SOFT_BG, color: ACCENT_HOVER }}
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
        className="rounded-full bg-[#C670FF] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#B14DF0]"
      >
        つくりに行く
      </Link>
      <button
        type="button"
        onClick={onClose}
        className="rounded-full px-4 py-2 text-sm font-medium text-[#9B7AB5] transition hover:bg-[#F3E0FF]"
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
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-b from-[#F8EEFF] to-white p-6 text-center shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <CloseButton onClose={onClose} />
        <NewPill />
        <h2 className="mt-2 text-lg font-bold" style={{ color: ACCENT_TEXT }}>
          {title}が解放されました！
        </h2>

        <div className="mx-auto mt-4 w-52 overflow-hidden rounded-2xl shadow-md ring-1 ring-[#E6C8FF]">
          <Image
            src="/collections/petit-unlock-hero.png"
            alt={title}
            width={600}
            height={600}
            className="h-auto w-full"
            priority
          />
        </div>

        <p className="mt-4 text-sm text-[#7A5A93]">
          コンプリート報酬の新しいスタイルが登場。さっそく作ってみましょう。
        </p>

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
}: {
  title: string;
  newlyUnlocked: CollectionUnlockAnnouncement["unlockedPresets"];
  onClose: () => void;
}) {
  const count = newlyUnlocked.length;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-b from-[#F8EEFF] to-white p-6 text-center shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <CloseButton onClose={onClose} />
        <NewPill />
        <h2 className="mt-2 text-lg font-bold" style={{ color: ACCENT_TEXT }}>
          新たに{count}体 解放！
        </h2>
        <p className="mt-1 text-sm text-[#7A5A93]">
          {title}の続きが登場しました。
        </p>

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
