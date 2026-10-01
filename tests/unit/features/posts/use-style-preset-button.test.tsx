/**
 * ホームの引用元カード(Persta ORIGINAL)の「このカタログで生成する」(カタログ刷新後)。
 *
 * ここが誤ると (a) ログイン中の人にログインの案内が出る、(b) 未開放・会期終了の
 * スタイルでシートが開いて生成で弾かれる、(c) 押しても何も起きない、が起きる。
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UseStylePresetButton } from "@/features/posts/components/UseStylePresetButton";

const pushMock = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const Sheet = (props: {
      preset: { id: string };
      subscriptionPlan: string;
      isGuest?: boolean;
    }) => (
      <div
        data-testid="style-generation-sheet"
        data-preset={props.preset.id}
        data-plan={props.subscriptionPlan}
        data-guest={String(props.isGuest ?? false)}
      />
    );
    return Sheet;
  },
}));

jest.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: ({ open }: { open: boolean }) => (open ? <div data-testid="auth-modal" /> : null),
}));

const PRESET = {
  id: "preset-1",
  slug: "summer-marine",
  title: "夏のマリンコーデ",
  category: { unlockPrerequisiteKey: null, sequentialUnlock: false },
};

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function mockFetch(handlers: Record<string, () => Response>) {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const handler = Object.entries(handlers).find(([path]) => url.includes(path))?.[1];
    if (!handler) throw new Error(`unexpected fetch: ${url}`);
    return handler();
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderButton(props: Partial<React.ComponentProps<typeof UseStylePresetButton>> = {}) {
  return render(
    <UseStylePresetButton
      presetId="preset-1"
      slug="summer-marine"
      currentUserId="viewer-1"
      isViewerResolved
      {...props}
    />
  );
}

describe("UseStylePresetButton", () => {
  beforeEach(() => jest.clearAllMocks());

  test("文言は「このカタログで生成する」", () => {
    renderButton();
    expect(screen.getByText("posts.feedUseCatalog")).toBeTruthy();
  });

  /*
    未ログインは、ログインなしで生成できるカテゴリ(コーディネート系)のときだけシートを開く
    (2026-10-01 ユーザー決定。/style の未ログインと同じ範囲)。それ以外はログインの案内。
  */
  describe("未ログイン", () => {
    test("ログインなしで生成できるカテゴリなら、未ログインのシートを開く(購読プランは引かない)", async () => {
      const fetchMock = mockFetch({
        "/api/style-presets/preset-1/summary": () =>
          jsonResponse({
            preset: { ...PRESET, category: { ...PRESET.category, allowGuestGeneration: true } },
          }),
      });
      renderButton({ currentUserId: null });

      fireEvent.click(screen.getByTestId("feed-use-style-button"));

      const sheet = await screen.findByTestId("style-generation-sheet");
      expect(sheet.getAttribute("data-guest")).toBe("true");
      expect(sheet.getAttribute("data-plan")).toBe("free");
      expect(screen.queryByTestId("auth-modal")).toBeNull();
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes("subscription-plan"))
      ).toBe(false);
    });

    test("ログインが要るカテゴリなら、ログインの案内を出す", async () => {
      mockFetch({
        "/api/style-presets/preset-1/summary": () =>
          jsonResponse({
            preset: { ...PRESET, category: { ...PRESET.category, allowGuestGeneration: false } },
          }),
      });
      renderButton({ currentUserId: null });

      fireEvent.click(screen.getByTestId("feed-use-style-button"));

      expect(await screen.findByTestId("auth-modal")).toBeTruthy();
      expect(screen.queryByTestId("style-generation-sheet")).toBeNull();
    });

    test("段階解放のカテゴリは、ログインなしで生成できても開放を確かめられないのでログインの案内", async () => {
      mockFetch({
        "/api/style-presets/preset-1/summary": () =>
          jsonResponse({
            preset: {
              ...PRESET,
              category: {
                unlockPrerequisiteKey: "collection-a",
                sequentialUnlock: false,
                allowGuestGeneration: true,
              },
            },
          }),
      });
      renderButton({ currentUserId: null });

      fireEvent.click(screen.getByTestId("feed-use-style-button"));

      expect(await screen.findByTestId("auth-modal")).toBeTruthy();
    });

    test("スタイルが取れなければ、ログインの案内を出す", async () => {
      mockFetch({
        "/api/style-presets/preset-1/summary": () => jsonResponse({}, 404),
      });
      renderButton({ currentUserId: null });

      fireEvent.click(screen.getByTestId("feed-use-style-button"));

      expect(await screen.findByTestId("auth-modal")).toBeTruthy();
    });
  });

  test("⭐見ている人が確定する前は何もしない(ログイン中の人にログインの案内を出さない)", () => {
    const fetchMock = mockFetch({});
    renderButton({ currentUserId: null, isViewerResolved: false });

    fireEvent.click(screen.getByTestId("feed-use-style-button"));

    expect(screen.queryByTestId("auth-modal")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("ログイン中は、スタイルと購読プランを取ってシートを開く", async () => {
    mockFetch({
      "/api/style-presets/preset-1/summary": () => jsonResponse({ preset: PRESET }),
      "/api/users/me/subscription-plan": () => jsonResponse({ plan: "light" }),
    });
    renderButton();

    fireEvent.click(screen.getByTestId("feed-use-style-button"));

    const sheet = await screen.findByTestId("style-generation-sheet");
    expect(sheet.getAttribute("data-preset")).toBe("preset-1");
    expect(sheet.getAttribute("data-plan")).toBe("light");
    expect(pushMock).not.toHaveBeenCalled();
  });

  test("購読プランが取れなくても、無料プランでシートを開く", async () => {
    mockFetch({
      "/api/style-presets/preset-1/summary": () => jsonResponse({ preset: PRESET }),
      "/api/users/me/subscription-plan": () => jsonResponse({}, 500),
    });
    renderButton();

    fireEvent.click(screen.getByTestId("feed-use-style-button"));

    expect((await screen.findByTestId("style-generation-sheet")).getAttribute("data-plan")).toBe(
      "free"
    );
  });

  test("スタイルが取れない(非公開になった等)ときは、紹介ページへ移る", async () => {
    mockFetch({ "/api/style-presets/preset-1/summary": () => jsonResponse({}, 404) });
    renderButton();

    fireEvent.click(screen.getByTestId("feed-use-style-button"));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/styles/summer-marine"));
    expect(screen.queryByTestId("style-generation-sheet")).toBeNull();
  });

  test.each([["locked"], ["ended"], ["unknown"]])(
    "段階解放のスタイルが %s なら、シートを開かず紹介ページへ移る(理由はページが伝える)",
    async (status) => {
      mockFetch({
        "/api/style-presets/preset-1/summary": () =>
          jsonResponse({
            preset: { ...PRESET, category: { unlockPrerequisiteKey: "prev", sequentialUnlock: false } },
          }),
        "/api/style-presets/preset-1/unlock-status": () => jsonResponse({ status }),
      });
      renderButton();

      fireEvent.click(screen.getByTestId("feed-use-style-button"));

      await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/styles/summer-marine"));
      expect(screen.queryByTestId("style-generation-sheet")).toBeNull();
    }
  );

  test("段階解放のスタイルでも、開放済みならシートを開く", async () => {
    mockFetch({
      "/api/style-presets/preset-1/summary": () =>
        jsonResponse({
          preset: { ...PRESET, category: { unlockPrerequisiteKey: null, sequentialUnlock: true } },
        }),
      "/api/style-presets/preset-1/unlock-status": () => jsonResponse({ status: "unlocked" }),
      "/api/users/me/subscription-plan": () => jsonResponse({ plan: "free" }),
    });
    renderButton();

    fireEvent.click(screen.getByTestId("feed-use-style-button"));

    expect(await screen.findByTestId("style-generation-sheet")).toBeTruthy();
  });
});
