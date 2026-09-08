"use client";

/**
 * ホームで選んでいたタブ(新着 / PICK UP / フォロー)を、詳細画面から戻ったときに
 * 復元するための軽量な保存領域。
 *
 * ## なぜ要るか
 *
 * タブは `PostList` の state にしかない。投稿詳細へ遷移するとページセグメントが
 * アンマウントされ、戻ると URL パラメータ(`?sort=`)が無いため既定タブ
 * (PICK UP)へ戻ってしまう。「新着を見ていたのに戻ると PICK UP に居る」という
 * 迷子はここが原因。
 *
 * 一覧そのものの復元は `home-feed-restore.ts` が担うが、あちらは
 * **20件を超えて読み込んでいるときしか保存しない**(初期20件のままなら
 * サーバー描画で同じ高さになるため復元が要らない)。タブは読み込み件数に
 * 関係なく戻したいので、こちらに独立して持つ。
 *
 * ## なぜ sessionStorage か(localStorage ではなく)
 *
 * 表示形式(`home-view-preference.ts`)は「その人の好み」なので端末に永続化するが、
 * タブは違う。PICK UP は運営が既定として前に出したいタブなので、
 * localStorage に永続化すると一度でも新着を押した人には二度と既定が効かなくなる。
 * 目的は「同じ滞在のなかで戻ったときに元のタブに居ること」なので、
 * セッション内に閉じる sessionStorage が過不足ない。
 * (新しく開き直したときは既定の PICK UP から始まる)
 */

import { isValidSortType } from "./utils";
import type { SortType } from "../types";

const STORAGE_KEY = "persta-ai:home-sort-type";

/**
 * 直前に選んでいたタブ。未保存・不正値・storage 不可なら null。
 *
 * null を返す(既定値を返さない)のは、呼び出し側が「保存が無い」と
 * 「保存された既定タブ」を区別できるようにするため。
 */
export function getHomeSortType(): SortType | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw && isValidSortType(raw) ? raw : null;
  } catch {
    // プライベートモード等。保存が使えなくても既定タブで動く
    return null;
  }
}

/** 選んだタブを控える。書き込みは best-effort(失敗しても操作は止めない)。 */
export function setHomeSortType(value: SortType): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    // 容量超過・storage 不可。復元できないだけで実害はない
  }
}

/** 控えを捨てる(次回は既定タブから始まる)。 */
export function clearHomeSortType(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 読み書きできない環境。消せなくても TTL 相当の実害はない
  }
}
