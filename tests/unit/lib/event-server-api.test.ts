/** @jest-environment node */

jest.mock("react", () => {
  const actual = jest.requireActual("react");
  return {
    ...actual,
    cache: <T,>(fn: T) => fn,
  };
});

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

var mockEnv = {
  NEXT_PUBLIC_EVENT_USER_ID: "event-user-1",
};

jest.mock("@/lib/env", () => ({
  get env() {
    return mockEnv;
  },
}));

import { createClient } from "@/lib/supabase/server";
import { getEventImagesServer } from "@/features/event/lib/server-api";

type QueryResult<T = unknown> = {
  data: T | null;
  error: unknown | null;
};

type QueryCalls = {
  select: unknown[][];
  eq: unknown[][];
  order: unknown[][];
  range: unknown[][];
};

function createGeneratedImagesSupabase(result: QueryResult) {
  const calls: QueryCalls = {
    select: [],
    eq: [],
    order: [],
    range: [],
  };

  const builder = {
    select: jest.fn((...args: unknown[]) => {
      calls.select.push(args);
      return builder;
    }),
    eq: jest.fn((...args: unknown[]) => {
      calls.eq.push(args);
      return builder;
    }),
    order: jest.fn((...args: unknown[]) => {
      calls.order.push(args);
      return builder;
    }),
    range: jest.fn((...args: unknown[]) => {
      calls.range.push(args);
      return Promise.resolve({
        data: result.data,
        error: result.error,
      });
    }),
  };

  const from = jest.fn((table: string) => {
    expect(table).toBe("generated_images");
    return builder;
  });

  return {
    client: { from },
    from,
    calls,
  };
}

function createImageRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "image-1",
    user_id: "event-user-1",
    is_posted: true,
    posted_at: "2026-03-10T00:00:00.000Z",
    image_url: "https://example.com/event-1.webp",
    ...overrides,
  };
}

describe("EventServerApi unit tests from EARS specs", () => {
  const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockCreateClient.mockReset();
    mockEnv.NEXT_PUBLIC_EVENT_USER_ID = "event-user-1";
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("EVTSAPI-001 getEventImagesServer", () => {
    test("getEventImagesServer_EVENT_USER_ID設定済みの場合_postedAt降順の投稿済み画像を返す", async () => {
      // Spec: EVTSAPI-001
      const rows = [
        createImageRecord({ id: "event-1", posted_at: "2026-03-11T00:00:00.000Z" }),
        createImageRecord({ id: "event-2", posted_at: "2026-03-10T00:00:00.000Z" }),
      ];
      const supabase = createGeneratedImagesSupabase({
        data: rows,
        error: null,
      });
      mockCreateClient.mockResolvedValue(supabase.client as never);

      const result = await getEventImagesServer(6, 3);

      expect(mockCreateClient).toHaveBeenCalledTimes(1);
      expect(result).toEqual(rows);
      expect(supabase.from).toHaveBeenCalledWith("generated_images");
      expect(supabase.calls.select).toEqual([["*"]]);
      expect(supabase.calls.eq).toEqual([
        ["is_posted", true],
        ["user_id", "event-user-1"],
      ]);
      expect(supabase.calls.order).toEqual([
        ["posted_at", { ascending: false }],
      ]);
      expect(supabase.calls.range).toEqual([[3, 8]]);
    });

    test("getEventImagesServer_dataがnull相当の場合_空配列を返す", async () => {
      // Spec: EVTSAPI-001
      mockEnv.NEXT_PUBLIC_EVENT_USER_ID = "event-user-2";
      const supabase = createGeneratedImagesSupabase({
        data: null,
        error: null,
      });
      mockCreateClient.mockResolvedValue(supabase.client as never);

      const result = await getEventImagesServer();

      expect(result).toEqual([]);
      expect(supabase.calls.eq).toEqual([
        ["is_posted", true],
        ["user_id", "event-user-2"],
      ]);
      expect(supabase.calls.range).toEqual([[0, 3]]);
    });
  });

  describe("EVTSAPI-002 getEventImagesServer", () => {
    test("getEventImagesServer_EVENT_USER_ID未設定の場合_クエリ前に設定エラーを投げる", async () => {
      // Spec: EVTSAPI-002
      mockEnv.NEXT_PUBLIC_EVENT_USER_ID = "";
      const supabase = createGeneratedImagesSupabase({
        data: [createImageRecord()],
        error: null,
      });
      mockCreateClient.mockResolvedValue(supabase.client as never);

      await expect(getEventImagesServer()).rejects.toThrow(
        "NEXT_PUBLIC_EVENT_USER_ID環境変数が設定されていません"
      );

      expect(mockCreateClient).toHaveBeenCalledTimes(1);
      expect(supabase.from).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("EVTSAPI-003 getEventImagesServer", () => {
    test("getEventImagesServer_クエリエラーの場合_ログしてローカライズ済み取得エラーを投げる", async () => {
      // Spec: EVTSAPI-003
      const queryError = { message: "db failed" };
      const supabase = createGeneratedImagesSupabase({
        data: [createImageRecord({ id: "stale-row" })],
        error: queryError,
      });
      mockCreateClient.mockResolvedValue(supabase.client as never);

      await expect(getEventImagesServer(2, 1)).rejects.toThrow(
        "イベント画像の取得に失敗しました: db failed"
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Database query error:",
        queryError
      );
      expect(supabase.calls.range).toEqual([[1, 2]]);
    });

    test("getEventImagesServer_クエリエラーが繰り返される場合_各呼び出しで独立してログして例外を投げる", async () => {
      // Spec: EVTSAPI-003
      const queryError = { message: "db failed again" };
      const supabase = createGeneratedImagesSupabase({
        data: null,
        error: queryError,
      });
      mockCreateClient.mockResolvedValue(supabase.client as never);

      // Fixed: call the helper twice to prove repeated failures are handled independently.
      // Reason: EVTSAPI-003 documents no retry and no error suppression across calls.
      await expect(getEventImagesServer()).rejects.toThrow(
        "イベント画像の取得に失敗しました: db failed again"
      );
      await expect(getEventImagesServer()).rejects.toThrow(
        "イベント画像の取得に失敗しました: db failed again"
      );

      expect(mockCreateClient).toHaveBeenCalledTimes(2);
      expect(supabase.from).toHaveBeenCalledTimes(2);
      expect(supabase.calls.range).toEqual([
        [0, 3],
        [0, 3],
      ]);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        "Database query error:",
        queryError
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        "Database query error:",
        queryError
      );
    });
  });
});
