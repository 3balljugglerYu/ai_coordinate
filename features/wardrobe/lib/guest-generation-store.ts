"use client";

import { useSyncExternalStore } from "react";

/**
 * ゲストが「いま画面で生成した（まだ保存していない）画像」を、生成結果 state を
 * 持つクライアントコンポーネント（StylePageClient / GenerationFormContainer）の
 * 外側（試用バナー・サイドバーのログインボタン等）から参照するための共有ストア。
 *
 * - producer: 生成コンポーネントが「ゲスト＆結果あり」のとき set、結果リセット/
 *   離脱で clear する。
 * - consumer: バナー / サイドバーが購読し、画像があれば「保存する」導線
 *   （signup 固定モーダル + 画像引き継ぎ）に切り替える。
 *
 * module-level state なのでタブ単位。OAuth リダイレクト等のフルページ遷移で
 * 失われるが、保存トリガ時に localStorage へ退避（stashPendingWardrobeSave）
 * 済みのため claim には影響しない。
 */
export interface GuestGeneration {
  /** 生成画像（data URL）。 */
  imageBase64: string;
  /** 由来の style プリセット ID。/coordinate 等概念が無い画面では null。 */
  styleId: string | null;
}

let current: GuestGeneration | null = null;
const listeners = new Set<() => void>();

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

export function setGuestGeneration(value: GuestGeneration): void {
  current = value;
  emitChange();
}

export function clearGuestGeneration(): void {
  if (current === null) return;
  current = null;
  emitChange();
}

export function getGuestGeneration(): GuestGeneration | null {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 現在のゲスト生成画像を購読する。SSR では常に null。
 */
export function useGuestGeneration(): GuestGeneration | null {
  return useSyncExternalStore(
    subscribe,
    getGuestGeneration,
    () => null
  );
}
