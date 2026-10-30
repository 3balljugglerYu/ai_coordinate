/**
 * 運営が人を選んで機能を開く一覧の管理画面(AllowlistManagerClient)。
 * クリエイター招待(/admin/creator-allowlist)と、見本を使える人(/admin/i2i-allowlist)で共通に使う。
 *
 * ここで守ること:
 *  - 渡された API(apiPath)だけを呼ぶ(画面ごとに別の一覧を変える)
 *  - 見出しやボタンは画面ごとの言葉(copy)で出す
 *  - 足す・有効と無効の切り替え・削除のあとは、一覧を読み直す。削除は確かめてから
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AllowlistManagerClient } from "@/app/(app)/admin/_components/AllowlistManagerClient";

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const API = "/api/admin/i2i-allowlist";
const COPY = {
  addHeading: "使える人を追加",
  addButton: "追加",
  addedDescription: "見本を使える人に追加しました",
  listHeading: "見本を使える人",
  removeConfirm: "この人を一覧から削除しますか?",
};
const MEMBER = { userId: "u1", nickname: "はな", avatarUrl: null, isActive: true, note: null };

const fetchMock = jest.fn();

function ok(body: unknown) {
  return Promise.resolve({ ok: true, json: async () => body } as Response);
}

beforeEach(() => {
  fetchMock.mockReset();
  mockToast.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function renderClient() {
  return render(<AllowlistManagerClient initialMembers={[MEMBER]} apiPath={API} copy={COPY} />);
}

test("見出しは画面ごとの言葉で、人数も出す", () => {
  renderClient();

  expect(screen.getByRole("heading", { name: "使える人を追加" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "見本を使える人(1人)" })).toBeInTheDocument();
});

test("検索して足すと、渡された API に POST し、一覧を読み直す", async () => {
  fetchMock
    .mockImplementationOnce(() => ok({ users: [{ user_id: "u2", nickname: "そら", avatar_url: null }] }))
    .mockImplementationOnce(() => ok({ ok: true }))
    .mockImplementationOnce(() => ok([MEMBER, { ...MEMBER, userId: "u2", nickname: "そら" }]));
  renderClient();

  fireEvent.change(screen.getByPlaceholderText("ニックネーム または ユーザーID で検索"), {
    target: { value: "そら" },
  });
  fireEvent.click(screen.getByRole("button", { name: "検索" }));
  fireEvent.click(await screen.findByRole("button", { name: "追加" }));

  await waitFor(() => expect(screen.getByText("見本を使える人(2人)")).toBeInTheDocument());
  expect(fetchMock).toHaveBeenNthCalledWith(2, API, expect.objectContaining({ method: "POST", body: JSON.stringify({ userId: "u2" }) }));
  expect(fetchMock).toHaveBeenNthCalledWith(3, API);
  expect(mockToast).toHaveBeenCalledWith({ title: "追加しました", description: "見本を使える人に追加しました" });
});

test("無効にすると、その人の API に PATCH する", async () => {
  fetchMock.mockImplementationOnce(() => ok({ ok: true })).mockImplementationOnce(() => ok([{ ...MEMBER, isActive: false }]));
  renderClient();

  fireEvent.click(screen.getByRole("button", { name: "無効化" }));

  await waitFor(() => expect(screen.getByText("無効")).toBeInTheDocument());
  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    `${API}/u1`,
    expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isActive: false }) }),
  );
});

test("削除は、画面ごとの言葉で確かめてから DELETE する。やめたら何もしない", async () => {
  const confirmSpy = jest.spyOn(window, "confirm");
  try {
    confirmSpy.mockReturnValueOnce(false);
    renderClient();
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(confirmSpy).toHaveBeenCalledWith("この人を一覧から削除しますか?");
    expect(fetchMock).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    fetchMock.mockImplementationOnce(() => ok({ ok: true })).mockImplementationOnce(() => ok([]));
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    await waitFor(() => expect(screen.getByText("見本を使える人(0人)")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenNthCalledWith(1, `${API}/u1`, { method: "DELETE" });
  } finally {
    confirmSpy.mockRestore();
  }
});
