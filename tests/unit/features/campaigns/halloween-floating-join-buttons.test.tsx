/**
 * 企画ページの浮いたボタン(2026-10-16 ユーザー指示)。
 *
 * - 「カタログをつくる」(CREATE)・「カタログから生成する」(対象作品)の2つ
 * - ページの終わりの目印が画面に入ったら(またはそれより下までスクロールしたら)消す。
 *   その下はサイト共通の案内(利用規約などのリンク)で、重なると押せなくなるため
 * - 消えているあいだは、読み上げとキーボードの移動からも外す
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import {
  FloatingJoinButtons,
  HALLOWEEN_PAGE_END_ID,
} from "@/features/campaigns/halloween/components/FloatingJoinButtons";

const original = globalThis.IntersectionObserver;
let callback: IntersectionObserverCallback = () => undefined;
const observe = jest.fn();
const disconnect = jest.fn();

function entry(isIntersecting: boolean, top: number): IntersectionObserverEntry {
  return { isIntersecting, boundingClientRect: { top } } as IntersectionObserverEntry;
}

function renderWithEnd(worksHref = "#hbs-works") {
  return render(
    <>
      <div id={HALLOWEEN_PAGE_END_ID} />
      <FloatingJoinButtons joinHref="/free" worksHref={worksHref} />
    </>,
  );
}

beforeEach(() => {
  observe.mockClear();
  disconnect.mockClear();
  globalThis.IntersectionObserver = jest.fn((cb: IntersectionObserverCallback) => {
    callback = cb;
    return { observe, disconnect, unobserve: jest.fn(), takeRecords: jest.fn() };
  }) as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  globalThis.IntersectionObserver = original;
});

describe("FloatingJoinButtons", () => {
  test("2つのボタン: カタログをつくる → CREATE / カタログから生成する → 対象作品", () => {
    renderWithEnd();
    const bar = screen.getByTestId("halloween-floating-cta");
    const links = bar.querySelectorAll("a");
    expect(Array.from(links).map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["カタログをつくる", "/free"],
      ["カタログから生成する", "#hbs-works"],
    ]);
    // ページの終わりの目印を見張る
    expect(observe).toHaveBeenCalledWith(document.getElementById(HALLOWEEN_PAGE_END_ID));
  });

  test("「カタログから生成する」はページの外(ハッシュタグの検索など)へも行ける", () => {
    renderWithEnd("/search?q=%23tag");
    const links = screen.getByTestId("halloween-floating-cta").querySelectorAll("a");
    expect(links[1].getAttribute("href")).toBe("/search?q=%23tag");
  });

  test("ページの途中では出したまま。終わりの目印が見えたら消し、読み上げとキーボードからも外す", () => {
    renderWithEnd();
    const bar = screen.getByTestId("halloween-floating-cta");
    expect(bar.className).not.toContain("floatingCtaHidden");
    expect(bar.hasAttribute("inert")).toBe(false);
    expect(bar.getAttribute("aria-hidden")).toBeNull();

    // 目印はまだ画面の下の外
    act(() => callback([entry(false, 1200)], {} as IntersectionObserver));
    expect(bar.className).not.toContain("floatingCtaHidden");

    // 目印が画面に入った
    act(() => callback([entry(true, 700)], {} as IntersectionObserver));
    expect(bar.className).toContain("floatingCtaHidden");
    expect(bar.hasAttribute("inert")).toBe(true);
    expect(bar.getAttribute("aria-hidden")).toBe("true");

    // 目印より下(サイト共通の案内)までスクロールした
    act(() => callback([entry(false, -300)], {} as IntersectionObserver));
    expect(bar.className).toContain("floatingCtaHidden");

    // 上へ戻ったら、また出す
    act(() => callback([entry(false, 1500)], {} as IntersectionObserver));
    expect(bar.className).not.toContain("floatingCtaHidden");
    expect(bar.hasAttribute("inert")).toBe(false);
  });

  test("画面から外れたら見張りをやめる", () => {
    const { unmount } = renderWithEnd();
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  test("IntersectionObserver が無い環境では、出したまま", () => {
    globalThis.IntersectionObserver = undefined as unknown as typeof IntersectionObserver;
    renderWithEnd();
    expect(screen.getByTestId("halloween-floating-cta").className).not.toContain("floatingCtaHidden");
  });
});
