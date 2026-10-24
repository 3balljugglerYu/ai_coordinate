/**
 * @jest-environment jsdom
 */

/**
 * つかう人の抽選の「エントリー」と進捗バー(2026-10-15 ユーザー決定。Amazon のキャンペーンページが参考)。
 *
 * - 未ログイン: ログインしてエントリー(戻り先はこのページ)
 * - ログイン中・未エントリー: 「エントリーする」→「エントリー済み」になりバーが出る
 * - バーは10段。ちがう応募作1つで1段、3・6・10段で1〜3口
 * - 抽選はエントリーした人だけ。エントリー前の投稿も数える
 * - 題名は「キャンペーンに参加」。数え方の吹き出しはエントリーしてから出す(10/15 ユーザー指示)
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  EntryProgressCard,
  EntryProgressProvider,
  formatTimeLeft,
} from "@/features/campaigns/halloween/components/EntryProgressCard";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const STARTS = "2026-10-16T11:00:00.000Z"; // 10/16 20:00 JST
const ENDS = "2026-10-31T15:00:00.000Z"; // 11/01 00:00 JST(含まない)
const DURING = () => Date.parse("2026-10-26T15:00:00.000Z"); // 終わりまで5日
const BEFORE = () => Date.parse("2026-10-15T03:00:00.000Z");
const AFTER = () => Date.parse("2026-11-01T00:00:00.000Z");

type Viewer = { enteredAt: string | null; usedWorks: number; celebratedTickets: number } | null;

function progress(viewer: Viewer) {
  return { ok: true, status: 200, json: async () => ({ startsAt: STARTS, endsAt: ENDS, viewer }) };
}

function mockFetch(...responses: unknown[]) {
  const fetchMock = jest.fn();
  for (const response of responses) {
    fetchMock.mockImplementationOnce(async () => response);
  }
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** カードの「※」の注意書き(出ている順) */
function notesInCard(): string[] {
  const card = screen.getByTestId("halloween-entry-card");
  return Array.from(card.querySelectorAll("p"))
    .map((node) => node.textContent ?? "")
    .filter((text) => text.startsWith("※"));
}

const NOTES = [
  "※ 1口達成するたびに自動で応募は完了します(投稿を取り消すと、その分の口数は減ります)",
  "※ 抽選はエントリーした人が対象です(エントリー前の投稿も数えます)",
  "※ 同じ対象作品で生成してもカウントは増えません",
  "※ 期間中に「#うちの子のベストショット」のタグを付けて投稿された作品が、対象作品です",
];

afterEach(() => {
  // @ts-expect-error テストごとに置き換えた fetch を戻す
  delete global.fetch;
});

