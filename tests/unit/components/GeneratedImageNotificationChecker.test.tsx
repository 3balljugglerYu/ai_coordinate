/** @jest-environment jsdom */

/**
 * 生成完了トーストの見張り役(全ページ常駐・10秒ごと)。
 *
 * 以前は毎回 getUser(Supabase への通信)でユーザーを確かめていた。supabase-js 2.90 の
 * getUser はタブ間ロックを握ったまま通信するため、裏に回ったタブがその途中で止まると
 * ロックを握ったままになり、他のタブのログイン確認がすべて止まった(2026-09-27)。
 *
 * ここで守ること:
 *  - ユーザーIDは手元のセッションから取り、getUser を使わない
 *  - 画面が裏にある間は何も問い合わせず、表に出たときに1回確かめる
 *  - 既存の振る舞い(トースト・既読位置)は変えない
 */

const stableTranslate = (key: string) => key;
jest.mock("next-intl", () => ({
  useTranslations: () => stableTranslate,
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/ja",
}));

const mockToast = jest.fn(() => ({ dismiss: jest.fn() }));
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock("@/features/generation/components/CoordinateGeneratedListHashScroll", () => ({
  COORDINATE_GENERATED_LIST_ID: "coordinate-generated-list",
  COORDINATE_GENERATED_LIST_HASH: "#coordinate-generated-list",
}));

jest.mock("@/features/auth/lib/auth-client", () => ({
  getCurrentSession: jest.fn(),
  getCurrentUser: jest.fn(),
}));

jest.mock("@/features/generation/lib/current-user", () => ({
  getCurrentUserId: jest.fn(),
}));

jest.mock("@/features/generation/lib/database", () => ({
  getGeneratedImages: jest.fn(),
  listCoordinateImagesCreatedAfter: jest.fn(),
}));

jest.mock("@/features/generation/lib/coordinate-toast-ack", () => ({
  fetchCoordinateToastAckAt: jest.fn(),
  setCoordinateToastAckAt: jest.fn(),
}));

import { act, render } from "@testing-library/react";
import { GeneratedImageNotificationChecker } from "@/components/GeneratedImageNotificationChecker";
import {
  getCurrentSession,
  getCurrentUser,
} from "@/features/auth/lib/auth-client";
import { getCurrentUserId } from "@/features/generation/lib/current-user";
import {
  getGeneratedImages,
  listCoordinateImagesCreatedAfter,
} from "@/features/generation/lib/database";
import {
  fetchCoordinateToastAckAt,
  setCoordinateToastAckAt,
} from "@/features/generation/lib/coordinate-toast-ack";

const mockGetCurrentSession = jest.mocked(getCurrentSession);
const mockGetCurrentUser = jest.mocked(getCurrentUser);
const mockGetCurrentUserId = jest.mocked(getCurrentUserId);
const mockFetchAck = jest.mocked(fetchCoordinateToastAckAt);
const mockSetAck = jest.mocked(setCoordinateToastAckAt);
const mockListAfter = jest.mocked(listCoordinateImagesCreatedAfter);
const mockGetGeneratedImages = jest.mocked(getGeneratedImages);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACK_AT = "2026-09-27T00:00:00.000Z";
const POLL_MS = 10_000;

