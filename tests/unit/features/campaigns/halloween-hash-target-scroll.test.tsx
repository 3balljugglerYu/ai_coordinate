/**
 * @jest-environment jsdom
 */

/**
 * 場所つきの URL(#hbs-works など)で開いたとき、描いたあとにその場所へ移る(2026-10-25 ユーザー指示)。
 * 企画ページは中身があとから届くので、ブラウザだけでは上のまま止まる(手元の dev で確認)。
 */
import { act, render } from "@testing-library/react";
import { HASH_TARGET_SETTLE_MS, HashTargetScroll } from "@/features/campaigns/halloween/components/HashTargetScroll";

let resizeCallbacks: (() => void)[] = [];

class FakeResizeObserver {
  constructor(callback: () => void) {
    resizeCallbacks.push(callback);
  }
  observe() {}
  disconnect() {
    resizeCallbacks = [];
  }
}

function placeTarget(id: string) {
  const target = document.createElement("div");
  target.id = id;
  const scrollIntoView = jest.fn();
  target.scrollIntoView = scrollIntoView;
  document.body.appendChild(target);
  return scrollIntoView;
}

function resizePage() {
  act(() => resizeCallbacks.forEach((callback) => callback()));
}

beforeEach(() => {
  jest.useFakeTimers();
  resizeCallbacks = [];
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
});

afterEach(() => {
  jest.useRealTimers();
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
  delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
});

describe("HashTargetScroll", () => {
  test("#hbs-works で開いたら、対象作品の見出しへ移る(なめらかに流さない)", () => {
    window.history.replaceState(null, "", "/campaigns/halloween-best-shot#hbs-works");
    const scrollIntoView = placeTarget("hbs-works");
    render(<HashTargetScroll />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  test("上で高さが変わったら合わせ直し、決めた時間が過ぎたらやめる", () => {
    window.history.replaceState(null, "", "/campaigns/halloween-best-shot#hbs-works");
    const scrollIntoView = placeTarget("hbs-works");
    render(<HashTargetScroll />);
    resizePage();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);

    act(() => jest.advanceTimersByTime(HASH_TARGET_SETTLE_MS));
    resizePage();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  test("自分でスクロールしたら、そのあとは合わせ直さない", () => {
    window.history.replaceState(null, "", "/campaigns/halloween-best-shot#hbs-works");
    const scrollIntoView = placeTarget("hbs-works");
    render(<HashTargetScroll />);
    act(() => {
      window.dispatchEvent(new Event("wheel"));
    });
    resizePage();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  test("このページの場所(hbs-)でない id や、場所なしの URL では動かない", () => {
    window.history.replaceState(null, "", "/campaigns/halloween-best-shot#main");
    const other = placeTarget("main");
    const { unmount } = render(<HashTargetScroll />);
    expect(other).not.toHaveBeenCalled();
    unmount();

    window.history.replaceState(null, "", "/campaigns/halloween-best-shot");
    const works = placeTarget("hbs-works");
    render(<HashTargetScroll />);
    expect(works).not.toHaveBeenCalled();
  });

  test("飛び先がページに無ければ何もしない(作品がまだないときの #hbs-works)", () => {
    window.history.replaceState(null, "", "/campaigns/halloween-best-shot#hbs-works");
    expect(() => render(<HashTargetScroll />)).not.toThrow();
  });
});
