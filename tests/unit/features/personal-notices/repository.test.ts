/** @jest-environment node */

jest.mock("server-only", () => ({}));

const tables: Record<string, unknown[]> = {};
const rpcMock = jest.fn();
const queries: Array<{ table: string; ops: Array<[string, ...unknown[]]> }> = [];

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: rpcMock,
    from(table: string) {
      const q = { table, ops: [] as Array<[string, ...unknown[]]> };
      queries.push(q);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "in", "eq", "order", "limit", "ilike", "range"]) {
        builder[op] = (...args: unknown[]) => {
          q.ops.push([op, ...args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => void) => {
        const inOp = q.ops.find((o) => o[0] === "in");
        let rows = tables[table] ?? [];
        if (inOp) {
          const [, column, values] = inOp as [string, string, string[]];
          rows = rows.filter((r) => values.includes((r as Record<string, string>)[column]));
        }
        resolve({ data: rows, error: null });
      };
      return builder;
    },
  }),
}));

jest.mock("@/features/posts/lib/utils", () => ({
  getPostThumbUrl: (p: { storage_path_thumb?: string }) =>
    p.storage_path_thumb ? `https://cdn.example/${p.storage_path_thumb}` : "",
}));

import {
  listPersonalNotices,
  lookupPersonalNoticeRecipients,
  sendPersonalNotice,
  retractPersonalNoticeRecipient,
} from "@/features/personal-notices/lib/repository";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const POST_OK = uuid(1);
const POST_HIDDEN = uuid(2);
const POST_OTHER = uuid(3);
const ALICE = uuid(11);
const BOB = uuid(12);
const STOPPED = uuid(13);
const NOBODY = uuid(14);

const post = (id: string, user_id: string, overrides = {}) => ({
  id,
  user_id,
  is_posted: true,
  moderation_status: "visible",
  image_url: null,
  storage_path: null,
  storage_path_thumb: `${id}.webp`,
  ...overrides,
});

beforeEach(() => {
  queries.length = 0;
  rpcMock.mockReset();
  tables.generated_images = [
    post(POST_OK, ALICE),
    post(POST_HIDDEN, BOB, { is_posted: false }),
    post(POST_OTHER, ALICE),
  ];
  tables.profiles = [
    { user_id: ALICE, nickname: "はるまき", avatar_url: "https://a.example/a.png", deactivated_at: null },
    { user_id: BOB, nickname: "そらいろ", avatar_url: null, deactivated_at: null },
    { user_id: STOPPED, nickname: "停止", avatar_url: null, deactivated_at: "2026-10-01T00:00:00Z" },
  ];
});

const lines = (...inputs: string[]) => inputs.map((input, i) => ({ line: i + 1, input }));
const postUrl = (id: string) => `https://www.persta.ai/posts/${id}`;
const userUrl = (id: string) => `https://www.persta.ai/users/${id}`;

describe("lookupPersonalNoticeRecipients", () => {
  test("投稿の行は投稿した人を宛先にして作品を付け_ユーザーの行は文だけ", async () => {
    const rows = await lookupPersonalNoticeRecipients(lines(postUrl(POST_OK), userUrl(BOB)));

    expect(rows).toEqual([
      expect.objectContaining({
        line: 1,
        kind: "post",
        recipientId: ALICE,
        postId: POST_OK,
        nickname: "はるまき",
        avatarUrl: "https://a.example/a.png",
        postThumbUrl: `https://cdn.example/${POST_OK}.webp`,
        error: null,
      }),
      expect.objectContaining({
        line: 2,
        kind: "user",
        recipientId: BOB,
        postId: null,
        nickname: "そらいろ",
        error: null,
      }),
    ]);
  });

  test("全部の行を確かめ_それぞれの理由を返す(最初の1行で止めない)", async () => {
    const rows = await lookupPersonalNoticeRecipients(
      lines(
        "abc",
        postUrl(uuid(99)),
        postUrl(POST_HIDDEN),
        userUrl(NOBODY),
        userUrl(STOPPED),
        postUrl(POST_OK),
        postUrl(POST_OTHER)
      )
    );

    expect(rows.map((r) => [r.line, r.error, r.duplicateOfLine])).toEqual([
      [1, "invalid_input", null],
      [2, "post_not_found", null],
      [3, "post_not_visible", null],
      [4, "user_not_found", null],
      [5, "user_unavailable", null],
      [6, null, null],
      // 同じ人(はるまき)の別の作品も「同じ人」(1回に1人1通)
      [7, "duplicate", 6],
    ]);
    // 公開中でない作品でも、誰の作品かは見せる
    expect(rows[2]).toMatchObject({ recipientId: BOB, nickname: "そらいろ" });
  });

  test("公開停止の作品も送れない", async () => {
    tables.generated_images = [post(POST_OK, ALICE, { moderation_status: "pending" })];

    const [row] = await lookupPersonalNoticeRecipients(lines(postUrl(POST_OK)));

    expect(row.error).toBe("post_not_visible");
  });

  test("投稿もユーザーもまとめて1回ずつ読む", async () => {
    await lookupPersonalNoticeRecipients(
      lines(postUrl(POST_OK), postUrl(POST_HIDDEN), userUrl(BOB), userUrl(STOPPED))
    );

    expect(queries.map((q) => q.table)).toEqual(["generated_images", "profiles"]);
    const profileIn = queries[1].ops.find((o) => o[0] === "in");
    expect(new Set(profileIn?.[2] as string[])).toEqual(new Set([ALICE, BOB, STOPPED]));
  });
});

