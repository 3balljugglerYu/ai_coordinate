/** @jest-environment node */

import { redactSecrets, REDACTED } from "@/lib/security/redact-secrets";

describe("redactSecrets", () => {
  describe("primitive types", () => {
    test("string / number / boolean / null / undefined はそのまま返す", () => {
      expect(redactSecrets("hello")).toBe("hello");
      expect(redactSecrets(42)).toBe(42);
      expect(redactSecrets(true)).toBe(true);
      expect(redactSecrets(null)).toBe(null);
      expect(redactSecrets(undefined)).toBe(undefined);
    });

    test("function / symbol は [REDACTED] に置換", () => {
      expect(redactSecrets(() => 1)).toBe(REDACTED);
      expect(redactSecrets(Symbol("x"))).toBe(REDACTED);
    });
  });

  describe("Creator Looks 機密キー (= レッドライン項目)", () => {
    test("hidden_prompt は値が文字列でも [REDACTED] に置換", () => {
      expect(redactSecrets({ hidden_prompt: "secret outfit prompt" })).toEqual({
        hidden_prompt: REDACTED,
      });
    });

    test("HIDDEN_PROMPT (大文字) も [REDACTED]", () => {
      expect(redactSecrets({ HIDDEN_PROMPT: "x" })).toEqual({
        HIDDEN_PROMPT: REDACTED,
      });
    });

    test("user_hidden_prompt (部分一致) も [REDACTED]", () => {
      expect(redactSecrets({ user_hidden_prompt: "x" })).toEqual({
        user_hidden_prompt: REDACTED,
      });
    });

    test("extracted_prompt / meta_extractor_output / creator_looks_prompt はマスク", () => {
      expect(
        redactSecrets({
          extracted_prompt: "x",
          meta_extractor_output: "y",
          creator_looks_prompt: "z",
        }),
      ).toEqual({
        extracted_prompt: REDACTED,
        meta_extractor_output: REDACTED,
        creator_looks_prompt: REDACTED,
      });
    });
  });

  describe("一般 secret 系", () => {
    test("authorization / api_key / apikey / secret / password / bearer はマスク", () => {
      expect(
        redactSecrets({
          Authorization: "Bearer xxx",
          api_key: "sk-abc",
          apiKey: "sk-def",
          secret: "topsecret",
          password: "hunter2",
          bearer: "tok",
        }),
      ).toEqual({
        Authorization: REDACTED,
        api_key: REDACTED,
        apiKey: REDACTED,
        secret: REDACTED,
        password: REDACTED,
        bearer: REDACTED,
      });
    });

    test("service_role / access_token / refresh_token / private_key はマスク", () => {
      expect(
        redactSecrets({
          service_role_key: "sr",
          access_token: "at",
          refresh_token: "rt",
          private_key: "pk",
        }),
      ).toEqual({
        service_role_key: REDACTED,
        access_token: REDACTED,
        refresh_token: REDACTED,
        private_key: REDACTED,
      });
    });
  });

  describe("非機密キー", () => {
    test("template_id / image_url / created_at などは素通し", () => {
      expect(
        redactSecrets({
          template_id: "uuid",
          image_url: "https://...",
          created_at: "2026-06-01",
        }),
      ).toEqual({
        template_id: "uuid",
        image_url: "https://...",
        created_at: "2026-06-01",
      });
    });
  });

  describe("ネスト / 配列", () => {
    test("ネスト object 内の hidden_prompt も再帰でマスク", () => {
      expect(
        redactSecrets({
          template: {
            id: "abc",
            details: {
              hidden_prompt: "X",
              other: "y",
            },
          },
        }),
      ).toEqual({
        template: {
          id: "abc",
          details: {
            hidden_prompt: REDACTED,
            other: "y",
          },
        },
      });
    });

    test("`secrets` のような複数形キーも丸ごと [REDACTED] (= 部分一致防衛)", () => {
      expect(
        redactSecrets({
          template: {
            id: "abc",
            secrets: { hidden_prompt: "x" },
          },
        }),
      ).toEqual({
        template: {
          id: "abc",
          secrets: REDACTED,
        },
      });
    });

    test("配列の各要素も再帰でマスク", () => {
      expect(
        redactSecrets([
          { hidden_prompt: "a" },
          { other: "b" },
          { api_key: "c" },
        ]),
      ).toEqual([
        { hidden_prompt: REDACTED },
        { other: "b" },
        { api_key: REDACTED },
      ]);
    });
  });

  describe("循環参照", () => {
    test("循環は [CIRCULAR] に置換 (= 無限ループしない)", () => {
      type Cycle = { name: string; self?: Cycle };
      const obj: Cycle = { name: "root" };
      obj.self = obj;
      const result = redactSecrets(obj) as unknown as {
        name: string;
        self: string;
      };
      expect(result.name).toBe("root");
      expect(result.self).toBe("[CIRCULAR]");
    });
  });

  describe("Error / Date / RegExp", () => {
    test("Error は { name, message, stack } の plain object になる", () => {
      const err = new Error("boom");
      const result = redactSecrets(err) as {
        name: string;
        message: string;
        stack?: string;
      };
      expect(result.name).toBe("Error");
      expect(result.message).toBe("boom");
      expect(typeof result.stack).toBe("string");
    });

    test("Date は ISO 文字列化", () => {
      const d = new Date("2026-06-01T00:00:00Z");
      expect(redactSecrets(d)).toBe("2026-06-01T00:00:00.000Z");
    });

    test("RegExp は toString される", () => {
      expect(redactSecrets(/abc/g)).toBe("/abc/g");
    });
  });

  describe("immutability (= 入力 obj を mutate しない)", () => {
    test("元の object には影響を与えない", () => {
      const input = { hidden_prompt: "secret", other: "ok" };
      const output = redactSecrets(input);
      expect(input.hidden_prompt).toBe("secret"); // 元はそのまま
      expect(output).toEqual({ hidden_prompt: REDACTED, other: "ok" });
    });
  });

  describe("実運用想定: ログ payload", () => {
    test("Edge Function エラーログ想定の object", () => {
      const logPayload = {
        event: "extract_failed",
        template_id: "tpl-1",
        attempt: 3,
        error: {
          message: "OpenAI API timeout",
          status: 504,
        },
        request: {
          model: "gpt-5.5",
          // 実装上 prompt をログに混ぜがちなフィールド
          extracted_prompt: "Styling Direction: Head: ...",
          input_meta_prompt: "ignored (=サブ文字列でないため素通し)",
        },
      };
      const redacted = redactSecrets(logPayload) as Record<string, unknown>;
      expect(redacted.event).toBe("extract_failed");
      expect(redacted.template_id).toBe("tpl-1");
      expect(redacted.attempt).toBe(3);
      const request = redacted.request as Record<string, unknown>;
      expect(request.model).toBe("gpt-5.5");
      expect(request.extracted_prompt).toBe(REDACTED);
      // input_meta_prompt はキー名に sensitive substring を含まないので素通し
      // (= 完全防御ではなく key-based defense であることをテストで明示)
      expect(request.input_meta_prompt).toBe(
        "ignored (=サブ文字列でないため素通し)",
      );
    });
  });
});
