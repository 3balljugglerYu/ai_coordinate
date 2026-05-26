/** @jest-environment node */

jest.mock("@/lib/supabase/admin");

import { createAdminClient } from "@/lib/supabase/admin";
import {
  listAllPromptOverrides,
  getPromptOverrideByKey,
  getResolvedPromptTemplates,
  upsertPromptOverride,
  deletePromptOverride,
} from "@/features/generation-prompts/lib/admin-repository";
import {
  PROMPT_KEYS,
  PROMPT_REGISTRY,
} from "@/shared/generation/prompt-registry";

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;

function makeSelectChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue(result),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

describe("generation-prompts admin-repository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("listAllPromptOverrides", () => {
    test("DB rows をそのまま返す", async () => {
      const rows = [
        {
          prompt_key: "style.base_prefix",
          content: "X",
          created_by: "u",
          updated_by: "u",
          created_at: "2026-01-01",
          updated_at: "2026-01-02",
        },
      ];
      const from = jest.fn().mockReturnValue(
        makeSelectChain({ data: rows, error: null }),
      );
      mockCreateAdminClient.mockReturnValue({ from } as never);
      const result = await listAllPromptOverrides();
      expect(result).toEqual(rows);
      expect(from).toHaveBeenCalledWith("prompt_overrides");
    });

    test("DB error 時は空配列を返す (生成を止めない)", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const from = jest.fn().mockReturnValue(
        makeSelectChain({ data: null, error: new Error("DB down") }),
      );
      mockCreateAdminClient.mockReturnValue({ from } as never);
      const result = await listAllPromptOverrides();
      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("getPromptOverrideByKey", () => {
    test("既存 key は行を返す", async () => {
      const row = {
        prompt_key: "style.base_prefix",
        content: "X",
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      };
      const from = jest.fn().mockReturnValue(
        makeSelectChain({ data: row, error: null }),
      );
      mockCreateAdminClient.mockReturnValue({ from } as never);
      const result = await getPromptOverrideByKey("style.base_prefix");
      expect(result).toEqual(row);
    });

    test("行が無ければ null を返す", async () => {
      const from = jest.fn().mockReturnValue(
        makeSelectChain({ data: null, error: null }),
      );
      mockCreateAdminClient.mockReturnValue({ from } as never);
      const result = await getPromptOverrideByKey("nonexistent");
      expect(result).toBeNull();
    });

    test("DB error 時は null", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const from = jest.fn().mockReturnValue(
        makeSelectChain({ data: null, error: new Error("DB down") }),
      );
      mockCreateAdminClient.mockReturnValue({ from } as never);
      const result = await getPromptOverrideByKey("any");
      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe("getResolvedPromptTemplates", () => {
    test("registry default で全 key を埋め、override がある key だけ上書きする", async () => {
      const override = {
        prompt_key: "style.base_prefix",
        content: "OVERRIDDEN",
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      };
      const from = jest.fn().mockReturnValue(
        makeSelectChain({ data: [override], error: null }),
      );
      mockCreateAdminClient.mockReturnValue({ from } as never);
      const result = await getResolvedPromptTemplates();
      // 全 key 含まれる (toHaveProperty はドットを nested path として扱うので array で渡す)
      for (const key of PROMPT_KEYS) {
        expect(result[key]).toBeDefined();
      }
      // override 対象は上書き
      expect(result["style.base_prefix"]).toBe("OVERRIDDEN");
      // それ以外は registry default
      expect(result["inspire.preamble"]).toBe(
        PROMPT_REGISTRY["inspire.preamble"].defaultContent,
      );
    });

    test("DB から取得できなくても全 key を default で返す", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const from = jest.fn().mockReturnValue(
        makeSelectChain({ data: null, error: new Error("DB down") }),
      );
      mockCreateAdminClient.mockReturnValue({ from } as never);
      const result = await getResolvedPromptTemplates();
      expect(Object.keys(result).sort()).toEqual([...PROMPT_KEYS].sort());
      for (const key of PROMPT_KEYS) {
        expect(result[key]).toBe(PROMPT_REGISTRY[key].defaultContent);
      }
      consoleSpy.mockRestore();
    });
  });

  describe("upsertPromptOverride", () => {
    test("既存 row があれば previousContent を返す", async () => {
      const existing = { content: "OLD" };
      const upsert = jest.fn().mockResolvedValue({ error: null });
      const from = jest.fn().mockImplementation((_table: string) => {
        // 1 回目 (select 既存取得) と 2 回目 (upsert) を区別
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: existing, error: null }),
          upsert,
        };
      });
      mockCreateAdminClient.mockReturnValue({ from } as never);
      const result = await upsertPromptOverride({
        key: "style.base_prefix",
        content: "NEW",
        userId: "admin-1",
      });
      expect(result.previousContent).toBe("OLD");
      // upsert に created_by は含めない (既存行更新)
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt_key: "style.base_prefix",
          content: "NEW",
          updated_by: "admin-1",
        }),
        { onConflict: "prompt_key" },
      );
      expect(upsert.mock.calls[0][0]).not.toHaveProperty("created_by");
    });

    test("既存 row が無ければ created_by も埋め、previousContent=null", async () => {
      const upsert = jest.fn().mockResolvedValue({ error: null });
      const from = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        upsert,
      }));
      mockCreateAdminClient.mockReturnValue({ from } as never);
      const result = await upsertPromptOverride({
        key: "style.base_prefix",
        content: "NEW",
        userId: "admin-1",
      });
      expect(result.previousContent).toBeNull();
      // 新規行作成時は created_by も含める
      expect(upsert.mock.calls[0][0]).toMatchObject({
        prompt_key: "style.base_prefix",
        content: "NEW",
        created_by: "admin-1",
        updated_by: "admin-1",
      });
    });

    test("DB upsert error は throw する", async () => {
      const from = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        upsert: jest.fn().mockResolvedValue({ error: new Error("constraint") }),
      }));
      mockCreateAdminClient.mockReturnValue({ from } as never);
      await expect(
        upsertPromptOverride({
          key: "style.base_prefix",
          content: "X",
          userId: "u",
        }),
      ).rejects.toThrow(/upsert failed/);
    });
  });

  describe("deletePromptOverride", () => {
    test("既存 row があれば content を返してから削除", async () => {
      const del = jest.fn().mockResolvedValue({ error: null });
      const eqDel = jest.fn().mockResolvedValue({ error: null });
      const from = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: { content: "WAS" }, error: null }),
        delete: jest.fn().mockReturnValue({ eq: eqDel }),
      }));
      mockCreateAdminClient.mockReturnValue({ from } as never);
      const result = await deletePromptOverride("style.base_prefix");
      expect(result.previousContent).toBe("WAS");
      expect(eqDel).toHaveBeenCalledWith("prompt_key", "style.base_prefix");
      void del;
    });

    test("行が無ければ previousContent=null で delete を呼ばない", async () => {
      const eqDel = jest.fn();
      const from = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        delete: jest.fn().mockReturnValue({ eq: eqDel }),
      }));
      mockCreateAdminClient.mockReturnValue({ from } as never);
      const result = await deletePromptOverride("missing");
      expect(result.previousContent).toBeNull();
      expect(eqDel).not.toHaveBeenCalled();
    });

    test("DB delete error は throw する", async () => {
      const from = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: { content: "X" }, error: null }),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: new Error("perm") }),
        }),
      }));
      mockCreateAdminClient.mockReturnValue({ from } as never);
      await expect(deletePromptOverride("k")).rejects.toThrow(/delete failed/);
    });
  });
});
