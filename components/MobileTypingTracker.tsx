"use client";

import { useEffect } from "react";

/**
 * スマホで文字を入力しているあいだ、`<html data-mobile-typing="true">` を立てる。
 *
 * 立っているあいだは、ヘッダーと下のナビ(と、ナビの背面に敷いた進み具合のバー)を
 * 画面の外へ滑らせて隠し、入力欄を広く使えるようにする(app/globals.css の
 * `data-mobile-typing`)。キーボードを出すと画面の高さそのものが縮むブラウザでは、
 * 下に固定したナビがキーボードの真上へ押し上げられ、入力欄がとても狭くなっていた
 * (2026-10-04 報告)。
 *
 * - 指で操作する端末だけ(PC やキーボード付きの大きい画面では隠さない。幅は CSS 側で lg 未満)
 * - 文字を打つ欄だけ(チェックボックス・ボタン・選択肢・読み取り専用などでは隠さない)
 * - ⭐ **画面のキーボードが実際に出ているときだけ**(見えている高さが、その向きでの最大より
 *   大きく縮んだとき)。カーソルだけで決めると、次のときにナビが隠れたまま残る(PR #682 レビュー):
 *   - 検索ページを開いたときの自動のカーソル(タップではないのでキーボードが出ない。SearchBar)
 *   - Android の戻るボタンなどで、カーソルを残したままキーボードだけ閉じたとき
 *   - 外付けキーボード(画面のキーボードが出ない)
 * - カーソルがあるのがそのバーの中の欄(ヘッダーの検索欄)なら、そのバーは隠さない(CSS の :focus-within)
 * - 欄から欄へ移るときに一瞬出て消えないよう、カーソルが外れたら次の欄を待ってから判定する
 * - カーソルのある欄が画面から消えても(シートを閉じたなど)ブラウザは知らせないことがあるので、
 *   立っているあいだは少しごとに確かめ、残ったままにしない
 */

export const MOBILE_TYPING_ATTRIBUTE = "data-mobile-typing";
/**
 * 見えている高さがこれ以上縮んだら、画面のキーボードが出ているとみなす。
 * キーボードは 250px 前後以上、Safari のアドレスバーの出入りはそれより小さい。
 */
export const KEYBOARD_MIN_HEIGHT_PX = 150;
/** 立っているあいだ、カーソルのある欄がまだあるかを確かめる間隔 */
export const MOBILE_TYPING_RECHECK_MS = 500;

const TEXT_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
]);

/** キーボードを出して文字を打つ欄か */
export function isTextEntryElement(element: Element | null): boolean {
  if (!element || !element.isConnected) return false;
  if (element instanceof HTMLTextAreaElement) {
    return !element.readOnly && !element.disabled && element.inputMode !== "none";
  }
  if (element instanceof HTMLInputElement) {
    return (
      TEXT_INPUT_TYPES.has(element.type.toLowerCase()) &&
      !element.readOnly &&
      !element.disabled &&
      element.inputMode !== "none"
    );
  }
  return element instanceof HTMLElement && element.isContentEditable === true;
}

function isCoarsePointer(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

/**
 * 画面のキーボードが出ているかを、見えている高さの縮みで見る。
 *
 * - Safari は画面(innerHeight)は変えず、見えている範囲(visualViewport)だけを縮める。
 *   キーボードで画面ごと縮むブラウザ(今回の報告)は、どちらも縮む。visualViewport で両方を見られる
 * - 拡大しているときは見えている高さが縮むので、倍率で戻してから比べる
 * - 向きを変えると高さが変わるので、幅ごとに最大を覚え直す
 * visualViewport が無いブラウザでは判定できないので、カーソルだけで決める(これまでの動き)。
 */
function createKeyboardDetector() {
  let baselineWidth = 0;
  let baselineHeight = 0;
  return {
    /** 今の高さを覚え、キーボードが出ているかを返す */
    isKeyboardShown(): boolean {
      const viewport = window.visualViewport;
      if (!viewport) return true;
      const width = Math.round(window.innerWidth);
      const height = viewport.height * (viewport.scale || 1);
      if (width !== baselineWidth) {
        baselineWidth = width;
        baselineHeight = Math.max(height, window.innerHeight);
      }
      baselineHeight = Math.max(baselineHeight, height);
      return baselineHeight - height >= KEYBOARD_MIN_HEIGHT_PX;
    },
  };
}

export function MobileTypingTracker() {
  useEffect(() => {
    const root = document.documentElement;
    const keyboard = createKeyboardDetector();
    let recheckTimer: ReturnType<typeof setInterval> | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const update = () => {
      // 高さは毎回見て覚える(キーボードが閉じているときの高さを最大として持つため)
      const keyboardShown = keyboard.isKeyboardShown();
      const focused = isCoarsePointer() && isTextEntryElement(document.activeElement);
      const typing = focused && keyboardShown;
      if (typing) {
        if (root.getAttribute(MOBILE_TYPING_ATTRIBUTE) !== "true") {
          root.setAttribute(MOBILE_TYPING_ATTRIBUTE, "true");
        }
      } else if (root.hasAttribute(MOBILE_TYPING_ATTRIBUTE)) {
        root.removeAttribute(MOBILE_TYPING_ATTRIBUTE);
      }
      // 文字を打つ欄にカーソルがあるあいだは確かめ続ける(欄が消えた・キーボードが遅れて出た)
      if (focused && !recheckTimer) {
        recheckTimer = setInterval(update, MOBILE_TYPING_RECHECK_MS);
      } else if (!focused && recheckTimer) {
        clearInterval(recheckTimer);
        recheckTimer = null;
      }
    };

    const onFocusIn = () => update();
    // 欄から欄へ移るときは focusout → focusin の順に来る。次の欄にカーソルが移るのを待つ
    const onFocusOut = () => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = null;
        update();
      }, 0);
    };

    // キーボードが開く・閉じると、見えている高さが変わる
    const viewport = window.visualViewport;
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    viewport?.addEventListener("resize", update);
    update();

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      viewport?.removeEventListener("resize", update);
      if (settleTimer) clearTimeout(settleTimer);
      if (recheckTimer) clearInterval(recheckTimer);
      root.removeAttribute(MOBILE_TYPING_ATTRIBUTE);
    };
  }, []);

  return null;
}
