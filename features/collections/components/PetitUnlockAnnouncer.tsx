"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import {
  decideUnlockAnnouncement,
  type CollectionUnlockAnnouncement,
  type UnlockAnnouncementMode,
} from "@/features/collections/lib/collection-unlock-announcement";
import { getCollectionAck } from "@/features/collections/lib/collection-ack";

// クライアントでのみ true を返す SSR セーフなゲート(setState-in-effect を避けるため
// useSyncExternalStore を使う)。サーバー/ハイドレーション中は false で何も描画しない。
const noopSubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

const STORAGE_KEY = "persta:collection-unlock-seen-v1";

/** カテゴリ key -> 「前回お知らせ時の解放数」。 */
type SeenMap = Record<string, number>;

function readSeenMap(): SeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as SeenMap;
    }
    return {};
  } catch {
    return {};
  }
}

function writeSeen(categoryKey: string, unlockedCount: number) {
  if (typeof window === "undefined") return;
  try {
    const map = readSeenMap();
    map[categoryKey] = unlockedCount;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage 不可(プライベートモード等)でも致命ではない。お知らせは出ないだけ。
  }
}

interface ActiveAnnouncement {
  mode: Exclude<UnlockAnnouncementMode, "none">;
  announcement: CollectionUnlockAnnouncement;
  /** 段階解放(drip)で「新たに解放された」分のプリセット(初回は解放済み全件)。 */
  newlyUnlocked: CollectionUnlockAnnouncement["unlockedPresets"];
}

/**
 * localStorage の「前回見た解放数」と現在値を突き合わせ、最初に表示すべき1件を返す。
 * 表示不要なら null。クライアント(localStorage 可用)でのみ呼ぶ。
 */
function resolveActiveAnnouncement(
  announcements: CollectionUnlockAnnouncement[],
): ActiveAnnouncement | null {
  const seenMap = readSeenMap();
  for (const announcement of announcements) {
    // 前提カテゴリ(神コレ)のコンプリート演出が「まだ確認されていない」間はお知らせを出さない。
    // コンプリート演出は表示時に collection-ack を現在のユニーク数へ進めるため、
    // ack がその値以上になっていれば「演出は既に出た(=確認フェーズに入った)」とみなせる。
    // これにより「コンプリート演出 → 閉じる → 次に解放お知らせ」の順序になり、重ならない。
    if (
      announcement.prerequisiteAckCount > 0 &&
      getCollectionAck(announcement.prerequisiteKey) <
        announcement.prerequisiteAckCount
    ) {
      continue;
    }

    const hasSeen = Object.prototype.hasOwnProperty.call(
      seenMap,
      announcement.categoryKey,
    );
    const seen = hasSeen ? seenMap[announcement.categoryKey] : null;
    const mode = decideUnlockAnnouncement(seen, announcement.unlockedCount);
    if (mode === "none") continue;

    const newlyUnlocked =
      mode === "drip" && seen !== null
        ? announcement.unlockedPresets.slice(seen, announcement.unlockedCount)
        : announcement.unlockedPresets.slice(0, announcement.unlockedCount);

    return { mode, announcement, newlyUnlocked };
  }
  return null;
}

/**
 * ぷち神など「解放ゲート付きカテゴリ」の解放お知らせを、ホーム再訪時に出すクライアント。
 *
 * - 初回(まだ一度も見ていない & 解放数>0) → トップバナー(A): 「ぷち神コレクション解放！」
 * - 段階解放(前回より解放数が増えた) → モーダル(B): 「新たに N体 解放！」+ サムネ
 *
 * 「前回見た解放数」は localStorage に保存し、表示後に現在値へ更新する(=同じ解放では再表示しない)。
 * サーバー側の判定(可視性 admin_only / 前提完走)を通った announcements だけが渡る前提。
 */
