/** @jest-environment node */

import {
  resolveAllPromptTemplatesForWorker,
  clearWorkerPromptCache,
} from "@/supabase/functions/image-gen-worker/prompt-override";
import {
  PROMPT_REGISTRY,
  PROMPT_KEYS,
} from "@/shared/generation/prompt-registry";

beforeEach(() => {
  clearWorkerPromptCache();
});

/** supabase-js の最小モック (.from().select()) */
function makeSupabaseMock(
  result:
    | { data: Array<{ prompt_key: string; content: string }>; error: null }
    | { data: null; error: Error },
) {
  return {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue(result),
  };
}

describe("resolveAllPromptTemplatesForWorker", () => {
  test("DB に override が無ければ全 key を registry default で埋める", async () => {
    const supabase = makeSupabaseMock({ data: [], error: null });
    const result = await resolveAllPromptTemplatesForWorker(supabase, {
      forceFresh: true,
    });
    expect(Object.keys(result).sort()).toEqual([...PROMPT_KEYS].sort());
    for (const key of PROMPT_KEYS) {
      expect(result[key]).toBe(PROMPT_REGISTRY[key].defaultContent);
    }
  });

  test("DB に override がある key は content で上書きされる", async () => {
    const supabase = makeSupabaseMock({
      data: [
        { prompt_key: "style.base_prefix", content: "OVERRIDDEN BASE" },
        { prompt_key: "inspire.preamble", content: "OVERRIDDEN PREAMBLE" },
      ],
      error: null,
    });
    const result = await resolveAllPromptTemplatesForWorker(supabase, {
      forceFresh: true,
    });
    expect(result["style.base_prefix"]).toBe("OVERRIDDEN BASE");
    expect(result["inspire.preamble"]).toBe("OVERRIDDEN PREAMBLE");
    // 他の key は default のまま
    expect(result["style.real_suffix"]).toBe(
      PROMPT_REGISTRY["style.real_suffix"].defaultContent,
    );
  });

  test("registry に無い key の row は無視する (whitelisting)", async () => {
    const supabase = makeSupabaseMock({
      data: [{ prompt_key: "unknown.key", content: "ignored" }],
      error: null,
    });
    const result = await resolveAllPromptTemplatesForWorker(supabase, {
      forceFresh: true,
    });
    expect(result["unknown.key"]).toBeUndefined();
  });

  test("DB query エラー時は registry default で fallback (生成は止めない)", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const supabase = makeSupabaseMock({
      data: null,
      error: new Error("DB down"),
    });
    const result = await resolveAllPromptTemplatesForWorker(supabase, {
      forceFresh: true,
    });
    expect(result["style.base_prefix"]).toBe(
      PROMPT_REGISTRY["style.base_prefix"].defaultContent,
    );
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test("memory cache: forceFresh=false なら 2 回目以降は DB を叩かない", async () => {
    const supabase = makeSupabaseMock({
      data: [{ prompt_key: "style.base_prefix", content: "FIRST" }],
      error: null,
    });
    await resolveAllPromptTemplatesForWorker(supabase, { forceFresh: false });
    await resolveAllPromptTemplatesForWorker(supabase, { forceFresh: false });
    await resolveAllPromptTemplatesForWorker(supabase, { forceFresh: false });
    expect(supabase.select).toHaveBeenCalledTimes(1);
  });

  test("forceFresh=true なら毎回 DB を叩く", async () => {
    const supabase = makeSupabaseMock({
      data: [{ prompt_key: "style.base_prefix", content: "FRESH" }],
      error: null,
    });
    await resolveAllPromptTemplatesForWorker(supabase, { forceFresh: true });
    await resolveAllPromptTemplatesForWorker(supabase, { forceFresh: true });
    expect(supabase.select).toHaveBeenCalledTimes(2);
  });
});