let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState) {
  act(() => {
    visibility = next;
    // 実ブラウザの visibilitychange は document から window へ伝わる
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  });
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

describe("GeneratedImageNotificationChecker", () => {
  beforeAll(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => visibility === "hidden",
    });
  });

  afterAll(() => {
    delete (document as { visibilityState?: unknown }).visibilityState;
    delete (document as { hidden?: unknown }).hidden;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    visibility = "visible";
    mockGetCurrentSession.mockResolvedValue({
      user: { id: USER_ID },
    } as never);
    mockGetCurrentUser.mockResolvedValue({ id: USER_ID } as never);
    mockGetCurrentUserId.mockResolvedValue(USER_ID);
    mockFetchAck.mockResolvedValue(ACK_AT);
    mockListAfter.mockResolvedValue([]);
    mockGetGeneratedImages.mockResolvedValue([]);
    mockSetAck.mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("表のタブは手元のセッションで10秒ごとに確認する", async () => {
    render(<GeneratedImageNotificationChecker />);
    await advance(0);

    expect(mockGetCurrentSession).toHaveBeenCalledTimes(1);
    expect(mockFetchAck).toHaveBeenCalledTimes(1);
    expect(mockFetchAck).toHaveBeenLastCalledWith(USER_ID);

    await advance(POLL_MS - 1);
    expect(mockGetCurrentSession).toHaveBeenCalledTimes(1);

    await advance(1);
    expect(mockGetCurrentSession).toHaveBeenCalledTimes(2);
    expect(mockFetchAck).toHaveBeenCalledTimes(2);
    expect(mockListAfter).toHaveBeenLastCalledWith(USER_ID, ACK_AT, 50);
    // Supabase への通信を伴うユーザー確認は使わない
    expect(mockGetCurrentUser).not.toHaveBeenCalled();
    expect(mockGetCurrentUserId).not.toHaveBeenCalled();
  });

  test("新しい画像があればトーストを出して既読位置を進める", async () => {
    const earlier = "2026-09-27T01:00:00.000Z";
    const latest = "2026-09-27T02:00:00.000Z";
    mockListAfter.mockResolvedValue([
      { created_at: latest },
      { created_at: earlier },
    ] as never);

    render(<GeneratedImageNotificationChecker />);
    await advance(0);

    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "generatedImageReadyTitle",
        description: "generatedImageReadyMultiple",
      })
    );
    expect(mockSetAck).toHaveBeenCalledTimes(1);
    expect(mockSetAck).toHaveBeenCalledWith(USER_ID, latest);
  });

  test("既読位置がまだ無ければ直近の画像で既読位置を作りトーストは出さない", async () => {
    const newest = "2026-09-26T23:00:00.000Z";
    mockFetchAck.mockResolvedValue(null as never);
    mockGetGeneratedImages.mockResolvedValue([
      { created_at: "2026-09-26T20:00:00.000Z" },
      { created_at: newest },
    ] as never);

    render(<GeneratedImageNotificationChecker />);
    await advance(0);

    expect(mockGetGeneratedImages).toHaveBeenCalledWith(USER_ID, 50, 0, "coordinate");
    expect(mockSetAck).toHaveBeenCalledWith(USER_ID, newest);
    expect(mockListAfter).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  test("裏で開いたタブは表に出た時点で確認する", async () => {
    visibility = "hidden";
    render(<GeneratedImageNotificationChecker />);
    await advance(3 * POLL_MS);

    expect(mockGetCurrentSession).not.toHaveBeenCalled();
    expect(mockFetchAck).not.toHaveBeenCalled();

    setVisibility("visible");
    await advance(0);

    expect(mockGetCurrentSession).toHaveBeenCalledTimes(1);
    expect(mockFetchAck).toHaveBeenCalledTimes(1);

    await advance(POLL_MS);

    expect(mockGetCurrentSession).toHaveBeenCalledTimes(2);
  });

  test("裏に回ったタブは問い合わせを止め、表に戻ると再開する", async () => {
    render(<GeneratedImageNotificationChecker />);
    await advance(0);
    expect(mockFetchAck).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    await advance(3 * POLL_MS);

    // 裏にいる30秒のあいだ、認証にも DB にも問い合わせない
    expect(mockFetchAck).toHaveBeenCalledTimes(1);
    expect(mockListAfter).toHaveBeenCalledTimes(1);
    expect(mockGetCurrentSession).toHaveBeenCalledTimes(1);
    expect(mockGetCurrentUser).not.toHaveBeenCalled();
    expect(mockGetCurrentUserId).not.toHaveBeenCalled();

    // 表に戻ったらすぐ1回確かめ、以後はまた10秒ごと
    setVisibility("visible");
    await advance(0);
    expect(mockFetchAck).toHaveBeenCalledTimes(2);

    await advance(POLL_MS);
    expect(mockFetchAck).toHaveBeenCalledTimes(3);
  });

  test("確認の途中で表に戻っても二重には確認しない", async () => {
    let resolveSession: (value: unknown) => void = () => {};
    mockGetCurrentSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSession = resolve;
        }) as never
    );

    render(<GeneratedImageNotificationChecker />);
    await advance(0);
    expect(mockGetCurrentSession).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    setVisibility("visible");
    await advance(0);

    expect(mockGetCurrentSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSession({ user: { id: USER_ID } });
    });
    await advance(0);
    expect(mockFetchAck).toHaveBeenCalledTimes(1);
  });

  test("確認が失敗しても次の10秒で確認を続ける", async () => {
    mockGetCurrentSession.mockRejectedValueOnce(new Error("storage unavailable"));

    render(<GeneratedImageNotificationChecker />);
    await advance(0);
    expect(mockGetCurrentSession).toHaveBeenCalledTimes(1);
    expect(mockFetchAck).not.toHaveBeenCalled();

    await advance(POLL_MS);

    expect(mockGetCurrentSession).toHaveBeenCalledTimes(2);
    expect(mockFetchAck).toHaveBeenCalledTimes(1);
  });

  test("画面から外れたら確認をやめる", async () => {
    const { unmount } = render(<GeneratedImageNotificationChecker />);
    await advance(0);
    expect(mockGetCurrentSession).toHaveBeenCalledTimes(1);

    unmount();
    await advance(3 * POLL_MS);
    setVisibility("hidden");
    setVisibility("visible");
    await advance(0);

    expect(mockGetCurrentSession).toHaveBeenCalledTimes(1);
  });

  test("未ログインならDBに問い合わせない", async () => {
    mockGetCurrentSession.mockResolvedValue(null);

    render(<GeneratedImageNotificationChecker />);
    await advance(0);

    expect(mockGetCurrentSession).toHaveBeenCalledTimes(1);
    expect(mockFetchAck).not.toHaveBeenCalled();
    expect(mockListAfter).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });
});
