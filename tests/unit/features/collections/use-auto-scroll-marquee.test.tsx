/** @jest-environment jsdom */

/**
 * 「自動で流れるが、指でも動かせる」棚。
 *
 * ⭐ 以前は `transform: translateX()` の CSS アニメーションで流しており、
 * 外側が `overflow-hidden` だったため**指でドラッグしても動かなかった**
 * (実機で報告)。動いているものは触れば動かせる、が自然な期待なので、
 * **本物のスクロール位置(scrollLeft)を進める**方式に変えた。
 *
 * ⭐ 止め方も変えた。以前は CSS の `:hover` で止めていたが、
 * **スマホでは hover がタップ後も残る**ため、指を離しても止まったままで、
 * 別の場所を触るまで再開しなかった。
 * ここでは「操作があったら止め、一定時間で再開」にしている。
 */

import React from "react";
import { render, act } from "@testing-library/react";
import { useAutoScrollMarquee } from "@/features/collections/lib/use-auto-scroll-marquee";

/** rAF を手で進められるようにする。 */
let rafCallbacks: Map<number, FrameRequestCallback>;
let rafSeq: number;
let now: number;

function stepFrame(ms: number) {
  now += ms;
  const callbacks = Array.from(rafCallbacks.entries());
  rafCallbacks.clear();
  act(() => {
    for (const [, cb] of callbacks) cb(now);
  });
}

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
    MockIntersectionObserver.instances.push(this);
  }
  observe() {
    // 既定で「見えている」状態にしておく
    act(() => {
      this.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
    });
  }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  jest.useFakeTimers();
  rafCallbacks = new Map();
  rafSeq = 0;
  now = 0;
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafSeq += 1;
    rafCallbacks.set(rafSeq, cb);
    return rafSeq;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((id: number) => {
    rafCallbacks.delete(id);
  }) as typeof window.cancelAnimationFrame;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  MockIntersectionObserver.instances = [];
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    MockIntersectionObserver;
});

afterEach(() => {
  jest.useRealTimers();
});

function Harness({
  enabled = true,
  speedPxPerSec = 100,
  resumeDelayMs = 2500,
  scrollWidth = 1000,
}: {
  enabled?: boolean;
  speedPxPerSec?: number;
  resumeDelayMs?: number;
  scrollWidth?: number;
}) {
  const ref = useAutoScrollMarquee<HTMLDivElement>({
    enabled,
    speedPxPerSec,
    resumeDelayMs,
  });
  return (
    <div ref={ref} data-testid="track" style={{ overflowX: "auto" }}>
      <div style={{ width: scrollWidth }} />
    </div>
  );
}

/*
  jsdom はレイアウトを持たないので、`scrollWidth` は常に0、`scrollLeft` は
  代入しても0のまま(スクロールできない要素とみなされる)。
  素の値として持たせて、計算だけを検証できるようにする。
*/
function setup(props: Parameters<typeof Harness>[0] = {}) {
  const scrollWidth = props.scrollWidth ?? 1000;
  const utils = render(<Harness {...props} />);
  const el = utils.getByTestId("track") as HTMLDivElement;
  Object.defineProperty(el, "scrollWidth", {
    configurable: true,
    get: () => scrollWidth,
  });
  Object.defineProperty(el, "scrollLeft", {
    configurable: true,
    writable: true,
    value: 0,
  });
  return { el, ...utils };
}

