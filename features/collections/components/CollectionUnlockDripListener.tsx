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
import { getUnlockAnnouncements } from "@/features/collections/lib/unlock-announcements-prefetch";
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
        // 進捗モーダル表示中に先読み済みならそれを再利用し(体感待ちほぼゼロ)、
        // 無ければここでフォールバック取得する(従来と同じ待ち時間)。
        const data = await getUnlockAnnouncements();
        if (cancelled) return;
        const announcement = (data.announcements ?? []).find(
          (a) => a.categoryKey === categoryKey,
        );
        if (!announcement) return;

        // sequential は baseline(常時解放=表紙)を未記録時の既読とみなす。これにより
        // 「はじまり生成 → Day1解放」が初回から drip として出る(前提型は従来どおり初回はAに委譲)。
        const seenRaw = getUnlockSeen(announcement.categoryKey);
        const baseline = announcement.baselineUnlockedCount ?? 0;
        const effectiveSeen = seenRaw ?? (baseline > 0 ? baseline : null);
        const mode = decideUnlockAnnouncement(
          effectiveSeen,
          announcement.unlockedCount,
        );
        // 段階解放(drip)のみ担当。初回(effectiveSeen===null=前提型で未記録)はホームの A に委ねる。
        if (mode !== "drip" || effectiveSeen === null) return;

        const newlyUnlocked = announcement.unlockedPresets.slice(
          effectiveSeen,
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
      body={active.announcement.dripBody}
      colors={{
        accent: active.announcement.accentColor,
        accentHover: active.announcement.accentHoverColor,
        title: active.announcement.titleColor,
        soft: active.announcement.softColor,
      }}
      unitLabel={active.announcement.unitLabel}
    />,
    document.body,
  );
}
