/**
 * 画面幅判定のテスト。
 *
 * 派生生成の入力面は、モバイルではボトムシート、デスクトップでは横長モーダル
 * に切り替える。判定を誤ると、狭い画面に 1100px のモーダルが出る。
 */

import { act, renderHook } from "@testing-library/react";
import { useIsDesktopViewport } from "@/features/generation/hooks/useIsDesktopViewport";

type Listener = () => void;

function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<Listener>();
  let matches = initialMatches;

  const query = {
    get matches() {
      return matches;
    },
    addEventListener: (_event: string, listener: Listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_event: string, listener: Listener) => {
      listeners.delete(listener);
    },
  };

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: jest.fn(() => query),
  });

  return {
    setMatches(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener());
    },
    listenerCount: () => listeners.size,
  };
}

afterEach(() => {
  // 他のテストへ持ち越さない
  Reflect.deleteProperty(window, "matchMedia");
});

describe("useIsDesktopViewport", () => {
  it("広い画面では true", () => {
    installMatchMedia(true);

    const { result } = renderHook(() => useIsDesktopViewport());

    expect(result.current).toBe(true);
  });

  it("狭い画面では false", () => {
    installMatchMedia(false);

    const { result } = renderHook(() => useIsDesktopViewport());

    expect(result.current).toBe(false);
  });

  it("リサイズに追従する", () => {
    const media = installMatchMedia(false);

    const { result } = renderHook(() => useIsDesktopViewport());
    expect(result.current).toBe(false);

    act(() => {
      media.setMatches(true);
    });

    expect(result.current).toBe(true);
  });

  it("アンマウントで購読を解除する", () => {
    const media = installMatchMedia(true);

    const { unmount } = renderHook(() => useIsDesktopViewport());
    expect(media.listenerCount()).toBe(1);

    unmount();

    expect(media.listenerCount()).toBe(0);
  });

  it("matchMedia が無い環境でも落ちずに false", () => {
    // SSR や古いブラウザ。狭い画面用のレイアウトへ倒す方が事故が少ない。
    Reflect.deleteProperty(window, "matchMedia");

    const { result } = renderHook(() => useIsDesktopViewport());

    expect(result.current).toBe(false);
  });
});
