/**
 * 運営配信の DB 読み書き（push-broadcast-repository）。
 *
 * 守ること:
 *  - 予約の変更は送る前（scheduled / canceled）の行だけを書き換え、0 行なら false を返す
 *    （送信が始まっていたのに成功扱いにしない）
 *  - 取り消しは予約中（scheduled）の行だけ。0 行なら false
 *  - お知らせの要約には、送り終えていない送信待ちの数（pendingCount）を付ける。
 *    数えるのは積み始めた配信だけ
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import {
  applyAnnouncementPushAction,
  getAnnouncementPushSummaries,
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
});

afterEach(() => {
  jest.restoreAllMocks();
});
