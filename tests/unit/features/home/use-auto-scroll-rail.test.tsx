/** @jest-environment jsdom */

/**
 * 棚を自動で流す動き(2026-10-17 ユーザー指示: 「簡単お着替えのように自動でスクロール」)。
 * 簡単お着替え(HomeStylePresetCarousel)と同じ速さ・止めどき・位置の残し方であること。
 */

import React, { useEffect } from "react";
import { act, render } from "@testing-library/react";
import type { Swiper as SwiperType } from "swiper";
import {
  AUTO_SCROLL_MAX_FRAME_DELTA_MS,
  AUTO_SCROLL_VELOCITY_PX_PER_SEC,
  useAutoScrollRail,
} from "@/features/home/hooks/useAutoScrollRail";

const KEY = "test-rail-translate";
const PITCH = 192; // カード 180px + すき間 12px
const ITEMS = 12;
const ONE_SET = ITEMS * PITCH; // 1組ぶんの幅

type Rail = Omit<ReturnType<typeof useAutoScrollRail>, "containerRef">;

function Harness({
  enabled = true,
  onReady,
}: {
  enabled?: boolean;
  onReady: (rail: Rail) => void;
}) {
  const { containerRef, ...rail } = useAutoScrollRail({ itemCount: ITEMS, storageKey: KEY, enabled });
  useEffect(() => {
    onReady(rail);
  });
  return <section ref={containerRef} data-testid="rail" />;
}

// requestAnimationFrame を手で1コマずつ進める
let frames: Array<(time: number) => void> = [];
let clock = 1000;
let observerCallbacks: IntersectionObserverCallback[] = [];

function runFrame(elapsedMs: number) {
  clock += elapsedMs;
  const pending = frames;
  frames = [];
  pending.forEach((callback) => callback(clock));
}

/** 時間を、ふつうの速さのコマ(20ms ずつ)で進める。1コマは100ms までしか進まないため */
function advance(totalMs: number) {
  for (let elapsed = 0; elapsed < totalMs; elapsed += 20) {
    runFrame(20);
  }
}

function fakeSwiper() {
  const wrapperEl = document.createElement("div");
  const swiper = {
    translate: 0,
    animating: false,
    snapGrid: [0, PITCH, PITCH * 2],
    wrapperEl,
    update: jest.fn(),
    setTranslate(value: number) {
      swiper.translate = value;
      wrapperEl.style.transform = `translate3d(${value}px, 0px, 0px)`;
    },
  };
  return swiper;
}

function setUp({ enabled = true }: { enabled?: boolean } = {}) {
  let rail!: Rail;
  const view = render(<Harness enabled={enabled} onReady={(next) => (rail = next)} />);
  const swiper = fakeSwiper();
  act(() => rail.onSwiper(swiper as unknown as SwiperType));
  return { view, swiper, rail: () => rail };
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
}

