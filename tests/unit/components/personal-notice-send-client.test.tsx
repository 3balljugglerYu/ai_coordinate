/**
 * 管理画面: 個人あてのお知らせを送るページ。
 * 守ること: 確かめた宛先と今の宛先が同じで、赤い行がないときだけ送れる。
 */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PersonalNoticeSendClient } from "@/features/personal-notices/components/PersonalNoticeSendClient";
import { buildPersonalNoticeRecipientsCsv } from "@/features/personal-notices/components/PersonalNoticeRecipientsClient";

const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: jest.fn() }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, src }: { alt?: string; src?: string }) =>
    React.createElement("img", { alt, src }),
}));

jest.mock("next-intl", () => ({
  useTranslations: () => ((key: string) => key) as never,
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock("@/features/notifications/components/UnreadNotificationProvider", () => ({
  useUnreadNotificationCount: () => ({ refreshUnreadCount: jest.fn() }),
}));

jest.mock("@/features/notifications/lib/personal-notice-api", () => ({
  markPersonalNoticeOpened: jest.fn(),
}));

const row = (line: number, overrides = {}) => ({
  line,
  input: `https://www.persta.ai/posts/p${line}`,
  kind: "post",
  recipientId: `u${line}`,
  postId: `p${line}`,
  nickname: `n${line}`,
  avatarUrl: null,
  postThumbUrl: null,
  error: null,
  duplicateOfLine: null,
  errorMessage: null,
  ...overrides,
});

const fetchMock = jest.fn();

function respond(json: unknown, ok = true) {
  fetchMock.mockResolvedValueOnce({ ok, json: async () => json });
}

function renderClient() {
  return render(
    <PersonalNoticeSendClient
      copiedFromMemo={null}
      defaults={{ memo: "", title: "", body: "", codePrefix: "" }}
    />
  );
}

function sendButton() {
  return screen.getAllByRole("button").find((b) => /人に送る|^送る$/.test(b.textContent ?? ""))!;
}

async function fillAndLookup(rows: unknown[]) {
  fireEvent.change(screen.getByLabelText(/① 宛先/), {
    target: { value: rows.map((r) => (r as { input: string }).input).join("\n") },
  });
  respond({ rows });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "宛先を確かめる" }));
  });
}

function fillTexts(body = "受付番号: {受付番号}", prefix = "HBS") {
  fireEvent.change(screen.getByLabelText(/管理用のメモ/), { target: { value: "ベストショット賞" } });
  fireEvent.change(screen.getByLabelText(/^題名/), { target: { value: "当選のお知らせ" } });
  fireEvent.change(screen.getByLabelText(/^本文/), { target: { value: body } });
  if (prefix) {
    fireEvent.change(screen.getByLabelText(/受付番号の頭の英字/), { target: { value: prefix } });
  }
}

beforeEach(() => {
  fetchMock.mockReset();
  pushMock.mockReset();
  global.fetch = fetchMock as never;
});

