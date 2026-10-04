/**
 * @jest-environment jsdom
 *
 * スマホで文字を入力しているあいだ <html data-mobile-typing="true"> を立てる(ヘッダーとナビを隠す合図)。
 * ⭐ 立ったまま残ると、ナビが消えたままになりどこへも行けなくなる。外れる側を重点的に確かめる。
 */

import { act, render } from "@testing-library/react";
import {
  MOBILE_TYPING_ATTRIBUTE,
  MOBILE_TYPING_RECHECK_MS,
  MobileTypingTracker,
  isTextEntryElement,
} from "@/components/MobileTypingTracker";

function setPointer(coarse: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === "(pointer: coarse)" ? coarse : false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }),
  });
}

const typing = () => document.documentElement.getAttribute(MOBILE_TYPING_ATTRIBUTE);

/*
  jsdom に visualViewport は無いので、見えている高さを動かせる偽物を置く。
  キーボードが出ると見えている高さが縮む(Safari も、画面ごと縮むブラウザも)。
*/
const FULL_HEIGHT = 800;
const KEYBOARD_HEIGHT = 300;
let viewport: EventTarget & { height: number; scale: number };
function installViewport() {
  viewport = Object.assign(new EventTarget(), { height: FULL_HEIGHT, scale: 1 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: FULL_HEIGHT });
}
function setViewportHeight(height: number, scale = 1) {
  act(() => {
    viewport.height = height;
    viewport.scale = scale;
    viewport.dispatchEvent(new Event("resize"));
  });
}
const openKeyboard = () => setViewportHeight(FULL_HEIGHT - KEYBOARD_HEIGHT);
const closeKeyboard = () => setViewportHeight(FULL_HEIGHT);

function add<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  document.body.appendChild(element);
  return element;
}

/** くり返し確かめ直すタイマーが残っていない(1回きりのものを流しても、数が 0 に戻る) */
function expectNoRecheckTimer() {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  expect(jest.getTimerCount()).toBe(0);
}

