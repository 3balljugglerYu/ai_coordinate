/** @jest-environment jsdom */

import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  CatalogSwipePanel,
  type CatalogTabMode,
} from "@/features/style-presets/components/CatalogSwipePanel";

/**
 * スタイルカタログの一覧の横スワイプ(カタログ刷新後)。
 *
 * タッチは addEventListener(touchmove は passive: false)で直接受けているので、
 * ここでも touches / changedTouches を持たせたイベントを直接投げる。
 * jsdom にはレイアウトも Web Animations も無いので、
 *  - 一覧の幅(clientWidth)は 400px に固定する(切り替えの距離は 20% = 80px)
 *  - element.animate が無い環境では、動かさずに切り替えだけ行う(動きを減らす設定と同じ道)
 */

const originalClientWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "clientWidth"
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 400,
  });
});

afterAll(() => {
  if (originalClientWidth) {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
  }
});

type Point = { x: number; y: number };

/** タッチのイベントを投げる。touches は画面に触れている指、changed は動いた(離れた)指。 */
function dispatchTouch(
  target: Element,
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  touches: Point[],
  { changed, timeStamp }: { changed?: Point[]; timeStamp?: number } = {}
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const toTouchList = (points: Point[]) =>
    points.map((point, index) => ({
      identifier: index,
      clientX: point.x,
      clientY: point.y,
    }));
  Object.defineProperty(event, "touches", { value: toTouchList(touches) });
  Object.defineProperty(event, "changedTouches", {
    value: toTouchList(changed ?? touches),
  });
  if (timeStamp !== undefined) {
    Object.defineProperty(event, "timeStamp", { value: timeStamp });
  }
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

type SwipeOptions = {
  startY?: number;
  endY?: number;
  /** 指を動かしていた時間(ms)。短いほど素早い払いになる */
  duration?: number;
  release?: boolean;
};

/** 指を置いて、startX から endX まで動かして離す。途中の touchmove を返す。 */
function swipe(
  target: Element,
  startX: number,
  endX: number,
  { startY = 300, endY = startY, duration = 400, release = true }: SwipeOptions = {}
) {
  const steps = 8;
  const base = 1000;
  dispatchTouch(target, "touchstart", [{ x: startX, y: startY }], { timeStamp: base });
  const moves: Event[] = [];
  for (let i = 1; i <= steps; i += 1) {
    moves.push(
      dispatchTouch(
        target,
        "touchmove",
        [
          {
            x: startX + ((endX - startX) * i) / steps,
            y: startY + ((endY - startY) * i) / steps,
          },
        ],
        { timeStamp: base + (duration * i) / steps }
      )
    );
  }
  if (release) {
    dispatchTouch(target, "touchend", [], {
      changed: [{ x: endX, y: endY }],
      timeStamp: base + duration,
    });
  }
  return moves;
}

function tabKeys(count: number) {
  return Array.from({ length: count }, (_, index) => `tab-${index}`);
}

/** 選択中のタブはボタン(カード)を、隣のタブの見本は「peek tab-N」を描く。 */
function renderTab(onCardClick: () => void) {
  return function renderTestTab(key: string, mode: CatalogTabMode) {
    return mode === "page" ? (
      <button type="button" onClick={onCardClick}>
        card
      </button>
    ) : (
      <p>peek {key}</p>
    );
  };
}

function renderPanel({
  activeIndex = 0,
  count = 3,
  onSwipeTo = jest.fn(),
  onCardClick = jest.fn(),
}: {
  activeIndex?: number;
  count?: number;
  onSwipeTo?: jest.Mock;
  onCardClick?: jest.Mock;
} = {}) {
  const keys = tabKeys(count);
  render(
    <CatalogSwipePanel
      tabKeys={keys}
      activeKey={keys[activeIndex]}
      onSwipeTo={onSwipeTo}
      renderTab={renderTab(onCardClick)}
    />
  );
  return {
    card: screen.getByRole("button", { name: "card" }),
    track: screen.getByTestId("catalog-swipe-panel").firstElementChild as HTMLElement,
    onSwipeTo,
    onCardClick,
  };
}

describe("CatalogSwipePanel", () => {
  test("左へ払うと次のタブへ", () => {
    const { card, onSwipeTo } = renderPanel({ activeIndex: 0 });

    swipe(card, 300, 150);

    expect(onSwipeTo).toHaveBeenCalledWith("tab-1");
  });

  test("右へ払うと前のタブへ", () => {
    const { card, onSwipeTo } = renderPanel({ activeIndex: 1 });

    swipe(card, 150, 300);

    expect(onSwipeTo).toHaveBeenCalledWith("tab-0");
  });

  test("一覧の幅の 20% に届かないゆっくりした動きでは切り替えない", () => {
    const { card, onSwipeTo } = renderPanel({ activeIndex: 0 });

    swipe(card, 300, 240, { duration: 600 });

    expect(onSwipeTo).not.toHaveBeenCalled();
  });

  test("短くても素早く払えば切り替える", () => {
    const { card, onSwipeTo } = renderPanel({ activeIndex: 0 });

    swipe(card, 300, 260, { duration: 40 });

    expect(onSwipeTo).toHaveBeenCalledWith("tab-1");
  });

  test("縦の動き(スクロール)では切り替えず、一覧もずらさず、スクロールも止めない", () => {
    const { card, track, onSwipeTo } = renderPanel({ activeIndex: 0 });

    const moves = swipe(card, 300, 280, { startY: 500, endY: 200 });

    expect(onSwipeTo).not.toHaveBeenCalled();
    expect(track.style.transform).toBe("");
    expect(moves.some((event) => event.defaultPrevented)).toBe(false);
  });

  test("横に動かしている間は、縦にスクロールさせない(touchmove を止める)", () => {
    const { card } = renderPanel({ activeIndex: 0 });

    dispatchTouch(card, "touchstart", [{ x: 300, y: 300 }]);
    // 向きが決まるまで(6px 未満)はブラウザに任せる
    const undecided = dispatchTouch(card, "touchmove", [{ x: 297, y: 301 }]);
    // 横と決まったら、斜めに動いても縦には流さない
    const horizontal = dispatchTouch(card, "touchmove", [{ x: 280, y: 306 }]);
    const diagonal = dispatchTouch(card, "touchmove", [{ x: 240, y: 330 }]);

    expect(undecided.defaultPrevented).toBe(false);
    expect(horizontal.defaultPrevented).toBe(true);
    expect(diagonal.defaultPrevented).toBe(true);
  });

  test("払っている間は、隣の一覧と一緒に指についてずれる", () => {
    const { card, track } = renderPanel({ activeIndex: 0 });

    swipe(card, 300, 240, { release: false });

    expect(track.style.transform).toBe("translate3d(-60px, 0, 0)");
  });

  test("隣が無い向きは手応えだけ返し、離すと元へ戻って切り替えない", () => {
    const { card, track, onSwipeTo } = renderPanel({ activeIndex: 0 });

    // 先頭のタブで右へ引く
    swipe(card, 150, 310, { release: false });
    expect(track.style.transform).toBe("translate3d(40px, 0, 0)");

    dispatchTouch(card, "touchend", [], { changed: [{ x: 310, y: 300 }] });
    expect(onSwipeTo).not.toHaveBeenCalled();
    expect(track.style.transform).toBe("");
  });

  test("最後のタブで左へ払っても切り替えない", () => {
    const { card, onSwipeTo } = renderPanel({ activeIndex: 2, count: 3 });

    swipe(card, 300, 100);

    expect(onSwipeTo).not.toHaveBeenCalled();
  });

  test("画面の端から始まる操作はブラウザの「戻る」に譲る", () => {
    const { card, onSwipeTo } = renderPanel({ activeIndex: 1 });

    const moves = swipe(card, 10, 200);

    expect(onSwipeTo).not.toHaveBeenCalled();
    expect(moves.some((event) => event.defaultPrevented)).toBe(false);
  });

  test("2本目の指が触れたら(拡大縮小)、横の操作をやめて元へ戻す", () => {
    const { card, track, onSwipeTo } = renderPanel({ activeIndex: 0 });

    swipe(card, 300, 200, { release: false });
    dispatchTouch(card, "touchstart", [
      { x: 200, y: 300 },
      { x: 100, y: 400 },
    ]);
    dispatchTouch(card, "touchend", [], { changed: [{ x: 200, y: 300 }] });

    expect(track.style.transform).toBe("");
    expect(onSwipeTo).not.toHaveBeenCalled();
  });

  test("払った指を離したときのクリックでは、カードを開かない", () => {
    const { card, onSwipeTo, onCardClick } = renderPanel({ activeIndex: 0 });

    swipe(card, 300, 150);
    fireEvent.click(card);

    expect(onSwipeTo).toHaveBeenCalledWith("tab-1");
    expect(onCardClick).not.toHaveBeenCalled();
  });

  test("ふつうのタップではカードを開く", () => {
    const { card, onSwipeTo, onCardClick } = renderPanel({ activeIndex: 0 });

    // 直前に払っていても、次に指を置いた時点で元に戻る
    swipe(card, 300, 150);
    fireEvent.click(card);
    dispatchTouch(card, "touchstart", [{ x: 200, y: 300 }]);
    dispatchTouch(card, "touchend", [], { changed: [{ x: 200, y: 300 }] });
    fireEvent.click(card);

    expect(onSwipeTo).toHaveBeenCalledTimes(1);
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  test("右から左へ並ぶ言語では、右へ払うと次のタブへ", () => {
    const onSwipeTo = jest.fn();
    render(
      <div dir="rtl">
        <CatalogSwipePanel
          tabKeys={tabKeys(3)}
          activeKey="tab-0"
          onSwipeTo={onSwipeTo}
          renderTab={renderTab(jest.fn())}
        />
      </div>
    );

    swipe(screen.getByRole("button", { name: "card" }), 150, 300);

    expect(onSwipeTo).toHaveBeenCalledWith("tab-1");
  });

  describe("隣のタブの中身", () => {
    test("PC では先に用意せず、指が触れた時点で用意する(操作はできない見本)", () => {
      const { card } = renderPanel({ activeIndex: 1 });
      expect(screen.queryByTestId("catalog-swipe-peek-next")).toBeNull();

      dispatchTouch(card, "touchstart", [{ x: 300, y: 300 }]);

      const previous = screen.getByTestId("catalog-swipe-peek-previous");
      const next = screen.getByTestId("catalog-swipe-peek-next");
      expect(previous.textContent).toBe("peek tab-0");
      expect(next.textContent).toBe("peek tab-2");
      for (const peek of [previous, next]) {
        expect(peek.hasAttribute("inert")).toBe(true);
        expect(peek.getAttribute("aria-hidden")).toBe("true");
      }
    });

    test("先頭のタブでは前を、最後のタブでは次を出さない", () => {
      const { card } = renderPanel({ activeIndex: 0, count: 2 });

      dispatchTouch(card, "touchstart", [{ x: 300, y: 300 }]);

      expect(screen.queryByTestId("catalog-swipe-peek-previous")).toBeNull();
      expect(screen.getByTestId("catalog-swipe-peek-next").textContent).toBe("peek tab-1");
    });

    test("指で触れる端末では、触れる前(画面が落ち着いた時点)に用意する", () => {
      jest.useFakeTimers();
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: query === "(pointer: coarse)",
      })) as unknown as typeof window.matchMedia;
      try {
        renderPanel({ activeIndex: 0 });
        expect(screen.queryByTestId("catalog-swipe-peek-next")).toBeNull();

        act(() => {
          jest.advanceTimersByTime(300);
        });

        expect(screen.getByTestId("catalog-swipe-peek-next").textContent).toBe("peek tab-1");
      } finally {
        window.matchMedia = originalMatchMedia;
        jest.useRealTimers();
      }
    });

    /*
      ⭐ 切り替えたとき、隣に置いていた見本の入れ物をそのまま今の一覧にする。
      作り直すと、表示済みのアイコンや画像が読み込み直しになり、一度グレーに戻る。
    */
    test("切り替えても、隣に置いていた入れ物(と中身)を作り直さずに今の一覧にする", () => {
      const onSwipeTo = jest.fn();
      const renderSame = (key: string, mode: CatalogTabMode) => (
        <p data-mode={mode}>list {key}</p>
      );
      const { rerender } = render(
        <CatalogSwipePanel
          tabKeys={tabKeys(3)}
          activeKey="tab-0"
          onSwipeTo={onSwipeTo}
          renderTab={renderSame}
        />
      );
      dispatchTouch(screen.getByText("list tab-0"), "touchstart", [{ x: 300, y: 300 }]);
      const nextPeek = screen.getByTestId("catalog-swipe-peek-next");
      const nextContent = within(nextPeek).getByText("list tab-1");
      const current = screen.getByTestId("catalog-swipe-current");

      rerender(
        <CatalogSwipePanel
          tabKeys={tabKeys(3)}
          activeKey="tab-1"
          onSwipeTo={onSwipeTo}
          renderTab={renderSame}
        />
      );

      // 次の見本だった入れ物と中身が、そのまま今の一覧になる
      expect(screen.getByTestId("catalog-swipe-current")).toBe(nextPeek);
      expect(within(nextPeek).getByText("list tab-1")).toBe(nextContent);
      expect(nextContent.getAttribute("data-mode")).toBe("page");
      expect(nextPeek.hasAttribute("inert")).toBe(false);
      // 今の一覧だった入れ物は、前の見本になる
      expect(screen.getByTestId("catalog-swipe-peek-previous")).toBe(current);
      expect(current.hasAttribute("inert")).toBe(true);
    });

    test("横に動かし始めたら、隣の一覧の先頭を固定したタブ列のすぐ下にそろえる", () => {
      render(
        <div>
          <div data-catalog-tab-bar />
          <CatalogSwipePanel
            tabKeys={tabKeys(3)}
            activeKey="tab-0"
            onSwipeTo={jest.fn()}
            renderTab={renderTab(jest.fn())}
          />
        </div>
      );
      const bar = document.querySelector("[data-catalog-tab-bar]") as HTMLElement;
      const panel = screen.getByTestId("catalog-swipe-panel");
      // タブ列は画面の上端に固定(下端 49px)、一覧は 500px 上までスクロールしている
      bar.getBoundingClientRect = () => ({ bottom: 49 }) as DOMRect;
      panel.getBoundingClientRect = () => ({ top: -500 }) as DOMRect;
      const card = screen.getByRole("button", { name: "card" });

      swipe(card, 300, 200, { release: false });

      expect(screen.getByTestId("catalog-swipe-peek-next").style.top).toBe("549px");
    });
  });

  function renderWithBar(keys: string[], activeKey: string) {
    return (
      <div>
        <div data-catalog-tab-bar />
        <CatalogSwipePanel
          tabKeys={keys}
          activeKey={activeKey}
          onSwipeTo={jest.fn()}
          renderTab={(key) => <p>list {key}</p>}
        />
      </div>
    );
  }

  test("タブが変わったら、固定したタブ列の裏に隠れた一覧の先頭まで戻す", () => {
    const scrollBy = jest.spyOn(window, "scrollBy").mockImplementation(() => {});
    const { rerender } = render(renderWithBar(tabKeys(3), "tab-0"));
    const bar = document.querySelector("[data-catalog-tab-bar]") as HTMLElement;
    const panel = screen.getByTestId("catalog-swipe-panel");
    // タブ列は画面の上端に固定(下端 49px)、一覧の先頭は 500px 上に隠れている
    bar.getBoundingClientRect = () => ({ bottom: 49 }) as DOMRect;
    panel.getBoundingClientRect = () => ({ top: -500 }) as DOMRect;

    rerender(renderWithBar(tabKeys(3), "tab-1"));

    expect(scrollBy).toHaveBeenCalledWith({ top: -549, behavior: "instant" });
    scrollBy.mockRestore();
  });

  test("タブの位置がずれただけ(前にタブが差し込まれた)では、スクロールを動かさない", () => {
    const scrollBy = jest.spyOn(window, "scrollBy").mockImplementation(() => {});
    const { rerender } = render(renderWithBar(["all", "popular", "event"], "popular"));
    const bar = document.querySelector("[data-catalog-tab-bar]") as HTMLElement;
    const panel = screen.getByTestId("catalog-swipe-panel");
    bar.getBoundingClientRect = () => ({ bottom: 49 }) as DOMRect;
    panel.getBoundingClientRect = () => ({ top: -500 }) as DOMRect;

    // 前に🔖お気に入りが差し込まれて、選択中の位置だけがずれる
    rerender(renderWithBar(["all", "favorites", "popular", "event"], "popular"));

    expect(scrollBy).not.toHaveBeenCalled();
    scrollBy.mockRestore();
  });
});
