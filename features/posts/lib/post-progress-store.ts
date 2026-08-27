"use client";

/**
 * 投稿の進行状況を、画面をまたいで1か所で受け取るための置き場。
 *
 * ## なぜ要るのか
 *
 * 以前は投稿が終わると `window.location.href = "/"` で**ホームへフル遷移**し、
 * ホーム(`PostList`)が sessionStorage を読んで付与モーダルを出していた。
 * つまり「投稿できた」と「ペルコインをもらえた」を伝える役目が、
 * **遷移先の画面**に乗っていた。
 *
 * 遷移をやめると、その受け皿が無くなる。投稿の入口は5か所あり
 * (`/style` / 生成一覧 / 生成ギャラリー / 投稿詳細 / 完走モーダル)、
 * それぞれに同じ後始末を書くと必ずズレる。
 * そこで**アプリ全体に1つだけ置いたホスト**がここを購読し、
 * バー・トースト・付与モーダルをまとめて出す。
 *
 * ## Provider ではなく module 変数にしている理由
 *
 * 投稿を始めた画面と、結果を出すホストは別のツリーにいる。
 * Context にすると両者を包む Provider が要るが、ホストは Suspense 境界の
 * 外側(`LocaleShell`)に置きたい(遷移で unmount されると表示中のモーダルが
 * 消えるため)。module 変数なら、どこから呼んでも届く。
 */

import type { PostImageResponse } from "../types";

export interface PostProgressState {
  /** 送信中。バーを出す。 */
  submitting: boolean;
  /** 直近で完了した投稿。null なら完了直後ではない。 */
  completed: PostImageResponse | null;
}

const INITIAL: PostProgressState = { submitting: false, completed: null };

let state: PostProgressState = INITIAL;
const listeners = new Set<() => void>();

function emit(next: PostProgressState) {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

/** 送信を始めた。 */
export function startPostProgress() {
  emit({ submitting: true, completed: null });
}

/** 送信が終わった(成功)。 */
export function finishPostProgress(response: PostImageResponse) {
  emit({ submitting: false, completed: response });
}

/**
 * 送信が終わった(失敗・中断)。
 *
 * 失敗は投稿モーダル側がその場でエラー表示するので、ここでは
 * **バーを消すだけ**にする。二重に知らせない。
 */
export function abortPostProgress() {
  emit({ submitting: false, completed: null });
}

/** 完了の合図を出し終えた。次の投稿に備えて畳む。 */
export function clearPostCompletion() {
  emit({ submitting: false, completed: null });
}

export function subscribePostProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPostProgressSnapshot(): PostProgressState {
  return state;
}

/**
 * サーバー側のスナップショット。
 *
 * `useSyncExternalStore` はサーバーでもこれを呼ぶ。毎回新しい object を
 * 返すと無限ループになるので、**同じ参照**を返すこと。
 */
export function getPostProgressServerSnapshot(): PostProgressState {
  return INITIAL;
}

/** テスト用。module 変数なのでテスト間で持ち越さないよう明示的に戻す。 */
export function resetPostProgressForTest() {
  state = INITIAL;
}
