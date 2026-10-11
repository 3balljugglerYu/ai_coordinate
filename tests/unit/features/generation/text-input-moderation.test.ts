import { moderateTextInput, TEXT_INPUT_MODERATION_MODEL } from "@/features/generation/lib/text-input-moderation";

// jsdom には Response が無いので、使う所だけの形にする
const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  body: { cancel: async () => undefined },
});

describe("moderateTextInput(文字入力を生成の前に確かめる。2026-10-11)", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "info").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  test("1つでも flagged なら flagged。入れた文字はログに出さず、種類だけ残す", async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      jsonResponse({
        results: [
          { flagged: false, categories: { sexual: false } },
          { flagged: true, categories: { sexual: true, violence: false } },
        ],
      }),
    );
    await expect(moderateTextInput(["ぺるこ", "ひみつの言葉"], { apiKey: "k", fetchFn })).resolves.toBe("flagged");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/moderations");
    expect(JSON.parse(init.body)).toEqual({ model: TEXT_INPUT_MODERATION_MODEL, input: ["ぺるこ", "ひみつの言葉"] });
    expect(init.headers.Authorization).toBe("Bearer k");
    expect(console.info).toHaveBeenCalledWith("[text-input-moderation] flagged", { categories: ["sexual"] });
    expect(JSON.stringify((console.info as jest.Mock).mock.calls)).not.toContain("ひみつの言葉");
  });

  test("どれも flagged でなければ ok", async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({ results: [{ flagged: false }] }));
    await expect(moderateTextInput(["ウルトラマンコスモス"], { apiKey: "k", fetchFn })).resolves.toBe("ok");
  });

  test("空・空白だけ・重複は送らない(何も無ければ問い合わせない)", async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({ results: [{ flagged: false }] }));
    await expect(moderateTextInput(["", "  "], { apiKey: "k", fetchFn })).resolves.toBe("ok");
    expect(fetchFn).not.toHaveBeenCalled();
    await moderateTextInput([" 天才 ", "天才"], { apiKey: "k", fetchFn });
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).input).toEqual(["天才"]);
  });

  test.each([
    ["API がエラーを返す", () => Promise.resolve(jsonResponse({ error: "x" }, 500))],
    ["答えの形がおかしい", () => Promise.resolve(jsonResponse({ results: [] }))],
    ["通信に失敗する", () => Promise.reject(new Error("network"))],
  ])("%s ときは unavailable(止めない)", async (_label, impl) => {
    const fetchFn = jest.fn().mockImplementation(impl);
    await expect(moderateTextInput(["ぺるこ"], { apiKey: "k", fetchFn })).resolves.toBe("unavailable");
  });

  test("時間がかかりすぎたら打ち切って unavailable", async () => {
    jest.useFakeTimers();
    const fetchFn = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const pending = moderateTextInput(["ぺるこ"], { apiKey: "k", fetchFn });
    await jest.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toBe("unavailable");
    expect(console.warn).toHaveBeenCalledWith("[text-input-moderation] request failed", { reason: "timeout" });
    jest.useRealTimers();
  });

  test("キーが無ければ問い合わせずに unavailable", async () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const fetchFn = jest.fn();
    await expect(moderateTextInput(["ぺるこ"], { fetchFn })).resolves.toBe("unavailable");
    expect(fetchFn).not.toHaveBeenCalled();
    if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
  });

  test("毎回、スコアの上位3つを残す(文字は出さない。線を決めるための記録)", async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            flagged: false,
            category_scores: { sexual: 0.31234, harassment: 0.02, violence: 0.001, hate: 0.0001 },
          },
        ],
      }),
    );
    await moderateTextInput(["ひみつの言葉"], { apiKey: "k", fetchFn });
    expect(console.info).toHaveBeenCalledWith("[text-input-moderation] scores", {
      results: [{ flagged: false, top: [["sexual", 0.312], ["harassment", 0.02], ["violence", 0.001]] }],
    });
    expect(JSON.stringify((console.info as jest.Mock).mock.calls)).not.toContain("ひみつの言葉");
  });

  test("flagged でなくても、種類ごとの線以上なら止める", async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      jsonResponse({ results: [{ flagged: false, category_scores: { sexual: 0.3, violence: 0.01 } }] }),
    );
    await expect(
      moderateTextInput(["ぺるこ"], { apiKey: "k", fetchFn, thresholds: { sexual: 0.3 } }),
    ).resolves.toBe("flagged");
    await expect(
      moderateTextInput(["ぺるこ"], { apiKey: "k", fetchFn, thresholds: { sexual: 0.31, violence: 0.5 } }),
    ).resolves.toBe("ok");
  });

  test("線が空のあいだは、これまでどおり flagged だけで止める", async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      jsonResponse({ results: [{ flagged: false, category_scores: { sexual: 0.99 } }] }),
    );
    await expect(moderateTextInput(["ぺるこ"], { apiKey: "k", fetchFn })).resolves.toBe("ok");
  });
});
