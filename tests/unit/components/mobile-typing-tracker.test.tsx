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

function add<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  document.body.appendChild(element);
  return element;
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
    expect(typing()).toBe("true");

    act(() => textarea.blur());
    await flush();
    expect(typing()).toBeNull();
  });

  test("チェックボックスやボタンでは立てない", () => {
    const checkbox = add("input", { type: "checkbox" });
    const button = add("button");
    render(<MobileTypingTracker />);

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
    expect(typing()).toBe("true");

    // ブラウザによっては、消えるときに focusout が来ない
    textarea.remove();
    await act(async () => {
      jest.advanceTimersByTime(MOBILE_TYPING_RECHECK_MS);
    });

    expect(typing()).toBeNull();
  });

  test("外したら(画面を離れたら)下ろす", () => {
    const textarea = add("textarea");
    const { unmount } = render(<MobileTypingTracker />);
    act(() => textarea.focus());
    expect(typing()).toBe("true");

    unmount();

    expect(typing()).toBeNull();
  });

  test("最初からカーソルがある欄(自動で選ばれた欄)にも効く", () => {
    const textarea = add("textarea");
    textarea.focus();

    render(<MobileTypingTracker />);

    expect(typing()).toBe("true");
  });
});
