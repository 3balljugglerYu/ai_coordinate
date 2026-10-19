/** @jest-environment jsdom */

/**
 * 運営配信の状態の見せ方（全体配信の履歴・お知らせのフォームと一覧）。
 *
 * 守ること:
 *  - 送信待ちを積み終えた（sent）だけでは「送信済み」と見せない。送り終えていない分が
 *    残る間は「送信中」
 *  - 期限切れ（expired）は理由とあわせて出す。途中まで送っていたら件数も出す
 *  - 期限切れの配信は戻せないので、お知らせのフォームでチェックを変えられない
 *  - プッシュの予約・変更・取り消しが効かなかったときは、「保存しました」だけで終えない
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PushBroadcastClient } from "@/app/(app)/admin/push-broadcasts/PushBroadcastClient";
import { AnnouncementForm } from "@/app/(app)/admin/announcements/AnnouncementForm";
import { AnnouncementListClient } from "@/app/(app)/admin/announcements/AnnouncementListClient";
import { decoratePushBroadcastAdmin } from "@/features/push-broadcasts/lib/presentation";
import type {
  AnnouncementPushSummary,
  PushBroadcast,
  PushBroadcastDeliveryStats,
} from "@/features/push-broadcasts/lib/schema";
import type { AnnouncementAdminView } from "@/features/announcements/lib/schema";

const toast = jest.fn();
const routerRefreshMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefreshMock, push: jest.fn() }),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

// 本文の編集欄はこの確認に関係しない（重いエディタを読み込まない）
jest.mock("@/features/announcements/components/AnnouncementEditor", () => ({
  AnnouncementEditor: () => null,
}));

function broadcast(overrides: Partial<PushBroadcast> = {}): PushBroadcast {
  return {
    id: "b1",
    title: "ハロウィン企画",
    body: "",
    url: null,
    announcementId: null,
    sendAt: "2026-10-20T11:00:00.000Z",
    status: "sent",
    enqueuedCount: 0,
    createdBy: null,
    createdAt: "2026-10-14T00:00:00.000Z",
    updatedAt: "2026-10-14T00:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    canceledAt: null,
    ...overrides,
  };
}

function stats(overrides: Partial<PushBroadcastDeliveryStats> = {}) {
  return { pending: 0, sent: 0, skipped: 0, failed: 0, ...overrides };
}

function pushSummary(
  overrides: Partial<AnnouncementPushSummary> = {}
): AnnouncementPushSummary {
  return {
    id: "b1",
    status: "sent",
    sendAt: "2026-10-20T11:00:00.000Z",
    enqueuedCount: 5,
    pendingCount: 0,
    ...overrides,
  };
}

function announcement(
  push: AnnouncementPushSummary | null,
  overrides: Partial<AnnouncementAdminView> = {}
): AnnouncementAdminView {
  return {
    id: "a1",
    title: "ハロウィン企画",
    bodyJson: { type: "doc" },
    bodyText: "本文",
    assetPaths: [],
    status: "published",
    publishAt: "2026-10-20T11:00:00.000Z",
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-10-14T00:00:00.000Z",
    updatedAt: "2026-10-14T00:00:00.000Z",
    publishAtDisplay: "2026/10/20 20:00",
    displayStatusLabel: "公開",
    displayStatusClassName: "",
    push,
    ...overrides,
  };
}

const originalFetch = global.fetch;

beforeEach(() => {
  toast.mockReset();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("全体配信の履歴（PushBroadcastClient）", () => {
  test("積み終えても送り終えていない分があれば「送信中」と出す", () => {
    render(
      <PushBroadcastClient
        initialBroadcasts={[
          decoratePushBroadcastAdmin(
            broadcast({ enqueuedCount: 3 }),
            stats({ pending: 2, sent: 1 })
          ),
        ]}
      />
    );

    expect(screen.getByText("送信中")).toBeTruthy();
    expect(screen.queryByText("送信済み")).toBeNull();
    expect(screen.getByText(/待ち 2/)).toBeTruthy();
  });

  test("期限切れで 1 人も積んでいなければ、理由だけを出す（件数は出さない）", () => {
    render(
      <PushBroadcastClient
        initialBroadcasts={[
          decoratePushBroadcastAdmin(broadcast({ status: "expired" }), undefined),
        ]}
      />
    );

    expect(screen.getByText("期限切れ")).toBeTruthy();
    expect(
      screen.getByText(
        "送信日時から 1 時間以内に送り始められなかったため、送っていません。"
      )
    ).toBeTruthy();
    expect(screen.queryByText(/宛先 0 人/)).toBeNull();
  });

  test("途中で期限切れなら、残りを送っていないことと件数を出す", () => {
    render(
      <PushBroadcastClient
        initialBroadcasts={[
          decoratePushBroadcastAdmin(
            broadcast({ status: "expired", enqueuedCount: 3 }),
            stats({ sent: 3 })
          ),
        ]}
      />
    );

    expect(
      screen.getByText(
        "送信日時から 1 時間以内に送り終えられなかったため、残りは送っていません。"
      )
    ).toBeTruthy();
    expect(screen.getByText(/宛先 3 人/)).toBeTruthy();
  });
});

describe("お知らせのフォーム（AnnouncementForm）", () => {
  test("期限切れの配信はチェックを変えられず、理由を出す", () => {
    render(
      <AnnouncementForm
        announcement={announcement(pushSummary({ status: "expired", enqueuedCount: 0 }))}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(
      screen.getByRole("checkbox", { name: "プッシュ通知も送る" }).hasAttribute("disabled")
    ).toBe(true);
    expect(screen.getByText(/プッシュ通知: 期限切れ/)).toBeTruthy();
    expect(
      screen.getByText(
        "送信日時から 1 時間以内に送り始められなかったため、送っていません。"
      )
    ).toBeTruthy();
  });

  test("送り終えていない分があれば「送信中」と出す", () => {
    render(
      <AnnouncementForm
        announcement={announcement(pushSummary({ pendingCount: 2 }))}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(screen.getByText("プッシュ通知: 送信中（宛先 5 人）")).toBeTruthy();
  });

  test("プッシュの取り消しが効かなかったら、その理由を出す（「保存しました」で終えない）", async () => {
    const pushError = "プッシュ通知はすでに送信が始まっていたため、取り消せませんでした";
    const saved = announcement(pushSummary(), { status: "draft", publishAt: null });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...saved, pushError }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const onSuccess = jest.fn();

    render(
      <AnnouncementForm
        announcement={announcement(pushSummary({ status: "scheduled", enqueuedCount: 0 }))}
        onSuccess={onSuccess}
        onCancel={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "更新する" }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(onSuccess).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "プッシュ通知の設定を反映できませんでした",
        description: `お知らせは保存しました。${pushError}`,
        variant: "destructive",
      })
    );
  });
});

describe("お知らせのフォーム: プッシュの送り方", () => {
  function savedResponse() {
    return jest.fn().mockResolvedValue({
      ok: true,
      json: async () => announcement(null),
    });
  }

  function lastBody(fetchMock: jest.Mock) {
    return JSON.parse(fetchMock.mock.calls[0][1].body as string);
  }

  test("⭐チェックを変えずに保存したら sendPush を送らない（サーバーが今の予約を保つ）", async () => {
    const fetchMock = savedResponse();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AnnouncementForm
        announcement={announcement(pushSummary({ status: "scheduled", enqueuedCount: 0 }))}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "更新する" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastBody(fetchMock)).not.toHaveProperty("sendPush");
  });

  test("チェックを外して保存したら sendPush: false を送る", async () => {
    const fetchMock = savedResponse();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AnnouncementForm
        announcement={announcement(pushSummary({ status: "scheduled", enqueuedCount: 0 }))}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "プッシュ通知も送る" }));
    fireEvent.click(screen.getByRole("button", { name: "更新する" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastBody(fetchMock).sendPush).toBe(false);
  });

  test("⭐取り消し済みの予約は、チェックを変えない保存で sendPush を送らない（勝手に戻さない）", async () => {
    const fetchMock = savedResponse();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AnnouncementForm
        announcement={announcement(pushSummary({ status: "canceled", enqueuedCount: 0 }))}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "更新する" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastBody(fetchMock)).not.toHaveProperty("sendPush");
  });

  test("⭐下書きのあいだはチェックを押せず、理由を出す（保存しても残らないため）", async () => {
    const fetchMock = savedResponse();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AnnouncementForm
        announcement={announcement(null, { status: "draft", publishAt: null })}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: "プッシュ通知も送る" });
    expect(checkbox.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/下書きのあいだは選べません/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "更新する" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastBody(fetchMock)).not.toHaveProperty("sendPush");
  });
});

describe("お知らせの一覧（AnnouncementListClient）", () => {
  test("プッシュの札も、送り終えていない分があれば「送信中」", () => {
    render(
      <AnnouncementListClient
        initialAnnouncements={[announcement(pushSummary({ pendingCount: 1 }))]}
      />
    );

    expect(screen.getByText("プッシュ: 送信中")).toBeTruthy();
  });

  test("送り終えていれば「送信済み」", () => {
    render(
      <AnnouncementListClient
        initialAnnouncements={[announcement(pushSummary({ pendingCount: 0 }))]}
      />
    );

    expect(screen.getByText("プッシュ: 送信済み")).toBeTruthy();
  });
});

describe("お知らせの一覧: 編集を開くとき", () => {
  test("⭐今の状態を読み直してから開く（一覧が古くても、取り消し済みならチェックは外れている）", async () => {
    const fresh = announcement(pushSummary({ status: "canceled", enqueuedCount: 0 }));
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => fresh });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AnnouncementListClient
        initialAnnouncements={[
          announcement(pushSummary({ status: "scheduled", enqueuedCount: 0 })),
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "編集" }));

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "プッシュ通知も送る" })).toBeTruthy()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/announcements/a1",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(
      screen.getByRole("checkbox", { name: "プッシュ通知も送る" }).getAttribute("data-state")
    ).toBe("unchecked");
    expect(screen.getByText("プッシュ: 取り消し")).toBeTruthy();
  });

  test("読み直せなくても、一覧の値で開く", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;

    render(
      <AnnouncementListClient
        initialAnnouncements={[
          announcement(pushSummary({ status: "scheduled", enqueuedCount: 0 })),
        ]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "編集" }));

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "プッシュ通知も送る" })).toBeTruthy()
    );
    expect(
      screen.getByRole("checkbox", { name: "プッシュ通知も送る" }).getAttribute("data-state")
    ).toBe("checked");
  });
});

describe("お知らせの一覧: 編集を開くとき（読み直しの失敗とすばやい開き直し）", () => {
  test("⭐読み直しで配信の状態だけ読めなかったら（push が null）、一覧の値を残す（送信済みを「無い」と見せない）", async () => {
    const listed = announcement(pushSummary({ status: "sent", enqueuedCount: 5 }));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...listed, title: "直した題名", push: null }),
    }) as unknown as typeof fetch;

    render(<AnnouncementListClient initialAnnouncements={[listed]} />);
    fireEvent.click(screen.getByRole("button", { name: "編集" }));

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "プッシュ通知も送る" })).toBeTruthy()
    );
    // 送信済みなのでチェックは変えられない（押して送り直せない）
    expect(
      screen.getByRole("checkbox", { name: "プッシュ通知も送る" }).hasAttribute("disabled")
    ).toBe(true);
    expect((screen.getByLabelText("タイトル") as HTMLInputElement).value).toBe("直した題名");
  });

  test("⭐閉じてすぐ別のお知らせを開いたら、前の読み込みの結果で上書きしない", async () => {
    const first = announcement(null, { id: "a1", title: "1つ目" });
    const second = announcement(null, { id: "a2", title: "2つ目" });
    let resolveFirst: (value: unknown) => void = () => {};
    global.fetch = jest.fn((url: string) =>
      url.endsWith("/a1")
        ? new Promise((resolve) => { resolveFirst = resolve; })
        : Promise.resolve({ ok: true, json: async () => ({ ...second, title: "2つ目（最新）" }) })
    ) as unknown as typeof fetch;

    render(<AnnouncementListClient initialAnnouncements={[first, second]} />);
    const editButtons = screen.getAllByRole("button", { name: "編集" });
    fireEvent.click(editButtons[0]);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.click(screen.getAllByRole("button", { name: "編集" })[1]);

    await waitFor(() =>
      expect((screen.getByLabelText("タイトル") as HTMLInputElement).value).toBe("2つ目（最新）")
    );
    await act(async () => {
      resolveFirst({ ok: true, json: async () => ({ ...first, title: "1つ目（遅れて届いた）" }) });
    });
    expect((screen.getByLabelText("タイトル") as HTMLInputElement).value).toBe("2つ目（最新）");
  });
});