async function flush() {
  await act(async () => {
    jest.advanceTimersByTime(0);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute(MOBILE_TYPING_ATTRIBUTE);
  setPointer(true);
  installViewport();
});
afterEach(() => {
  jest.useRealTimers();
});

describe("isTextEntryElement", () => {
  test.each([
    ["textarea", () => add("textarea"), true],
    ["type 無しの input", () => add("input"), true],
    ["search", () => add("input", { type: "search" }), true],
    ["email", () => add("input", { type: "email" }), true],
    ["number", () => add("input", { type: "number" }), true],
    ["checkbox", () => add("input", { type: "checkbox" }), false],
    ["radio", () => add("input", { type: "radio" }), false],
    ["file", () => add("input", { type: "file" }), false],
    ["range", () => add("input", { type: "range" }), false],
    ["読み取り専用の textarea", () => add("textarea", { readonly: "" }), false],
    ["無効の input", () => add("input", { disabled: "" }), false],
    ["inputmode=none", () => add("input", { inputmode: "none" }), false],
    ["button", () => add("button"), false],
  ])("%s", (_label, make, expected) => {
    expect(isTextEntryElement(make())).toBe(expected);
  });

  test("文字を直接編集できる欄も対象", () => {
    const div = add("div", { contenteditable: "true" });
    // jsdom は isContentEditable を実装しないので、ブラウザと同じ値を与える
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(isTextEntryElement(div)).toBe(true);
  });

  test("画面から外れた欄・何も無いときは対象外", () => {
    const textarea = document.createElement("textarea");
    expect(isTextEntryElement(textarea)).toBe(false);
    expect(isTextEntryElement(null)).toBe(false);
  });
});

describe("MobileTypingTracker", () => {
  test("文字を打つ欄にカーソルがあるあいだだけ立ち、外れたら下ろす", async () => {
    const textarea = add("textarea");
    render(<MobileTypingTracker />);
    expect(typing()).toBeNull();

    act(() => textarea.focus());
    openKeyboard();
    expect(typing()).toBe("true");

    act(() => textarea.blur());
    closeKeyboard();
    await flush();
    expect(typing()).toBeNull();
    // 確かめ直しのタイマーも残さない
    expectNoRecheckTimer();
  });

  test("チェックボックスやボタンでは立てない", () => {
    const checkbox = add("input", { type: "checkbox" });
    const button = add("button");
    render(<MobileTypingTracker />);
    openKeyboard();

    act(() => checkbox.focus());
    expect(typing()).toBeNull();
    act(() => button.focus());
    expect(typing()).toBeNull();
  });

  test("PC など指で操作しない端末では立てない", () => {
    setPointer(false);
    const textarea = add("textarea");
    render(<MobileTypingTracker />);

    act(() => textarea.focus());
    openKeyboard();

    expect(typing()).toBeNull();
  });

  test("欄から欄へ移っても下ろさない(ナビが一瞬出て消えるちらつきを出さない)", async () => {
    const first = add("input");
    const second = add("textarea");
    const seen: Array<string | null> = [];
    const observer = new MutationObserver(() => seen.push(typing()));
    observer.observe(document.documentElement, { attributes: true });
    render(<MobileTypingTracker />);
    act(() => first.focus());
    openKeyboard();
    expect(typing()).toBe("true");

    act(() => second.focus());
    await flush();
    await act(async () => {
      await Promise.resolve();
    });
    observer.disconnect();

    expect(typing()).toBe("true");
    expect(seen).not.toContain(null);
  });

  test("カーソルのある欄が画面から消えたら(シートを閉じたなど)、少し後に下ろす", async () => {
    const textarea = add("textarea");
    render(<MobileTypingTracker />);
    act(() => textarea.focus());
    openKeyboard();
    expect(typing()).toBe("true");

    // ブラウザによっては、消えるときに focusout が来ない
    textarea.remove();
    await act(async () => {
      jest.advanceTimersByTime(MOBILE_TYPING_RECHECK_MS);
    });

    expect(typing()).toBeNull();
    expectNoRecheckTimer();
  });

  test("外したら(画面を離れたら)下ろす", () => {
    const textarea = add("textarea");
    const { unmount } = render(<MobileTypingTracker />);
    act(() => textarea.focus());
    openKeyboard();
    expect(typing()).toBe("true");

    unmount();

    expect(typing()).toBeNull();
  });

  test("最初からカーソルがある欄でも、キーボードが出たら効く", () => {
    const textarea = add("textarea");
    textarea.focus();
    render(<MobileTypingTracker />);
    expect(typing()).toBeNull();

    openKeyboard();

    expect(typing()).toBe("true");
  });

  // ⭐ PR #682 レビュー: カーソルだけで決めると、キーボードが無いのにナビが隠れたまま残っていた
  test("自動でカーソルが入っただけ(キーボードが出ない)では隠さない", async () => {
    // 検索ページを開いたときの自動のカーソル(SearchBar)
    const search = add("input", { type: "search" });
    render(<MobileTypingTracker />);

    act(() => search.focus());
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(typing()).toBeNull();
  });

  test("カーソルを残したままキーボードだけ閉じたら(Android の戻るなど)、ナビを戻す", () => {
    const textarea = add("textarea");
    render(<MobileTypingTracker />);
    act(() => textarea.focus());
    openKeyboard();
    expect(typing()).toBe("true");

    closeKeyboard();

    expect(document.activeElement).toBe(textarea);
    expect(typing()).toBeNull();
    // もう一度キーボードを出せば、また隠す
    openKeyboard();
    expect(typing()).toBe("true");
  });

  test("文字欄からボタンへ移ったら(送信を押したなど)下ろす", async () => {
    const textarea = add("textarea");
    const send = add("button");
    render(<MobileTypingTracker />);
    act(() => textarea.focus());
    openKeyboard();

    act(() => send.focus());
    await flush();

    expect(typing()).toBeNull();
    expectNoRecheckTimer();
  });

  test("拡大して見えている高さが縮んだだけでは、キーボードとみなさない", () => {
    const textarea = add("textarea");
    render(<MobileTypingTracker />);
    act(() => textarea.focus());

    // 2倍に拡大: 見えている高さは半分だが、倍率で戻すと同じ
    setViewportHeight(FULL_HEIGHT / 2, 2);

    expect(typing()).toBeNull();
  });

  test("Safari のアドレスバーの出入り程度の縮みでは、キーボードとみなさない", () => {
    const textarea = add("textarea");
    render(<MobileTypingTracker />);
    act(() => textarea.focus());

    setViewportHeight(FULL_HEIGHT - 100);

    expect(typing()).toBeNull();
  });

  test("visualViewport が無いブラウザでは、カーソルだけで決める(これまでの動き)", () => {
    Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
    const textarea = add("textarea");
    render(<MobileTypingTracker />);

    act(() => textarea.focus());

    expect(typing()).toBe("true");
  });
});
