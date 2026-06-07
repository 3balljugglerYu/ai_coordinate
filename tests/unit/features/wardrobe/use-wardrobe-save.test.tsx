/**
 * @jest-environment jsdom
 */

/**
 * `useWardrobeSave` の挙動テスト。
 *
 * /style・/coordinate など複数画面で共通利用する「ゲスト保存（ログイン転換）」
 * ロジックの契約を固定する:
 * - 保存ボタン押下: 計測 + 退避 + signup 固定モーダルを開く
 * - ログイン後 (?claim_wardrobe=1) の claim 副作用（saved / already-claimed / error）
 * - AuthModal に渡す props（signup 固定・切替リンク非表示・redirectTo にフラグ付与）
 */

import { act, renderHook, waitFor } from "@testing-library/react";

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();
let mockPathname = "/style";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

const labels: Record<string, string> = {
  wardrobeSaveSuccess: "保存しました",
  wardrobeSaveAlreadyClaimed: "すでに保存済み",
  wardrobeSaveError: "保存に失敗",
  wardrobeSaveModalTitle: "保存タイトル",
  wardrobeSaveModalDescription: "保存説明",
};
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => labels[key] ?? key,
}));

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockRecordEvent = jest.fn();
jest.mock("@/features/style/lib/style-usage-client", () => ({
  recordStyleUsageClientEvent: (...args: unknown[]) => mockRecordEvent(...args),
}));

const mockStash = jest.fn();
const mockClaim = jest.fn();
jest.mock("@/features/wardrobe/lib/pending-wardrobe-save", () => ({
  stashPendingWardrobeSave: (...args: unknown[]) => mockStash(...args),
  claimPendingWardrobeSave: (...args: unknown[]) => mockClaim(...args),
}));

import { useWardrobeSave } from "@/features/wardrobe/hooks/use-wardrobe-save";

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockToast.mockReset();
  mockRecordEvent.mockReset().mockResolvedValue(undefined);
  mockStash.mockReset();
  mockClaim.mockReset().mockResolvedValue({ status: "none" });
  mockSearchParams = new URLSearchParams();
  mockPathname = "/style";
});