describe("sendPersonalNotice", () => {
  const input = {
    adminUserId: "admin-1",
    memo: "m",
    title: "t",
    body: "b",
    codePrefix: null,
    recipients: [{ recipientId: ALICE, postId: POST_OK }, { recipientId: BOB, postId: null }],
  };

  test("RPC にそのまま渡し_送った回のIDと人数を返す", async () => {
    rpcMock.mockResolvedValue({
      data: { notice_id: "notice-1", recipients: [{}, {}] },
      error: null,
    });

    await expect(sendPersonalNotice(input)).resolves.toEqual({
      ok: true,
      noticeId: "notice-1",
      recipientCount: 2,
    });
    expect(rpcMock).toHaveBeenCalledWith("send_personal_notice", {
      p_admin_user_id: "admin-1",
      p_memo: "m",
      p_title: "t",
      p_body_template: "b",
      p_code_prefix: null,
      p_recipients: [
        { recipient_id: ALICE, post_id: POST_OK },
        { recipient_id: BOB, post_id: null },
      ],
    });
  });

  test("PN_ のエラーはコードと行(0始まり)を返す", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "PN_POST_NOT_ALLOWED", details: "1" },
    });

    await expect(sendPersonalNotice(input)).resolves.toEqual({
      ok: false,
      code: "PN_POST_NOT_ALLOWED",
      rowIndex: 1,
    });
  });

  test("知らないエラーは UNKNOWN", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "connection reset", details: null },
    });

    await expect(sendPersonalNotice(input)).resolves.toEqual({
      ok: false,
      code: "UNKNOWN",
      rowIndex: null,
    });
  });
});

describe("retractPersonalNoticeRecipient", () => {
  test("取り消したか(2回目は false)を返す", async () => {
    rpcMock.mockResolvedValueOnce({ data: { retracted: true }, error: null });
    rpcMock.mockResolvedValueOnce({ data: { retracted: false }, error: null });

    const args = { adminUserId: "admin-1", recipientRowId: "row-1" };
    await expect(retractPersonalNoticeRecipient(args)).resolves.toEqual({ ok: true, retracted: true });
    await expect(retractPersonalNoticeRecipient(args)).resolves.toEqual({ ok: true, retracted: false });
    expect(rpcMock).toHaveBeenCalledWith("retract_personal_notice_recipient", {
      p_admin_user_id: "admin-1",
      p_recipient_row_id: "row-1",
    });
  });

  test("見つからない行はコードを返す", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "PN_RECIPIENT_ROW_NOT_FOUND" } });

    await expect(
      retractPersonalNoticeRecipient({ adminUserId: "a", recipientRowId: "r" })
    ).resolves.toEqual({ ok: false, code: "PN_RECIPIENT_ROW_NOT_FOUND" });
  });
});

describe("listPersonalNotices", () => {
  test("開いた人数は取り消した人を数えず_取り消しは別に数える", async () => {
    tables.personal_notices = [
      { id: "n1", memo: "ベストショット賞", title: "t", recipient_count: 3, created_at: "2026-11-07T11:00:00Z" },
    ];
    tables.personal_notice_recipients = [
      { id: "r1", notice_id: "n1", opened_at: "2026-11-07T12:00:00Z", retracted_at: null },
      { id: "r2", notice_id: "n1", opened_at: null, retracted_at: null },
      { id: "r3", notice_id: "n1", opened_at: "2026-11-07T12:00:00Z", retracted_at: "2026-11-07T13:00:00Z" },
    ];

    await expect(listPersonalNotices()).resolves.toEqual([
      {
        id: "n1",
        memo: "ベストショット賞",
        title: "t",
        recipientCount: 3,
        openedCount: 1,
        retractedCount: 1,
        createdAt: "2026-11-07T11:00:00Z",
      },
    ]);
  });

  test("メモで探すときは % と _ を文字として探す", async () => {
    tables.personal_notices = [];

    await listPersonalNotices(" 100%_賞 ");

    const ilike = queries[0].ops.find((o) => o[0] === "ilike");
    expect(ilike).toEqual(["ilike", "memo", "%100\\%\\_賞%"]);
  });
});
