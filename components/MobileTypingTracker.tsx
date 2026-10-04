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
 * - カーソルがあるのがそのバーの中の欄(ヘッダーの検索欄)なら、そのバーは隠さない(CSS の :focus-within)
 * - 欄から欄へ移るときに一瞬出て消えないよう、カーソルが外れたら次の欄を待ってから判定する
 * - カーソルのある欄が画面から消えても(シートを閉じたなど)ブラウザは知らせないことがあるので、
 *   立っているあいだは少しごとに確かめ、残ったままにしない
 */

export const MOBILE_TYPING_ATTRIBUTE = "data-mobile-typing";
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

export function MobileTypingTracker() {
  useEffect(() => {
    const root = document.documentElement;
    let recheckTimer: ReturnType<typeof setInterval> | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const update = () => {
      const typing = isCoarsePointer() && isTextEntryElement(document.activeElement);
      if (typing) {
        root.setAttribute(MOBILE_TYPING_ATTRIBUTE, "true");
        if (!recheckTimer) {
          recheckTimer = setInterval(update, MOBILE_TYPING_RECHECK_MS);
        }
      } else {
        root.removeAttribute(MOBILE_TYPING_ATTRIBUTE);
        if (recheckTimer) {
          clearInterval(recheckTimer);
          recheckTimer = null;
        }
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

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    update();

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      if (settleTimer) clearTimeout(settleTimer);
      if (recheckTimer) clearInterval(recheckTimer);
      root.removeAttribute(MOBILE_TYPING_ATTRIBUTE);
    };
  }, []);

  return null;
}
