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

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
