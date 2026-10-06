/**
 * @jest-environment jsdom
 *
 * 「本文から名前の欄を作る」道具の画面(「ガチャに分ける」と同じ作り)。
 * ⭐ 押しても本文は書き換えず、案を見せて「採用」で初めて書き換える。「元に戻す」で戻せる。
 */

const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NameInputCreateTool } from "@/features/generation/components/NameInputCreateTool";

const ORIGINAL = "{{INPUT:名前}}\n野菜のドレス\n【名前】〇〇";
const CREATED = {
  original: "野菜のドレス\n【名前】〇〇",
  body: "野菜のドレス\n{{INPUT:名前}}",
  removedLines: [2],
  balance: 95,
};
const SLOT = { label: "名前", required: false };
const mockProposalOpen = jest.fn();

function Harness({ initialPrompt = ORIGINAL }: { initialPrompt?: string }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  return (
    <>
      <NameInputCreateTool
        prompt={prompt}
        slot={SLOT}
        onApply={setPrompt}
        onProposalOpenChange={mockProposalOpen}
      />
      <output data-testid="prompt">{prompt}</output>
      <button type="button" onClick={() => setPrompt(`${prompt}\n追記`)}>
        edit-body
      </button>
    </>
  );
}

let fetchMock: jest.Mock;
function respondWith(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });
}

beforeEach(() => {
  fetchMock = jest.fn();
  Object.defineProperty(globalThis, "fetch", { value: fetchMock, writable: true, configurable: true });
  mockRefresh.mockClear();
  mockProposalOpen.mockClear();
});

const createButton = () =>
  screen.getByRole("button", { name: /nameInputCreateButton|nameInputCreatePending/ });
const promptText = () => screen.getByTestId("prompt").textContent;

describe("NameInputCreateTool", () => {
  test("目印しかない本文では押せない", () => {
    render(<Harness initialPrompt="{{INPUT:名前}}" />);
    expect(createButton()).toHaveProperty("disabled", true);
  });

  test("押すと本文と欄の設定を送り、案を見せるが、本文はまだ変えない", async () => {
    const user = userEvent.setup();
    respondWith(200, CREATED);
    render(<Harness />);
    await user.click(createButton());

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/name-input/create",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ prompt: ORIGINAL, slot: SLOT }) }),
    );
    expect(await screen.findByTestId("name-input-create-proposal")).toBeTruthy();
    expect(screen.getAllByTestId("name-input-create-removed-line").map((n) => n.textContent)).toEqual([
      "【名前】〇〇",
    ]);
    expect(screen.getByTestId("name-input-create-proposal-body").textContent).toBe(CREATED.body);
    expect(promptText()).toBe(ORIGINAL);
    expect(mockProposalOpen).toHaveBeenLastCalledWith(true);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  test("採用で書き換え、元に戻すで戻せる", async () => {
    const user = userEvent.setup();
    respondWith(200, CREATED);
    render(<Harness />);
    await user.click(createButton());
    await user.click(await screen.findByRole("button", { name: "gachaSplitAccept" }));
    expect(promptText()).toBe(CREATED.body);
    expect(mockProposalOpen).toHaveBeenLastCalledWith(false);

    await user.click(screen.getByRole("button", { name: "gachaSplitUndo" }));
    expect(promptText()).toBe(ORIGINAL);
  });

  test("採用のあとに本文を書き換えたら、元に戻すは出さない", async () => {
    const user = userEvent.setup();
    respondWith(200, CREATED);
    render(<Harness />);
    await user.click(createButton());
    await user.click(await screen.findByRole("button", { name: "gachaSplitAccept" }));
    await user.click(screen.getByRole("button", { name: "edit-body" }));
    expect(screen.queryByRole("button", { name: "gachaSplitUndo" })).toBeNull();
  });

  test("やめると案を閉じ、本文はそのまま", async () => {
    const user = userEvent.setup();
    respondWith(200, CREATED);
    render(<Harness />);
    await user.click(createButton());
    await user.click(await screen.findByRole("button", { name: "gachaSplitCancel" }));
    expect(screen.queryByTestId("name-input-create-proposal")).toBeNull();
    expect(promptText()).toBe(ORIGINAL);
  });

  test.each([
    ["NAME_INPUT_CREATE_NOT_FOUND", 422, "nameInputCreateNotFound"],
    ["NAME_INPUT_CREATE_INSUFFICIENT_BALANCE", 400, "nameInputCreateInsufficient"],
    ["NAME_INPUT_CREATE_FAILED", 502, "nameInputCreateFailed"],
  ])("%s は、その知らせを出す", async (errorCode, status, key) => {
    const user = userEvent.setup();
    respondWith(status, { errorCode });
    render(<Harness />);
    await user.click(createButton());
    await waitFor(() =>
      expect(screen.getByTestId("name-input-create-error").textContent).toContain(key),
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  test("返事が届かなければ、使ったかどうかを確かめてもらう(使っていないとは言わない)", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    render(<Harness />);
    await user.click(createButton());
    await waitFor(() =>
      expect(screen.getByTestId("name-input-create-error").textContent).toContain(
        "nameInputCreateConnectionLost",
      ),
    );
  });

  test("返事の形がおかしければ、通信が切れたときと同じに扱う", async () => {
    const user = userEvent.setup();
    respondWith(200, { body: 1 });
    render(<Harness />);
    await user.click(createButton());
    await waitFor(() =>
      expect(screen.getByTestId("name-input-create-error").textContent).toContain(
        "nameInputCreateConnectionLost",
      ),
    );
  });
});
