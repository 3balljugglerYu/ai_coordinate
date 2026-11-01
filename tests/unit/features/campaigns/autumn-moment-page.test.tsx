/**
 * @jest-environment jsdom
 */
import { act, render, screen, within } from "@testing-library/react";
import { AutumnMomentPage } from "@/features/campaigns/autumn-moment/components/AutumnMomentPage";
import { AUTUMN_MOMENT } from "@/features/campaigns/autumn-moment/autumn-moment";

jest.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element -- テスト用に next/image を素の img に置き換える
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));

const SUBMISSION_PAGES = [
  [
    { postId: "p1", thumbnailUrl: "https://img.test/p1.webp", authorName: "ひかり" },
    { postId: "p2", thumbnailUrl: "https://img.test/p2.webp", authorName: "そら" },
  ],
];

/** ブラウザの時刻を決めて描く(段階はブラウザの時刻で決まる) */
function renderAt(iso: string, submissionPages: typeof SUBMISSION_PAGES = []) {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(iso));
  return render(<AutumnMomentPage submissionPages={submissionPages} />);
}

afterEach(() => {
  jest.useRealTimers();
});

describe("11月の企画「うちの子の秋のひととき」のページ(2026-10-30・10/31 テーマ変更)", () => {
  test("題名・3つの期間(応募・生成・結果発表)・ハッシュタグを出す", () => {
    renderAt("2026-11-05T12:00:00+09:00");
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("うちの子の");
    expect(h1.textContent).toContain("秋のひととき");
    const text = document.body.textContent ?? "";
    expect(text).toContain("応募期間11/1(日) 0:00 〜 11/15(日) 23:59");
    expect(text).toContain("生成期間11/16(月) 0:00 〜 11/22(日) 23:59");
    expect(text).toContain("結果発表11/29(日)ごろ");
    expect(screen.getAllByText(AUTUMN_MOMENT.hashtag).length).toBeGreaterThanOrEqual(2);
  });

  test("Amazonギフトカードは正式名と「○○円分」で書き、略称や全員もらえる言い方をしない(注意事項)", () => {
    renderAt("2026-11-05T12:00:00+09:00");
    const text = document.body.textContent ?? "";
    expect(text).toContain("Amazonギフトカード 5,000円分");
    for (const ng of ["アマギフ", "Amazon ギフトカード", "ギフト券", "GET", "もらえる"]) {
      expect(text).not.toContain(ng);
    }
    // 決まった注記2つ
    expect(screen.getByTestId("amazon-gift-card-notice").textContent).toContain(
      "本キャンペーンはPersta.AIによる提供です。",
    );
    expect(screen.getByTestId("amazon-gift-card-notice").textContent).toContain(
      "Amazon、Amazon.co.jpおよびそれらのロゴはAmazon.com, Inc.またはその関連会社の商標です。",
    );
  });

  test("賞は2つ(1名様・10名様)。生成数・いいね・コメントなどを総合して運営が選ぶと書く(2026-10-31 ユーザー決定)", () => {
    renderAt("2026-11-05T12:00:00+09:00");
    const prizes = screen.getAllByTestId("autumn-moment-prize");
    expect(prizes).toHaveLength(2);
    expect(within(prizes[0]).getByTestId("autumn-moment-prize-gift").textContent).toBe("Amazonギフトカード 5,000円分1名様");
    expect(within(prizes[1]).getByTestId("autumn-moment-prize-gift").textContent).toBe("ペルコイン 200枚10名様");
    expect(document.body.textContent).toContain("11/1〜11/22 の生成数・いいね・コメントなどを総合して、運営が選びます！");
  });

  test("⭐「投票」「票」「いちばん使われた」とは書かない(回数の多い順に決まるように読めるため。2026-10-31 ユーザー指示)", () => {
    for (const iso of ["2026-10-31T21:00:00+09:00", "2026-11-05T12:00:00+09:00", "2026-11-18T12:00:00+09:00", "2026-11-23T00:00:00+09:00"]) {
      const { unmount } = renderAt(iso, SUBMISSION_PAGES);
      const text = document.body.textContent ?? "";
      for (const ng of ["投票", "票", "使われた", "多い順"]) {
        expect(text).not.toContain(ng);
      }
      unmount();
    }
  });

  test("応募のしかたは CREATE の手順、生成期間の楽しみ方は「このカタログで生成する」の手順", () => {
    renderAt("2026-11-05T12:00:00+09:00");
    expect(screen.getAllByTestId("autumn-moment-step-creator")).toHaveLength(8);
    expect(screen.getAllByTestId("autumn-moment-step-generator")).toHaveLength(4);
    const text = document.body.textContent ?? "";
    expect(text).toContain("生成期間の楽しみ方");
    expect(text).toContain("応募期間中から、いつでも生成できます");
  });

  test("応募作品が無いあいだは、一覧の区画ごと出さない", () => {
    renderAt("2026-11-01T00:10:00+09:00");
    expect(document.getElementById("am-works")).toBeNull();
    expect(screen.queryByTestId("autumn-moment-works")).toBeNull();
  });

  test("応募作品があれば、数と一覧を出す", () => {
    renderAt("2026-11-05T12:00:00+09:00", SUBMISSION_PAGES);
    expect(document.getElementById("am-works")).toBeTruthy();
    expect(screen.getByTestId("autumn-moment-works-count").textContent).toBe("現在、応募作品は2作品！");
    expect(screen.getAllByTestId("autumn-moment-work")).toHaveLength(2);
  });

  describe("いまの段階で変わるところ(ブラウザの時刻で決める)", () => {
    test("応募の前: スタートの日時を出し、浮いたボタンは出さない", () => {
      renderAt("2026-10-31T21:00:00+09:00");
      expect(screen.getByTestId("autumn-moment-phase-notice").textContent).toContain("11/1(日) 0:00 から応募スタート！");
      expect(screen.queryByTestId("autumn-moment-floating-cta")).toBeNull();
    });

    test("応募期間: 「カタログをつくる」(CREATE)と「応募作品を見る」", () => {
      renderAt("2026-11-05T12:00:00+09:00", SUBMISSION_PAGES);
      expect(screen.getByTestId("autumn-moment-phase-notice").textContent).toContain("ただいま応募期間中");
      const floating = screen.getByTestId("autumn-moment-floating-cta");
      const create = within(floating).getByRole("link", { name: /カタログを\s*つくる/ });
      expect(create.getAttribute("href")).toBe("/free");
      const works = within(floating).getByRole("link", { name: /応募作品を\s*見る/ });
      expect(works.getAttribute("href")).toBe("#am-works");
    });

    test("応募作品がまだ無いときの「応募作品を見る」は、ハッシュタグの検索へ", () => {
      renderAt("2026-11-01T00:10:00+09:00");
      const works = within(screen.getByTestId("autumn-moment-floating-cta")).getByRole("link", { name: /応募作品を\s*見る/ });
      expect(works.getAttribute("href")).toBe(AUTUMN_MOMENT.entriesHref);
    });

    test("生成期間: 応募のボタンは消え、「作品を見て生成する」だけ", () => {
      renderAt("2026-11-18T12:00:00+09:00", SUBMISSION_PAGES);
      expect(screen.getByTestId("autumn-moment-phase-notice").textContent).toContain("ただいま生成期間中");
      const floating = screen.getByTestId("autumn-moment-floating-cta");
      expect(within(floating).queryByRole("link", { name: /カタログを\s*つくる/ })).toBeNull();
      const generate = within(floating).getByRole("link", { name: /作品を見て\s*生成する/ });
      expect(generate.getAttribute("href")).toBe("#am-works");
    });

    test("⭐開いたまま 11/1 0:00 をまたぐと、読み直さなくても応募期間の表示に変わる", () => {
      renderAt("2026-10-31T23:59:58+09:00");
      expect(screen.getByTestId("autumn-moment-phase-notice").textContent).toContain("まもなくスタート");
      expect(screen.queryByTestId("autumn-moment-floating-cta")).toBeNull();
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(screen.getByTestId("autumn-moment-phase-notice").textContent).toContain("ただいま応募期間中");
      expect(screen.getByTestId("autumn-moment-floating-cta").getAttribute("data-phase")).toBe("submit");
    });

    test("⭐開いたまま 11/16 0:00 をまたぐと、応募のボタンが消えて生成のボタンになる", () => {
      renderAt("2026-11-15T23:59:59+09:00", SUBMISSION_PAGES);
      expect(screen.getByTestId("autumn-moment-floating-cta").getAttribute("data-phase")).toBe("submit");
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      const floating = screen.getByTestId("autumn-moment-floating-cta");
      expect(floating.getAttribute("data-phase")).toBe("generate");
      expect(within(floating).queryByRole("link", { name: /カタログを\s*つくる/ })).toBeNull();
    });

    test("締め切りのあと: 結果発表の日を出し、浮いたボタンは出さない", () => {
      renderAt("2026-11-23T00:00:00+09:00", SUBMISSION_PAGES);
      expect(screen.getByTestId("autumn-moment-phase-notice").textContent).toContain("結果発表は 11/29(日)ごろ です");
      expect(screen.queryByTestId("autumn-moment-floating-cta")).toBeNull();
    });

    test("浮いたボタンは、ページの終わりの目印に来たら消す", () => {
      const observers: { callback: IntersectionObserverCallback }[] = [];
      const original = global.IntersectionObserver;
      global.IntersectionObserver = jest.fn((callback: IntersectionObserverCallback) => {
        observers.push({ callback });
        return { observe: jest.fn(), disconnect: jest.fn(), unobserve: jest.fn(), takeRecords: jest.fn() };
      }) as unknown as typeof IntersectionObserver;
      try {
        renderAt("2026-11-05T12:00:00+09:00");
        expect(document.getElementById("am-page-end")).toBeTruthy();
        const floating = screen.getByTestId("autumn-moment-floating-cta");
        expect(floating.getAttribute("aria-hidden")).toBeNull();
        const endObserver = observers.at(-1);
        act(() => {
          endObserver?.callback(
            [{ isIntersecting: true, boundingClientRect: { top: 10 } } as IntersectionObserverEntry],
            {} as IntersectionObserver,
          );
        });
        expect(screen.getByTestId("autumn-moment-floating-cta").getAttribute("aria-hidden")).toBe("true");
      } finally {
        global.IntersectionObserver = original;
      }
    });
  });
});
