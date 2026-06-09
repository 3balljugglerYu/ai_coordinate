"use client";

import { useState } from "react";
import { shareMount } from "../lib/share-mount";

/**
 * 公開台紙ページで「所有者のみ」に表示するシェア/保存ボタン。
 * シェアは公開ページURLの URL 共有(shareMount)。保存は台紙画像のダウンロード。
 */
export function MountShareButton({
  completionId,
  mountImageUrl,
  displayName,
}: {
  completionId: string;
  mountImageUrl: string;
  displayName: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handleShare() {
    setBusy(true);
    try {
      await shareMount(completionId, mountImageUrl);
    } catch {
      // ユーザーキャンセル等は無視
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    setBusy(true);
    try {
      const res = await fetch(mountImageUrl, { mode: "cors" });
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${displayName || "collection"}-mount.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // 失敗時は新規タブで開く(最低限の保存導線)
      window.open(mountImageUrl, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap justify-center gap-3">
      <button
        type="button"
        onClick={handleShare}
        disabled={busy}
        className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        台紙をシェアする
      </button>
      <button
        type="button"
        onClick={handleDownload}
        disabled={busy}
        className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        画像を保存
      </button>
    </div>
  );
}
