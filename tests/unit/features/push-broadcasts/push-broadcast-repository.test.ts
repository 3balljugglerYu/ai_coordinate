/**
 * 運営配信の DB 読み書き（push-broadcast-repository）。
 *
 * 守ること:
 *  - 予約の変更は送る前（scheduled / canceled）の行だけを書き換え、0 行なら false を返す
 *    （送信が始まっていたのに成功扱いにしない）
 *  - 取り消しは予約中（scheduled）の行だけ。0 行なら false
 *  - お知らせの要約には、送り終えていない送信待ちの数（pendingCount）を付ける。
 *    数えるのは積み始めた配信だけ
 *  - 送信待ちの件数は配信ごと・状態ごとにまとめる（processing は送り終えていない側）。
 *    件数が取れなくても一覧は出す
 *  - 新しい配信は予約中（scheduled）として作る
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  aggregateDeliveryStats,
  applyAnnouncementPushAction,
  cancelScheduledPushBroadcast,
  createPushBroadcast,
  getAnnouncementPushSummaries,
  getPushBroadcastById,
  listPushBroadcastsForAdmin,
  PUSH_BROADCAST_LIST_LIMIT,
} from "@/features/push-broadcasts/lib/push-broadcast-repository";

type Client = NonNullable<Parameters<typeof applyAnnouncementPushAction>[3]>;
type Result = { data: unknown; error: unknown };
type Call = [method: string, args: unknown[]];

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "eq",
  "in",
  "order",
  "limit",
  "maybeSingle",
  "single",
];

/** from() ごとに results を先頭から 1 つずつ返す、await できる問い合わせの偽物 */
function fakeClient(results: Result[], rpcResult: Result = { data: [], error: null }) {
  const calls: Call[] = [];
  const queue = [...results];
  const from = jest.fn((table: string) => {
    calls.push(["from", [table]]);
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    for (const method of CHAIN_METHODS) {
      builder[method] = (...args: unknown[]) => {
        calls.push([method, args]);
        return builder;
      };
    }
    builder.then = (
      resolve: (value: Result) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  });
  const rpc = jest.fn(async () => rpcResult);
  return { client: { from, rpc } as unknown as Client, calls, rpc };
}

const RESCHEDULE = {
  type: "reschedule" as const,
  id: "b1",
  content: {
    title: "ハロウィン企画",
    body: "本文",
    sendAt: "2026-10-20T11:00:00.000Z",
  },
};

function broadcastRow(id: string, status: string, announcementId: string) {
  return {
    id,
    title: "t",
    body: "",
    url: null,
    announcement_id: announcementId,
    send_at: "2026-10-20T11:00:00.000Z",
    status,
    enqueued_count: 5,
    created_by: null,
    created_at: "2026-10-14T00:00:00.000Z",
    updated_at: "2026-10-14T00:00:00.000Z",
    started_at: null,
    finished_at: null,
    canceled_at: null,
  };
}

describe("applyAnnouncementPushAction", () => {
  test("予約の変更: 送る前の行だけを書き換え、書き換えられたら true", async () => {
    const { client, calls } = fakeClient([{ data: [{ id: "b1" }], error: null }]);

    await expect(
      applyAnnouncementPushAction("a1", RESCHEDULE, "admin-1", client)
    ).resolves.toBe(true);

    expect(calls).toEqual(
      expect.arrayContaining([
        ["eq", ["id", "b1"]],
        ["in", ["status", ["scheduled", "canceled"]]],
        ["select", ["id"]],
      ])
    );
  });

  test("予約の変更: 0 行（その間に送信が始まった）なら false", async () => {
    const { client } = fakeClient([{ data: [], error: null }]);

    await expect(
      applyAnnouncementPushAction("a1", RESCHEDULE, "admin-1", client)
    ).resolves.toBe(false);
  });

  test("予約の変更: DB のエラーは例外", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient([{ data: null, error: { message: "boom" } }]);

    await expect(
      applyAnnouncementPushAction("a1", RESCHEDULE, "admin-1", client)
    ).rejects.toThrow("プッシュ通知の予約の更新に失敗しました");
  });

  test("取り消し: 予約中の行だけを対象にし、取り消せたら true", async () => {
    const { client, calls } = fakeClient([
      { data: broadcastRow("b1", "canceled", "a1"), error: null },
    ]);

    await expect(
      applyAnnouncementPushAction("a1", { type: "cancel", id: "b1" }, "admin-1", client)
    ).resolves.toBe(true);

    expect(calls).toEqual(expect.arrayContaining([["eq", ["status", "scheduled"]]]));
  });

  test("取り消し: 0 行（その間に送信が始まった）なら false", async () => {
    const { client } = fakeClient([{ data: null, error: null }]);

    await expect(
      applyAnnouncementPushAction("a1", { type: "cancel", id: "b1" }, "admin-1", client)
    ).resolves.toBe(false);
  });

  test("何もしないなら true（書き込まない）", async () => {
    const { client, calls } = fakeClient([]);

    await expect(
      applyAnnouncementPushAction("a1", { type: "none" }, "admin-1", client)
    ).resolves.toBe(true);
    expect(calls).toEqual([]);
  });

  test("新しく予約: お知らせに結びつけて予約中で作り、true", async () => {
    const { client, calls } = fakeClient([{ data: null, error: null }]);

    await expect(
      applyAnnouncementPushAction(
        "a1",
        { type: "create", content: RESCHEDULE.content },
        "admin-1",
        client
      )
    ).resolves.toBe(true);

    expect(calls).toContainEqual([
      "insert",
      [
        {
          announcement_id: "a1",
          title: "ハロウィン企画",
          body: "本文",
          url: null,
          send_at: "2026-10-20T11:00:00.000Z",
          status: "scheduled",
          created_by: "admin-1",
        },
      ],
    ]);
  });

  test("新しく予約: DB のエラーは例外", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient([{ data: null, error: { message: "boom" } }]);

    await expect(
      applyAnnouncementPushAction(
        "a1",
        { type: "create", content: RESCHEDULE.content },
        "admin-1",
        client
      )
    ).rejects.toThrow("プッシュ通知の予約に失敗しました");
  });
});

