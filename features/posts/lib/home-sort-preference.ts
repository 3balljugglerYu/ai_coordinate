"use client";

/**
 * ホームで選んでいたタブ(PICK UP / 新着 / オススメ / フォロー)を控えておく場所。
 *
 * ## なぜ要るか
 *
 * タブは `PostList` の state にしかない。投稿詳細へ遷移するとページセグメントが
 * アンマウントされ、戻ると URL パラメータ(`?sort=`)が無いため既定タブへ戻って
 * しまう。「新着を見ていたのに戻ると PICK UP に居る」という迷子はここが原因。
 *
 * 一覧そのものの復元は `home-feed-restore.ts` が担うが、あちらは
 * **20件を超えて読み込んでいるときしか保存しない**(初期20件のままなら
 * サーバー描画で同じ高さになるため復元が要らない)。タブは読み込み件数に
 * 関係なく戻したいので、こちらに独立して持つ。
 *
 * ## ⭐ 控えは2層ある
 *
 * 見た目は1つの値だが、**目的の違う2つの控え**を重ねている。
 *
 * | 層 | 保存先 | 対象 | 役目 |
 * |---|---|---|---|
 * | 滞在 | sessionStorage | **全タブ** | 詳細から戻ったとき元の場所に居る |
 * | 訪問 | localStorage(24時間) | 一覧タブのみ | 次に開いたとき前回のタブで始まる |
 *
 * 読むときは滞在 → 訪問の順に見る。同じ滞在のなかでは、いま居るタブが
 * 何であれそこへ帰るのが正しい。滞在が切れたあとは「前回の好み」の話になり、
 * 判断が変わる。
 *
 * ### なぜ訪問層が要るか(sessionStorage だけでは足りない)
 *
 * 以前は滞在層しか無かった。同じ滞在のなかで戻れれば足りる、という判断である。
 * しかし**モバイルではタブや PWA が頻繁に落とされる**ため、実際には
 * 「開き直すたびに既定へ戻る」体験になっていた。
 *
 * ### なぜ訪問層に期限があるか
 *
 * 素朴に永続化すると既定タブ(PICK UP)が死ぬ。新着は「探しに行くとき」に
 * 押すタブなので、last-write-wins だと意図的な操作が勝ち続け、
 * **一度押しただけの人が永久に新着へ固定される**。
 *
 * 期限つきなら「昨夜新着で終えた → 今朝も新着」は効き、
 * 「先週たまたま押した」は効かない。
 *
 * ### なぜ訪問層にフォローを入れないか
 *
 * フォローは「見る場所」ではなく「行った先」で、そのまま離脱されると
 * 次に開いたときに事故る。
 *
 * - フォローが 0 人なら、**空の画面でアプリが開く**
 * - 未ログインだと控えのほうが認証モーダルより先に走るので
 *   (`PostList` の `handleSortChange` → `shouldShowAuth` の順)、
 *   次回**開いた瞬間にログインモーダル**が出る
 *
 * 滞在層には入るので、詳細から戻ったときはちゃんとフォローへ帰る。
 *
 * ⭐ localStorage は端末単位でユーザー単位ではない(共用端末では他人の選択を
 *    引き継ぐ)。タブの好み程度なので許容している。
 */

import { isValidSortType } from "./utils";
import type { SortType } from "../types";

/** 滞在層。同じ滞在のなかで戻るためのもので、全タブが対象。 */
const SESSION_KEY = "persta-ai:home-sort-type";
/** 訪問層。次に開いたときのためのもので、一覧タブだけが対象。 */
const VISIT_KEY = "persta-ai:home-sort-type:last-visit";

/** これを超えて時間が経った訪問層の控えは使わない(既定タブから始める)。 */
export const HOME_SORT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 訪問をまたいで控えてよいタブ。
 *
 * 検索専用の並び(daily / month / popular)は `PostList` 側が検索画面を
 * 除外しているので届かないが、許可制にして二重に塞いでおく。
 */
