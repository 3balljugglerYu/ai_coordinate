/**
 * @jest-environment jsdom
 */

/**
 * 「キャンペーン対象の投稿」(2026-10-15 ユーザー決定)。
 * 3列 × 2段の6件を1ページにし、左右のスワイプ(と矢印・点)で6件単位に移る。
 * カードはサムネイルだけ(作者名・利用回数は出さない)。
 * サムネイルを押すと /use-prompts と同じ確認を出してから投稿のページへ。
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SubmissionCarousel } from "@/features/campaigns/halloween/components/SubmissionCarousel";

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
    Array.from({ length: 6 }, (_, index) => item(`p${pageIndex}-${index}`)),
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
    expect(screen.queryByRole("button", { name: "次の6件" })).toBeNull();
  });

  test("矢印で6件ずつ移る(端では押しても動かない・フォーカスは落とさない)", () => {
    render(<SubmissionCarousel pages={pages(3)} />);
    const scrollTo = stubScroller(screen.getByTestId("halloween-works"));
    const prev = screen.getByRole("button", { name: "前の6件" });
    const next = screen.getByRole("button", { name: "次の6件" });
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
