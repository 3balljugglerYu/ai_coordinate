/** @jest-environment jsdom */

/**
 * 全体配信の画面（PushBroadcastClient）の操作。
 *
 * 守ること:
 *  - 入力が足りない・おかしいときは、確認を出さずに理由を知らせる（送らない）
 *  - 送る前に必ず確認を出す。作れたら履歴の先頭に足し、入力を空にする
 *  - 作れなかったら理由を出し、確認を閉じない（入力を失わない）
 *  - 取り消せるのは予約中の配信だけ。取り消せなかったら理由を出し、最新の状態に合わせる
 *  - 「更新」で履歴を取り直す。取れなかったら理由を出し、今の表示は残す
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PushBroadcastClient } from "@/app/(app)/admin/push-broadcasts/PushBroadcastClient";
import { decoratePushBroadcastAdmin } from "@/features/push-broadcasts/lib/presentation";
import type {
  PushBroadcast,
  PushBroadcastAdminView,
  PushBroadcastDeliveryStats,
} from "@/features/push-broadcasts/lib/schema";

const toast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

function view(
  overrides: Partial<PushBroadcast> = {},
  stats?: PushBroadcastDeliveryStats
): PushBroadcastAdminView {
  return decoratePushBroadcastAdmin(
    {
      id: "b1",
      title: "ハロウィン企画",
      body: "",
      url: null,
      announcementId: null,
      sendAt: "2099-10-20T11:00:00.000Z",
      status: "scheduled",
      enqueuedCount: 0,
      createdBy: null,
      createdAt: "2026-10-14T00:00:00.000Z",
      updatedAt: "2026-10-14T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      canceledAt: null,
      ...overrides,
    },
    stats
  );
}

function jsonResponse(payload: unknown, ok = true) {
  return { ok, json: async () => payload };
}

function mockFetch(...responses: unknown[]) {
  const fetchMock = jest.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function requestBody(fetchMock: jest.Mock, index = 0) {
  return JSON.parse(fetchMock.mock.calls[index][1].body as string);
}

function fillTitle(value: string) {
  fireEvent.change(screen.getByLabelText("タイトル"), { target: { value } });
}

function clickSubmit(name: "送信する" | "予約する") {
  fireEvent.click(screen.getByRole("button", { name }));
}

function chooseSchedule(sendAt?: string) {
  fireEvent.click(screen.getByRole("radio", { name: "日時を指定して予約する" }));
  if (sendAt !== undefined) {
    fireEvent.change(document.getElementById("push_send_at") as HTMLInputElement, {
      target: { value: sendAt },
    });
  }
}

function historyTitles() {
  return screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
}

const originalFetch = global.fetch;

beforeEach(() => {
  toast.mockReset();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("入力の確認", () => {
  test.each([
    {
      name: "タイトルが空白だけ",
      fill: () => fillTitle("   "),
      submit: "送信する" as const,
      message: "タイトルを入力してください",
    },
    {
      name: "行き先が / でも https:// でもない",
      fill: () => {
        fillTitle("お知らせ");
        fireEvent.change(screen.getByLabelText("押したときの行き先（任意）"), {
          target: { value: "http://example.com" },
        });
      },
      submit: "送信する" as const,
      message: "行き先は / から始まるパスか https:// の URL にしてください",
    },
    {
      name: "予約なのに日時が空",
      fill: () => {
        fillTitle("お知らせ");
        chooseSchedule();
      },
      submit: "予約する" as const,
      message: "送信日時を入力してください",
    },
    {
      name: "予約の日時が今より前",
      fill: () => {
        fillTitle("お知らせ");
        chooseSchedule("2020-01-01T00:00");
      },
      submit: "予約する" as const,
      message: "送信日時は今より後にしてください",
    },
  ])("$name なら、確認を出さずに理由を知らせる", ({ fill, submit, message }) => {
    const fetchMock = mockFetch();
    render(<PushBroadcastClient initialBroadcasts={[]} />);

    fill();
    clickSubmit(submit);

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: message, variant: "destructive" })
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("送信", () => {
  test("確認してから作り、履歴の先頭に足して入力を空にする", async () => {
    const created = view({ id: "b-new", title: "ハロウィン企画が始まりました" });
    const fetchMock = mockFetch(jsonResponse(created));
    render(
      <PushBroadcastClient
        initialBroadcasts={[view({ id: "b-old", title: "前の配信", status: "sent" })]}
      />
    );

    fillTitle("  ハロウィン企画が始まりました  ");
    fireEvent.change(screen.getByLabelText("本文（任意）"), {
      target: { value: " 投稿しよう " },
    });
    clickSubmit("送信する");

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("今すぐ送信しますか？")).toBeTruthy();
    expect(within(dialog).getByText(/「ハロウィン企画が始まりました」を/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "送信する" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/push-broadcasts",
      expect.objectContaining({ method: "POST" })
    );
    expect(requestBody(fetchMock)).toEqual({
      title: "ハロウィン企画が始まりました",
      body: "投稿しよう",
      url: null,
      sendAt: null,
    });
    expect(historyTitles()).toEqual(["ハロウィン企画が始まりました", "前の配信"]);
    expect((screen.getByLabelText("タイトル") as HTMLInputElement).value).toBe("");
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "送信を始めました" })
    );
  });

  test("予約は日時を ISO 形式で送り、「予約しました」と知らせる", async () => {
    const fetchMock = mockFetch(jsonResponse(view({ id: "b-new" })));
    render(<PushBroadcastClient initialBroadcasts={[]} />);

    fillTitle("ハロウィン企画");
    fireEvent.change(screen.getByLabelText("押したときの行き先（任意）"), {
      target: { value: "/campaigns/halloween-best-shot" },
    });
    chooseSchedule("2099-10-20T20:00");
    clickSubmit("予約する");

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("予約しますか？")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "予約する" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "予約しました" }))
    );
    expect(requestBody(fetchMock)).toEqual({
      title: "ハロウィン企画",
      body: "",
      url: "/campaigns/halloween-best-shot",
      sendAt: new Date("2099-10-20T20:00").toISOString(),
    });
  });

  test.each([
    {
      name: "サーバーの理由",
      response: jsonResponse({ error: "送信日時は今より後にしてください" }, false),
      message: "送信日時は今より後にしてください",
    },
    {
      name: "応答が読めなければ既定の文言",
      response: { ok: false, json: async () => Promise.reject(new Error("not json")) },
      message: "配信の作成に失敗しました",
    },
  ])("作れなかったら $name を出し、確認を閉じない", async ({ response, message }) => {
    mockFetch(response);
    render(<PushBroadcastClient initialBroadcasts={[]} />);

    fillTitle("ハロウィン企画");
    clickSubmit("送信する");
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "送信する" })
    );

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: message, variant: "destructive" })
      )
    );
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("まだ配信はありません。")).toBeTruthy();
    expect((document.getElementById("push_title") as HTMLInputElement).value).toBe(
      "ハロウィン企画"
    );
  });
});

describe("取り消し", () => {
  test("「取り消す」は予約中の配信にだけ出る", () => {
    render(
      <PushBroadcastClient
        initialBroadcasts={[
          view({ id: "b1", title: "予約中の配信" }),
          view({ id: "b2", title: "送った配信", status: "sent" }),
          view({ id: "b3", title: "取り消した配信", status: "canceled" }),
        ]}
      />
    );

    expect(screen.getAllByRole("button", { name: "取り消す" })).toHaveLength(1);
  });

  test("確認してから取り消し、その配信を「取り消し」にする", async () => {
    const fetchMock = mockFetch(
      jsonResponse(view({ id: "b1", announcementId: "a1", status: "canceled" }))
    );
    render(
      <PushBroadcastClient
        initialBroadcasts={[view({ id: "b1", announcementId: "a1" })]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "取り消す" }));

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("予約を取り消しますか？")).toBeTruthy();
    expect(
      within(dialog).getByText(
        "「ハロウィン企画」の配信を取り消します。お知らせ自体は公開されたままです。"
      )
    ).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "取り消す" }));

    await waitFor(() => expect(screen.getByText("取り消し")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/push-broadcasts/b1",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(requestBody(fetchMock)).toEqual({ status: "canceled" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "取り消す" })).toBeNull();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "取り消しました" }));
  });

  test("取り消せなかったら理由を出し、取り直した最新の状態に合わせる", async () => {
    const fetchMock = mockFetch(
      jsonResponse({ error: "送信が始まった配信は取り消せません" }, false),
      jsonResponse([view({ id: "b1", status: "sending", enqueuedCount: 3 })])
    );
    render(<PushBroadcastClient initialBroadcasts={[view({ id: "b1" })]} />);

    fireEvent.click(screen.getByRole("button", { name: "取り消す" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "取り消す" })
    );

    await waitFor(() => expect(screen.getByText("送信中")).toBeTruthy());
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "送信が始まった配信は取り消せません",
        variant: "destructive",
      })
    );
    expect(fetchMock).toHaveBeenLastCalledWith("/api/admin/push-broadcasts");
  });
});

describe("更新", () => {
  test("「更新」で履歴を取り直す", async () => {
    mockFetch(jsonResponse([view({ id: "b1", title: "新しく見えた配信", status: "sent" })]));
    render(<PushBroadcastClient initialBroadcasts={[]} />);
    expect(screen.getByText("まだ配信はありません。")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => expect(historyTitles()).toEqual(["新しく見えた配信"]));
    expect(toast).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: "サーバーの理由",
      response: jsonResponse({ error: "権限がありません" }, false),
      message: "権限がありません",
    },
    {
      name: "一覧でない応答なら既定の文言",
      response: jsonResponse({ unexpected: true }),
      message: "配信履歴の取得に失敗しました",
    },
  ])("取り直せなかったら $name を出し、今の表示は残す", async ({ response, message }) => {
    mockFetch(response);
    render(<PushBroadcastClient initialBroadcasts={[view({ title: "今の配信" })]} />);

    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: message, variant: "destructive" })
      )
    );
    expect(historyTitles()).toEqual(["今の配信"]);
  });
});
