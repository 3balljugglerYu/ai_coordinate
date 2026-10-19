/** @jest-environment node */

jest.mock("server-only", () => ({}));

jest.mock("@/lib/auth", () => ({
  requireAdmin: jest.fn(),
}));

jest.mock("@/lib/admin-audit", () => ({
  logAdminAction: jest.fn(),
}));

jest.mock("@/features/personal-notices/lib/repository", () => ({
  lookupPersonalNoticeRecipients: jest.fn(),
  sendPersonalNotice: jest.fn(),
  retractPersonalNoticeRecipient: jest.fn(),
}));

import { NextRequest, NextResponse } from "next/server";
import { POST as sendPost } from "@/app/api/admin/personal-notices/route";
import { POST as lookupPost } from "@/app/api/admin/personal-notices/lookup/route";
import { POST as retractPost } from "@/app/api/admin/personal-notices/recipients/[id]/retract/route";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import {
  lookupPersonalNoticeRecipients,
  retractPersonalNoticeRecipient,
  sendPersonalNotice,
} from "@/features/personal-notices/lib/repository";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockLog = logAdminAction as jest.MockedFunction<typeof logAdminAction>;
const mockLookup = lookupPersonalNoticeRecipients as jest.MockedFunction<
  typeof lookupPersonalNoticeRecipients
>;
const mockSend = sendPersonalNotice as jest.MockedFunction<typeof sendPersonalNotice>;
const mockRetract = retractPersonalNoticeRecipient as jest.MockedFunction<
  typeof retractPersonalNoticeRecipient
>;

const ROW_ID = "11111111-2222-4333-8444-555555555555";

function request(path: string, body?: unknown, origin: string | null = "http://localhost:3000") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const okRow = (line: number, overrides = {}) => ({
  line,
  input: `x${line}`,
  kind: "post" as const,
  recipientId: `user-${line}`,
  postId: `post-${line}`,
  nickname: `n${line}`,
  avatarUrl: null,
  postThumbUrl: null,
  error: null,
  duplicateOfLine: null,
  ...overrides,
});

