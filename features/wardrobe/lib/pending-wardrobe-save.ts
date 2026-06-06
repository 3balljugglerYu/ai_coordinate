"use client";

/**
 * ゲスト生成画像を「ログインを跨いで」運ぶための退避ヘルパ。
 *
 * フロー: ゲストが結果パネルで「クローゼットに保存」→ 画像を localStorage に退避
 * → AuthModal でログイン → リダイレクトで戻った後に `claimPendingWardrobeSave` が
 * `/api/wardrobe/claim` へ POST して本人のクローゼットに永続化する。
 *
 * localStorage を使う理由: OAuth リダイレクトでページが再読み込みされ、React state
 * (`resultImageUrl`) は消えるため。同一オリジンの localStorage はリダイレクトを跨いで残る。
 */

const PENDING_KEY = "persta-ai:wardrobe-pending";

export interface PendingWardrobeSave {
  imageBase64: string;
  styleId: string | null;
}

export type ClaimPendingResult =
  | { status: "none" }
  | { status: "saved"; id: string }
  | { status: "error"; errorCode: string | null };

function safeRead(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // private browsing / quota 超過は黙って無視
  }
}

function safeRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function stashPendingWardrobeSave(payload: PendingWardrobeSave): void {
  safeWrite(
    PENDING_KEY,
    JSON.stringify({
      imageBase64: payload.imageBase64,
      styleId: payload.styleId,
    }),
  );
}

export function readPendingWardrobeSave(): PendingWardrobeSave | null {
  const raw = safeRead(PENDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      imageBase64?: unknown;
      styleId?: unknown;
    };
    if (
      typeof parsed.imageBase64 !== "string" ||
      parsed.imageBase64.length === 0
    ) {
      return null;
    }
    return {
      imageBase64: parsed.imageBase64,
      styleId: typeof parsed.styleId === "string" ? parsed.styleId : null,
    };
  } catch {
    return null;
  }
}

export function clearPendingWardrobeSave(): void {
  safeRemove(PENDING_KEY);
}

export async function claimPendingWardrobeSave(): Promise<ClaimPendingResult> {
  const pending = readPendingWardrobeSave();
  if (!pending) return { status: "none" };

  // 一回限り: fetch の前にクリアして、再マウント/二重実行でのループを防ぐ
  clearPendingWardrobeSave();

  try {
    const response = await fetch("/api/wardrobe/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: pending.imageBase64,
        styleId: pending.styleId,
      }),
    });
    const data = (await response.json().catch(() => null)) as {
      id?: string;
      errorCode?: string;
    } | null;

    if (response.ok && data?.id) {
      return { status: "saved", id: data.id };
    }
    return { status: "error", errorCode: data?.errorCode ?? null };
  } catch {
    return { status: "error", errorCode: null };
  }
}