describe("cancelScheduledPushBroadcast", () => {
  test("DB のエラーは例外", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient([{ data: null, error: { message: "boom" } }]);

    await expect(cancelScheduledPushBroadcast("b1", client)).rejects.toThrow(
      "配信の取り消しに失敗しました"
    );
  });
});

describe("aggregateDeliveryStats", () => {
  test("配信ごと・状態ごとに足す。processing は送り終えていない側に数える", () => {
    const stats = aggregateDeliveryStats([
      { broadcast_id: "b1", status: "sent", row_count: 4 },
      { broadcast_id: "b1", status: "skipped", row_count: "2" },
      { broadcast_id: "b1", status: "failed", row_count: 1 },
      { broadcast_id: "b1", status: "pending", row_count: 3 },
      { broadcast_id: "b1", status: "processing", row_count: 1 },
      { broadcast_id: "b2", status: "sent", row_count: 7 },
    ]);

    expect(stats.get("b1")).toEqual({ sent: 4, skipped: 2, failed: 1, pending: 4 });
    expect(stats.get("b2")).toEqual({ sent: 7, skipped: 0, failed: 0, pending: 0 });
  });

  test("知らない状態と数でない件数は数えない", () => {
    const stats = aggregateDeliveryStats([
      { broadcast_id: "b1", status: "unknown", row_count: 5 },
      { broadcast_id: "b1", status: "sent", row_count: "x" },
    ]);

    expect(stats.get("b1")).toEqual({ sent: 0, skipped: 0, failed: 0, pending: 0 });
  });
});

describe("listPushBroadcastsForAdmin", () => {
  test("新しい順に上限まで取り、件数と表示用の値を付ける", async () => {
    const { client, calls, rpc } = fakeClient(
      [
        {
          data: [
            { ...broadcastRow("b2", "sent", "a1"), enqueued_count: 3 },
            { ...broadcastRow("b1", "scheduled", "a1"), announcement_id: null },
          ],
          error: null,
        },
      ],
      {
        data: [
          { broadcast_id: "b2", status: "sent", row_count: 2 },
          { broadcast_id: "b2", status: "pending", row_count: 1 },
        ],
        error: null,
      }
    );

    const views = await listPushBroadcastsForAdmin(client);

    expect(calls).toEqual(
      expect.arrayContaining([
        ["from", ["admin_push_broadcasts"]],
        ["order", ["created_at", { ascending: false }]],
        ["limit", [PUSH_BROADCAST_LIST_LIMIT]],
      ])
    );
    expect(rpc).toHaveBeenCalledWith("admin_push_broadcast_stats", {
      p_broadcast_ids: ["b2", "b1"],
    });
    expect(views.map((v) => [v.id, v.statusLabel, v.stats.pending])).toEqual([
      ["b2", "送信中", 1],
      ["b1", "予約中", 0],
    ]);
    expect(views[0]).toEqual(
      expect.objectContaining({
        announcementId: "a1",
        sendAt: "2026-10-20T11:00:00.000Z",
        enqueuedCount: 3,
        createdAt: "2026-10-14T00:00:00.000Z",
      })
    );
    expect(views[1].announcementId).toBeNull();
  });

  test("件数が取れなくても一覧は出す", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient(
      [{ data: [broadcastRow("b1", "sent", "a1")], error: null }],
      { data: null, error: { message: "boom" } }
    );

    const views = await listPushBroadcastsForAdmin(client);

    expect(views).toHaveLength(1);
    expect(views[0].statusLabel).toBe("送信済み");
    expect(views[0].stats).toEqual({ sent: 0, skipped: 0, failed: 0, pending: 0 });
  });

  test("配信が無ければ件数を問い合わせない。client を渡さなければ管理用のクライアントを使う", async () => {
    const { client, rpc } = fakeClient([{ data: null, error: null }]);
    jest.mocked(createAdminClient).mockReturnValue(client);

    await expect(listPushBroadcastsForAdmin()).resolves.toEqual([]);
    expect(createAdminClient).toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("一覧が取れなければ例外", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient([{ data: null, error: { message: "boom" } }]);

    await expect(listPushBroadcastsForAdmin(client)).rejects.toThrow(
      "配信履歴の取得に失敗しました"
    );
  });
});