describe("useWardrobeSave", () => {
  test("isGuest は authenticated で false、guest / null で true", () => {
    const authed = renderHook(() =>
      useWardrobeSave({ authState: "authenticated" }),
    );
    expect(authed.result.current.isGuest).toBe(false);

    const guest = renderHook(() => useWardrobeSave({ authState: "guest" }));
    expect(guest.result.current.isGuest).toBe(true);

    const unknown = renderHook(() => useWardrobeSave({ authState: null }));
    expect(unknown.result.current.isGuest).toBe(true);
  });

  test("requestSave: 計測 → 退避 → モーダルを開く", () => {
    const { result } = renderHook(() => useWardrobeSave({ authState: "guest" }));

    expect(result.current.authModalProps.open).toBe(false);
    act(() => {
      result.current.requestSave({
        imageBase64: "data:image/png;base64,abc",
        styleId: "style-1",
      });
    });

    expect(mockRecordEvent).toHaveBeenCalledWith({
      eventType: "wardrobe_save_click",
      styleId: "style-1",
    });
    expect(mockStash).toHaveBeenCalledWith({
      imageBase64: "data:image/png;base64,abc",
      styleId: "style-1",
    });
    expect(result.current.authModalProps.open).toBe(true);
  });

  test("requestSave: styleId 未指定は null として扱う", () => {
    const { result } = renderHook(() => useWardrobeSave({ authState: "guest" }));
    act(() => {
      result.current.requestSave({ imageBase64: "data:image/png;base64,abc" });
    });
    expect(mockStash).toHaveBeenCalledWith({
      imageBase64: "data:image/png;base64,abc",
      styleId: null,
    });
  });

  test("requestSave: 画像が無いときは何もしない", () => {
    const { result } = renderHook(() => useWardrobeSave({ authState: "guest" }));
    act(() => {
      result.current.requestSave({ imageBase64: null, styleId: "s" });
    });
    expect(mockStash).not.toHaveBeenCalled();
    expect(mockRecordEvent).not.toHaveBeenCalled();
    expect(result.current.authModalProps.open).toBe(false);
  });

  test("authModalProps は signup 固定・切替非表示・クエリ無しは ? でフラグ付与", () => {
    mockPathname = "/coordinate";
    const { result } = renderHook(() => useWardrobeSave({ authState: "guest" }));
    const props = result.current.authModalProps;
    expect(props.mode).toBe("signup");
    expect(props.hideModeSwitch).toBe(true);
    expect(props.title).toBe("保存タイトル");
    expect(props.description).toBe("保存説明");
    expect(props.redirectTo).toBe("/coordinate?claim_wardrobe=1");
  });

  test("redirectTo: 既存クエリがあるときは & でフラグを付与する", () => {
    mockPathname = "/style";
    mockSearchParams = new URLSearchParams("style=foo");
    const { result } = renderHook(() => useWardrobeSave({ authState: "guest" }));
    expect(result.current.authModalProps.redirectTo).toBe(
      "/style?style=foo&claim_wardrobe=1",
    );
  });

  test("claim 副作用: flag が無ければ claim を呼ばない", () => {
    renderHook(() => useWardrobeSave({ authState: "authenticated" }));
    expect(mockClaim).not.toHaveBeenCalled();
  });

  test("claim 副作用: flag があってもゲストなら claim を呼ばない", () => {
    mockSearchParams = new URLSearchParams("claim_wardrobe=1");
    renderHook(() => useWardrobeSave({ authState: "guest" }));
    expect(mockClaim).not.toHaveBeenCalled();
  });

  test("claim 副作用: saved → success トースト + /my-page へ遷移", async () => {
    mockSearchParams = new URLSearchParams("claim_wardrobe=1");
    mockClaim.mockResolvedValue({ status: "saved", id: "img-1" });
    renderHook(() => useWardrobeSave({ authState: "authenticated" }));

    await waitFor(() => expect(mockClaim).toHaveBeenCalledTimes(1));
    expect(mockToast).toHaveBeenCalledWith({ title: "保存しました" });
    expect(mockPush).toHaveBeenCalledWith("/my-page");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test("claim 副作用: ALREADY_CLAIMED → 専用トースト + pathname へ replace", async () => {
    mockPathname = "/coordinate";
    mockSearchParams = new URLSearchParams("claim_wardrobe=1");
    mockClaim.mockResolvedValue({
      status: "error",
      errorCode: "WARDROBE_CLAIM_ALREADY_CLAIMED",
    });
    renderHook(() => useWardrobeSave({ authState: "authenticated" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "すでに保存済み" }),
    );
    expect(mockReplace).toHaveBeenCalledWith("/coordinate");
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("claim 副作用: その他エラー → 汎用トースト + pathname へ replace", async () => {
    mockSearchParams = new URLSearchParams("claim_wardrobe=1");
    mockClaim.mockResolvedValue({
      status: "error",
      errorCode: "WARDROBE_CLAIM_SAVE_FAILED",
    });
    renderHook(() => useWardrobeSave({ authState: "authenticated" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({ title: "保存に失敗" }),
    );
    expect(mockReplace).toHaveBeenCalledWith("/style");
  });

  test("claim 副作用: 再レンダーしても claim は一度だけ", async () => {
    mockSearchParams = new URLSearchParams("claim_wardrobe=1");
    mockClaim.mockResolvedValue({ status: "none" });
    const { rerender } = renderHook(() =>
      useWardrobeSave({ authState: "authenticated" }),
    );
    await waitFor(() => expect(mockClaim).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    expect(mockClaim).toHaveBeenCalledTimes(1);
  });
});