const validSend = {
  recipients_text: "x1\n\nx2",
  memo: " ベストショット賞 ",
  title: " 🎃当選のお知らせ ",
  body: "受付番号: {受付番号}",
  code_prefix: "HBS",
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockRequireAdmin.mockResolvedValue({ id: "admin-1" } as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /api/admin/personal-notices/lookup", () => {
  test("別サイトからは403で確かめない", async () => {
    const res = await lookupPost(request("/api/admin/personal-notices/lookup", { recipients_text: "x" }, "https://evil.example"));
    expect(res.status).toBe(403);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  test("管理者でなければ requireAdmin の応答をそのまま返す", async () => {
    mockRequireAdmin.mockRejectedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const res = await lookupPost(request("/api/admin/personal-notices/lookup", { recipients_text: "x" }));
    expect(res.status).toBe(403);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  test("空・201行は400", async () => {
    const empty = await lookupPost(request("/api/admin/personal-notices/lookup", { recipients_text: " \n " }));
    expect(empty.status).toBe(400);

    const many = Array.from({ length: 201 }, (_, i) => `x${i}`).join("\n");
    const tooMany = await lookupPost(request("/api/admin/personal-notices/lookup", { recipients_text: many }));
    expect(tooMany.status).toBe(400);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  test("行ごとの結果に画面の文を付けて返す", async () => {
    mockLookup.mockResolvedValue([
      okRow(1),
      okRow(3, { error: "duplicate", duplicateOfLine: 1 }),
    ]);

    const res = await lookupPost(request("/api/admin/personal-notices/lookup", { recipients_text: "x1\n\nx3" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockLookup).toHaveBeenCalledWith([
      { line: 1, input: "x1" },
      { line: 3, input: "x3" },
    ]);
    expect(json.rows.map((r: { errorMessage: string | null }) => r.errorMessage)).toEqual([
      null,
      "1行目と同じ人です",
    ]);
  });
});

describe("POST /api/admin/personal-notices", () => {
  test("宛先をサーバーで確かめ直し_セッションの管理者で送り_操作記録を残す", async () => {
    mockLookup.mockResolvedValue([okRow(1), okRow(3, { kind: "user", postId: null })]);
    mockSend.mockResolvedValue({ ok: true, noticeId: "notice-1", recipientCount: 2 });

    const res = await sendPost(request("/api/admin/personal-notices", validSend));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notice_id: "notice-1", recipient_count: 2 });
    expect(mockSend).toHaveBeenCalledWith({
      adminUserId: "admin-1",
      memo: "ベストショット賞",
      title: "🎃当選のお知らせ",
      body: "受付番号: {受付番号}",
      codePrefix: "HBS",
      recipients: [
        { recipientId: "user-1", postId: "post-1" },
        { recipientId: "user-3", postId: null },
      ],
    });
    expect(mockLog).toHaveBeenCalledWith({
      adminUserId: "admin-1",
      actionType: "personal_notice_send",
      targetType: "personal_notice",
      targetId: "notice-1",
      metadata: { memo: "ベストショット賞", recipient_count: 2, code_prefix: "HBS" },
    });
  });

  test("送れない行が1つでもあれば何も送らず_行の結果を返す", async () => {
    mockLookup.mockResolvedValue([okRow(1), okRow(3, { error: "post_not_visible" })]);

    const res = await sendPost(request("/api/admin/personal-notices", validSend));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.rows[1].errorMessage).toBe("作品が公開中ではありません");
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
  });

  test("本文の前後の改行・空白は落として送る(DB の btrim は半角の空白しか落とさない)", async () => {
    mockLookup.mockResolvedValue([okRow(1)]);
    mockSend.mockResolvedValue({ ok: true, noticeId: "n", recipientCount: 1 });

    await sendPost(request("/api/admin/personal-notices", { ...validSend, body: "\n　受付番号: {受付番号}\n\n\n" }));

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ body: "受付番号: {受付番号}" }));
  });

  test("本文に {受付番号} が無ければ頭の英字は送らない", async () => {
    mockLookup.mockResolvedValue([okRow(1)]);
    mockSend.mockResolvedValue({ ok: true, noticeId: "n", recipientCount: 1 });

    await sendPost(request("/api/admin/personal-notices", { ...validSend, body: "200ペルコインを付与しました", code_prefix: "HBS" }));

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ codePrefix: null }));
  });

  test.each([
    ["題名に {受付番号}", { title: "{受付番号}" }],
    ["{受付番号} があるのに頭の英字なし", { code_prefix: "" }],
    ["頭の英字が小文字", { code_prefix: "hbs" }],
    ["題名が61文字", { title: "あ".repeat(61) }],
    ["メモが空", { memo: "  " }],
  ])("入力の誤り(%s)は400で何も送らない", async (_label, change) => {
    const res = await sendPost(request("/api/admin/personal-notices", { ...validSend, ...change }));
    expect(res.status).toBe(400);
    expect(mockLookup).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("題名の文字数は絵文字も1文字と数える(DB の char_length と同じ)", async () => {
    mockLookup.mockResolvedValue([okRow(1)]);
    mockSend.mockResolvedValue({ ok: true, noticeId: "n", recipientCount: 1 });

    const res = await sendPost(request("/api/admin/personal-notices", { ...validSend, title: "🎃".repeat(60) }));

    expect(res.status).toBe(200);
  });

  test("DB 関数のエラーは画面の文と行番号(貼った文の行)で返し_記録は残さない", async () => {
    mockLookup.mockResolvedValue([okRow(1), okRow(3)]);
    mockSend.mockResolvedValue({ ok: false, code: "PN_POST_NOT_ALLOWED", rowIndex: 1 });

    const res = await sendPost(request("/api/admin/personal-notices", validSend));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({
      error: "送れない宛先があります。もう一度確かめてください",
      errorCode: "PN_POST_NOT_ALLOWED",
      line: 3,
    });
    expect(mockLog).not.toHaveBeenCalled();
  });

  test("admin_users にいない管理者は403", async () => {
    mockLookup.mockResolvedValue([okRow(1)]);
    mockSend.mockResolvedValue({ ok: false, code: "PN_ADMIN_REQUIRED", rowIndex: null });

    const res = await sendPost(request("/api/admin/personal-notices", validSend));

    expect(res.status).toBe(403);
  });

  test("別サイトからは403で何も送らない", async () => {
    const res = await sendPost(request("/api/admin/personal-notices", validSend, "https://evil.example"));
    expect(res.status).toBe(403);
    expect(mockRequireAdmin).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/personal-notices/recipients/[id]/retract", () => {
  const params = (id = ROW_ID) => ({ params: Promise.resolve({ id }) });
  const path = `/api/admin/personal-notices/recipients/${ROW_ID}/retract`;

  test("取り消したら操作記録を残す", async () => {
    mockRetract.mockResolvedValue({ ok: true, retracted: true });

    const res = await retractPost(request(path), params());

    expect(res.status).toBe(200);
    expect(mockRetract).toHaveBeenCalledWith({ adminUserId: "admin-1", recipientRowId: ROW_ID });
    expect(mockLog).toHaveBeenCalledWith({
      adminUserId: "admin-1",
      actionType: "personal_notice_retract",
      targetType: "personal_notice_recipient",
      targetId: ROW_ID,
    });
  });

  test("取り消し済み(2回目)は記録を増やさない", async () => {
    mockRetract.mockResolvedValue({ ok: true, retracted: false });

    const res = await retractPost(request(path), params());

    expect(res.status).toBe(200);
    expect(mockLog).not.toHaveBeenCalled();
  });

  test("UUIDでない・見つからない行は404", async () => {
    const bad = await retractPost(request(path), params("x"));
    expect(bad.status).toBe(404);
    expect(mockRetract).not.toHaveBeenCalled();

    mockRetract.mockResolvedValue({ ok: false, code: "PN_RECIPIENT_ROW_NOT_FOUND" });
    const missing = await retractPost(request(path), params());
    expect(missing.status).toBe(404);
  });

  test("別サイトからは403", async () => {
    const res = await retractPost(request(path, undefined, "https://evil.example"), params());
    expect(res.status).toBe(403);
    expect(mockRetract).not.toHaveBeenCalled();
  });
});
