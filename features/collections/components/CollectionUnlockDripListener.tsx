"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UnlockDripModal } from "@/features/collections/components/UnlockModals";
import {
  decideUnlockAnnouncement,
  type CollectionUnlockAnnouncement,
} from "@/features/collections/lib/collection-unlock-announcement";
import {
  getUnlockSeen,
  writeUnlockSeen,
} from "@/features/collections/lib/collection-unlock-seen";
import { setUnlockAnnouncerActive } from "@/features/collections/lib/unlock-announcer-signal";
import { COLLECTION_PROGRESS_DISMISSED_EVENT } from "@/features/collections/hooks/useCollectionProgress";

interface ActiveDrip {
  announcement: CollectionUnlockAnnouncement;
  newlyUnlocked: CollectionUnlockAnnouncement["unlockedPresets"];
}

/**
 * 進捗モーダルを閉じた直後に、段階解放(B)モーダルを「新たに解放された分」のサムネ付きで出す常駐リスナ。
 *
 * - `CollectionProgressChecker`(AppShell 常駐)が進捗モーダルを閉じると
 *   `COLLECTION_PROGRESS_DISMISSED_EVENT`(detail.categoryKey)を発火する。
 * - 本リスナはそれを受け、`/api/collections/unlock-announcements` で最新の解放状況を取得し、
 *   当該カテゴリの解放数が「前回見た数(localStorage)」より増えていれば B を即表示する。
 * - 初回(seen が無い)の場合はホームの初回モーダル(A)に委ねるため、ここでは出さない。
 *
 * これにより「生成 → 進捗モーダル → 閉じる → 段階解放モーダル(B)」の順序になる
 * (進捗モーダルが出るのはコレクションシリーズが public のとき = go-live 後)。
 */
export function CollectionUnlockDripListener() {
  const [active, setActive] = useState<ActiveDrip | null>(null);
  // フェッチ中フラグ(同期的に重複フェッチを防ぐ)。短時間に dismiss が連続発火しても、
  // API 解決前は active がまだ null のため、ref で弾く必要がある。
  const fetchingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function handleDismissed(event: Event) {
      const detail = (event as CustomEvent).detail as
        | { categoryKey?: string }
        | undefined;
      const categoryKey = detail?.categoryKey;
      if (!categoryKey) return;
      // 既に表示中、またはフェッチ中なら多重フェッチしない。
      if (active || fetchingRef.current) return;

      fetchingRef.current = true;
      try {
        const res = await fetch("/api/collections/unlock-announcements", {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          announcements?: CollectionUnlockAnnouncement[];
        };
        const announcement = (data.announcements ?? []).find(
          (a) => a.categoryKey === categoryKey,
        );
        if (!announcement) return;

        const seen = getUnlockSeen(announcement.categoryKey);
        const mode = decideUnlockAnnouncement(seen, announcement.unlockedCount);
        // 段階解放(drip)のみ担当。初回(seen===null)はホームの A に委ねる。
        if (mode !== "drip" || seen === null) return;

        const newlyUnlocked = announcement.unlockedPresets.slice(
          seen,
          announcement.unlockedCount,
        );
        if (newlyUnlocked.length === 0 || cancelled) return;

        setActive({ announcement, newlyUnlocked });
      } catch {
        // 取得失敗は無視(致命ではない。次の機会に出る)。
      } finally {
        fetchingRef.current = false;
      }
    }

    window.addEventListener(COLLECTION_PROGRESS_DISMISSED_EVENT, handleDismissed);
    return () => {
      cancelled = true;
      window.removeEventListener(
        COLLECTION_PROGRESS_DISMISSED_EVENT,
        handleDismissed,
      );
    };
  }, [active]);

  // 表示中はポップアップバナーを抑止する(解放お知らせ優先)。
  const isVisible = !!active;
  useEffect(() => {
    setUnlockAnnouncerActive(isVisible);
    return () => setUnlockAnnouncerActive(false);
  }, [isVisible]);

  function close() {
    if (active) {
      writeUnlockSeen(
        active.announcement.categoryKey,
        active.announcement.unlockedCount,
      );
    }
    setActive(null);
  }

  if (!active || typeof document === "undefined") return null;

  return createPortal(
    <UnlockDripModal
      title={active.announcement.categoryDisplayName}
      newlyUnlocked={active.newlyUnlocked}
      onClose={close}
    />,
    document.body,
  );
}