describe("EntryProgressCard", () => {
  test("同じ Provider の中の2枚は、読み込みは1回で、片方で押すともう片方もエントリー済みになる(2026-10-24)", async () => {
    const fetchMock = mockFetch(
      progress({ enteredAt: null, usedWorks: 4, celebratedTickets: 0 }),
      { ok: true, status: 200, json: async () => ({ enteredAt: "2026-10-26T15:00:00.000Z" }) },
    );
    render(
      <EntryProgressProvider>
        <EntryProgressCard now={DURING} />
        <EntryProgressCard now={DURING} />
      </EntryProgressProvider>,
    );
    const buttons = await screen.findAllByRole("button", { name: "エントリーする" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(screen.getAllByText("✓ エントリー済み")).toHaveLength(2));
    expect(screen.queryByRole("button", { name: "エントリーする" })).toBeNull();
    expect(screen.getAllByTestId("halloween-entry-now").map((node) => node.textContent)).toEqual([
      "現在 4作品(1口)",
      "現在 4作品(1口)",
    ]);
    // 読み込み1回 + エントリー1回
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /*
    2026-10-24 ユーザー指示: 対象作品の上のカードは長いので、エントリー済みなら「あと○作品で○口！」までにする。
    残りの時間と「※」の注意書きは出さず、「詳しくはこちら」で参加方法のエンジョイ部門へ案内する。
  */
  test("短いカード(エントリー済み): 「あと○作品で○口！」までにして、残りの時間と注意書きは出さず「詳しくはこちら」を置く", async () => {
    mockFetch(progress({ enteredAt: "2026-10-20T00:00:00.000Z", usedWorks: 4, celebratedTickets: 1 }));
    render(<EntryProgressCard now={DURING} compact />);
    await screen.findByText("✓ エントリー済み");
    expect(screen.getByTestId("halloween-entry-bubble")).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByTestId("halloween-entry-now").textContent).toBe("現在 4作品(1口)");
    const next = screen.getByText("あと2作品で2口！");
    const more = screen.getByRole("button", { name: /詳しくはこちら/ });
    // 「詳しくはこちら」は「あと○作品で○口！」の下で、その間にほかの文はない
    expect(next.nextElementSibling).toBe(more);
    expect(screen.queryByText(/企画終了まであと/)).toBeNull();
    expect(notesInCard()).toEqual([]);
  });

  test("短いカード(未エントリー): 「エントリーする」と残りの時間はそのまま出し、下に「詳しくはこちら」を置く", async () => {
    mockFetch(progress({ enteredAt: null, usedWorks: 0, celebratedTickets: 0 }));
    render(<EntryProgressCard now={DURING} compact />);
    const button = await screen.findByRole("button", { name: "エントリーする" });
    const time = screen.getByText("企画終了まであと：5日");
    const more = screen.getByRole("button", { name: /詳しくはこちら/ });
    expect(button.compareDocumentPosition(time) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(time.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("ふつうのカード(手順1)は、エントリー済みでも残りの時間と注意書きを出し、「詳しくはこちら」は置かない", async () => {
    mockFetch(progress({ enteredAt: "2026-10-20T00:00:00.000Z", usedWorks: 4, celebratedTickets: 1 }));
    render(<EntryProgressCard now={DURING} />);
    await screen.findByText("✓ エントリー済み");
    expect(screen.getByText("企画終了まであと：5日")).toBeTruthy();
    expect(notesInCard()).toEqual(NOTES);
    expect(screen.queryByRole("button", { name: /詳しくはこちら/ })).toBeNull();
  });

  test("Provider の外のカードは、それぞれ自分で読む", async () => {
    const fetchMock = mockFetch(progress(null), progress(null));
    render(
      <>
        <EntryProgressCard now={DURING} />
        <EntryProgressCard now={DURING} />
      </>,
    );
    expect(await screen.findAllByRole("link", { name: "ログインしてエントリー" })).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("読み込み中は骨組みだけ出す", () => {
    global.fetch = jest.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;
    render(<EntryProgressCard now={DURING} />);
    expect(screen.getByTestId("halloween-entry-loading")).toBeTruthy();
  });

  test("進捗はこの企画の API から、キャッシュせずに読む", async () => {
    const fetchMock = mockFetch(progress(null));
    render(<EntryProgressCard now={DURING} />);
    await screen.findByTestId("halloween-entry-card");
    expect(fetchMock).toHaveBeenCalledWith("/api/hashtag-campaigns/halloween-best-shot/progress", {
      cache: "no-store",
    });
  });

  test("未ログイン: 「ログインしてエントリー」でログインへ(戻り先はこのページ)", async () => {
    mockFetch(progress(null));
    render(<EntryProgressCard now={DURING} />);
    const link = await screen.findByRole("link", { name: "ログインしてエントリー" });
    expect(link.getAttribute("href")).toBe(`/login?redirect=${encodeURIComponent("/campaigns/halloween-best-shot")}`);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("企画終了まであと：5日")).toBeTruthy();
  });

  test("未エントリー: 「エントリーする」を押すとエントリー済みになり、たまっていた数でバーが出る", async () => {
    const fetchMock = mockFetch(
      progress({ enteredAt: null, usedWorks: 4, celebratedTickets: 0 }),
      { ok: true, status: 200, json: async () => ({ enteredAt: "2026-10-26T15:00:00.000Z" }) },
    );
    render(<EntryProgressCard now={DURING} />);
    await screen.findByRole("button", { name: "エントリーする" });
    // 押す前は、たまった数も数え方の吹き出しも「※」の注意書きも出さない
    expect(screen.queryByText(/たまっています/)).toBeNull();
    expect(screen.queryByTestId("halloween-entry-bubble")).toBeNull();
    expect(screen.queryByText("✓ エントリー済み")).toBeNull();
    expect(notesInCard()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "エントリーする" }));
    expect(await screen.findByText("✓ エントリー済み")).toBeTruthy();
    expect(screen.getByTestId("halloween-entry-bubble").textContent).toBe(
      "対象作品を生成して投稿するたびに、1カウント！3作品で1口・6作品で2口・10作品で3口",
    );
    // 押したあとに注意書き4つが出る
    expect(notesInCard()).toEqual(NOTES);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/hashtag-campaigns/halloween-best-shot/entry", { method: "POST" });

    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("4");
    expect(bar.getAttribute("aria-valuemax")).toBe("10");
    expect(screen.getByTestId("halloween-entry-now").textContent).toBe("現在 4作品(1口)");
    expect(screen.getByText("あと2作品で2口！")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "エントリーする" })).toBeNull();
  });

  test("エントリー済み: バーは10段で、使った数だけ埋まり、3・6・10段目が口数の目印", async () => {
    mockFetch(progress({ enteredAt: STARTS, usedWorks: 6, celebratedTickets: 2 }));
    render(<EntryProgressCard now={DURING} />);
    const bar = await screen.findByRole("progressbar");
    // 読み上げの名前は、賞品・参加方法と同じ部門の呼び名(10/15 統一感のため)
    expect(bar.getAttribute("aria-label")).toBe("エンジョイ部門の抽選の進み具合");
    const cells = Array.from(bar.children);
    expect(cells).toHaveLength(10);
    expect(cells.map((cell) => cell.getAttribute("data-filled"))).toEqual([
      ...Array(6).fill("true"),
      ...Array(4).fill("false"),
    ]);
    expect(cells.map((cell, index) => (cell.getAttribute("data-goal") ? index + 1 : null)).filter(Boolean)).toEqual([
      3, 6, 10,
    ]);
    expect(bar.getAttribute("aria-valuetext")).toBe("10作品中6作品(2口)");
    expect(screen.getByText("あと4作品で3口！")).toBeTruthy();
  });

  test("10作品を超えてもバーは10段で止まり、3口達成と出す", async () => {
    mockFetch(progress({ enteredAt: STARTS, usedWorks: 13, celebratedTickets: 3 }));
    render(<EntryProgressCard now={DURING} />);
    const bar = await screen.findByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("10");
    expect(screen.getByTestId("halloween-entry-now").textContent).toBe("現在 13作品(3口)");
    expect(screen.getByText("3口達成！おめでとうございます🎉")).toBeTruthy();
  });

  test("始まる前は、いつから数えるか・終わりまでの残りを出さない(10/15 ユーザー指示)", async () => {
    mockFetch(progress({ enteredAt: STARTS, usedWorks: 0, celebratedTickets: 0 }));
    render(<EntryProgressCard now={BEFORE} />);
    const card = await screen.findByTestId("halloween-entry-card");
    expect(card.textContent).not.toContain("から数えます");
    expect(card.textContent).not.toContain("企画終了まであと");
    // エントリー済みなので、バーと注意書きは出る
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(notesInCard()).toEqual(NOTES);
  });

  test("終わったあと: 未エントリーなら受付終了(ボタンを出さない)。エントリー済みなら結果の数を出す", async () => {
    mockFetch(progress({ enteredAt: null, usedWorks: 3, celebratedTickets: 0 }));
    const { unmount } = render(<EntryProgressCard now={AFTER} />);
    expect(await screen.findByText("エントリーの受付は終了しました")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "エントリーする" })).toBeNull();
    expect(screen.getByText("企画は終了しました")).toBeTruthy();
    expect(notesInCard()).toEqual([]);
    unmount();

    mockFetch(progress({ enteredAt: STARTS, usedWorks: 3, celebratedTickets: 1 }));
    render(<EntryProgressCard now={AFTER} />);
    expect((await screen.findByTestId("halloween-entry-now")).textContent).toBe("現在 3作品(1口)");
  });

  test("押している間は二重に送らない(aria-disabled で、フォーカスは落とさない)", async () => {
    let resolveEntry: (value: unknown) => void = () => undefined;
    const fetchMock = mockFetch(progress({ enteredAt: null, usedWorks: 0, celebratedTickets: 0 }));
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveEntry = resolve)));
    render(<EntryProgressCard now={DURING} />);
    const button = await screen.findByRole("button", { name: "エントリーする" });
    fireEvent.click(button);
    const pending = screen.getByRole("button", { name: "エントリー中…" });
    expect(pending.getAttribute("aria-disabled")).toBe("true");
    expect(pending.hasAttribute("disabled")).toBe(false);
    fireEvent.click(pending);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolveEntry({ ok: true, status: 200, json: async () => ({ enteredAt: STARTS }) });
    });
    expect(await screen.findByText("✓ エントリー済み")).toBeTruthy();
  });

  test("受付が終わっていた(409)なら受付終了、失敗なら知らせてもう一度押せる", async () => {
    mockFetch(progress({ enteredAt: null, usedWorks: 0, celebratedTickets: 0 }), { ok: false, status: 409 });
    const { unmount } = render(<EntryProgressCard now={DURING} />);
    fireEvent.click(await screen.findByRole("button", { name: "エントリーする" }));
    expect(await screen.findByText("エントリーの受付は終了しました")).toBeTruthy();
    unmount();

    mockFetch(progress({ enteredAt: null, usedWorks: 0, celebratedTickets: 0 }), { ok: false, status: 500 });
    render(<EntryProgressCard now={DURING} />);
    fireEvent.click(await screen.findByRole("button", { name: "エントリーする" }));
    expect((await screen.findByRole("alert")).textContent).toContain("エントリーできませんでした");
    expect(screen.getByRole("button", { name: "エントリーする" })).toBeTruthy();
  });

  test("ログインが切れていた(401)なら、ログインしてエントリーへ切り替える", async () => {
    mockFetch(progress({ enteredAt: null, usedWorks: 0, celebratedTickets: 0 }), { ok: false, status: 401 });
    render(<EntryProgressCard now={DURING} />);
    fireEvent.click(await screen.findByRole("button", { name: "エントリーする" }));
    expect(await screen.findByRole("link", { name: "ログインしてエントリー" })).toBeTruthy();
  });

  test("読み込めなければ知らせ、「もう一度読み込む」で読み直す", async () => {
    mockFetch({ ok: false, status: 500 }, progress(null));
    render(<EntryProgressCard now={DURING} />);
    expect(await screen.findByText("エントリーの状況を読み込めませんでした。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "もう一度読み込む" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "ログインしてエントリー" })).toBeTruthy());
  });

  test("題名は「キャンペーンに参加」。未ログイン(= 未エントリー)では吹き出しも注意書きも出さない", async () => {
    mockFetch(progress(null));
    render(<EntryProgressCard now={DURING} />);
    expect(await screen.findByRole("heading", { name: "キャンペーンに参加" })).toBeTruthy();
    // 全員もらえるように読める「ゲットしよう」はやめた(10/16 ユーザー提供の注意事項)
    expect(
      screen.getByText("キャンペーン対象作品を利用して、Amazonギフトカードが当たるチャンス！"),
    ).toBeTruthy();
    expect(screen.queryByTestId("halloween-entry-bubble")).toBeNull();
    expect(notesInCard()).toEqual([]);
  });

  test("エントリー済み: 注意書きは、自動で応募・エントリーした人だけ・同じ作品は増えない・期間中のタグ付きが対象、の4つをこの順で出す", async () => {
    mockFetch(progress({ enteredAt: STARTS, usedWorks: 1, celebratedTickets: 0 }));
    render(<EntryProgressCard now={DURING} />);
    await screen.findByText("✓ エントリー済み");
    expect(notesInCard()).toEqual(NOTES);
  });
});

describe("formatTimeLeft", () => {
  const hour = 60 * 60 * 1000;
  test.each([
    [5 * 24 * hour + 3 * hour, "5日"],
    [24 * hour, "1日"],
    [23 * hour + 59 * 60 * 1000, "23時間"],
    [hour, "1時間"],
    [59 * 60 * 1000, "1時間未満"],
  ])("%i ms → %s", (ms, label) => {
    expect(formatTimeLeft(ms)).toBe(label);
  });
});