describe("useAutoScrollMarquee", () => {
  test("⭐自動でスクロール位置が進む（transform ではない）", () => {
    const { el } = setup({ speedPxPerSec: 100 });

    stepFrame(0); // 初回は経過時間0
    stepFrame(1000); // 1秒

    expect(el.scrollLeft).toBeCloseTo(100, 0);
  });

  test("速さは px/秒で効く", () => {
    const { el } = setup({ speedPxPerSec: 50 });

    stepFrame(0);
    stepFrame(2000);

    expect(el.scrollLeft).toBeCloseTo(100, 0);
  });

  test("⭐触ったら止まる", () => {
    const { el } = setup({ speedPxPerSec: 100 });
    stepFrame(0);

    act(() => {
      el.dispatchEvent(new Event("pointerdown"));
    });
    stepFrame(1000);

    expect(el.scrollLeft).toBe(0);
  });

  test("⭐指を離してしばらくすると再開する（hover が残っても止まりっぱなしにしない）", () => {
    const { el } = setup({ speedPxPerSec: 100, resumeDelayMs: 2500 });
    stepFrame(0);

    act(() => {
      el.dispatchEvent(new Event("pointerdown"));
    });
    stepFrame(500);
    expect(el.scrollLeft).toBe(0);

    // 待ち時間が過ぎたら再開
    act(() => {
      jest.advanceTimersByTime(2500);
    });
    stepFrame(1000);

    expect(el.scrollLeft).toBeCloseTo(100, 0);
  });

  test("触るたびに再開の待ち時間が延びる", () => {
    const { el } = setup({ speedPxPerSec: 100, resumeDelayMs: 2000 });
    stepFrame(0);

    act(() => {
      el.dispatchEvent(new Event("pointerdown"));
      jest.advanceTimersByTime(1500);
      el.dispatchEvent(new Event("pointerdown"));
      jest.advanceTimersByTime(1500);
    });
    stepFrame(1000);

    // 合計3秒たっているが、2回目から2秒経っていないので止まったまま
    expect(el.scrollLeft).toBe(0);
  });

  test("ホイール操作でも止まる", () => {
    const { el } = setup({ speedPxPerSec: 100 });
    stepFrame(0);

    act(() => {
      el.dispatchEvent(new Event("wheel"));
    });
    stepFrame(1000);

    expect(el.scrollLeft).toBe(0);
  });

  test("⭐半分を越えたら送り返す（2周ぶん並べた継ぎ目を隠す）", () => {
    const { el } = setup({ speedPxPerSec: 100, scrollWidth: 1000 });

    stepFrame(0);
    stepFrame(6000); // +600 → 半分(500)を越えるので -500

    expect(el.scrollLeft).toBeCloseTo(100, 0);
  });

  /**
   * ⭐ iOS の慣性スクロールは、指を離したあとも流れ続けるのに
   * `touchstart` のようなイベントを出さない。イベントだけを見ていると
   * **慣性の最中に自動送りが割り込んで、両方が同時に動かす**。
   * 「自分が置いた位置と違う＝誰かが動かした」で判定すれば一律に拾える。
   */
  test("⭐自分以外が動かしたら止まる（慣性スクロール対策）", () => {
    const { el } = setup({ speedPxPerSec: 100 });
    stepFrame(0);
    stepFrame(1000); // 自動送りで 100 まで進む
    expect(el.scrollLeft).toBeCloseTo(100, 0);

    // 慣性で外から動いたことにする(イベントは出さない)
    el.scrollLeft = 400;

    stepFrame(1000);

    // 割り込んで進めない
    expect(el.scrollLeft).toBeCloseTo(400, 0);
  });

  test("外から動かされた位置を起点に再開する（元の位置へ戻さない）", () => {
    // 折り返し(半分=2000)に掛からない広さにして、続きから進むことだけを見る
    const { el } = setup({
      speedPxPerSec: 100,
      resumeDelayMs: 2000,
      scrollWidth: 4000,
    });
    stepFrame(0);
    stepFrame(1000);

    el.scrollLeft = 400; // 慣性・手動で移動
    stepFrame(16); // 検知して停止

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    stepFrame(1000);

    // 400 から続く(0 や 100 へ戻らない)
    expect(el.scrollLeft).toBeCloseTo(500, 0);
  });

  /**
   * ブラウザによっては `scrollLeft` への代入が整数へ丸められる。
   * 毎フレームの端数を持ち越さないと、遅い速度でまったく進まなくなる。
   */
  test("⭐遅い速度でも進む（丸めで止まらない）", () => {
    const { el } = setup({ speedPxPerSec: 24 });
    // 代入時に整数へ丸めるブラウザを模す
    let raw = 0;
    Object.defineProperty(el, "scrollLeft", {
      configurable: true,
      get: () => raw,
      set: (v: number) => {
        raw = Math.floor(v);
      },
    });

    stepFrame(0);
    // 16ms ごとに 0.384px。丸めるだけだと永遠に 0 のまま
    for (let i = 0; i < 60; i += 1) stepFrame(16);

    expect(el.scrollLeft).toBeGreaterThan(15);
  });

  test("手動で左端より戻したときも送り返す", () => {
    const { el } = setup({ speedPxPerSec: 100, scrollWidth: 1000 });
    stepFrame(0);

    // ブラウザは負にしないが、実装の対称性を確かめる
    el.scrollLeft = -10;
    act(() => {
      el.dispatchEvent(new Event("scroll"));
    });

    expect(el.scrollLeft).toBeCloseTo(490, 0);
  });

  test("件数が少ないとき(enabled=false)は動かさない", () => {
    const { el } = setup({ enabled: false, speedPxPerSec: 100 });

    stepFrame(0);
    stepFrame(1000);

    expect(el.scrollLeft).toBe(0);
  });

  test("⭐動きを減らす設定の人には自動で流さない", () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;

    const { el } = setup({ speedPxPerSec: 100 });

    stepFrame(0);
    stepFrame(1000);

    expect(el.scrollLeft).toBe(0);
  });

  test("⭐画面に入るまで動かさない（先頭から見えるように）", () => {
    const { el } = setup({ speedPxPerSec: 100 });
    const io = MockIntersectionObserver.instances[0];

    act(() => {
      io.callback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        io as unknown as IntersectionObserver
      );
    });
    stepFrame(0);
    stepFrame(1000);

    expect(el.scrollLeft).toBe(0);
  });

  test("外したら rAF を止める（後片付け）", () => {
    const { unmount } = setup();
    stepFrame(0);

    unmount();

    expect(rafCallbacks.size).toBe(0);
  });
});
