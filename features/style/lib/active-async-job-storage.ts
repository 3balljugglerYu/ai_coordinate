/**
 * /style の非同期生成ジョブを「画面離脱→復帰」で復元するための一時保存。
 *
 * 背景: /style で生成中に他画面へ移動すると StylePageClient が unmount し、
 * ポーリングが停止する(= pollingStopped)。ジョブ自体はサーバーで継続するため、
 * 進行中の jobId を sessionStorage に保持しておき、復帰時に再ポーリングして
 * 通常完了と同じ流れで結果を表示する。
 *
 * sessionStorage を使う理由:
 * - タブ単位で生存し、ナビゲーション(unmount/remount)を跨いで残る
 * - タブを閉じれば消えるので、別セッションに古いジョブを持ち越さない
 *
 * 完了(成功表示 or 失敗)時・新規生成開始時に必ず clear する。
 */

const STORAGE_KEY = "persta:style:active-async-job";

export interface PersistedActiveStyleJob {
  jobId: string;
  /** 復帰時の利用イベント記録(recordStyleUsageClientEvent)に使う */
  styleId: string;
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    // プライベートモード等でアクセスが拒否される場合がある
    return null;
  }
}

export function persistActiveStyleJob(job: PersistedActiveStyleJob): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }
  if (!job.jobId) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(job));
  } catch {
    // 保存失敗は致命的ではない(復帰表示ができないだけ)
  }
}

export function readActiveStyleJob(): PersistedActiveStyleJob | null {
  const storage = getSessionStorage();
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedActiveStyleJob> | null;
    if (
      !parsed ||
      typeof parsed.jobId !== "string" ||
      parsed.jobId.length === 0
    ) {
      return null;
    }
    return {
      jobId: parsed.jobId,
      styleId: typeof parsed.styleId === "string" ? parsed.styleId : "",
    };
  } catch {
    return null;
  }
}

export function clearActiveStyleJob(): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // 削除失敗は無視
  }
}
