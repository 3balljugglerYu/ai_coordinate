/**
 * 企画の贈り物を出す部品。期間中・出すページ・受け取っていない・この端末で閉じていないときだけ出す。
 */

import { act, render, screen } from "@testing-library/react";

const mockAuth = jest.fn();
const mockCampaignOpen = jest.fn(() => true);
const mockPathname = jest.fn(() => "/ja");
const mockRefresh = jest.fn();

jest.mock("@/features/auth/hooks/use-auth-user", () => ({ useAuthUser: () => mockAuth() }));
jest.mock("@/features/campaigns/halloween/hooks/useHalloweenCampaignOpen", () => ({
  useHalloweenCampaignOpen: () => mockCampaignOpen(),
}));
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ refresh: mockRefresh }),
}));
jest.mock("@/features/campaigns/lib/campaign-events", () => ({
  CAMPAIGN_EVENTS: { giftView: "campaign_gift_view" },
  trackCampaignEvent: jest.fn(),
}));
jest.mock("@/features/campaigns/campaign-gift/components/CampaignGiftModal", () => ({
  CampaignGiftModal: ({
    open,
    signedIn,
    onClose,
    onClaimed,
    onClaim,
  }: {
    open: boolean;
    signedIn: boolean;
    onClose: (kind: "done" | "later" | "retry") => void;
    onClaimed?: () => void;
    onClaim?: () => Promise<{ status: string }>;
  }) =>
    open ? (
      <div role="dialog" data-testid="gift" data-signed-in={String(signedIn)}>
        <button
          type="button"
          onClick={() => {
            void onClaim?.().then((result) => {
              document.body.setAttribute("data-claim-result", result.status);
            });
          }}
        >
          受け取る
        </button>
        <button type="button" onClick={() => onClaimed?.()}>
          受け取った
        </button>
        <button type="button" onClick={() => onClose("done")}>
          閉じる
        </button>
        <button type="button" onClick={() => onClose("later")}>
          あとで
        </button>
        <button type="button" onClick={() => onClose("retry")}>
          受け取れずに閉じる
        </button>
      </div>
    ) : null,
}));

import { __resetCampaignGiftQuietForTest, CampaignGiftHost } from "@/features/campaigns/campaign-gift/components/CampaignGiftHost";
import { __resetCampaignGiftLaterForTest } from "@/features/campaigns/campaign-gift/campaign-gift";

const fetchMock = jest.fn();

function statusResponse(body: object) {
  return Promise.resolve({ ok: true, json: async () => body } as Response);
}

beforeEach(() => {
  __resetCampaignGiftQuietForTest();
  __resetCampaignGiftLaterForTest();
  jest.useFakeTimers();
  window.localStorage.clear();
  window.sessionStorage.clear();
  mockAuth.mockReturnValue({ status: "signed-in", user: { id: "user-1" } });
  mockCampaignOpen.mockReturnValue(true);
  mockPathname.mockReturnValue("/ja");
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    statusResponse({ open: true, claimed: false, signedIn: true, amount: 200, expireAt: "2026-10-31T14:59:00.000Z" }),
  );
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

/** 受け取れるかの返事(fetch → json)が届いてから、出すまでの待ちを進める */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    jest.advanceTimersByTime(1000);
  });
}

test("受け取っていない人には、少し待ってから出す", async () => {
  render(<CampaignGiftHost />);
  await settle();
  expect(fetchMock).toHaveBeenCalledWith("/api/campaign-gifts/halloween-best-shot", { cache: "no-store" });
  expect(screen.getByTestId("gift")).toBeInTheDocument();
});

test("閉じたら、この端末ではもう出さない", async () => {
  const { unmount } = render(<CampaignGiftHost />);
  await settle();
  act(() => {
    screen.getByText("閉じる").click();
  });
  expect(window.localStorage.getItem("campaign-gift-dismissed:halloween-best-shot:user-1")).toBe("1");
  unmount();
  fetchMock.mockClear();
  render(<CampaignGiftHost />);
  await settle();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.queryByTestId("gift")).toBeNull();
});

test("ほかの端末で受け取っていたら出さず、もう聞きに行かない", async () => {
  fetchMock.mockImplementation(() => statusResponse({ open: true, claimed: true, signedIn: true, amount: 200, expireAt: null }));
  render(<CampaignGiftHost />);
  await settle();
  expect(screen.queryByTestId("gift")).toBeNull();
  expect(window.localStorage.getItem("campaign-gift-dismissed:halloween-best-shot:user-1")).toBe("1");
});

test("受け付けの期間の外なら出さない", async () => {
  fetchMock.mockImplementation(() => statusResponse({ open: false, claimed: false, signedIn: true, amount: 200, expireAt: null }));
  render(<CampaignGiftHost />);
  await settle();
  expect(screen.queryByTestId("gift")).toBeNull();
});

