/**
 * スタイル紹介ページの「このスタイルで作る」ボタンのテスト。
 *
 * ここが誤ると (a) 未開放なのに押せて、生成画面で黙って別のスタイルに
 * 差し替わる、(b) ゲートの無いスタイルでも毎回問い合わせて遅くなる、
 * (c) 判定できないときに使えるスタイルを止める、のいずれかが起きる。
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { StylePresetGenerateCta } from "@/features/style-presets/components/StylePresetGenerateCta";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...props }, children),
}));

function mockFetch(body: unknown, ok = true) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const baseProps = {
  presetId: "preset-1",
  href: "/ja/style?style=preset-1",
  label: "このスタイルで作る",
};

describe("StylePresetGenerateCta", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("ゲートの無いカテゴリでは問い合わせず、そのまま押せる", () => {
    const fetchMock = mockFetch({ status: "unlocked" });

    render(<StylePresetGenerateCta {...baseProps} isGatedCategory={false} />);

    expect(screen.getByTestId("style-preset-cta")).toHaveAttribute(
      "href",
      "/ja/style?style=preset-1"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("未開放なら押せない状態にして理由を出す", async () => {
    mockFetch({ status: "locked", reason: "sequential" });

    render(<StylePresetGenerateCta {...baseProps} isGatedCategory />);

    await waitFor(() => {
      expect(screen.getByTestId("style-preset-cta-locked")).toBeInTheDocument();
    });
    // 押して生成画面へ飛ばさない
    expect(screen.queryByTestId("style-preset-cta")).not.toBeInTheDocument();
    expect(screen.getByText("presetLockedSequentialDescription")).toBeInTheDocument();
  });

  test("前提カテゴリ制なら別の理由を出す", async () => {
    mockFetch({ status: "locked", reason: "prerequisite" });

    render(<StylePresetGenerateCta {...baseProps} isGatedCategory />);

    await waitFor(() => {
      expect(
        screen.getByText("presetLockedPrerequisiteDescription")
      ).toBeInTheDocument();
    });
  });

  test("開放済みなら押せる", async () => {
    const fetchMock = mockFetch({ status: "unlocked" });

    render(<StylePresetGenerateCta {...baseProps} isGatedCategory />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("style-preset-cta")).toBeInTheDocument();
  });

  test("unknown(未ログイン・未公開)なら止めない", async () => {
    const fetchMock = mockFetch({ status: "unknown" });

    render(<StylePresetGenerateCta {...baseProps} isGatedCategory />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("style-preset-cta")).toBeInTheDocument();
  });

  test("問い合わせに失敗しても止めない(生成側の判定に委ねる)", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;

    render(<StylePresetGenerateCta {...baseProps} isGatedCategory />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId("style-preset-cta")).toBeInTheDocument();
    errorSpy.mockRestore();
  });
});