beforeEach(() => {
  frames = [];
  clock = 1000;
  observerCallbacks = [];
  jest.spyOn(performance, "now").mockImplementation(() => clock);
  window.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  }) as unknown as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = jest.fn(() => {
    frames = [];
  });
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) {
      observerCallbacks.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // jsdom に無い。見えている位置(transform の横の移動)だけ読めればよい
  (globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = class {
    m41: number;
    constructor(transform: string) {
      const match = /translate3d\((-?[\d.]+)px/.exec(transform ?? "");
      this.m41 = match ? Number(match[1]) : 0;
    }
  };
  window.sessionStorage.clear();
  setHidden(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("棚を自動で流す", () => {
  test("⭐真ん中の組から始め、1秒に32px ずつ左へ流れる(簡単お着替えと同じ速さ)", () => {
    const { swiper } = setUp();
    expect(swiper.translate).toBe(-ONE_SET);

    advance(500);

    expect(AUTO_SCROLL_VELOCITY_PX_PER_SEC).toBe(32);
    expect(swiper.translate).toBeCloseTo(-ONE_SET - 16);
  });

  test("左の端まで来たら、つなぎ目を見せずに1組ぶん戻す", () => {
    const { swiper } = setUp();
    swiper.translate = -2 * ONE_SET + 1;

    runFrame(100); // 3.2px 進むと -2組 を越える

    expect(swiper.translate).toBeCloseTo(-2 * ONE_SET + 1 - 3.2 + ONE_SET);
  });

  test("1コマが長くても(裏から戻ったときなど)、100ms ぶんしか進めない", () => {
    const { swiper } = setUp();

    runFrame(5000);

    expect(AUTO_SCROLL_MAX_FRAME_DELTA_MS).toBe(100);
    expect(swiper.translate).toBeCloseTo(-ONE_SET - 3.2);
  });

  test("指で触れている間は止まり、離すとまた流れる", () => {
    const { swiper, rail } = setUp();

    rail().onTouchStart();
    advance(500);
    expect(swiper.translate).toBe(-ONE_SET);

    rail().onTouchEnd();
    advance(500);
    expect(swiper.translate).toBeCloseTo(-ONE_SET - 16);
  });

  test("指で弾いたあと Swiper が動かしている間は、横から動かさない", () => {
    const { swiper } = setUp();
    swiper.animating = true;

    advance(500);

    expect(swiper.translate).toBe(-ONE_SET);
  });

  test("画面から外れたら止めて位置を残し、また見えたら続きから流す", () => {
    const { swiper } = setUp();
    advance(500);
    const position = swiper.translate;

    act(() => observerCallbacks[0]([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    advance(500);
    expect(swiper.translate).toBe(position);
    expect(Number(window.sessionStorage.getItem(KEY))).toBeCloseTo(position);

    act(() => observerCallbacks[0]([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    advance(500);
    expect(swiper.translate).toBeCloseTo(position - 16);
  });

  test("タブが裏に回ったら止めて位置を残し、表に戻って棚が見えていれば流す", () => {
    const { swiper, view } = setUp();
    const section = view.getByTestId("rail");
    section.getBoundingClientRect = () => ({ top: 100, bottom: 400 }) as DOMRect;

    setHidden(true);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    advance(500);
    expect(swiper.translate).toBe(-ONE_SET);
    expect(window.sessionStorage.getItem(KEY)).toBe(String(-ONE_SET));

    setHidden(false);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    advance(500);
    expect(swiper.translate).toBeCloseTo(-ONE_SET - 16);
  });

  test("ページを離れるとき(pagehide)と、移る前の saveTranslate で位置を残す", () => {
    const { swiper, rail } = setUp();
    advance(500);

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(Number(window.sessionStorage.getItem(KEY))).toBeCloseTo(swiper.translate);

    advance(500);
    rail().saveTranslate();
    expect(Number(window.sessionStorage.getItem(KEY))).toBeCloseTo(swiper.translate);
  });

  test.each([
    ["真ん中の帯の中ならそのまま", "-100", -100],
    ["右へはみ出していたら1組ぶん左へ", "500", 500 - ONE_SET],
    ["左へはみ出していたら1組ぶん右へ", String(-2 * ONE_SET - 50), -ONE_SET - 50],
  ])("戻ってきたら、残した位置の続きから(%s)", (_label, saved, expected) => {
    window.sessionStorage.setItem(KEY, saved);

    const { swiper } = setUp();

    expect(swiper.translate).toBeCloseTo(expected);
  });

  test("残した値が読めなければ、真ん中の組から", () => {
    window.sessionStorage.setItem(KEY, "not-a-number");

    const { swiper } = setUp();

    expect(swiper.translate).toBe(-ONE_SET);
  });

  test("enabled が false(作品が少ない)なら、何も動かさない", () => {
    const { swiper } = setUp({ enabled: false });

    advance(500);

    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(observerCallbacks).toHaveLength(0);
    expect(swiper.translate).toBe(0);
  });

  test("外したら止めて、位置を残す", () => {
    const { swiper, view } = setUp();
    advance(500);

    view.unmount();

    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    expect(Number(window.sessionStorage.getItem(KEY))).toBeCloseTo(swiper.translate);
  });
});
