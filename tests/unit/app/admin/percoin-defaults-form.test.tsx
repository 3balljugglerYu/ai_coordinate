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
        appliedFrom: null,
        previousAmount: null,
      },
      {
        source: "daily_post_one_tap",
        amount: 20,
        label: "投稿ボーナス：ワンタップ",
        scheduledAmount: null,
        scheduledAtLocal: "",
        scheduledAt: null,
        appliedFrom: null,
        previousAmount: null,
      },
    ],
    streakDefaults: Array.from({ length: 14 }, (_, i) => ({
      streak_day: i + 1,
      amount: i + 1 === 14 ? 100 : 10,
      scheduledAmount: null,
      scheduledAtLocal: "",
      scheduledAt: null,
      appliedFrom: null,
      previousAmount: null,
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

  test("一括指定は予約額が空でも日時を入れる", () => {
    /*
      額→日時の順を強いないための仕様。額の無い予約は保存時に指摘する。
    */
    render(<PercoinDefaultsForm {...buildProps()} />);

    const [allInput] = screen.getAllByLabelText("まとめて日時を入れる");
    fireEvent.change(allInput, { target: { value: FUTURE_LOCAL } });
    fireEvent.click(screen.getByRole("button", { name: "すべての項目に入れる" }));

    expect(scheduleAtInput(0).value).toBe(FUTURE_LOCAL);
    expect(scheduleAtInput(1).value).toBe(FUTURE_LOCAL);
    // 連続ログイン側にも入る
    expect(scheduleAtInput(2).value).toBe(FUTURE_LOCAL);
  });

  test("セクションごとの一括指定はその範囲だけに入る", () => {
    render(<PercoinDefaultsForm {...buildProps()} />);

    const inputs = screen.getAllByLabelText("まとめて日時を入れる");
    // 0=すべて 1=特典別 2=連続ログイン（還元は props に無いので出ない）
    fireEvent.change(inputs[2], { target: { value: FUTURE_LOCAL } });
    fireEvent.click(screen.getByRole("button", { name: "14日ぶんに入れる" }));

    // 特典別（先頭2つ）は空のまま、連続ログインだけ入る
    expect(scheduleAtInput(0).value).toBe("");
    expect(scheduleAtInput(1).value).toBe("");
    expect(scheduleAtInput(2).value).toBe(FUTURE_LOCAL);
  });

  test("保存時に不足している項目をまとめて出す", async () => {
    render(<PercoinDefaultsForm {...buildProps()} />);

    const [allInput] = screen.getAllByLabelText("まとめて日時を入れる");
    fireEvent.change(allInput, { target: { value: FUTURE_LOCAL } });
    fireEvent.click(screen.getByRole("button", { name: "すべての項目に入れる" }));
    // 1つだけ額を入れる → 残りは「額が無い」で指摘されるはず
    fireEvent.change(scheduleAmountInput(0), { target: { value: "10" } });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    const panel = await screen.findByTestId("schedule-issues");
    expect(panel).toHaveTextContent("予約額が入っていません");
    // 16項目中1つだけ埋めたので 15 件
    expect(panel).toHaveTextContent("15 件");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("額の無い日時をまとめて消せる", async () => {
    render(<PercoinDefaultsForm {...buildProps()} />);

    const [allInput] = screen.getAllByLabelText("まとめて日時を入れる");
    fireEvent.change(allInput, { target: { value: FUTURE_LOCAL } });
    fireEvent.click(screen.getByRole("button", { name: "すべての項目に入れる" }));
    fireEvent.change(scheduleAmountInput(0), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await screen.findByTestId("schedule-issues");
    fireEvent.click(
      screen.getByRole("button", { name: "予約額の無い日時をまとめて消す" })
    );

    // 額を入れた項目は残り、他は消える
    expect(scheduleAtInput(0).value).toBe(FUTURE_LOCAL);
    expect(scheduleAtInput(1).value).toBe("");
    expect(screen.queryByTestId("schedule-issues")).not.toBeInTheDocument();
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

  test("項目が1つも無いときは保存させない", async () => {
    /*
      取得に失敗すると空のリストが渡りうる。その状態で保存すると
      「全項目を空で上書き」に見える操作になるため、送信しない。
      (ページ側でもエラー表示に切り替えているが、部品としても守る)
    */
    render(<PercoinDefaultsForm bonusDefaults={[]} streakDefaults={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(global.fetch).not.toHaveBeenCalled();
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

  test("切替済みの予約は現在額に畳まれ、経緯だけを示す", () => {
    /*
      サーバーで「切替済み」を現在額に畳んで渡す。畳まないと、過去日時の
      予約が入力欄に残って別項目の保存まで弾かれ、さらにその予約を消すと
      実際に配られている額が古い額へ黙って戻る。
    */
    const props = buildProps();
    props.bonusDefaults[0] = {
      ...props.bonusDefaults[0],
      amount: 10,
      scheduledAmount: null,
      scheduledAt: null,
      scheduledAtLocal: "",
      appliedFrom: "2020-01-01T00:00:00.000Z",
      previousAmount: 20,
    };

    render(<PercoinDefaultsForm {...props} />);

    expect(screen.getByText(/いま配られているのは/)).toBeInTheDocument();
    // 予約欄は空になっており、保存を妨げない
    expect(scheduleAmountInput(0).value).toBe("");
    expect(scheduleAtInput(0).value).toBe("");
  });

  test("切替済みの項目があっても保存できる", async () => {
    const props = buildProps();
    props.bonusDefaults[0] = {
      ...props.bonusDefaults[0],
      amount: 10,
      appliedFrom: "2020-01-01T00:00:00.000Z",
      previousAmount: 20,
    };

    render(<PercoinDefaultsForm {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string
    );
    const free = body.bonusDefaults.find(
      (b: { source: string }) => b.source === "daily_post_free"
    );
    // 切替後の額がそのまま現在額として保存され、予約は解除される
    expect(free.amount).toBe(10);
    expect(free.scheduled_at).toBeNull();
  });

  test("予約を消せる", () => {
    render(<PercoinDefaultsForm {...buildProps()} />);

    fireEvent.change(scheduleAmountInput(0), { target: { value: "10" } });
    fireEvent.change(scheduleAtInput(0), { target: { value: FUTURE_LOCAL } });
    fireEvent.click(screen.getAllByRole("button", { name: "予約を消す" })[0]);

    expect(scheduleAmountInput(0).value).toBe("");
    expect(scheduleAtInput(0).value).toBe("");
  });


  test("連続ログインの予約も送られる", async () => {
    render(<PercoinDefaultsForm {...buildProps()} />);

    // 先頭2つはボーナス欄。3つ目以降が連続ログイン1日目〜
    const streakAmount = screen.getAllByLabelText("予約額")[2] as HTMLInputElement;
    const streakAt = screen.getAllByLabelText("切替日時")[2] as HTMLInputElement;
    fireEvent.change(streakAmount, { target: { value: "5" } });
    fireEvent.change(streakAt, { target: { value: FUTURE_LOCAL } });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    fireEvent.click(await screen.findByRole("button", { name: "この内容で保存" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string
    );
    const day1 = body.streakDefaults.find(
      (s: { streak_day: number }) => s.streak_day === 1
    );
    expect(day1.scheduled_amount).toBe(5);
    expect(day1.scheduled_at).toBe("2099-09-30T15:00:00.000Z");
  });

  test("確認から戻れる", async () => {
    render(<PercoinDefaultsForm {...buildProps()} />);

    fireEvent.change(scheduleAmountInput(0), { target: { value: "10" } });
    fireEvent.change(scheduleAtInput(0), { target: { value: FUTURE_LOCAL } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    fireEvent.click(await screen.findByRole("button", { name: "戻って直す" }));

    expect(screen.queryByTestId("schedule-confirm")).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("保存に失敗したら理由を出す", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "予約の保存に失敗しました" }),
    }) as unknown as typeof fetch;

    render(<PercoinDefaultsForm {...buildProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "予約の保存に失敗しました" })
      )
    );
  });
});
