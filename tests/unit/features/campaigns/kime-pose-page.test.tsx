/**
 * @jest-environment jsdom
 */
import { act, render, screen, within } from "@testing-library/react";
import { KimePosePage } from "@/features/campaigns/kime-pose/components/KimePosePage";
import { KIME_POSE } from "@/features/campaigns/kime-pose/kime-pose";

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
  return render(<KimePosePage submissionPages={submissionPages} />);
}

afterEach(() => {
  jest.useRealTimers();
});

describe("11月の企画「うちの子の決めポーズ」のページ(2026-10-30)", () => {
  test("題名・3つの期間(応募・投票・結果発表)・ハッシュタグを出す", () => {
    renderAt("2026-11-05T12:00:00+09:00");
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("うちの子の");
    expect(h1.textContent).toContain("決めポーズ");
    const text = document.body.textContent ?? "";
    expect(text).toContain("応募期間11/1(日) 0:00 〜 11/15(日) 23:59");
    expect(text).toContain("投票期間11/16(月) 0:00 〜 11/22(日) 23:59");
    expect(text).toContain("結果発表11/29(日)ごろ");
    expect(screen.getAllByText(KIME_POSE.hashtag).length).toBeGreaterThanOrEqual(2);
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

  test("賞は2つ(1名様・10名様)。使われた回数の多い順に決まると書く", () => {
    renderAt("2026-11-05T12:00:00+09:00");
    const prizes = screen.getAllByTestId("kime-pose-prize");
    expect(prizes).toHaveLength(2);
    expect(within(prizes[0]).getByTestId("kime-pose-prize-gift").textContent).toBe("Amazonギフトカード 5,000円分1名様");
    expect(within(prizes[1]).getByTestId("kime-pose-prize-gift").textContent).toBe("ペルコイン 200枚10名様");
    expect(document.body.textContent).toContain("使われた回数の多い順に決まります！");
  });

  test("応募のしかたは CREATE の手順、投票のしかたは「このカタログで生成する」の手順", () => {
    renderAt("2026-11-05T12:00:00+09:00");
    expect(screen.getAllByTestId("kime-pose-step-creator")).toHaveLength(8);
    expect(screen.getAllByTestId("kime-pose-step-voter")).toHaveLength(4);
    const text = document.body.textContent ?? "";
    // 票の数え方(2026-10-30 ユーザー決定: いつもの利用回数・応募期間中の生成も含める)
    expect(text).toContain("応募期間中の生成も、票に入ります");
    expect(text).toContain("自分の応募作品での生成は数えません");
    expect(text).toContain("プロンプトをコピーして貼り付けたものは数えません");
  });

  test("応募作品が無いあいだは、一覧の区画ごと出さない", () => {
    renderAt("2026-11-01T00:10:00+09:00");
    expect(document.getElementById("kp-works")).toBeNull();
    expect(screen.queryByTestId("kime-pose-works")).toBeNull();
  });

  test("応募作品があれば、数と一覧を出す", () => {
    renderAt("2026-11-05T12:00:00+09:00", SUBMISSION_PAGES);
    expect(document.getElementById("kp-works")).toBeTruthy();
    expect(screen.getByTestId("kime-pose-works-count").textContent).toBe("現在、応募作品は2作品！");
    expect(screen.getAllByTestId("kime-pose-work")).toHaveLength(2);
  });

  describe("いまの段階で変わるところ(ブラウザの時刻で決める)", () => {
    test("応募の前: スタートの日時を出し、浮いたボタンは出さない", () => {
      renderAt("2026-10-31T21:00:00+09:00");
      expect(screen.getByTestId("kime-pose-phase-notice").textContent).toContain("11/1(日) 0:00 から応募スタート！");
      expect(screen.queryByTestId("kime-pose-floating-cta")).toBeNull();
    });

    test("応募期間: 「カタログをつくる」(CREATE)と「応募作品を見る」", () => {
      renderAt("2026-11-05T12:00:00+09:00", SUBMISSION_PAGES);
      expect(screen.getByTestId("kime-pose-phase-notice").textContent).toContain("ただいま応募期間中");
      const floating = screen.getByTestId("kime-pose-floating-cta");
      const create = within(floating).getByRole("link", { name: /カタログを\s*つくる/ });
      expect(create.getAttribute("href")).toBe("/free");
      const works = within(floating).getByRole("link", { name: /応募作品を\s*見る/ });
      expect(works.getAttribute("href")).toBe("#kp-works");
    });

    test("応募作品がまだ無いときの「応募作品を見る」は、ハッシュタグの検索へ", () => {
      renderAt("2026-11-01T00:10:00+09:00");
      const works = within(screen.getByTestId("kime-pose-floating-cta")).getByRole("link", { name: /応募作品を\s*見る/ });
      expect(works.getAttribute("href")).toBe(KIME_POSE.entriesHref);
    });

    test("投票期間: 応募のボタンは消え、「作品を見て投票する」だけ", () => {
      renderAt("2026-11-18T12:00:00+09:00", SUBMISSION_PAGES);
      expect(screen.getByTestId("kime-pose-phase-notice").textContent).toContain("ただいま投票期間中");
      const floating = screen.getByTestId("kime-pose-floating-cta");
      expect(within(floating).queryByRole("link", { name: /カタログを\s*つくる/ })).toBeNull();
      const vote = within(floating).getByRole("link", { name: /作品を見て\s*投票する/ });
      expect(vote.getAttribute("href")).toBe("#kp-works");
    });

    test("締め切りのあと: 結果発表の日を出し、浮いたボタンは出さない", () => {
      renderAt("2026-11-23T00:00:00+09:00", SUBMISSION_PAGES);
      expect(screen.getByTestId("kime-pose-phase-notice").textContent).toContain("結果発表は 11/29(日)ごろ です");
      expect(screen.queryByTestId("kime-pose-floating-cta")).toBeNull();
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
        expect(document.getElementById("kp-page-end")).toBeTruthy();
        const floating = screen.getByTestId("kime-pose-floating-cta");
        expect(floating.getAttribute("aria-hidden")).toBeNull();
        const endObserver = observers.at(-1);
        act(() => {
          endObserver?.callback(
            [{ isIntersecting: true, boundingClientRect: { top: 10 } } as IntersectionObserverEntry],
            {} as IntersectionObserver,
          );
        });
        expect(screen.getByTestId("kime-pose-floating-cta").getAttribute("aria-hidden")).toBe("true");
      } finally {
        global.IntersectionObserver = original;
      }
    });
  });
});
