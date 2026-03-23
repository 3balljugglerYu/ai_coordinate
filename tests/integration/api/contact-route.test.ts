/** @jest-environment node */

const mockEnv = {
  RESEND_API_KEY: "re_test_key",
  CONTACT_EMAIL: "inbox@example.com",
  RESEND_FROM_EMAIL: "from@example.com",
};

jest.mock("@/lib/env", () => ({
  get env() {
    return mockEnv;
  },
}));

const sendMock = jest.fn();

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

const createClientMock = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import type { NextRequest } from "next/server";
import { Resend } from "resend";
import { POST } from "@/app/api/contact/route";

function createPostRequest(
  body: string | object,
  init?: { headers?: Record<string, string> },
): NextRequest {
  const payload =
    typeof body === "string" ? body : JSON.stringify(body);
  const request = new Request("http://localhost/api/contact", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept-language": "ja",
      ...init?.headers,
    },
    body: payload,
  });
  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: { get: () => undefined },
  }) as NextRequest;
}

function buildSupabase(user: {
  id: string;
  email?: string | null;
  created_at?: string;
} | null) {
  const getUser = jest.fn().mockResolvedValue({
    data: { user },
    error: null,
  });
  const maybeSingle = jest.fn().mockResolvedValue({
    data: null as { nickname: string | null; created_at: string } | null,
    error: null,
  });
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });
  return { auth: { getUser }, from };
}

describe("POST /api/contact", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.RESEND_API_KEY = "re_test_key";
    mockEnv.CONTACT_EMAIL = "inbox@example.com";
    mockEnv.RESEND_FROM_EMAIL = "from@example.com";
    sendMock.mockResolvedValue({
      data: { id: "email-msg-1" },
      error: null,
    });
    createClientMock.mockResolvedValue(buildSupabase(null));
  });

  test("POST_未ログインの場合_401で認証必須", async () => {
    // Spec: CONTACT-001
    createClientMock.mockResolvedValue(buildSupabase(null));

    const res = await POST(
      createPostRequest({
        email: "a@b.com",
        subject: "S",
        message: "M",
      }),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(401);
    expect(body.errorCode).toBe("CONTACT_AUTH_REQUIRED");
    expect(body.error).toBe("ログインが必要です");
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("POST_不正メールの場合_400でinvalidInput系", async () => {
    // Spec: CONTACT-002
    createClientMock.mockResolvedValue(
      buildSupabase({ id: "u1", email: "user@example.com" }),
    );

    const res = await POST(
      createPostRequest({
        email: "not-an-email",
        subject: "Valid subject",
        message: "Body",
      }),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.errorCode).toBe("CONTACT_INVALID_INPUT");
    expect(body.error).toBe("有効なメールアドレスを入力してください");
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("POST_件名空の場合_400でinvalidSubject", async () => {
    // Spec: CONTACT-002
    createClientMock.mockResolvedValue(
      buildSupabase({ id: "u1", email: "user@example.com" }),
    );

    const res = await POST(
      createPostRequest({
        email: "a@b.com",
        subject: "",
        message: "Body text",
      }),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.errorCode).toBe("CONTACT_INVALID_INPUT");
    expect(body.error).toBe("件名を入力してください");
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("POST_本文空の場合_400でinvalidMessage", async () => {
    // Spec: CONTACT-002
    createClientMock.mockResolvedValue(
      buildSupabase({ id: "u1", email: "user@example.com" }),
    );

    const res = await POST(
      createPostRequest({
        email: "a@b.com",
        subject: "Subject",
        message: "",
      }),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.errorCode).toBe("CONTACT_INVALID_INPUT");
    expect(body.error).toBe("お問い合わせ内容を入力してください");
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("POST_RESENDキー無しの場合_500で未設定", async () => {
    // Spec: CONTACT-003
    mockEnv.RESEND_API_KEY = "";
    createClientMock.mockResolvedValue(
      buildSupabase({ id: "u1", email: "user@example.com" }),
    );

    const res = await POST(
      createPostRequest({
        email: "a@b.com",
        subject: "Subject",
        message: "Message body",
      }),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.errorCode).toBe("CONTACT_EMAIL_NOT_CONFIGURED");
    expect(body.error).toBe("メール送信の設定が完了していません");
    expect(sendMock).not.toHaveBeenCalled();
    expect(Resend).not.toHaveBeenCalled();
  });

  test("POST_Resendエラーの場合_500で送信失敗", async () => {
    // Spec: CONTACT-004
    createClientMock.mockResolvedValue(
      buildSupabase({ id: "u1", email: "user@example.com" }),
    );
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: "provider down" },
    });

    const res = await POST(
      createPostRequest({
        email: "a@b.com",
        subject: "Subject",
        message: "Message body",
      }),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.errorCode).toBe("CONTACT_SEND_FAILED");
    expect(body.error).toBe(
      "メールの送信に失敗しました。しばらく経ってからお試しください。",
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test("POST_正常送信の場合_200でsuccess", async () => {
    // Spec: CONTACT-005
    createClientMock.mockResolvedValue(
      buildSupabase({ id: "u1", email: "user@example.com" }),
    );
    sendMock.mockResolvedValueOnce({
      data: { id: "re_abc" },
      error: null,
    });

    const res = await POST(
      createPostRequest({
        email: "sender@example.com",
        subject: "Hello",
        message: "Content",
      }),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.id).toBe("re_abc");
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test("POST_未処理例外の場合_500でunknown", async () => {
    // Spec: CONTACT-006
    createClientMock.mockResolvedValue(
      buildSupabase({ id: "u1", email: "user@example.com" }),
    );

    const res = await POST(createPostRequest("{not valid json"));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.errorCode).toBe("CONTACT_UNKNOWN_ERROR");
    expect(body.error).toBe(
      "エラーが発生しました。しばらく経ってからお試しください。",
    );
  });

  test("POST_件名に改行の場合_送信前にサニタイズする", async () => {
    // Spec: CONTACT-007
    createClientMock.mockResolvedValue(
      buildSupabase({ id: "u1", email: "user@example.com" }),
    );
    sendMock.mockResolvedValueOnce({
      data: { id: "re_xyz" },
      error: null,
    });

    const res = await POST(
      createPostRequest({
        email: "a@b.com",
        subject: "Line1\nLine2",
        message: "OK",
      }),
    );

    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0][0] as {
      subject: string;
      html: string;
    };
    expect(payload.subject).not.toMatch(/[\r\n]/);
    expect(payload.subject).toContain("Line1");
    expect(payload.subject).toContain("Line2");
    expect(payload.html).not.toMatch(/Line1\r?\nLine2/);
  });
});