describe("createPushBroadcast", () => {
  const input = {
    title: "ハロウィン企画",
    body: "本文",
    url: "/style",
    sendAt: "2026-10-20T11:00:00.000Z",
    createdBy: "admin-1",
  };

  test("予約中として作り、作った行を返す", async () => {
    const { client, calls } = fakeClient([
      { data: { ...broadcastRow("b1", "scheduled", "a1"), announcement_id: null }, error: null },
    ]);

    const created = await createPushBroadcast(input, client);

    expect(calls).toContainEqual([
      "insert",
      [
        {
          title: "ハロウィン企画",
          body: "本文",
          url: "/style",
          send_at: "2026-10-20T11:00:00.000Z",
          status: "scheduled",
          created_by: "admin-1",
        },
      ],
    ]);
    expect(created).toEqual(
      expect.objectContaining({ id: "b1", status: "scheduled", announcementId: null })
    );
  });

  test("DB のエラーは例外", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient([{ data: null, error: { message: "boom" } }]);

    await expect(createPushBroadcast(input, client)).rejects.toThrow(
      "配信の作成に失敗しました"
    );
  });
});

describe("getPushBroadcastById", () => {
  test("見つかれば返す", async () => {
    const { client, calls } = fakeClient([
      { data: broadcastRow("b1", "scheduled", "a1"), error: null },
    ]);

    await expect(getPushBroadcastById("b1", client)).resolves.toEqual(
      expect.objectContaining({ id: "b1", status: "scheduled", announcementId: "a1" })
    );
    expect(calls).toContainEqual(["eq", ["id", "b1"]]);
  });

  test("見つからなければ null", async () => {
    const { client } = fakeClient([{ data: null, error: null }]);

    await expect(getPushBroadcastById("b1", client)).resolves.toBeNull();
  });

  test("DB のエラーは例外", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient([{ data: null, error: { message: "boom" } }]);

    await expect(getPushBroadcastById("b1", client)).rejects.toThrow(
      "配信の取得に失敗しました"
    );
  });
});

describe("getAnnouncementPushSummaries", () => {
  test("積み始めた配信だけ、送り終えていない数（pending と processing）を数える", async () => {
    const { client, rpc } = fakeClient(
      [
        {
          data: [
            broadcastRow("b1", "sent", "a1"),
            broadcastRow("b2", "scheduled", "a2"),
          ],
          error: null,
        },
      ],
      {
        data: [
          { broadcast_id: "b1", status: "pending", row_count: 2 },
          { broadcast_id: "b1", status: "processing", row_count: "1" },
          { broadcast_id: "b1", status: "sent", row_count: 5 },
        ],
        error: null,
      }
    );

    const summaries = await getAnnouncementPushSummaries(["a1", "a2"], client);

    expect(rpc).toHaveBeenCalledWith("admin_push_broadcast_stats", {
      p_broadcast_ids: ["b1"],
    });
    expect(summaries.get("a1")).toEqual({
      id: "b1",
      status: "sent",
      sendAt: "2026-10-20T11:00:00.000Z",
      enqueuedCount: 5,
      pendingCount: 3,
    });
    expect(summaries.get("a2")?.pendingCount).toBe(0);
  });

  test("数が取れなくても要約は返す（pendingCount は 0）", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient(
      [{ data: [broadcastRow("b1", "sent", "a1")], error: null }],
      { data: null, error: { message: "boom" } }
    );

    const summaries = await getAnnouncementPushSummaries(["a1"], client);

    expect(summaries.get("a1")).toEqual(
      expect.objectContaining({ status: "sent", pendingCount: 0 })
    );
  });

  test("積み始めた配信が無ければ数を問い合わせない", async () => {
    const { client, rpc } = fakeClient([
      { data: [broadcastRow("b2", "canceled", "a2")], error: null },
    ]);

    await getAnnouncementPushSummaries(["a2"], client);

    expect(rpc).not.toHaveBeenCalled();
  });

  test("お知らせが無ければ何も問い合わせない", async () => {
    const { client, calls, rpc } = fakeClient([]);

    await expect(getAnnouncementPushSummaries([], client)).resolves.toEqual(new Map());
    expect(calls).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("配信が取れなければ例外", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient([{ data: null, error: { message: "boom" } }]);

    await expect(getAnnouncementPushSummaries(["a1"], client)).rejects.toThrow(
      "プッシュ通知の状態の取得に失敗しました"
    );
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});
