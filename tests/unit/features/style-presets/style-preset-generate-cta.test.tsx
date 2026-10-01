/**
 * スタイル紹介ページの「このスタイルで作る」ボタンのテスト。
 *
 * ここが誤ると (a) 未開放なのに押せて、生成画面で黙って別のスタイルに
 * 差し替わる、(b) ゲートの無いスタイルでも毎回問い合わせて遅くなる、
 * (c) 判定できないときに使えるスタイルを止める、のいずれかが起きる。
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StylePresetGenerateCta } from "@/features/style-presets/components/StylePresetGenerateCta";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...props }, children),
}));

const mockRevamp = jest.fn(() => false);
jest.mock("@/features/style-presets/hooks/useStylesCatalogRevamp", () => ({
  useStylesCatalogRevamp: () => mockRevamp(),
}));

const openSheetMock = jest.fn(async () => {});
const sheetParams = jest.fn();
jest.mock("@/features/style/hooks/useStylePresetGenerationSheet", () => ({
  useStylePresetGenerationSheet: (params: unknown) => {
    sheetParams(params);
    return { open: openSheetMock, isWorking: false, overlays: null };
  },
}));

const mockGetUser = jest.fn();
jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: () => mockGetUser() } }),
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

/*
  カタログ刷新後(公開前は運営だけ)は /style を使わない。/style へ飛ばすと
  このページへ戻されて押しても何も起きないので、その場で生成シートを開く。
*/
describe("StylePresetGenerateCta(カタログ刷新後)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRevamp.mockReturnValue(true);
    mockGetUser.mockResolvedValue({ data: { user: { id: "viewer-1" } } });
  });
  afterAll(() => mockRevamp.mockReturnValue(false));

  test("/style へのリンクではなく、押すとその場で生成シートを開く", async () => {
    mockFetch({ status: "unlocked" });

    render(<StylePresetGenerateCta {...baseProps} isGatedCategory={false} />);

    const button = screen.getByTestId("style-preset-cta");
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("href")).toBeNull();

    await waitFor(() =>
      expect(sheetParams).toHaveBeenLastCalledWith(
        expect.objectContaining({
          presetId: "preset-1",
          currentUserId: "viewer-1",
          isViewerResolved: true,
        })
      )
    );
    fireEvent.click(button);
    expect(openSheetMock).toHaveBeenCalledTimes(1);
  });

  test("未ログインも閲覧者が確定してからシートの判定に任せる", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    render(<StylePresetGenerateCta {...baseProps} isGatedCategory={false} />);

    await waitFor(() =>
      expect(sheetParams).toHaveBeenLastCalledWith(
        expect.objectContaining({ currentUserId: null, isViewerResolved: true })
      )
    );
  });
});
