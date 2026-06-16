"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  decideUnlockAnnouncement,
  type CollectionUnlockAnnouncement,
  type UnlockAnnouncementMode,
} from "@/features/collections/lib/collection-unlock-announcement";
import { getCollectionAck } from "@/features/collections/lib/collection-ack";
import {
  getUnlockSeen,
  writeUnlockSeen,
} from "@/features/collections/lib/collection-unlock-seen";
import { setUnlockAnnouncerActive } from "@/features/collections/lib/unlock-announcer-signal";
import {
  InitialUnlockModal,
  UnlockDripModal,
} from "@/features/collections/components/UnlockModals";

// クライアントでのみ true を返す SSR セーフなゲート(setState-in-effect を避けるため
// useSyncExternalStore を使う)。サーバー/ハイドレーション中は false で何も描画しない。
const noopSubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

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

    const seen = getUnlockSeen(announcement.categoryKey);
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
 * - 初回(まだ一度も見ていない & 解放数>0) → 初回解放モーダル(A): キャラ画像 + 「解放されました！」
 * - 段階解放(前回より解放数が増えた) → モーダル(B): 「新たに N体 解放！」+ サムネ
 *
 * 「前回見た解放数」は localStorage に保存し、表示後に現在値へ更新する(=同じ解放では再表示しない)。
 * サーバー側の判定(可視性 admin_only / 前提完走)を通った announcements だけが渡る前提。
 *
 * なお、生成直後(進捗モーダルを閉じた直後)の段階解放(B)は `CollectionUnlockDripListener`
 * (AppShell 常駐)が担当する。本コンポーネントはホームでの初回/再訪時表示を担う。
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

  // 通常時の表示判定(localStorage 読み取り)は useMemo で包み、毎レンダーの
  // localStorage.getItem / JSON.parse を避ける。依存が変わったときだけ再評価する
  // (setState-in-effect を避けるため render 時導出のまま、コストだけ抑える)。
  const resolvedActive = useMemo<ActiveAnnouncement | null>(
    () =>
      !previewMode && isClient && announcements.length > 0
        ? resolveActiveAnnouncement(announcements)
        : null,
    [previewMode, isClient, announcements],
  );

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
    // 「閉じた」判定は memo 外で行う(localStorage を再読み込みしない)。
    visible =
      resolvedActive &&
      resolvedActive.announcement.categoryKey !== acknowledgedKey
        ? resolvedActive
        : null;
  }

  function acknowledge() {
    if (previewMode) {
      // プレビューは記録しない(閉じるだけ)。
      setAcknowledgedKey(announcements[0]?.categoryKey ?? "preview");
      return;
    }
    if (!visible) return;
    writeUnlockSeen(
      visible.announcement.categoryKey,
      visible.announcement.unlockedCount,
    );
    setAcknowledgedKey(visible.announcement.categoryKey);
  }

  // プレビューで閉じたら消す。
  if (previewMode && acknowledgedKey) {
    visible = null;
  }

  // 解放お知らせを表示中はポップアップバナーを抑止する(解放お知らせ優先)。
  // React state ではなく外部シグナルへの反映なので effect で行う。
  const isVisible = !!visible;
  useEffect(() => {
    setUnlockAnnouncerActive(isVisible);
    return () => setUnlockAnnouncerActive(false);
  }, [isVisible]);

  if (!visible || typeof document === "undefined") return null;

  const node =
    visible.mode === "initial" ? (
      <InitialUnlockModal
        title={visible.announcement.categoryDisplayName}
        onClose={acknowledge}
      />
    ) : (
      <UnlockDripModal
        title={visible.announcement.categoryDisplayName}
        newlyUnlocked={visible.newlyUnlocked}
        onClose={acknowledge}
      />
    );

  return createPortal(node, document.body);
}
