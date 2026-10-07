/** @jest-environment node */

import { callNameInputCreateModel } from "@/features/generation/lib/name-input-create-openai";
import { NAME_INPUT_CREATE_JSON_SCHEMA } from "@/shared/generation/name-input-create";

describe("callNameInputCreateModel", () => {
  beforeEach(() => {
    jest.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test("名前の欄用の指示と JSON の形で呼び、行番号の答えを返す", async () => {
    const fetchFn = jest.fn(async () =>
      new Response(JSON.stringify({ output_text: '{"nameLines":[2]}' }), { status: 200 }),
    );
    const output = await callNameInputCreateModel("描く\n【名前】〇〇", {
      apiKey: "test-key",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(output).toEqual({ nameLines: [2] });
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.input).toBe("L1: 描く\nL2: 【名前】〇〇");
    expect(body.text.format).toMatchObject({ name: "name_input_create", schema: NAME_INPUT_CREATE_JSON_SCHEMA });
    expect(body.instructions).toContain("text field");
  });
});