const REMEMBERED_ACROSS_VISITS: SortType[] = [
  "popular_prompts",
  "newest",
  // 一般ユーザーの「オススメ」。PICK UP 全公開までは中間タブとして出ている
  "week",
];

/** 訪問をまたいで控えてよいタブか。 */
export function isRememberedAcrossVisits(value: SortType): boolean {
  return REMEMBERED_ACROSS_VISITS.includes(value);
}

type StoredVisitSort = {
  value: SortType;
  /** 控えた時刻(epoch ミリ秒)。期限の判定に使う。 */
  savedAt: number;
};

/** 訪問層の保存値を読み解く。壊れていれば null。 */
function parseVisitSort(raw: string): StoredVisitSort | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const { value, savedAt } = parsed as { value?: unknown; savedAt?: unknown };
  if (typeof value !== "string" || !isValidSortType(value)) {
    return null;
  }
  // 許可リストから外したタブが古い控えに残っていても復元しない
  if (!isRememberedAcrossVisits(value)) {
    return null;
  }
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) {
    return null;
  }
  return { value, savedAt };
}

/**
 * 直前に選んでいたタブ。未保存・不正値・期限切れ・storage 不可なら null。
 *
 * null を返す(既定値を返さない)のは、呼び出し側が「控えが無い」と
 * 「控えられた既定タブ」を区別できるようにするため。
 *
 * ⭐ 期限切れでも**消さない**。この関数はマウント時に2箇所から呼ばれ、
 *    うち1つは useLayoutEffect なので、読むだけの経路に書き込みを混ぜない。
 *    残っていても次の `setHomeSortType` が上書きする。
 */
export function getHomeSortType(): SortType | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    // 滞在層が最優先。同じ滞在のなかでは、いま居るタブへ帰る
    const session = window.sessionStorage.getItem(SESSION_KEY);
    if (session && isValidSortType(session)) {
      return session;
    }
  } catch {
    // プライベートモード等。訪問層で拾えるかもしれないので続ける
  }
  try {
    const raw = window.localStorage.getItem(VISIT_KEY);
    if (!raw) {
      return null;
    }
    const stored = parseVisitSort(raw);
    if (!stored) {
      return null;
    }
    /*
      ⭐ 差の**絶対値**で見る。端末の時計が進んでいるときに控えると savedAt が
      未来になり、単純な引き算では負になって**いつまでも失効しない**
      (時計を戻したあとも、実時間が追いつくまで期限が効かない)。
      未来の控えはそもそも信用できないので、同じように捨てる。
    */
    if (Math.abs(Date.now() - stored.savedAt) > HOME_SORT_TTL_MS) {
      return null;
    }
    return stored.value;
  } catch {
    // 保存が使えなくても既定タブで動く
    return null;
  }
}

/**
 * 選んだタブを控える。書き込みは best-effort(失敗しても操作は止めない)。
 *
 * ⭐ 訪問層に入らないタブ(フォロー)が来ても、**前の控えは消さない**。
 *    新着を読んでいた人がフォローを覗いて離脱したら、次は新着で開くのが
 *    素直である。消すと既定(PICK UP)へ飛ばされ、読んでいた場所を失う。
 */
export function setHomeSortType(value: SortType): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(SESSION_KEY, value);
  } catch {
    // 容量超過・storage 不可。復元できないだけで実害はない
  }
  if (!isRememberedAcrossVisits(value)) {
    return;
  }
  try {
    const stored: StoredVisitSort = { value, savedAt: Date.now() };
    window.localStorage.setItem(VISIT_KEY, JSON.stringify(stored));
  } catch {
    // 同上
  }
}

/**
 * 控えを捨てる(次回は既定タブから始まる)。
 *
 * 2層とも消す。片方だけ残すと、消したはずのタブが復活する。
 */
export function clearHomeSortType(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // 読み書きできない環境。消せなくても TTL 相当の実害はない
  }
  try {
    window.localStorage.removeItem(VISIT_KEY);
  } catch {
    // 同上
  }
}
