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
    // html の scroll-behavior: smooth に従わせない
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
  });

  test("合わせ直しを終えたら URL から場所を外す(「戻る」で帰ってきたときに、また移らない)", () => {
    window.history.replaceState({ keep: "next-state" }, "", "/campaigns/halloween-best-shot?utm=x#hbs-works");
    const scrollIntoView = placeTarget("hbs-works");
    const { unmount } = render(<HashTargetScroll />);
    // 合わせ直しているあいだは残す
    expect(window.location.hash).toBe("#hbs-works");
    act(() => jest.advanceTimersByTime(HASH_TARGET_SETTLE_MS));
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      "/campaigns/halloween-best-shot?utm=x",
    );
    // Next.js の履歴の中身は残す
    expect(window.history.state).toEqual({ keep: "next-state" });
    unmount();
    // 戻ってきてもう一度描いても移らない
    render(<HashTargetScroll />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  test("ページの中のリンクで場所が付いたときも、URL から外す", () => {
    window.history.replaceState(null, "", "/campaigns/halloween-best-shot");
    render(<HashTargetScroll />);
    act(() => {
      window.history.replaceState(null, "", "/campaigns/halloween-best-shot#hbs-works");
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(window.location.hash).toBe("");
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

  test("スクロールバーを動かしたとき(scroll だけが届く)も、飛んだ先が動いていたら、そのあとは合わせ直さない", () => {
    window.history.replaceState(null, "", "/campaigns/halloween-best-shot#hbs-works");
    const scrollIntoView = placeTarget("hbs-works");
    const target = document.getElementById("hbs-works") as HTMLElement;
    let top = 80;
    target.getBoundingClientRect = () => ({ top }) as DOMRect;
    render(<HashTargetScroll />);
    // 飛んだ先が動いていない scroll(ここで移したときや、ブラウザが位置を保ったとき)では止めない
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    resizePage();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);

    // 自分で動かした
    top = -400;
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    resizePage();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  test("描き直しで片付けても(React の開発時の2回目の描画)、場所は残し、描き直したあとも移る", () => {
    window.history.replaceState(null, "", "/campaigns/halloween-best-shot#hbs-works");
    const scrollIntoView = placeTarget("hbs-works");
    const first = render(<HashTargetScroll />);
    first.unmount();
    expect(window.location.hash).toBe("#hbs-works");
    render(<HashTargetScroll />);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    resizePage();
    expect(scrollIntoView).toHaveBeenCalledTimes(3);
  });

  test("自分で操作したら URL から場所を外す", () => {
    window.history.replaceState(null, "", "/campaigns/halloween-best-shot#hbs-works");
    placeTarget("hbs-works");
    render(<HashTargetScroll />);
    act(() => {
      window.dispatchEvent(new Event("touchstart"));
    });
    expect(window.location.hash).toBe("");
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

  test("決めた場所(項目の見出し)でない id や、場所なしの URL では動かない", () => {
    window.history.replaceState(null, "", "/campaigns/halloween-best-shot#main");
    const other = placeTarget("main");
    const { unmount } = render(<HashTargetScroll />);
    expect(other).not.toHaveBeenCalled();
    unmount();

    // 手順1のカード(#hbs-entry)はタブの中で隠れていることがあるので、移らない
    window.history.replaceState(null, "", "/campaigns/halloween-best-shot#hbs-entry");
    const step = placeTarget("hbs-entry");
    const second = render(<HashTargetScroll />);
    expect(step).not.toHaveBeenCalled();
    second.unmount();

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
