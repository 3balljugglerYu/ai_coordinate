/** @jest-environment jsdom */

/**
 * 個人あてのお知らせを送るページの下書き(この端末のブラウザに残す)。
 *
 * 守ること:
 *  - 入力すると自動で残り、開き直すと元に戻る
 *  - 賞ごとに複数持てる(新しく書く・開く・消す)
 *  - 送れたら、その下書きは消える(同じ文を2回送らない)
 *  - 「この文をもとに新しく送る」で来たときは、写した文で始める(下書きで上書きしない)
 *  - 残せないブラウザでは、そのことを画面で知らせる
 */

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PersonalNoticeSendClient } from "@/features/personal-notices/components/PersonalNoticeSendClient";
import { DRAFTS_STORAGE_KEY, readDrafts } from "@/features/personal-notices/lib/local-drafts";

const toast = jest.fn();
const routerPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: jest.fn() }),
}));
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));
// 詳細ページの見た目はこの確認に関係しない
jest.mock("@/features/notifications/components/PersonalNoticeDetailScreen", () => ({
  PersonalNoticeDetailScreen: () => null,
}));

const jsonResponse = (data: unknown) => ({ ok: true, json: async () => data });

const emptyDefaults = { memo: "", title: "", body: "", codePrefix: "" };

function renderPage(props: Partial<Parameters<typeof PersonalNoticeSendClient>[0]> = {}) {
  return render(
    <PersonalNoticeSendClient defaults={emptyDefaults} copiedFromMemo={null} {...props} />,
  );
}

const FIELD_IDS = {
  memo: "pn-memo",
  title: "pn-title",
  body: "pn-body",
  recipients: "pn-recipients",
} as const;
type FieldName = keyof typeof FIELD_IDS;
const field = (name: FieldName) =>
  document.getElementById(FIELD_IDS[name]) as HTMLInputElement;

async function type(name: FieldName, value: string) {
  fireEvent.change(field(name), { target: { value } });
  // 少し待ってから残す
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  window.localStorage.clear();
  toast.mockReset();
  routerPush.mockReset();
});

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("入力すると自動で残り、開き直すと元に戻る(宛先も)", async () => {
  const first = renderPage();
  await type("memo", "ハロウィン マスター賞");
  await type("title", "マスター賞に選ばれました");
  await type("recipients", "https://www.persta.ai/users/abc");

  expect(screen.getByText(/この端末に下書きを残しました/)).toBeTruthy();
  expect(readDrafts()).toHaveLength(1);
  first.unmount();

  renderPage();
  await waitFor(() => expect(field("memo").value).toBe("ハロウィン マスター賞"));
  expect(field("title").value).toBe("マスター賞に選ばれました");
  expect(field("recipients").value).toBe("https://www.persta.ai/users/abc");
  expect(screen.getByText("下書き「ハロウィン マスター賞」を開きました。宛先はもう一度確かめてください。")).toBeTruthy();
});

test("待つ前にページを閉じても、閉じるときに残す", async () => {
  const page = renderPage();
  await act(async () => {});
  fireEvent.change(field("title"), { target: { value: "急いで閉じた" } });
  act(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
  expect(readDrafts()[0]?.title).toBe("急いで閉じた");
  page.unmount();
});

test("賞ごとに複数持てる: 新しく書く → 一覧から前の下書きを開く", async () => {
  renderPage();
  await act(async () => {});
  // 待たずに「新しく書く」を押しても、書いていたほうは残る
  fireEvent.change(field("memo"), { target: { value: "マスター賞" } });
  fireEvent.click(screen.getByRole("button", { name: /新しく書く/ }));
  expect(field("memo").value).toBe("");
  await type("memo", "コイン賞");

  expect(screen.getByText("この端末の下書き（2件）")).toBeTruthy();
  const masterRow = screen.getByText("マスター賞").closest("li") as HTMLElement;
  fireEvent.click(within(masterRow).getByRole("button", { name: "開く" }));
  expect(field("memo").value).toBe("マスター賞");
  // 切り替えても、書いていたほうは消えない
  expect(readDrafts().map((d) => d.memo).sort()).toEqual(["コイン賞", "マスター賞"]);
});

test("下書きを消すときは確かめてから消す", async () => {
  renderPage();
  await type("memo", "消すもの");
  fireEvent.click(screen.getByRole("button", { name: "下書き「消すもの」を消す" }));
  expect(readDrafts()).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "消す" }));
  expect(readDrafts()).toHaveLength(0);
  expect(field("memo").value).toBe("");
  expect(toast).toHaveBeenCalledWith({ title: "下書きを消しました" });
});

test("「この文をもとに新しく送る」で来たときは、写した文で始め、下書きで上書きしない", async () => {
  window.localStorage.setItem(
    DRAFTS_STORAGE_KEY,
    JSON.stringify([
      {
        id: "old",
        memo: "前の下書き",
        title: "前の題名",
        body: "前の本文",
        codePrefix: "",
        recipientsText: "",
        updatedAt: "2026-10-19T00:00:00.000Z",
      },
    ]),
  );
  renderPage({
    copiedFromMemo: "セレクション賞",
    defaults: { memo: "", title: "写した題名", body: "写した本文", codePrefix: "SEL" },
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  expect(field("title").value).toBe("写した題名");
  expect(screen.queryByText(/下書き「前の下書き」を開きました/)).toBeNull();
  // 写した文は新しい下書きとして残り、前の下書きもそのまま
  expect(readDrafts().map((d) => d.title).sort()).toEqual(["写した題名", "前の題名"]);
});

test("送れたら、その下書きは消える(ほかの下書きは残る)", async () => {
  renderPage();
  await type("memo", "残すほう");
  fireEvent.click(screen.getByRole("button", { name: /新しく書く/ }));
  await type("memo", "送るほう");
  await type("title", "当選のお知らせ");
  await type("body", "おめでとうございます");
  await type("recipients", "https://www.persta.ai/users/abc");

  const fetchMock = jest.fn(async (url: string) => {
    if (url.endsWith("/lookup")) {
      return jsonResponse({
        rows: [
          {
            line: 1,
            input: "https://www.persta.ai/users/abc",
            kind: "user",
            recipientId: "u1",
            nickname: "あい",
            avatarUrl: null,
            postId: null,
            postThumbUrl: null,
            error: null,
            errorMessage: null,
          },
        ],
      });
    }
    return jsonResponse({ notice_id: "n1", recipient_count: 1 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;

  fireEvent.click(screen.getByRole("button", { name: /宛先を確かめる/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: "1人に送る" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "1人に送る" }));
  fireEvent.click(screen.getByRole("button", { name: "送る" }));
  await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/admin/personal-notices/n1"));

  // 送ったあとに時間が経っても、ページを閉じても、送った文を残し直さない
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  act(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
  expect(readDrafts().map((d) => d.memo)).toEqual(["残すほう"]);
});

test("残せないブラウザでは、閉じると消えることを知らせ、離れる前に確かめる", async () => {
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("quota", "QuotaExceededError");
  });
  renderPage();
  await type("title", "書きかけ");
  expect(screen.getByText("このブラウザに下書きを残せませんでした。ページを閉じると入力が消えます。")).toBeTruthy();

  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});

test("残せているときは、離れる前に確かめない", async () => {
  renderPage();
  await type("title", "書きかけ");
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});
