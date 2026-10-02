/** @jest-environment jsdom */

/**
 * 生成シートを開く処理(ホームの棚・詳細・紹介ページで共有)。
 *
 * ホームのカルーセルで「押しても何も起きない」と感じて何度も押される問題があった
 * (2026-10-02 ユーザー指摘)。押したカードに読み込み中を出し、待ちそのものも減らす。
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { useStylePresetGenerationSheet } from "@/features/style/hooks/useStylePresetGenerationSheet";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/ja",
  useRouter: () => ({ push: pushMock }),
}));
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => () => null,
}));
jest.mock("@/features/style/components/StyleGenerationSheet", () => ({
  StyleGenerationSheet: () => null,
}));
jest.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: () => null,
}));

const PRESET = {
  id: "preset-1",
  slug: "summer-marine",
  title: "夏のマリンコーデ",
  category: {
    sequentialUnlock: false,
    unlockPrerequisiteKey: null,
    allowGuestGeneration: true,
  },
} as unknown as StylePresetPublicSummary;

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

let fetchMock: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/subscription-plan")) return jsonResponse({ plan: "premium" });
    if (url.includes("/summary")) return jsonResponse({ preset: PRESET });
    throw new Error(`unexpected fetch: ${url}`);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

function callsTo(path: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes(path));
}

describe("useStylePresetGenerationSheet", () => {
  test("呼び出し側がスタイルを持っていれば、問い合わせずにシートを開く", async () => {
    const { result } = renderHook(() =>
      useStylePresetGenerationSheet({ currentUserId: "viewer-1", isViewerResolved: true })
    );

    await act(async () => {
      await result.current.open({ presetId: "preset-1", slug: "summer-marine", preset: PRESET });
    });

    expect(callsTo("/summary")).toHaveLength(0);
    expect(result.current.isOpen).toBe(true);
  });

  test("準備している間は、押したスタイルを workingPresetId で示し、終われば消す", async () => {
    let resolvePlan: (value: Response) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (resolvePlan = resolve))
    );
    const { result } = renderHook(() =>
      useStylePresetGenerationSheet({ currentUserId: "viewer-1", isViewerResolved: true })
    );

    let opening: Promise<void> = Promise.resolve();
    act(() => {
      opening = result.current.open({ presetId: "preset-1", preset: PRESET });
    });
    expect(result.current.workingPresetId).toBe("preset-1");
    expect(result.current.isWorking).toBe(true);

    await act(async () => {
      resolvePlan(jsonResponse({ plan: "free" }));
      await opening;
    });
    expect(result.current.workingPresetId).toBeNull();
    expect(result.current.isOpen).toBe(true);
  });

  test("準備している間にもう一度押しても、二重に開かない", async () => {
    let resolvePlan: (value: Response) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (resolvePlan = resolve))
    );
    const { result } = renderHook(() =>
      useStylePresetGenerationSheet({ currentUserId: "viewer-1", isViewerResolved: true })
    );

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.open({ presetId: "preset-1", preset: PRESET });
      // 同じ描画のうちの2回目(state はまだ変わっていない)
      void result.current.open({ presetId: "preset-2", preset: PRESET });
    });
    expect(result.current.workingPresetId).toBe("preset-1");

    await act(async () => {
      resolvePlan(jsonResponse({ plan: "free" }));
      await first;
    });
    expect(callsTo("/subscription-plan")).toHaveLength(1);
  });

  test("prefetch: 閲覧者が分かった時点で料金プランを取り、押したときは取り直さない", async () => {
    const { result } = renderHook(() =>
      useStylePresetGenerationSheet({
        currentUserId: "viewer-1",
        isViewerResolved: true,
        prefetch: true,
      })
    );
    await waitFor(() => expect(callsTo("/subscription-plan")).toHaveLength(1));

    await act(async () => {
      await result.current.open({ presetId: "preset-1", preset: PRESET });
    });

    expect(callsTo("/subscription-plan")).toHaveLength(1);
    expect(result.current.isOpen).toBe(true);
  });

  test("prefetch なしでは、押すまで問い合わせない", async () => {
    renderHook(() =>
      useStylePresetGenerationSheet({ currentUserId: "viewer-1", isViewerResolved: true })
    );
    await act(async () => {});

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("料金プランが取れなかった結果は覚えず、次に押したときに取り直す", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    const { result } = renderHook(() =>
      useStylePresetGenerationSheet({ currentUserId: "viewer-1", isViewerResolved: true })
    );

    await act(async () => {
      await result.current.open({ presetId: "preset-1", preset: PRESET });
    });
    expect(result.current.isOpen).toBe(true);

    await act(async () => {
      await result.current.open({ presetId: "preset-1", preset: PRESET });
    });
    expect(callsTo("/subscription-plan")).toHaveLength(2);
  });

  test("未ログインでも、渡されたスタイルでログインなしの判定をする(問い合わせない)", async () => {
    const { result } = renderHook(() =>
      useStylePresetGenerationSheet({ currentUserId: null, isViewerResolved: true })
    );

    await act(async () => {
      await result.current.open({ presetId: "preset-1", preset: PRESET });
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(true);
  });
});