test.each(["/ja/login", "/ja/admin", "/auth/x-complete", "/ja/credits/purchase"])("%s では聞きに行かない", async (path) => {
  mockPathname.mockReturnValue(path);
  render(<CampaignGiftHost />);
  await settle();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("企画の期間の外・日本語でない画面では聞きに行かない", async () => {
  mockCampaignOpen.mockReturnValue(false);
  render(<CampaignGiftHost />);
  await settle();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("ログインの状態が分かるまでは聞きに行かない", async () => {
  mockAuth.mockReturnValue({ status: "loading", user: null });
  render(<CampaignGiftHost />);
  await settle();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("ログインしていない人にも出す", async () => {
  mockAuth.mockReturnValue({ status: "signed-out", user: null });
  fetchMock.mockImplementation(() => statusResponse({ open: true, claimed: false, signedIn: false, amount: 200, expireAt: null }));
  render(<CampaignGiftHost />);
  await settle();
  expect(screen.getByTestId("gift")).toHaveAttribute("data-signed-in", "false");
});

test("ほかのモーダルが出ている間は待ち、閉じたら出す", async () => {
  const other = document.createElement("div");
  other.setAttribute("role", "dialog");
  document.body.appendChild(other);
  render(<CampaignGiftHost />);
  await settle();
  expect(screen.queryByTestId("gift")).toBeNull();
  other.remove();
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  expect(screen.getByTestId("gift")).toBeInTheDocument();
});

test("チュートリアルの途中は待つ", async () => {
  window.sessionStorage.setItem("tutorial_in_progress", "true");
  render(<CampaignGiftHost />);
  await settle();
  expect(screen.queryByTestId("gift")).toBeNull();
});

test("受け取れずに閉じたら覚えず、同じページでは出し直さず、別のページを開いたら出す", async () => {
  const { rerender } = render(<CampaignGiftHost />);
  await settle();
  act(() => {
    screen.getByText("受け取れずに閉じる").click();
  });
  expect(window.localStorage.getItem("campaign-gift-dismissed:halloween-best-shot:user-1")).toBeNull();
  await settle();
  expect(screen.queryByTestId("gift")).toBeNull();
  mockPathname.mockReturnValue("/ja/style");
  rerender(<CampaignGiftHost />);
  await settle();
  expect(screen.getByTestId("gift")).toBeInTheDocument();
});

test("ログインしていない人の画面が開いている間にログインしたら、その人の状態で聞き直して出し直す", async () => {
  mockAuth.mockReturnValue({ status: "signed-out", user: null });
  fetchMock.mockImplementation(() => statusResponse({ open: true, claimed: false, signedIn: false, amount: 200, expireAt: null }));
  const { rerender } = render(<CampaignGiftHost />);
  await settle();
  expect(screen.getByTestId("gift")).toHaveAttribute("data-signed-in", "false");
  mockAuth.mockReturnValue({ status: "signed-in", user: { id: "user-1" } });
  fetchMock.mockImplementation(() => statusResponse({ open: true, claimed: false, signedIn: true, amount: 200, expireAt: null }));
  rerender(<CampaignGiftHost />);
  // 前の人の画面は、すぐに消す
  expect(screen.queryByTestId("gift")).toBeNull();
  await settle();
  expect(screen.getByTestId("gift")).toHaveAttribute("data-signed-in", "true");
});

test("額が読めないときは出さない", async () => {
  fetchMock.mockImplementation(() => statusResponse({ open: true, claimed: false, signedIn: true, amount: null, expireAt: null }));
  render(<CampaignGiftHost />);
  await settle();
  expect(screen.queryByTestId("gift")).toBeNull();
});

test("まだ受け付けていないときは、ページを移っても、しばらく聞きに行かない", async () => {
  fetchMock.mockImplementation(() => statusResponse({ open: false, claimed: false, signedIn: true, amount: 200, expireAt: null }));
  const { rerender } = render(<CampaignGiftHost />);
  await settle();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  mockPathname.mockReturnValue("/ja/style");
  rerender(<CampaignGiftHost />);
  await settle();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("ブラウザではログイン中でも、サーバーで未ログインだったら、guest として覚える(その人の分は覚えない)", async () => {
  fetchMock.mockImplementation(() => statusResponse({ open: true, claimed: false, signedIn: false, amount: 200, expireAt: null }));
  render(<CampaignGiftHost />);
  await settle();
  act(() => {
    screen.getByText("閉じる").click();
  });
  expect(window.localStorage.getItem("campaign-gift-dismissed:halloween-best-shot:user-1")).toBeNull();
  expect(window.localStorage.getItem("campaign-gift-dismissed:halloween-best-shot:guest")).toBe("1");
});

test("生成の画面で受け取って閉じたら、ページを読み込み直す(画面の中の残高を新しくする)", async () => {
  const reload = jest.fn();
  const original = window.location;
  Object.defineProperty(window, "location", { configurable: true, value: { ...original, reload } });
  mockPathname.mockReturnValue("/ja/style");
  render(<CampaignGiftHost />);
  await settle();
  act(() => {
    screen.getByText("受け取った").click();
  });
  act(() => {
    screen.getByText("閉じる").click();
  });
  expect(reload).toHaveBeenCalledTimes(1);
  Object.defineProperty(window, "location", { configurable: true, value: original });
});

test("生成の画面でないところでは、受け取って閉じても読み込み直さない", async () => {
  const reload = jest.fn();
  const original = window.location;
  Object.defineProperty(window, "location", { configurable: true, value: { ...original, reload } });
  render(<CampaignGiftHost />);
  await settle();
  act(() => {
    screen.getByText("受け取った").click();
  });
  act(() => {
    screen.getByText("閉じる").click();
  });
  expect(reload).not.toHaveBeenCalled();
  Object.defineProperty(window, "location", { configurable: true, value: original });
});

describe("受け取りを送る", () => {
  async function claimWith(response: Partial<Response>) {
    render(<CampaignGiftHost />);
    await settle();
    fetchMock.mockImplementationOnce(() => Promise.resolve(response as Response));
    await act(async () => {
      screen.getByText("受け取る").click();
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    return document.body.getAttribute("data-claim-result");
  }

  afterEach(() => {
    document.body.removeAttribute("data-claim-result");
  });

  test("POST で送り、受け取れた返事をそのまま返す", async () => {
    const result = await claimWith({ ok: true, status: 200, json: async () => ({ status: "granted", amount: 200, expireAt: "x" }) });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/campaign-gifts/halloween-best-shot", { method: "POST" });
    expect(result).toBe("granted");
  });

  test("401 はログインし直し、ほかの失敗はエラーにする", async () => {
    expect(await claimWith({ ok: false, status: 401, json: async () => ({}) })).toBe("auth_required");
  });

  test("500 はエラー", async () => {
    expect(await claimWith({ ok: false, status: 500, json: async () => ({}) })).toBe("error");
  });
});

test("受け取れるかを聞けなかったら出さず、しばらく聞きに行かない", async () => {
  fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 500 } as Response));
  const { rerender } = render(<CampaignGiftHost />);
  await settle();
  expect(screen.queryByTestId("gift")).toBeNull();
  mockPathname.mockReturnValue("/ja/style");
  rerender(<CampaignGiftHost />);
  await settle();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("通信が失敗しても出さず、しばらく聞きに行かない", async () => {
  fetchMock.mockImplementation(() => Promise.reject(new Error("offline")));
  const { rerender } = render(<CampaignGiftHost />);
  await settle();
  mockPathname.mockReturnValue("/ja/style");
  rerender(<CampaignGiftHost />);
  await settle();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("「あとで」で閉じたら、3時間はどのページでも出さず(聞きにも行かない)、3時間たったら出す", async () => {
  const { unmount } = render(<CampaignGiftHost />);
  await settle();
  act(() => {
    screen.getByText("あとで").click();
  });
  expect(window.localStorage.getItem("campaign-gift-dismissed:halloween-best-shot:user-1")).toBeNull();
  expect(window.localStorage.getItem("campaign-gift-later:halloween-best-shot:user-1")).not.toBeNull();
  unmount();
  mockPathname.mockReturnValue("/ja/style");
  fetchMock.mockClear();
  const second = render(<CampaignGiftHost />);
  await settle();
  expect(fetchMock).not.toHaveBeenCalled();
  second.unmount();
  // 3時間たったことにする
  window.localStorage.setItem("campaign-gift-later:halloween-best-shot:user-1", String(Date.now() - 3 * 60 * 60 * 1000 - 1));
  __resetCampaignGiftLaterForTest();
  render(<CampaignGiftHost />);
  await settle();
  expect(screen.getByTestId("gift")).toBeInTheDocument();
});

test("ログインしていない人が「あとで」を押しても、ログインしたあとは出す", async () => {
  mockAuth.mockReturnValue({ status: "signed-out", user: null });
  fetchMock.mockImplementation(() => statusResponse({ open: true, claimed: false, signedIn: false, amount: 200, expireAt: null }));
  const { rerender } = render(<CampaignGiftHost />);
  await settle();
  act(() => {
    screen.getByText("あとで").click();
  });
  expect(window.localStorage.getItem("campaign-gift-later:halloween-best-shot:guest")).not.toBeNull();
  mockAuth.mockReturnValue({ status: "signed-in", user: { id: "user-1" } });
  fetchMock.mockImplementation(() => statusResponse({ open: true, claimed: false, signedIn: true, amount: 200, expireAt: null }));
  mockPathname.mockReturnValue("/ja/style");
  rerender(<CampaignGiftHost />);
  await settle();
  expect(screen.getByTestId("gift")).toHaveAttribute("data-signed-in", "true");
});

test("ブラウザではログイン中でサーバーでは未ログインのとき、「あとで」でページを移るたびに出し直さない", async () => {
  fetchMock.mockImplementation(() => statusResponse({ open: true, claimed: false, signedIn: false, amount: 200, expireAt: null }));
  const { rerender } = render(<CampaignGiftHost />);
  await settle();
  act(() => {
    screen.getByText("あとで").click();
  });
  fetchMock.mockClear();
  mockPathname.mockReturnValue("/ja/style");
  rerender(<CampaignGiftHost />);
  await settle();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.queryByTestId("gift")).toBeNull();
});