describe("PersonalNoticeSendClient", () => {
  test("確かめる前は送れない", () => {
    renderClient();
    fillTexts();
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
  });

  test("赤い行があると送れず_理由が出る", async () => {
    renderClient();
    await fillAndLookup([row(1), row(2, { error: "post_not_visible", errorMessage: "作品が公開中ではありません" })]);
    fillTexts();

    expect(screen.getByText("作品が公開中ではありません")).toBeTruthy();
    expect(screen.getByText(/送れない行が1つあります/)).toBeTruthy();
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
  });

  test("確かめたあとに宛先を変えたら_確かめ直すまで送れない", async () => {
    renderClient();
    await fillAndLookup([row(1)]);
    fillTexts();
    expect((sendButton() as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(screen.getByLabelText(/① 宛先/), { target: { value: "https://www.persta.ai/posts/p9" } });

    expect(screen.getByText(/宛先を変えました/)).toBeTruthy();
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
  });

  test("確認してから送ると_貼った文のまま送り_送った回のページへ移る", async () => {
    renderClient();
    await fillAndLookup([row(1), row(2, { kind: "user", postId: null })]);
    fillTexts();

    expect(sendButton().textContent).toContain("2人に送る");
    fireEvent.click(sendButton());
    expect(screen.getByText("2人に送りますか？")).toBeTruthy();

    respond({ notice_id: "notice-1", recipient_count: 2 });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "送る" }));
    });

    const [, init] = fetchMock.mock.calls[1];
    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/personal-notices");
    expect(JSON.parse(init.body)).toEqual({
      recipients_text: "https://www.persta.ai/posts/p1\nhttps://www.persta.ai/posts/p2",
      memo: "ベストショット賞",
      title: "当選のお知らせ",
      body: "受付番号: {受付番号}",
      code_prefix: "HBS",
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin/personal-notices/notice-1"));
  });

  test("本文に {受付番号} が無ければ頭の英字は送らない", async () => {
    renderClient();
    await fillAndLookup([row(1)]);
    fillTexts("200ペルコインを付与しました", "");

    fireEvent.click(sendButton());
    respond({ notice_id: "n", recipient_count: 1 });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "送る" }));
    });

    expect(JSON.parse(fetchMock.mock.calls[1][1].body).code_prefix).toBeNull();
  });

  test("{受付番号} があるのに頭の英字が無いと_押しても確認を出さない", async () => {
    renderClient();
    await fillAndLookup([row(1)]);
    fillTexts("受付番号: {受付番号}", "");

    fireEvent.click(sendButton());

    expect(screen.queryByText(/人に送りますか/)).toBeNull();
    expect(screen.getByText(/があるときは入れてください/)).toBeTruthy();
  });

  test("送るときにサーバーが赤い行を返したら_表を差し替えてエラーを出す", async () => {
    renderClient();
    await fillAndLookup([row(1)]);
    fillTexts();

    fireEvent.click(sendButton());
    respond(
      {
        error: "送れない宛先があります。直してからもう一度確かめてください",
        rows: [row(1, { error: "user_unavailable", errorMessage: "退会・停止中のユーザーです" })],
      },
      false
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "送る" }));
    });

    expect(screen.getByText("退会・停止中のユーザーです")).toBeTruthy();
    expect(screen.getByText(/送れない宛先があります/)).toBeTruthy();
    expect(pushMock).not.toHaveBeenCalled();
  });

  test("「{受付番号} を入れる」は本文に印を入れ_プレビューは例の番号に置き換わる", async () => {
    renderClient();
    await fillAndLookup([row(1)]);
    fillTexts("番号: ", "HBS");

    fireEvent.click(screen.getByRole("button", { name: /を入れる/ }));

    expect((screen.getByLabelText(/^本文/) as HTMLTextAreaElement).value).toContain("{受付番号}");
    expect(screen.getAllByText(/HBS-7F3K/).length).toBeGreaterThan(0);
  });
});

describe("buildPersonalNoticeRecipientsCsv", () => {
  test("照合用の列を出し_数式として動く値は無害化する", () => {
    const csv = buildPersonalNoticeRecipientsCsv(
      [
        {
          id: "r1",
          recipientId: "u1",
          nickname: "=HYPERLINK(\"x\")",
          avatarUrl: null,
          receiptCode: "HBS-7F3K",
          postId: "p1",
          postThumbUrl: null,
          openedAt: "2026-11-07T11:14:00Z",
          retractedAt: null,
        },
        {
          id: "r2",
          recipientId: "u2",
          nickname: "もちこ",
          avatarUrl: null,
          receiptCode: null,
          postId: null,
          postThumbUrl: null,
          openedAt: null,
          retractedAt: "2026-11-07T12:00:00Z",
        },
      ],
      "https://www.persta.ai"
    );

    expect(csv.split("\n")).toEqual([
      "nickname,user_id,receipt_code,post_url,opened_at,retracted_at",
      `"'=HYPERLINK(""x"")",u1,HBS-7F3K,https://www.persta.ai/posts/p1,2026-11-07 20:14 JST,`,
      "もちこ,u2,,,,2026-11-07 21:00 JST",
    ]);
  });
});
