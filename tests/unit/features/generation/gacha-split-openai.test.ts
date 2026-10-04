/** @jest-environment node */

import {
  GACHA_SPLIT_MODEL,
  GachaSplitModelError,
  callGachaSplitModel,
} from "@/features/generation/lib/gacha-split-openai";

function okResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200 });
}

describe("callGachaSplitModel", () => {
  beforeEach(() => {
    jest.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test("行番号付きの本文と JSON の形を指定して呼び、出力を JSON で返す", async () => {
    const fetchFn = jest.fn(async () =>
      okResponse({
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: '{"removeLines":[2],"candidates":["a","b"]}' },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );

    const output = await callGachaSplitModel("一行目\n二行目", {
      apiKey: "test-key",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(output).toEqual({ removeLines: [2], candidates: ["a", "b"] });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(GACHA_SPLIT_MODEL);
    expect(body.input).toBe("L1: 一行目\nL2: 二行目");
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
  });

  test("本文をログに出さない(使用量だけ)", async () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    const fetchFn = jest.fn(async () =>
      okResponse({ output_text: '{"removeLines":[],"candidates":[]}', usage: {} }),
    );

    await callGachaSplitModel("秘密のプロンプト", {
      apiKey: "test-key",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(JSON.stringify(info.mock.calls)).not.toContain("秘密のプロンプト");
  });

  test.each([
    ["OpenAI がエラーを返す", async () => new Response("{}", { status: 500 })],
    ["出力が空", async () => okResponse({ output: [] })],
    ["出力が JSON でない", async () => okResponse({ output_text: "not json" })],
    [
      "通信に失敗",
      async () => {
        throw new TypeError("network");
      },
    ],
  ])("%s ときは GachaSplitModelError", async (_label, impl) => {
    await expect(
      callGachaSplitModel("x", {
        apiKey: "test-key",
        fetchFn: jest.fn(impl) as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(GachaSplitModelError);
  });

  test("API キーが無ければ呼ばずに失敗する", async () => {
    const fetchFn = jest.fn();
    await expect(
      callGachaSplitModel("x", { apiKey: "", fetchFn: fetchFn as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(GachaSplitModelError);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
