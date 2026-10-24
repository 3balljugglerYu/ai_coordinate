/** @jest-environment jsdom */

/**
 * 企画ページの操作の GA4 イベント(2026-10-16 ユーザー「今後も同じような企画をする上で、アナリティクスはちゃんと残るように」)。
 *
 * GA4 に送らなかったことはどこにも残らず、落ちても気づけない。どの操作でどの名前を送るかを、ここで固定する。
 * - 操作はイベント名に入れる(GA4 で登録しなくても数が見られる)。パラメータは送らない
 * - 押しただけで送るもの・できたときだけ送るもの(コピー・エントリー)を分ける
 */

import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CAMPAIGN_EVENTS } from "@/features/campaigns/lib/campaign-events";
import { CopyHashtagButton } from "@/features/campaigns/halloween/components/CopyHashtagButton";
import { EntryProgressCard } from "@/features/campaigns/halloween/components/EntryProgressCard";
import { FloatingJoinButtons } from "@/features/campaigns/halloween/components/FloatingJoinButtons";
import { HalloweenBestShotPage } from "@/features/campaigns/halloween/components/HalloweenBestShotPage";
import { JoinDetails } from "@/features/campaigns/halloween/components/JoinDetails";
import { JoinTabs } from "@/features/campaigns/halloween/components/JoinTabs";
import { SubmissionCarousel } from "@/features/campaigns/halloween/components/SubmissionCarousel";
import { SIGNUP_SOURCE_COOKIE } from "@/features/auth/components/SignupSourceCapture";
import { requestJoinGuide } from "@/features/campaigns/halloween/lib/join-guide-requests";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        // 画面を移らずにテストを続ける
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));
jest.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element -- テスト用に next/image を素の img に置き換える
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

const gtag = jest.fn();

/** 送ったイベントの名前(送った順) */
function sentEvents(): string[] {
  return gtag.mock.calls.filter((call) => call[0] === "event").map((call) => call[1] as string);
}

beforeEach(() => {
  jest.clearAllMocks();
  (window as unknown as { gtag?: unknown }).gtag = gtag;
});

afterEach(() => {
  delete (window as unknown as { gtag?: unknown }).gtag;
  // @ts-expect-error テストごとに置き換えた fetch を戻す
  delete global.fetch;
});

