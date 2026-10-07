/**
 * スマホの生成画面(全画面のページ)を、ボトムシートのように下から出し・下へしまう。
 *
 * ## なぜページにしたか(2026-10-07 ユーザー決定)
 *
 * 生成シートに文字の入力欄(名前の欄・神コレの名前)が入ると、キーボードに合わせて
 * シートが上下し、欄がキーボードの裏に隠れた。キーボードに合わせて位置と高さを計算し直す
 * 「浮いた箱」がある限り、その途中の値が必ず見える(9月の投稿フォームと同じ。#617〜#624)。
 * 通常のページにすれば、キーボードの扱いはブラウザ標準に任せられる。
 *
 * ## アニメーション
 *
 * ブラウザの画面切り替え(View Transitions)で、今の画面を写真のように残したまま
 * 新しい画面を下から上げる/戻るときは生成画面を下へ下げる(CSS は app/globals.css)。
 * 対応していないブラウザ(iOS 17 以前など)・動きを減らす設定では、アニメーションなしで切り替える。
 *
 * ⭐ 切り替えの間は画面の描画が止まるので、待ちには上限を付ける(新しい画面が出るまで最大2秒)。
 */

const TRANSITION_ATTRIBUTE = "data-generation-screen-transition";
/** 生成画面の外枠に付ける目印(出た・消えたの判定に使う)。 */
export const GENERATION_SCREEN_ATTRIBUTE = "data-generation-screen";
const MAX_WAIT_MS = 2000;

type Router = { push: (href: string) => void; back: () => void; replace: (href: string) => void };

type DocumentWithTransition = Document & {
  startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> };
};

let resolveScreenShown: (() => void) | null = null;
// アプリの中から開いたか。直接 URL で来たときは「戻る」先が無いので、閉じたら元の画面へ置き換える
let openedFromApp = false;

/** スマホ幅か(開く瞬間に測る。useIsDesktopViewport は測る前は false なので使わない)。 */
export function isDesktopViewportNow(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(min-width: 768px)").matches;
}

function runTransition(kind: "open" | "close", update: (done: () => void) => void) {
  const doc = document as DocumentWithTransition;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduceMotion) {
    update(() => {});
    return;
  }
  document.documentElement.setAttribute(TRANSITION_ATTRIBUTE, kind);
  const transition = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, MAX_WAIT_MS);
        update(() => {
          window.clearTimeout(timer);
          resolve();
        });
      }),
  );
  transition.finished
    .catch(() => undefined)
    .finally(() => document.documentElement.removeAttribute(TRANSITION_ATTRIBUTE));
}

/** 生成画面を開く(下から上がる)。 */
export function openGenerationScreen(router: Router, href: string) {
  openedFromApp = true;
  runTransition("open", (done) => {
    resolveScreenShown = done;
    router.push(href);
  });
}

/** 生成画面が描かれたら呼ぶ(開くアニメーションを始める合図)。 */
export function notifyGenerationScreenShown() {
  resolveScreenShown?.();
  resolveScreenShown = null;
}

/** 生成画面を閉じる(下へ下がる)。アプリの中から開いていなければ fallbackHref へ置き換える。 */
export function closeGenerationScreen(router: Router, fallbackHref: string) {
  const goBack = openedFromApp;
  openedFromApp = false;
  runTransition("close", (done) => {
    if (goBack) {
      router.back();
    } else {
      router.replace(fallbackHref);
    }
    waitUntilScreenGone(done);
  });
}

function waitUntilScreenGone(done: () => void) {
  const isGone = () => !document.querySelector(`[${GENERATION_SCREEN_ATTRIBUTE}]`);
  if (isGone()) {
    done();
    return;
  }
  const observer = new MutationObserver(() => {
    if (isGone()) {
      observer.disconnect();
      done();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), MAX_WAIT_MS);
}
