/** @jest-environment jsdom */

/**
 * 付与額の予約フォーム。
 *
 * この画面で起きて困る間違いは3つ。テストで固定するのはその3つ。
 *  - 予約額だけ入れて日時を忘れる（保存できず理由も分からない）
 *  - 一括指定が意図しない項目まで書き換える
 *  - 何がいつ変わるか分からないまま保存してしまう
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PercoinDefaultsForm } from "@/app/(app)/admin/percoin-defaults/PercoinDefaultsForm";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

const toast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

const FUTURE_LOCAL = "2099-10-01T00:00";

function buildProps() {
  return {
    bonusDefaults: [
      {
        source: "daily_post_free",
        amount: 20,
        label: "投稿ボーナス：フリースタイル",
        scheduledAmount: null,
        scheduledAtLocal: "",
        scheduledAt: null,
      },
      {
        source: "daily_post_one_tap",
        amount: 20,
        label: "投稿ボーナス：ワンタップ",
        scheduledAmount: null,
        scheduledAtLocal: "",
        scheduledAt: null,
      },
    ],
    streakDefaults: Array.from({ length: 14 }, (_, i) => ({
      streak_day: i + 1,
      amount: i + 1 === 14 ? 100 : 10,
      scheduledAmount: null,
      scheduledAtLocal: "",
      scheduledAt: null,
    })),
  };
}

/** 指定ラベルの行にある「予約額」欄。 */
function scheduleAmountInput(index: number): HTMLInputElement {
  return screen.getAllByLabelText("予約額")[index] as HTMLInputElement;
}

function scheduleAtInput(index: number): HTMLInputElement {
  return screen.getAllByLabelText("切替日時")[index] as HTMLInputElement;
}

describe("PercoinDefaultsForm の予約", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as unknown as typeof fetch;
  });

  test("予約額だけ入れると、日時が要ることをその場で伝える", () => {
    render(<PercoinDefaultsForm {...buildProps()} />);

    fireEvent.change(scheduleAmountInput(0), { target: { value: "10" } });

    expect(
      screen.getByText("予約は額と切替日時の両方が必要です")
    ).toBeInTheDocument();
  });

  test("一括指定は予約額を入れた項目にだけ日時を入れる", () => {
    // 全項目に入れると、額の無い予約が大量にできて保存できなくなる
    render(<PercoinDefaultsForm {...buildProps()} />);

    fireEvent.change(scheduleAmountInput(0), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("まとめて日時を入れる"), {
      target: { value: FUTURE_LOCAL },
    });
    fireEvent.click(screen.getByRole("button", { name: "予約額を入れた項目に適用" }));

    expect(scheduleAtInput(0).value).toBe(FUTURE_LOCAL);
    expect(scheduleAtInput(1).value).toBe("");
  });

  test("保存前に「いつ・何が・いくつになるか」を確認させる", async () => {
    render(<PercoinDefaultsForm {...buildProps()} />);

    fireEvent.change(scheduleAmountInput(0), { target: { value: "10" } });
    fireEvent.change(scheduleAtInput(0), { target: { value: FUTURE_LOCAL } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    const confirm = await screen.findByTestId("schedule-confirm");
    expect(confirm).toHaveTextContent("投稿ボーナス：フリースタイル");
    expect(confirm).toHaveTextContent("20");
    expect(confirm).toHaveTextContent("10");
    // 確認を出した時点ではまだ送っていない
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("確認してから保存すると、予約が ISO で送られる", async () => {
    render(<PercoinDefaultsForm {...buildProps()} />);

    fireEvent.change(scheduleAmountInput(0), { target: { value: "10" } });
    fireEvent.change(scheduleAtInput(0), { target: { value: FUTURE_LOCAL } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    fireEvent.click(await screen.findByRole("button", { name: "この内容で保存" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const body = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string
    );
    const free = body.bonusDefaults.find(
      (b: { source: string }) => b.source === "daily_post_free"
    );
    // JST として解釈される（実行環境のTZに引きずられない）
    expect(free.scheduled_at).toBe("2099-09-30T15:00:00.000Z");
    expect(free.scheduled_amount).toBe(10);

    const untouched = body.bonusDefaults.find(
      (b: { source: string }) => b.source === "daily_post_one_tap"
    );
    expect(untouched.scheduled_at).toBeNull();
  });

  test("予約が無ければ確認を挟まずそのまま保存する", async () => {
    render(<PercoinDefaultsForm {...buildProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByTestId("schedule-confirm")).not.toBeInTheDocument();
  });

  test("過去の日時は保存させない", async () => {
    render(<PercoinDefaultsForm {...buildProps()} />);

    fireEvent.change(scheduleAmountInput(0), { target: { value: "10" } });
    fireEvent.change(scheduleAtInput(0), { target: { value: "2020-01-01T00:00" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("切替済みの予約は「いま配られている額」を示す", () => {
    const props = buildProps();
    props.bonusDefaults[0] = {
      ...props.bonusDefaults[0],
      scheduledAmount: 10,
      scheduledAt: "2020-01-01T00:00:00.000Z",
      scheduledAtLocal: "2020-01-01T09:00",
    };

    render(<PercoinDefaultsForm {...props} />);

    // amount は 20 のままだが、実際に配られているのは 10
    expect(screen.getByText(/いま配られているのは/)).toBeInTheDocument();
  });

  test("予約を消せる", () => {
    render(<PercoinDefaultsForm {...buildProps()} />);

    fireEvent.change(scheduleAmountInput(0), { target: { value: "10" } });
    fireEvent.change(scheduleAtInput(0), { target: { value: FUTURE_LOCAL } });
    fireEvent.click(screen.getAllByRole("button", { name: "予約を消す" })[0]);

    expect(scheduleAmountInput(0).value).toBe("");
    expect(scheduleAtInput(0).value).toBe("");
  });
});
