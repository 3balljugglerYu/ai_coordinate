/**
 * @jest-environment jsdom
 *
 * 「ガチャに分ける」道具の画面。
 * ⭐ 押しても入力欄は書き換えず、案を見せて「採用」で初めて書き換える。「元に戻す」で戻せる。
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
import { GachaSplitTool } from "@/features/generation/components/GachaSplitTool";

const ORIGINAL = "【職業ガチャ】\n職業をランダムに選んでください。\n例：医師、探偵\n働いている瞬間を描く。";
const SPLIT = {
  body: "【職業ガチャ】\n働いている瞬間を描く。",
  field: "{{GACHA}}\n1. 医師\n2. 探偵\n{{/GACHA}}",
  removedLines: [2, 3],
  candidateCount: 2,
  balance: 95,
};

function Harness({ initialPrompt = ORIGINAL }: { initialPrompt?: string }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [field, setField] = useState("{{GACHA}}\n1. \n{{/GACHA}}");
  return (
    <>
      <GachaSplitTool
        prompt={prompt}
        field={field}
        onApply={(body, nextField) => {
          setPrompt(body);
          setField(nextField);
        }}
      />
      <output data-testid="prompt">{prompt}</output>
      <output data-testid="field">{field}</output>
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
});

const splitButton = () =>
  screen.getByRole("button", { name: /gachaSplitButton|gachaSplitPending/ });

describe("GachaSplitTool", () => {
  test("本文が空なら押せない", () => {
    render(<Harness initialPrompt="  " />);
    expect(splitButton()).toHaveProperty("disabled", true);
  });

  test("押すと本文を送り、案を見せるが、入力欄はまだ変えない", async () => {
    const user = userEvent.setup();
    respondWith(200, SPLIT);
    render(<Harness />);

    await user.click(splitButton());

    await screen.findByTestId("gacha-split-proposal");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gacha-prompt/split",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ prompt: ORIGINAL }) }),
    );
    // 消す行(2・3行目)に印が付く
    expect(
      screen.getAllByTestId("gacha-split-removed-line").map((el) => el.textContent),
    ).toEqual(["職業をランダムに選んでください。", "例：医師、探偵"]);
    expect(screen.getByTestId("gacha-split-proposal-field").textContent).toBe(SPLIT.field);
    // まだ書き換えていない
    expect(screen.getByTestId("prompt").textContent).toBe(ORIGINAL);
    // 使ったペルコインを残高の表示へ反映する
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  test("採用すると本文と候補欄を書き換え、元に戻すと戻る", async () => {
    const user = userEvent.setup();
    respondWith(200, SPLIT);
    render(<Harness />);
    await user.click(splitButton());
    await screen.findByTestId("gacha-split-proposal");

    await user.click(screen.getByRole("button", { name: "gachaSplitAccept" }));

    expect(screen.getByTestId("prompt").textContent).toBe(SPLIT.body);
    expect(screen.getByTestId("field").textContent).toBe(SPLIT.field);
    expect(screen.queryByTestId("gacha-split-proposal")).toBeNull();

    await user.click(screen.getByRole("button", { name: "gachaSplitUndo" }));

    expect(screen.getByTestId("prompt").textContent).toBe(ORIGINAL);
    expect(screen.getByTestId("field").textContent).toBe("{{GACHA}}\n1. \n{{/GACHA}}");
  });

  test("やめると案を閉じ、入力欄はそのまま", async () => {
    const user = userEvent.setup();
    respondWith(200, SPLIT);
    render(<Harness />);
    await user.click(splitButton());
    await screen.findByTestId("gacha-split-proposal");

    await user.click(screen.getByRole("button", { name: "gachaSplitCancel" }));

    expect(screen.queryByTestId("gacha-split-proposal")).toBeNull();
    expect(screen.getByTestId("prompt").textContent).toBe(ORIGINAL);
  });

  test.each([
    ["GACHA_SPLIT_INSUFFICIENT_BALANCE", 400, "gachaSplitInsufficient"],
    ["GACHA_SPLIT_NOT_SPLITTABLE", 422, "gachaSplitNotSplittable"],
    ["GACHA_SPLIT_FAILED", 502, "gachaSplitFailed"],
  ])("%s のときは案内を出し、入力欄を変えない", async (errorCode, status, key) => {
    const user = userEvent.setup();
    respondWith(status, { error: "x", errorCode });
    render(<Harness />);

    await user.click(splitButton());

    const message = await screen.findByTestId("gacha-split-error");
    expect(message.textContent).toContain(key);
    expect(screen.queryByTestId("gacha-split-proposal")).toBeNull();
    expect(screen.getByTestId("prompt").textContent).toBe(ORIGINAL);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  test("通信に失敗したら失敗の案内を出す", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    render(<Harness />);

    await user.click(splitButton());

    await waitFor(() =>
      expect(screen.getByTestId("gacha-split-error").textContent).toContain("gachaSplitFailed"),
    );
  });
});
