import {
  hasCollectionDisplayPeriod,
  isActiveEventCategory,
  isCollectionDisplayPeriodActive,
  isCollectionDisplayPeriodEnded,
} from "@/features/collections/lib/collection-display-period";

const NOW = new Date("2026-07-15T00:00:00Z");

describe("isCollectionDisplayPeriodActive", () => {
  test("両方 NULL は常に表示", () => {
    expect(
      isCollectionDisplayPeriodActive(
        { collectionDisplayStartsAt: null, collectionDisplayEndsAt: null },
        NOW,
      ),
    ).toBe(true);
  });

  test("開始前は非表示、開始時刻ちょうどから表示", () => {
    expect(
      isCollectionDisplayPeriodActive(
        {
          collectionDisplayStartsAt: "2026-08-01T00:00:00Z",
          collectionDisplayEndsAt: null,
        },
        NOW,
      ),
    ).toBe(false);
    expect(
      isCollectionDisplayPeriodActive(
        {
          collectionDisplayStartsAt: "2026-07-15T00:00:00Z",
          collectionDisplayEndsAt: null,
        },
        NOW,
      ),
    ).toBe(true);
  });

  test("終了時刻ちょうどから非表示([starts, ends) 判定)", () => {
    expect(
      isCollectionDisplayPeriodActive(
        {
          collectionDisplayStartsAt: null,
          collectionDisplayEndsAt: "2026-07-15T00:00:00Z",
        },
        NOW,
      ),
    ).toBe(false);
    expect(
      isCollectionDisplayPeriodActive(
        {
          collectionDisplayStartsAt: null,
          collectionDisplayEndsAt: "2026-07-15T00:00:01Z",
        },
        NOW,
      ),
    ).toBe(true);
  });

  test("期間内は表示", () => {
    expect(
      isCollectionDisplayPeriodActive(
        {
          collectionDisplayStartsAt: "2026-07-01T00:00:00Z",
          collectionDisplayEndsAt: "2026-07-31T00:00:00Z",
        },
        NOW,
      ),
    ).toBe(true);
  });

  test("不正な日時文字列は制限なし扱い(フェイルオープン)", () => {
    expect(
      isCollectionDisplayPeriodActive(
        {
          collectionDisplayStartsAt: "invalid",
          collectionDisplayEndsAt: "invalid",
        },
        NOW,
      ),
    ).toBe(true);
  });
});

/**
 * ここが緩むと「終了しました」を言ってはいけない相手に言ってしまう。
 *
 * 引用スタイルカードの `ended` 判定はこの helper が正本で、開始前・期間未設定を
 * 終了扱いにすると (a) これから始まる企画の存在が漏れる (b) 開催中の企画に
 * 「終了しました」と嘘をつく、のどちらかが起きる。
 */
