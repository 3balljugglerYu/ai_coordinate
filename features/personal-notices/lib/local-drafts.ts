/**
 * 個人あてのお知らせの下書きを、この端末のブラウザ(localStorage)に残す。
 *
 * - 入力するたびに自動で残す。開き直すと元に戻る
 * - 賞ごとに文を前もって書いておけるよう、複数持てる(新しい順・最大 DRAFT_LIMIT 件)
 * - 送れたら、その下書きは消す
 *
 * ⭐ 端末(ブラウザ)ごとで、ほかの端末や管理者とは共有しない。サーバーには送らない。
 * ⭐ 読み書きは失敗しうる(プライベートウィンドウ・保存の上限・拒否)。失敗しても
 *    画面は動くように、ここで握って結果だけ返す。
 */

export const DRAFTS_STORAGE_KEY = "persta-ai:admin:personal-notice-drafts:v1";
export const DRAFT_LIMIT = 20;

export interface PersonalNoticeLocalDraft {
  id: string;
  memo: string;
  title: string;
  body: string;
  codePrefix: string;
  recipientsText: string;
  /** ISO 8601 */
  updatedAt: string;
}

export type DraftContent = Omit<PersonalNoticeLocalDraft, "id" | "updatedAt">;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isDraft(value: unknown): value is PersonalNoticeLocalDraft {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id !== "" &&
    typeof v.memo === "string" &&
    typeof v.title === "string" &&
    typeof v.body === "string" &&
    typeof v.codePrefix === "string" &&
    typeof v.recipientsText === "string" &&
    typeof v.updatedAt === "string" &&
    !Number.isNaN(Date.parse(v.updatedAt))
  );
}

/** 何も書いていない(残す意味がない) */
export function isEmptyDraftContent(content: DraftContent): boolean {
  return (
    !content.memo.trim() &&
    !content.title.trim() &&
    !content.body.trim() &&
    !content.recipientsText.trim()
  );
}

function sortNewestFirst(drafts: PersonalNoticeLocalDraft[]) {
  return [...drafts].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/** 残っている下書き(新しい順)。読めなければ空 */
export function readDrafts(storage: StorageLike | null = browserStorage()): PersonalNoticeLocalDraft[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortNewestFirst(parsed.filter(isDraft));
  } catch {
    return [];
  }
}

function writeDrafts(storage: StorageLike | null, drafts: PersonalNoticeLocalDraft[]): boolean {
  if (!storage) return false;
  try {
    storage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    return true;
  } catch {
    return false;
  }
}

/**
 * 下書きを残す(同じ id は書き換え、新しい id は先頭に足す)。
 * 中身が空なら残さず、その id の下書きを消す。上限を超えた古いものは落とす。
 * 戻り値: 残せたか(空で消した場合も、書き込めたら true)
 */
export function saveDraft(
  id: string,
  content: DraftContent,
  now: Date = new Date(),
  storage: StorageLike | null = browserStorage(),
): boolean {
  const others = readDrafts(storage).filter((draft) => draft.id !== id);
  if (isEmptyDraftContent(content)) {
    return writeDrafts(storage, others);
  }
  const next: PersonalNoticeLocalDraft = { id, ...content, updatedAt: now.toISOString() };
  return writeDrafts(storage, [next, ...others].slice(0, DRAFT_LIMIT));
}

/** 下書きを1つ消す。戻り値: 書き込めたか */
export function removeDraft(id: string, storage: StorageLike | null = browserStorage()): boolean {
  return writeDrafts(
    storage,
    readDrafts(storage).filter((draft) => draft.id !== id),
  );
}

const LABEL_BODY_MAX = 30;

/** 一覧に出す名前。メモ → 題名 → 本文の1行目(長ければ切る) → 決まった文 */
export function draftLabel(
  draft: Pick<PersonalNoticeLocalDraft, "memo" | "title" | "body">,
): string {
  const firstLine = draft.body.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
  const bodyLabel =
    Array.from(firstLine).length > LABEL_BODY_MAX
      ? `${Array.from(firstLine).slice(0, LABEL_BODY_MAX).join("")}…`
      : firstLine;
  return draft.memo.trim() || draft.title.trim() || bodyLabel || "（メモ・題名・本文なし）";
}

export function newDraftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
