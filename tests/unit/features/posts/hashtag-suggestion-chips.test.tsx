/** @jest-environment jsdom */

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import {
  appendHashtag,
  HashtagSuggestionChips,
} from "@/features/posts/components/HashtagSuggestionChips";
import {
  SearchAvailabilityProvider,
  SearchAvailabilityUpgrade,
} from "@/features/posts/components/SearchAvailabilityProvider";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({ hashtagSuggestionsLabel: "タグ候補" })[key] ?? key,
}));

function mockSuggestions(names: string[]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      suggestions: names.map((name) => ({ name, source: "category" })),
    }),
  }) as unknown as typeof fetch;
}

function renderChips({
  available,
  caption = "",
  onInsert = jest.fn(),
}: {
  available: boolean;
  caption?: string;
  onInsert?: (caption: string) => void;
}) {
  return render(
    <SearchAvailabilityProvider>
      <HashtagSuggestionChips
        imageId="11111111-1111-1111-1111-111111111111"
        caption={caption}
        onInsert={onInsert}
        maxLength={200}
      />
      {available ? <SearchAvailabilityUpgrade /> : null}
    </SearchAvailabilityProvider>
  );
}

describe("HashtagSuggestionChips", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSuggestions(["うちの子のオーストラリア旅行", "豪州旅行"]);
  });

  test("候補を押すと説明文の末尾に入る", async () => {
    const onInsert = jest.fn();
    renderChips({ available: true, caption: "今日の一枚", onInsert });

    const chip = await screen.findByRole("button", {
      name: "#うちの子のオーストラリア旅行",
    });
    fireEvent.click(chip);

    expect(onInsert).toHaveBeenCalledWith(
      "今日の一枚 #うちの子のオーストラリア旅行"
    );
  });

  test("既に入っているタグは候補に出さない", async () => {
    renderChips({ available: true, caption: "#豪州旅行 の記録" });

    await screen.findByRole("button", { name: "#うちの子のオーストラリア旅行" });
    expect(
      screen.queryByRole("button", { name: "#豪州旅行" })
    ).not.toBeInTheDocument();
  });

  test("段階公開中は候補を取りに行かない", async () => {
    renderChips({ available: false });

    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled();
    });
    expect(screen.queryByText("タグ候補")).not.toBeInTheDocument();
  });

  test("取得に失敗しても何も出さない（投稿は妨げない）", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("network")) as unknown as typeof fetch;

    renderChips({ available: true });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    expect(screen.queryByText("タグ候補")).not.toBeInTheDocument();
  });
});

describe("appendHashtag", () => {
  test("直前に区切りを入れる", () => {
    // 区切りが無いと `おでかけ#冬服` となり、タグとして成立しない
    expect(appendHashtag("おでかけ", "冬服", 200)).toBe("おでかけ #冬服");
  });

  test("空の説明文にはタグだけ入れる", () => {
    expect(appendHashtag("", "冬服", 200)).toBe("#冬服");
  });

  test("改行して次の行に入れられる（書いた文章を削らない）", () => {
    // 以前は末尾を trim していたため、改行ごと消えて前の行に付いていた
    expect(appendHashtag("今日のコーデ\n", "冬服", 200)).toBe(
      "今日のコーデ\n#冬服"
    );
  });

  test("空行を空けた書き方も保つ", () => {
    expect(appendHashtag("本文\n\n", "冬服", 200)).toBe("本文\n\n#冬服");
  });

  test("末尾が空白なら区切りを増やさない", () => {
    expect(appendHashtag("おでかけ ", "冬服", 200)).toBe("おでかけ #冬服");
  });

  test("上限を超えるなら何もしない", () => {
    const caption = "あ".repeat(198);
    expect(appendHashtag(caption, "冬服", 200)).toBe(caption);
  });
});