describe("isCollectionDisplayPeriodEnded", () => {
  test("終了日が NULL なら終了しない(常設・期間未設定)", () => {
    expect(
      isCollectionDisplayPeriodEnded(
        { collectionDisplayStartsAt: null, collectionDisplayEndsAt: null },
        NOW,
      ),
    ).toBe(false);
    expect(
      isCollectionDisplayPeriodEnded(
        {
          collectionDisplayStartsAt: "2026-07-01T00:00:00Z",
          collectionDisplayEndsAt: null,
        },
        NOW,
      ),
    ).toBe(false);
  });

  test("不正な日付は終了扱いにしない(判定できないなら黙る側へ倒す)", () => {
    expect(
      isCollectionDisplayPeriodEnded(
        {
          collectionDisplayStartsAt: null,
          collectionDisplayEndsAt: "not-a-date",
        },
        NOW,
      ),
    ).toBe(false);
  });

  test("終了時刻ちょうどから終了([starts, ends) と同じ境界)", () => {
    expect(
      isCollectionDisplayPeriodEnded(
        {
          collectionDisplayStartsAt: null,
          collectionDisplayEndsAt: "2026-07-15T00:00:00Z",
        },
        NOW,
      ),
    ).toBe(true);
  });

  test("終了前は終了しない", () => {
    expect(
      isCollectionDisplayPeriodEnded(
        {
          collectionDisplayStartsAt: null,
          collectionDisplayEndsAt: "2026-07-15T00:00:01Z",
        },
        NOW,
      ),
    ).toBe(false);
  });

  test("⭐開始前は終了ではない(active も ended も false になる)", () => {
    const beforeStart = {
      collectionDisplayStartsAt: "2026-08-01T00:00:00Z",
      collectionDisplayEndsAt: "2026-08-10T00:00:00Z",
    };

    expect(isCollectionDisplayPeriodActive(beforeStart, NOW)).toBe(false);
    expect(isCollectionDisplayPeriodEnded(beforeStart, NOW)).toBe(false);
  });

  test("⭐active と ended が同時に true になる期間はない", () => {
    const cases = [
      { collectionDisplayStartsAt: null, collectionDisplayEndsAt: null },
      {
        collectionDisplayStartsAt: "2026-07-01T00:00:00Z",
        collectionDisplayEndsAt: "2026-07-20T00:00:00Z",
      },
      {
        collectionDisplayStartsAt: "2026-07-01T00:00:00Z",
        collectionDisplayEndsAt: "2026-07-15T00:00:00Z",
      },
      {
        collectionDisplayStartsAt: "2026-08-01T00:00:00Z",
        collectionDisplayEndsAt: "2026-08-10T00:00:00Z",
      },
      {
        collectionDisplayStartsAt: null,
        collectionDisplayEndsAt: "not-a-date",
      },
    ];

    for (const period of cases) {
      expect(
        isCollectionDisplayPeriodActive(period, NOW) &&
          isCollectionDisplayPeriodEnded(period, NOW),
      ).toBe(false);
    }
  });
});

describe("hasCollectionDisplayPeriod", () => {
  test("両方NULLは期間未設定(=常設)", () => {
    expect(
      hasCollectionDisplayPeriod({
        collectionDisplayStartsAt: null,
        collectionDisplayEndsAt: null,
      }),
    ).toBe(false);
  });

  test("開始か終了のどちらかが設定されていれば期間あり", () => {
    expect(
      hasCollectionDisplayPeriod({
        collectionDisplayStartsAt: "2026-07-01T00:00:00Z",
        collectionDisplayEndsAt: null,
      }),
    ).toBe(true);
    expect(
      hasCollectionDisplayPeriod({
        collectionDisplayStartsAt: null,
        collectionDisplayEndsAt: "2026-07-31T00:00:00Z",
      }),
    ).toBe(true);
  });
});

describe("isActiveEventCategory", () => {
  test("期間設定あり+期間内のコレクションシリーズはイベント", () => {
    expect(
      isActiveEventCategory(
        {
          isCollectionSeries: true,
          collectionDisplayStartsAt: "2026-07-01T00:00:00Z",
          collectionDisplayEndsAt: "2026-07-31T00:00:00Z",
        },
        NOW,
      ),
    ).toBe(true);
  });

  test("期間未設定(NULL/NULL)のコレクションシリーズは常設扱いでイベントではない", () => {
    expect(
      isActiveEventCategory(
        {
          isCollectionSeries: true,
          collectionDisplayStartsAt: null,
          collectionDisplayEndsAt: null,
        },
        NOW,
      ),
    ).toBe(false);
  });

  test("期間終了済みのコレクションシリーズはイベントではない", () => {
    expect(
      isActiveEventCategory(
        {
          isCollectionSeries: true,
          collectionDisplayStartsAt: null,
          collectionDisplayEndsAt: "2026-07-10T00:00:00Z",
        },
        NOW,
      ),
    ).toBe(false);
  });

  test("コレクションシリーズでないカテゴリは期間があってもイベントではない", () => {
    expect(
      isActiveEventCategory(
        {
          isCollectionSeries: false,
          collectionDisplayStartsAt: "2026-07-01T00:00:00Z",
          collectionDisplayEndsAt: "2026-07-31T00:00:00Z",
        },
        NOW,
      ),
    ).toBe(false);
  });
});
