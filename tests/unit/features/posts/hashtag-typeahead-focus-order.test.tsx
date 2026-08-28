/** @jest-environment jsdom */

import { render, screen, fireEvent, act } from "@testing-library/react";
import { HashtagHighlightTextarea } from "@/features/posts/components/HashtagHighlightTextarea";
import {
  SearchAvailabilityProvider,
  SearchAvailabilityUpgrade,
} from "@/features/posts/components/SearchAvailabilityProvider";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

/**
 * 実ブラウザの順序（入力欄にフォーカス → 候補表示 → 候補を押す）を通す。
 *
 * 候補を押すと入力欄の blur が先に走る経路があり、そこでカーソル位置を捨てると
 * 候補ごと消えて「押しても何も入らない」になる。ボタンへ直接 click するだけの
 * テストではこの順序を再現できない。
 */
describe("入力中候補のフォーカス順序", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hashtags: [{ name: "冬服", post_count: 5 }] }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test("blur が先に走っても候補を押せば挿入される", async () => {
    const onChange = jest.fn();

    render(
      <SearchAvailabilityProvider>
        <HashtagHighlightTextarea value="今日は #冬" onChange={onChange} />
        <SearchAvailabilityUpgrade />
      </SearchAvailabilityProvider>
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    act(() => {
      textarea.focus();
      textarea.setSelectionRange(6, 6);
      fireEvent.select(textarea);
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    const chip = await screen.findByRole("button", { name: /#冬服/ });

    // 実ブラウザでは押した瞬間に入力欄が blur する場合がある
    fireEvent.blur(textarea, { relatedTarget: chip });
    fireEvent.click(chip);

    expect(onChange).toHaveBeenCalledWith("今日は #冬服");
  });

  test("入力欄の外へフォーカスが移ったら候補を閉じる", async () => {
    render(
      <SearchAvailabilityProvider>
        <HashtagHighlightTextarea value="今日は #冬" onChange={jest.fn()} />
        <button type="button">別の場所</button>
        <SearchAvailabilityUpgrade />
      </SearchAvailabilityProvider>
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    act(() => {
      textarea.setSelectionRange(6, 6);
      fireEvent.select(textarea);
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await screen.findByRole("button", { name: /#冬服/ });

    fireEvent.blur(textarea, {
      relatedTarget: screen.getByRole("button", { name: "別の場所" }),
    });

    expect(
      screen.queryByRole("button", { name: /#冬服/ })
    ).not.toBeInTheDocument();
  });
});