describe("イベント名", () => {
  test("どれも GA4 の名前の決まり(英字で始まり、英数字と _ だけ・40字まで)を守り、重ならない", () => {
    const names = Object.values(CAMPAIGN_EVENTS);
    for (const name of names) {
      expect(name).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
    }
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("浮いたボタン", () => {
  /** 浮いたボタンの「カタログをつくる」「カタログから生成する」(並び順) */
  function floatingLinks(): HTMLAnchorElement[] {
    const links = Array.from(screen.getByTestId("halloween-floating-cta").querySelectorAll("a"));
    expect(links.map((link) => link.textContent)).toEqual(["カタログをつくる", "カタログから生成する"]);
    return links;
  }

  test("⭐「カタログをつくる」「カタログから生成する」で別々の名前を送る(パラメータなし)", () => {
    render(<FloatingJoinButtons joinHref="/free" worksHref="/user-styles?campaign=halloween-best-shot" />);
    const [create, catalog] = floatingLinks();

    fireEvent.click(create);
    fireEvent.click(catalog);

    expect(gtag.mock.calls).toEqual([
      ["event", CAMPAIGN_EVENTS.ctaCreate, {}],
      ["event", CAMPAIGN_EVENTS.ctaCatalog, {}],
    ]);
  });

  test("ページの中へ飛ぶ形(#)でも「カタログから生成する」を送る", () => {
    render(<FloatingJoinButtons joinHref="/free" worksHref="#hbs-works" />);

    const [, catalog] = floatingLinks();
    catalog.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(catalog);

    expect(sentEvents()).toEqual([CAMPAIGN_EVENTS.ctaCatalog]);
  });

  test("GA4 が読み込まれていない(広告ブロックなど)ときも、押して落ちない", () => {
    delete (window as unknown as { gtag?: unknown }).gtag;
    render(<FloatingJoinButtons joinHref="/free" worksHref="/user-styles?campaign=halloween-best-shot" />);

    const [create] = floatingLinks();

    expect(() => fireEvent.click(create)).not.toThrow();
  });
});

describe("ハッシュタグのコピー", () => {
  test("⭐コピーできたときだけ送る", async () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
    render(<CopyHashtagButton hashtag="#うちの子のベストショット" />);

    fireEvent.click(screen.getByRole("button", { name: "コピーする" }));

    await screen.findByRole("button", { name: "コピーしました！" });
    expect(sentEvents()).toEqual([CAMPAIGN_EVENTS.hashtagCopy]);
  });

  test("コピーに失敗したら送らない", async () => {
    const writeText = jest.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyHashtagButton hashtag="#うちの子のベストショット" />);

    fireEvent.click(screen.getByRole("button", { name: "コピーする" }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    await act(async () => undefined);
    expect(sentEvents()).toEqual([]);
  });
});

describe("参加方法のタブ", () => {
  const tabs = [
    { key: "creator", icon: "🎨", label: "クリエイティブ部門", panel: <p>つくる</p>, eventName: CAMPAIGN_EVENTS.tabCreative },
    { key: "user", icon: "🎁", label: "エンジョイ部門", panel: <p>つかう</p>, eventName: CAMPAIGN_EVENTS.tabEnjoy },
  ];

  test("⭐最初に開いているタブでは送らず、切り替えたときに、選んだ部門の名前を送る", () => {
    render(<JoinTabs tabs={tabs} />);
    expect(sentEvents()).toEqual([]);

    fireEvent.click(screen.getByRole("tab", { name: /エンジョイ部門/ }));
    fireEvent.click(screen.getByRole("tab", { name: /クリエイティブ部門/ }));

    expect(sentEvents()).toEqual([CAMPAIGN_EVENTS.tabEnjoy, CAMPAIGN_EVENTS.tabCreative]);
  });

  test("開いているタブをもう一度押しても送らない", () => {
    render(<JoinTabs tabs={tabs} />);

    fireEvent.click(screen.getByRole("tab", { name: /クリエイティブ部門/ }));

    expect(sentEvents()).toEqual([]);
  });

  test("矢印キーで切り替えたときも送る", () => {
    render(<JoinTabs tabs={tabs} />);

    fireEvent.keyDown(screen.getByRole("tab", { name: /クリエイティブ部門/ }), { key: "ArrowRight" });

    expect(sentEvents()).toEqual([CAMPAIGN_EVENTS.tabEnjoy]);
  });
});

describe("参加方法のタブ(合図で切り替え)", () => {
  test("「詳しくはこちら」の合図で切り替えたときは、タブの GA4 を送らない", () => {
    render(
      <JoinTabs
        tabs={[
          { key: "creator", icon: "🎨", label: "クリエイティブ部門", panel: <p>A</p>, eventName: CAMPAIGN_EVENTS.tabCreative },
          { key: "user", icon: "🎁", label: "エンジョイ部門", panel: <p>B</p>, eventName: CAMPAIGN_EVENTS.tabEnjoy },
        ]}
      />,
    );
    act(() => requestJoinGuide("user"));
    expect(screen.getByRole("tab", { name: /エンジョイ部門/ }).getAttribute("aria-selected")).toBe("true");
    expect(sentEvents()).toEqual([]);
  });
});

describe("詳細な作成手順", () => {
  function toggle(details: HTMLDetailsElement, open: boolean) {
    details.open = open;
    fireEvent(details, new Event("toggle"));
  }

  test("⭐開いたときだけ送る(閉じたときは送らない)", () => {
    render(
      <JoinDetails eventName={CAMPAIGN_EVENTS.stepsEnjoy}>
        <p>手順</p>
      </JoinDetails>,
    );
    const details = screen.getByTestId("halloween-join-details") as HTMLDetailsElement;

    toggle(details, true);
    toggle(details, false);

    expect(sentEvents()).toEqual([CAMPAIGN_EVENTS.stepsEnjoy]);
  });

  /*
    2026-10-24: 対象作品の上のカードの「詳しくはこちら」で開いたときは、手順を押していないので送らない
    (ブラウザは open を書き換えても toggle を出す。jsdom は出さないので、ここで出す)。
    そのあと自分で閉じて開き直したら送る。
  */
  test("「詳しくはこちら」の合図で開いたときは送らず、そのあと自分で開いたら送る", () => {
    render(
      <JoinDetails eventName={CAMPAIGN_EVENTS.stepsEnjoy} tabKey="user">
        <p>手順</p>
      </JoinDetails>,
    );
    const details = screen.getByTestId("halloween-join-details") as HTMLDetailsElement;

    act(() => requestJoinGuide("user"));
    expect(details.open).toBe(true);
    fireEvent(details, new Event("toggle"));
    expect(sentEvents()).toEqual([]);

    toggle(details, false);
    toggle(details, true);
    expect(sentEvents()).toEqual([CAMPAIGN_EVENTS.stepsEnjoy]);
  });

  test("合図で開くのは同じ部門の手順だけ", () => {
    render(
      <JoinDetails eventName={CAMPAIGN_EVENTS.stepsCreative} tabKey="creator">
        <p>手順</p>
      </JoinDetails>,
    );
    act(() => requestJoinGuide("user"));
    expect((screen.getByTestId("halloween-join-details") as HTMLDetailsElement).open).toBe(false);
  });

  test("ページでは、部門ごとに別の名前で送る", () => {
    global.fetch = jest.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;
    render(<HalloweenBestShotPage />);
    const [creative, enjoy] = screen.getAllByTestId("halloween-join-details") as HTMLDetailsElement[];

    toggle(creative, true);
    toggle(enjoy, true);

    expect(sentEvents()).toEqual([CAMPAIGN_EVENTS.stepsCreative, CAMPAIGN_EVENTS.stepsEnjoy]);
  });
});

describe("対象作品の一覧", () => {
  test("作品を押したら送る", () => {
    render(
      <SubmissionCarousel
        pages={[[{ postId: "p1", thumbnailUrl: "https://img.test/p1.webp", authorName: "かぼちゃ" }]]}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "かぼちゃさんの作品" }));

    expect(sentEvents()).toEqual([CAMPAIGN_EVENTS.workTap]);
  });
});

describe("エントリー", () => {
  const STARTS = "2026-10-16T11:00:00.000Z";
  const ENDS = "2026-10-31T15:00:00.000Z";
  const DURING = () => Date.parse("2026-10-26T15:00:00.000Z");

  function progress(viewer: { enteredAt: string | null; usedWorks: number; celebratedTickets: number } | null) {
    return { ok: true, status: 200, json: async () => ({ startsAt: STARTS, endsAt: ENDS, viewer }) };
  }

  function mockFetch(...responses: unknown[]) {
    const fetchMock = jest.fn();
    for (const response of responses) {
      fetchMock.mockImplementationOnce(async () => response);
    }
    global.fetch = fetchMock as unknown as typeof fetch;
  }

  test("未ログインで「ログインしてエントリー」を押したら送る", async () => {
    mockFetch(progress(null));
    render(<EntryProgressCard now={DURING} />);

    fireEvent.click(await screen.findByRole("link", { name: "ログインしてエントリー" }));

    expect(sentEvents()).toEqual([CAMPAIGN_EVENTS.entryLogin]);
  });

  test("⭐「エントリーする」を押したら送り、エントリーできたら、もう1つ送る", async () => {
    mockFetch(progress({ enteredAt: null, usedWorks: 0, celebratedTickets: 0 }), {
      ok: true,
      status: 200,
      json: async () => ({ enteredAt: "2026-10-26T15:00:00.000Z" }),
    });
    render(<EntryProgressCard now={DURING} />);

    fireEvent.click(await screen.findByRole("button", { name: "エントリーする" }));

    await waitFor(() =>
      expect(sentEvents()).toEqual([CAMPAIGN_EVENTS.entryClick, CAMPAIGN_EVENTS.entryComplete]),
    );
  });

  test("エントリーできなかったら、押したことだけ送る(できたとは送らない)", async () => {
    mockFetch(progress({ enteredAt: null, usedWorks: 0, celebratedTickets: 0 }), {
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    render(<EntryProgressCard now={DURING} />);

    fireEvent.click(await screen.findByRole("button", { name: "エントリーする" }));

    await screen.findByRole("alert");
    expect(sentEvents()).toEqual([CAMPAIGN_EVENTS.entryClick]);
  });
});

describe("流入元(新規登録)", () => {
  function readCookie(): string | null {
    const match = document.cookie.split("; ").find((c) => c.startsWith(`${SIGNUP_SOURCE_COOKIE}=`));
    return match ? decodeURIComponent(match.slice(SIGNUP_SOURCE_COOKIE.length + 1)) : null;
  }

  function clearCookie() {
    document.cookie = `${SIGNUP_SOURCE_COOKIE}=; path=/; max-age=0`;
  }

  // 上のテストでページを描くと、first-touch の cookie が残る。ここでは毎回まっさらから始める
  beforeEach(clearCookie);

  afterEach(() => {
    clearCookie();
    window.history.replaceState({}, "", "/");
  });

  test("⭐企画ページに来たら、企画のキーと来た場所を流入元に残す(メタの広告から)", () => {
    global.fetch = jest.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;
    window.history.replaceState({}, "", "/campaigns/halloween-best-shot?fbclid=IwAR0abc");

    render(<HalloweenBestShotPage />);

    expect(readCookie()).toBe("halloween-best-shot_meta");
  });

  test("目印も来た場所も無ければ、企画のキーだけ残す", () => {
    global.fetch = jest.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;
    window.history.replaceState({}, "", "/campaigns/halloween-best-shot");

    const { container } = render(<HalloweenBestShotPage />);

    expect(within(container).getAllByTestId("halloween-join-details")).toHaveLength(2);
    expect(readCookie()).toBe("halloween-best-shot");
  });
});