export function PetitUnlockAnnouncer({
  announcements,
  previewMode,
}: {
  announcements: CollectionUnlockAnnouncement[];
  /**
   * 開発/E2E プレビュー用。"initial"/"drip" を渡すと localStorage を無視して該当 UI を強制表示する
   * (本番導線では undefined。URL クエリ petitUnlockPreview から page.tsx 経由で渡す)。
   */
  previewMode?: "initial" | "drip";
}) {
  // クライアントでのみ true。SSR/ハイドレーション中は false で何も出さない(localStorage 不可)。
  const isClient = useSyncExternalStore(
    noopSubscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
  // 「閉じた/CTA押した」を記録すると、その回は再表示しない(localStorage も更新する)。
  const [acknowledgedKey, setAcknowledgedKey] = useState<string | null>(null);

  // 表示判定は render 時に導出する(setState-in-effect を避ける)。
  // プレビュー時は localStorage を無視して該当モードを強制表示する。
  let visible: ActiveAnnouncement | null = null;
  if (previewMode && isClient && announcements.length > 0) {
    const announcement = announcements[0];
    const newlyUnlocked =
      previewMode === "drip"
        ? announcement.unlockedPresets.slice(
            Math.max(0, announcement.unlockedCount - 2),
            announcement.unlockedCount,
          )
        : announcement.unlockedPresets;
    visible = { mode: previewMode, announcement, newlyUnlocked };
  } else if (!previewMode) {
    const active =
      isClient && announcements.length > 0
        ? resolveActiveAnnouncement(announcements)
        : null;
    visible =
      active && active.announcement.categoryKey !== acknowledgedKey
        ? active
        : null;
  }

  function acknowledge() {
    if (previewMode) {
      // プレビューは記録しない(閉じるだけ)。
      setAcknowledgedKey(announcements[0]?.categoryKey ?? "preview");
      return;
    }
    if (!visible) return;
    writeSeen(
      visible.announcement.categoryKey,
      visible.announcement.unlockedCount,
    );
    setAcknowledgedKey(visible.announcement.categoryKey);
  }

  // プレビューで閉じたら消す。
  if (previewMode && acknowledgedKey) {
    visible = null;
  }

  if (!visible || typeof document === "undefined") return null;

  const node =
    visible.mode === "initial" ? (
      <InitialBanner
        title={visible.announcement.categoryDisplayName}
        onClose={acknowledge}
      />
    ) : (
      <DripModal
        title={visible.announcement.categoryDisplayName}
        newlyUnlocked={visible.newlyUnlocked}
        onClose={acknowledge}
      />
    );

  return createPortal(node, document.body);
}

/** A: 初回解放のトップバナー(画面上部に固定)。 */
function InitialBanner({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-x-0 top-16 z-50 flex justify-center px-3">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-rose-50 px-4 py-3 shadow-lg">
        <span className="text-2xl" aria-hidden>
          ✨
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-amber-900">
            {title}が解放されました！
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            コンプリート報酬の新しいスタイルが登場。さっそく作ってみましょう。
          </p>
        </div>
        <Link
          href="/style"
          onClick={onClose}
          className="shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-600"
        >
          見る
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="shrink-0 rounded-full p-1 text-amber-700 transition hover:bg-amber-100"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
          >
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** B: 段階解放のお祝いモーダル(新たに解放されたサムネを表示)。 */
function DripModal({
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
        className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-3xl" aria-hidden>
          🎉
        </p>
        <h2 className="mt-2 text-lg font-bold text-slate-900">
          新たに{count}体 解放！
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {title}の続きが登場しました。
        </p>

        {count > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {newlyUnlocked.map((preset) => (
              <div key={preset.id} className="w-20">
                <div className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  <Image
                    src={preset.thumbnailUrl}
                    alt={preset.title}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
                <p className="mt-1 truncate text-[11px] text-slate-600">
                  {preset.title}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/style"
            onClick={onClose}
            className="rounded-full bg-amber-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-600"
          >
            つくりに行く
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100"
          >
            あとで
          </button>
        </div>
      </div>
    </div>
  );
}
