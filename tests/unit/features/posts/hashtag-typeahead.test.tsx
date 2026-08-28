/** @jest-environment jsdom */

import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { HashtagTypeahead } from "@/features/posts/components/HashtagTypeahead";
import {
  SearchAvailabilityProvider,
  SearchAvailabilityUpgrade,
} from "@/features/posts/components/SearchAvailabilityProvider";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({ hashtagPopularLabel: "よく使われています" })[key] ?? key,
}));

function mockMatches(items: Array<{ name: string; post_count: number }>) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ hashtags: items }),
  }) as unknown as typeof fetch;
}

function renderTypeahead({
  value,
  caret,
  composing = false,
  available = true,
  onSelect = jest.fn(),
}: {
  value: string;
  caret: number | null;
  composing?: boolean;
  available?: boolean;
  onSelect?: (next: string) => void;
}) {
  return render(
    <SearchAvailabilityProvider>
      <HashtagTypeahead
        value={value}
        caret={caret}
        composing={composing}
        onSelect={onSelect}
      />
      {available ? <SearchAvailabilityUpgrade /> : null}
    </SearchAvailabilityProvider>
  );
}

describe("HashtagTypeahead", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockMatches([{ name: "冬服", post_count: 12 }]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** debounce を進めて fetch を解決させる。 */
  async function flush() {
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
  }

  test("打ちかけのタグに対して既存タグを出す", async () => {
    renderTypeahead({ value: "今日は #冬", caret: 6 });
    await flush();

    expect(
      await screen.findByRole("button", { name: /#冬服/ })
    ).toBeInTheDocument();
  });

  test("押すと打ちかけの部分が置き換わる", async () => {
    const onSelect = jest.fn();
    renderTypeahead({ value: "今日は #冬", caret: 6, onSelect });
    await flush();

    fireEvent.click(await screen.findByRole("button", { name: /#冬服/ }));

    expect(onSelect).toHaveBeenCalledWith("今日は #冬服");
  });

  test("後ろに文字が続く場合は空白で区切る", async () => {
    const onSelect = jest.fn();
    // 「#冬」まで打った位置にカーソル。後ろに「 です」ではなく「です」がある想定
    renderTypeahead({ value: "#冬です", caret: 2, onSelect });
    await flush();

    fireEvent.click(await screen.findByRole("button", { name: /#冬服/ }));

    expect(onSelect).toHaveBeenCalledWith("#冬服 です");
  });

  test("IME 変換中は出さない（変換候補と二重になるため）", async () => {
    renderTypeahead({ value: "今日は #冬", caret: 6, composing: true });
    await flush();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("段階公開中は出さない", async () => {
    renderTypeahead({ value: "今日は #冬", caret: 6, available: false });
    await flush();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("カーソルがタグの外なら出さない", async () => {
    renderTypeahead({ value: "#冬服 です", caret: 8 });
    await flush();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("打った文字と同じタグだけなら出さない（選ぶ意味がない）", async () => {
    mockMatches([{ name: "冬", post_count: 3 }]);
    renderTypeahead({ value: "#冬", caret: 2 });
    await flush();

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });


  test("押しても入力欄のフォーカスを奪わない", async () => {
    // blur が先に走ると候補ごと消えて、タップしても何も入らない
    renderTypeahead({ value: "今日は #冬", caret: 6 });
    await flush();

    const chip = await screen.findByRole("button", { name: /#冬服/ });
    const notCancelled = fireEvent.mouseDown(chip);

    expect(notCancelled).toBe(false);
  });

  test("非BMP文字のタグでも候補を出す", async () => {
    mockMatches([{ name: "𠮷野家", post_count: 2 }]);
    const text = "#\u{20BB7}";
    renderTypeahead({ value: text, caret: text.length });
    await flush();

    expect(
      await screen.findByRole("button", { name: /#𠮷野家/ })
    ).toBeInTheDocument();
  });
});
