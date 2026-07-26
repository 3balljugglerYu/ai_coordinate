import {
  hasCollectionDisplayPeriod,
  isActiveEventCategory,
  isCollectionDisplayPeriodActive,
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
