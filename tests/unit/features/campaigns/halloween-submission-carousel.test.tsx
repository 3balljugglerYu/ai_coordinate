/**
 * @jest-environment jsdom
 */

/**
 * 「キャンペーン対象の投稿」(2026-10-15 ユーザー決定)。
 * 3列 × 3段の9件を1ページにし(2026-10-24 に 3列 × 2段から変更)、左右のスワイプ(と矢印・点)でページ単位に移る。
 * カードはサムネイルだけ(作者名・利用回数は出さない)。
 * サムネイルを押すと /use-prompts と同じ確認を出してから投稿のページへ。
 * 2026-10-25: PC では横幅いっぱいにページを並べて見せ(6列・9列)、マウスのドラッグでもページを送る。
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  DRAG_CLICK_TOLERANCE_PX,
  DRAG_PAGE_THRESHOLD_PX,
  SNAP_RESTORE_FALLBACK_MS,
  SubmissionCarousel,
} from "@/features/campaigns/halloween/components/SubmissionCarousel";

const routerPushMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => routerPushMock(...args) }),
}));
jest.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element -- テスト用に next/image を素の img に置き換える
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

function item(id: string) {
  return { postId: id, thumbnailUrl: `https://img.test/${id}.webp`, authorName: `作者${id}` };
}

function pages(count: number) {
  return Array.from({ length: count }, (_, pageIndex) =>
    Array.from({ length: 9 }, (_, index) => item(`p${pageIndex}-${index}`)),
  );
}

function stubScroller(scroller: HTMLElement, width = 300) {
  Object.defineProperty(scroller, "clientWidth", { configurable: true, value: width });
  const scrollTo = jest.fn((options: ScrollToOptions) => {
    scroller.scrollLeft = options.left ?? 0;
  });
  scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo;
  return scrollTo;
}

beforeEach(() => routerPushMock.mockReset());

describe("SubmissionCarousel", () => {
  test("カードはサムネイルだけ(作者名・利用回数の文字は出さない)。作者名は画像の説明(alt)に入れる", () => {
    render(<SubmissionCarousel pages={[[item("a"), item("b")]]} />);
    const works = screen.getAllByTestId("halloween-work");
    expect(works).toHaveLength(2);
    expect(within(works[0]).getByAltText("作者aさんの作品")).toBeTruthy();
    works.forEach((work) => expect(work.textContent).toBe(""));
  });

  test("1ページだけなら、矢印も点も出さない", () => {
    render(<SubmissionCarousel pages={pages(1)} />);
    expect(screen.queryByRole("button", { name: "次のページ" })).toBeNull();
  });

  test("矢印で1ページずつ移る(端では押しても動かない・フォーカスは落とさない)", () => {
    render(<SubmissionCarousel pages={pages(3)} />);
    const scrollTo = stubScroller(screen.getByTestId("halloween-works"));
    const prev = screen.getByRole("button", { name: "前のページ" });
    const next = screen.getByRole("button", { name: "次のページ" });
    expect(prev.getAttribute("aria-disabled")).toBe("true");
    expect(prev.hasAttribute("disabled")).toBe(false);

    fireEvent.click(prev);
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.click(next);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 300, behavior: "smooth" });
    fireEvent.click(next);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 600, behavior: "smooth" });
    expect(next.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(next);
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  test("スワイプ(横スクロール)したページに点が付いてくる", () => {
    render(<SubmissionCarousel pages={pages(3)} />);
    const scroller = screen.getByTestId("halloween-works");
    stubScroller(scroller);
    const dots = screen.getAllByRole("button", { name: /ページ目$/ });
    expect(dots).toHaveLength(3);
    expect(dots[0].getAttribute("aria-current")).toBe("true");

    scroller.scrollLeft = 610;
    fireEvent.scroll(scroller);
    expect(dots[2].getAttribute("aria-current")).toBe("true");
    expect(dots[0].getAttribute("aria-current")).toBeNull();
  });

  test("点を押すとそのページへ移る", () => {
    render(<SubmissionCarousel pages={pages(3)} />);
    const scrollTo = stubScroller(screen.getByTestId("halloween-works"));
    fireEvent.click(screen.getByRole("button", { name: "2ページ目" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 300, behavior: "smooth" });
  });

  test("ページが多いときは点の代わりに「1 / 12」と出す", () => {
    render(<SubmissionCarousel pages={pages(12)} />);
    expect(screen.queryAllByRole("button", { name: /ページ目$/ })).toHaveLength(0);
    expect(screen.getByText("1 / 12")).toBeTruthy();
  });

  test("サムネイルを押すと確認を出し、「作品を見る」で投稿のページへ", () => {
    render(<SubmissionCarousel pages={[[item("a")]]} />);
    const link = screen.getByRole("link", { name: /作者a/ });
    expect(link.getAttribute("href")).toBe("/posts/a");
    fireEvent.click(link);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("この作品のページへ移動しますか？")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "作品を見る" }));
    expect(routerPushMock).toHaveBeenCalledWith("/posts/a");
  });

  test("⌘クリックなどは確認を出さず、ブラウザ本来の動き(別タブ)に任せる", () => {
    render(<SubmissionCarousel pages={[[item("a")]]} />);
    fireEvent.click(screen.getByRole("link", { name: /作者a/ }), { metaKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("SubmissionCarousel: PC で横に並べる・マウスでドラッグする(2026-10-25 ユーザー指示)", () => {
  let resizeCallbacks: (() => void)[] = [];
  class FakeResizeObserver {
    constructor(callback: () => void) {
      resizeCallbacks.push(callback);
    }
    observe() {}
    disconnect() {}
  }

  beforeEach(() => {
    resizeCallbacks = [];
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
  });
  afterEach(() => {
    delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
  });

  /** 見えている幅と1ページの幅を決めて、測り直させる(2ページ並ぶ = 6列) */
  function showSideBySide(scroller: HTMLElement, visible: number, pageWidth = 300) {
    const scrollTo = stubScroller(scroller, pageWidth * visible);
    (scroller.firstElementChild as HTMLElement).getBoundingClientRect = () => ({ width: pageWidth }) as DOMRect;
    act(() => resizeCallbacks.forEach((callback) => callback()));
    return scrollTo;
  }

  function drag(scroller: HTMLElement, from: number, to: number, steps = 5) {
    fireEvent.mouseDown(scroller, { button: 0, clientX: from });
    for (let index = 1; index <= steps; index += 1) {
      fireEvent.mouseMove(window, { buttons: 1, clientX: from + ((to - from) * index) / steps });
    }
    fireEvent.mouseUp(window, { clientX: to });
  }

  test("⭐2ページ並んで見えるときは、点と矢印は「いちばん左に置けるページ」の数だけ(最後のページで余白を出さない)", () => {
    render(<SubmissionCarousel pages={pages(4)} />);
    const scroller = screen.getByTestId("halloween-works");
    const scrollTo = showSideBySide(scroller, 2);
    // 4ページを2ページずつ見るので、左に置けるのは1〜3ページ目
    expect(screen.getAllByRole("button", { name: /ページ目$/ })).toHaveLength(3);
    const next = screen.getByRole("button", { name: "次のページ" });
    fireEvent.click(next);
    fireEvent.click(next);
    // 1ページ(3列)ずつ進む
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 600, behavior: "smooth" });
    expect(next.getAttribute("aria-disabled")).toBe("true");
  });

  test("全部のページが一度に見えるなら、矢印も点も出さない(ドラッグもしない)", () => {
    render(<SubmissionCarousel pages={pages(2)} />);
    const scroller = screen.getByTestId("halloween-works");
    showSideBySide(scroller, 2);
    expect(screen.queryByRole("button", { name: "次のページ" })).toBeNull();
    expect(scroller.getAttribute("data-draggable")).toBeNull();
  });

  test("⭐マウスでドラッグすると手に付いてきて、離すと動かした向きのページに止まる", () => {
    render(<SubmissionCarousel pages={pages(3)} />);
    const scroller = screen.getByTestId("halloween-works");
    const scrollTo = stubScroller(scroller);
    expect(scroller.getAttribute("data-draggable")).toBe("true");

    fireEvent.mouseDown(scroller, { button: 0, clientX: 500 });
    fireEvent.mouseMove(window, { buttons: 1, clientX: 400 });
    // ドラッグのあいだはスナップを外して、動かした分だけ動く
    expect(scroller.getAttribute("data-dragging")).toBe("true");
    expect(scroller.scrollLeft).toBe(100);
    fireEvent.mouseUp(window, { clientX: 400 });

    expect(scrollTo).toHaveBeenLastCalledWith({ left: 300, behavior: "smooth" });
    // 移り終わったらスナップを戻す
    fireEvent(scroller, new Event("scrollend"));
    expect(scroller.getAttribute("data-dragging")).toBeNull();
    expect(screen.getAllByRole("button", { name: /ページ目$/ })[1].getAttribute("aria-current")).toBe("true");
  });

  test("少しのドラッグ(1ページの半分より短い)でも、決めた長さを動かせば1ページ進む。戻す向きなら前へ", () => {
    render(<SubmissionCarousel pages={pages(3)} />);
    const scroller = screen.getByTestId("halloween-works");
    const scrollTo = stubScroller(scroller);

    drag(scroller, 500, 500 - DRAG_PAGE_THRESHOLD_PX);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 300, behavior: "smooth" });

    drag(scroller, 500, 500 + DRAG_PAGE_THRESHOLD_PX);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "smooth" });
  });

  test("決めた長さに届かないドラッグは、元のページに戻る", () => {
    render(<SubmissionCarousel pages={pages(3)} />);
    const scroller = screen.getByTestId("halloween-works");
    const scrollTo = stubScroller(scroller);

    drag(scroller, 500, 500 - (DRAG_PAGE_THRESHOLD_PX - 1));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "smooth" });
  });

  test("⭐ドラッグしたあとのクリックでは作品を開かない。そのあと普通に押せば開く", () => {
    render(<SubmissionCarousel pages={pages(3)} />);
    const scroller = screen.getByTestId("halloween-works");
    stubScroller(scroller);
    const link = screen.getAllByRole("link")[0];

    drag(scroller, 500, 380);
    fireEvent.click(link);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(link);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  test("ほとんど動かしていなければ(手ぶれ)、ドラッグにせず作品を開く", () => {
    render(<SubmissionCarousel pages={pages(3)} />);
    const scroller = screen.getByTestId("halloween-works");
    const scrollTo = stubScroller(scroller);
    const link = screen.getAllByRole("link")[0];

    drag(scroller, 500, 500 - (DRAG_CLICK_TOLERANCE_PX - 1), 1);
    expect(scroller.getAttribute("data-dragging")).toBeNull();
    expect(scrollTo).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  test("離したのが届かなくても(メニューが開いた・窓の外で離した)、ボタンを離して動かしたら、そこでドラッグを終える", () => {
    render(<SubmissionCarousel pages={pages(3)} />);
    const scroller = screen.getByTestId("halloween-works");
    const scrollTo = stubScroller(scroller);

    fireEvent.mouseDown(scroller, { button: 0, clientX: 500 });
    fireEvent.mouseMove(window, { buttons: 1, clientX: 400 });
    // mouseup は届かず、ボタンを離したまま動かした
    fireEvent.mouseMove(window, { buttons: 0, clientX: 380 });
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 300, behavior: "smooth" });
    // そのあと動かしても付いてこない
    const left = scroller.scrollLeft;
    fireEvent.mouseMove(window, { buttons: 0, clientX: 100 });
    expect(scroller.scrollLeft).toBe(left);
  });

  test("外で離してクリックが届かなかったときも、次のクリックは止めない", () => {
    jest.useFakeTimers();
    try {
      render(<SubmissionCarousel pages={pages(3)} />);
      const scroller = screen.getByTestId("halloween-works");
      stubScroller(scroller);
      drag(scroller, 500, 380);
      // 離した直後のクリックが来なかった
      act(() => jest.advanceTimersByTime(0));
      fireEvent.click(screen.getAllByRole("link")[0]);
      expect(screen.getByRole("dialog")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  test("スナップを戻すのは、移り終わってから(先に戻すと近いほうのページへ引き戻される)", () => {
    jest.useFakeTimers();
    try {
      render(<SubmissionCarousel pages={pages(3)} />);
      const scroller = screen.getByTestId("halloween-works");
      stubScroller(scroller);
      drag(scroller, 500, 450);
      expect(scroller.getAttribute("data-dragging")).toBe("true");
      fireEvent(scroller, new Event("scrollend"));
      expect(scroller.getAttribute("data-dragging")).toBeNull();

      // scrollend が届かないブラウザでも、少し待てば戻す
      drag(scroller, 500, 450);
      expect(scroller.getAttribute("data-dragging")).toBe("true");
      act(() => jest.advanceTimersByTime(SNAP_RESTORE_FALLBACK_MS));
      expect(scroller.getAttribute("data-dragging")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test("幅が広がって置ける位置が減ったら、スクロールが起きなくても、はみ出さない位置として出す", () => {
    render(<SubmissionCarousel pages={pages(4)} />);
    const scroller = screen.getByTestId("halloween-works");
    stubScroller(scroller);
    const next = screen.getByRole("button", { name: "次のページ" });
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);
    // 4ページ目にいるときに、2ページ並ぶ幅になった(置けるのは3ページ目まで)
    showSideBySide(scroller, 2);
    const dots = screen.getAllByRole("button", { name: /ページ目$/ });
    expect(dots).toHaveLength(3);
    expect(dots[2].getAttribute("aria-current")).toBe("true");
    expect(next.getAttribute("aria-disabled")).toBe("true");
  });

  test("ページが多くて「○ / ○」で出すとき、並べて見えていれば見えている範囲をページの数で出す", () => {
    render(<SubmissionCarousel pages={pages(14)} />);
    const scroller = screen.getByTestId("halloween-works");
    showSideBySide(scroller, 3);
    expect(screen.getByText("1〜3 / 14")).toBeTruthy();
  });

  test("Mac の Control+クリック(メニューを開く)ではドラッグしない", () => {
    render(<SubmissionCarousel pages={pages(3)} />);
    const scroller = screen.getByTestId("halloween-works");
    stubScroller(scroller);
    fireEvent.mouseDown(scroller, { button: 0, ctrlKey: true, clientX: 500 });
    fireEvent.mouseMove(window, { buttons: 1, clientX: 300 });
    expect(scroller.scrollLeft).toBe(0);
  });

  test("左ボタン以外(右クリックなど)ではドラッグしない", () => {
    render(<SubmissionCarousel pages={pages(3)} />);
    const scroller = screen.getByTestId("halloween-works");
    const scrollTo = stubScroller(scroller);

    fireEvent.mouseDown(scroller, { button: 2, clientX: 500 });
    fireEvent.mouseMove(window, { buttons: 1, clientX: 300 });
    fireEvent.mouseUp(window, { clientX: 300 });
    expect(scroller.scrollLeft).toBe(0);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
