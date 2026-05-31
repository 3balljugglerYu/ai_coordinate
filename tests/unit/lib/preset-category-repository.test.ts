/** @jest-environment node */

const createAdminClientMock = jest.fn();

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

import {
  createPresetCategory,
  deactivatePresetCategory,
  getPresetCategoryById,
  getPresetCategoryByKey,
  listPresetCategories,
  updatePresetCategory,
  type PresetCategoryRow,
} from "@/features/style-presets/lib/preset-category-repository";

const SAMPLE_ROW: PresetCategoryRow = {
  id: "11111111-1111-1111-1111-111111111111",
  key: "chibi",
  display_name_ja: "ちびキャラ",
  display_name_en: "Chibi",
  badge_color: "#ec4899",
  badge_text_color: "#ffffff",
  skip_base_prefix: true,
  default_image_input_mode: "single",
  output_aspect_ratio_mode: "source",
  user_guidance_ja: null,
  user_guidance_en: null,
  show_source_image_type_control: true,
  show_background_change_control: true,
  show_generation_model_control: true,
  show_user_prompt_input: false,
  visibility: "public",
  display_order: 10,
  is_active: true,
  created_by: null,
  updated_by: null,
  created_at: "2026-05-30T00:00:00.000Z",
  updated_at: "2026-05-30T00:00:00.000Z",
};

beforeEach(() => {
  jest.resetAllMocks();
});

/** listPresetCategories で使う select チェーン (order().order().eq()) */
function buildListChain(result: { data: PresetCategoryRow[]; error: null } | { data: null; error: { message: string } }) {
  const eqMock = jest.fn().mockResolvedValue(result);
  const orderMock2 = jest.fn(() => ({ eq: eqMock }));
  const orderMock1 = jest.fn(() => ({ order: orderMock2, eq: eqMock, ...buildThenable(result) }));
  return { from: jest.fn(() => ({ select: jest.fn(() => ({ order: orderMock1 })) })), eqMock };
}
// supabase クエリビルダは await 可能なので、`.order().order()` でも `.eq()` でも resolve できる必要がある。
function buildThenable<T>(value: T) {
  return {
    then: (resolve: (v: T) => unknown) => Promise.resolve(value).then(resolve),
  };
}

describe("listPresetCategories", () => {
  test("includeInactive 未指定 (= false) なら is_active=true で filter する", async () => {
    const mock = buildListChain({ data: [SAMPLE_ROW], error: null });
    createAdminClientMock.mockReturnValue(mock);

    const result = await listPresetCategories();
    expect(result).toHaveLength(1);
    expect(result[0]?.key).toBe("chibi");
    expect(mock.eqMock).toHaveBeenCalledWith("is_active", true);
  });

  test("includeInactive=true なら is_active filter を掛けない", async () => {
    const mock = buildListChain({ data: [], error: null });
    createAdminClientMock.mockReturnValue(mock);

    await listPresetCategories({ includeInactive: true });
    expect(mock.eqMock).not.toHaveBeenCalled();
  });

  test("error 時に例外を投げる", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const mock = buildListChain({ data: null, error: { message: "boom" } });
    createAdminClientMock.mockReturnValue(mock);

    await expect(listPresetCategories()).rejects.toThrow("カテゴリ一覧の取得に失敗しました");
    consoleError.mockRestore();
  });
});

/** 単一行取得 (id / key) 用の `select().eq().maybeSingle()` chain */
function buildSingleChain(result: { data: PresetCategoryRow | null; error: { message: string } | null }) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eq = jest.fn(() => ({ maybeSingle }));
  return jest.fn(() => ({ select: jest.fn(() => ({ eq })) }));
}

describe("getPresetCategoryById", () => {
  test("行があれば mapRow した結果を返す", async () => {
    createAdminClientMock.mockReturnValue({
      from: buildSingleChain({ data: SAMPLE_ROW, error: null }),
    });
    const result = await getPresetCategoryById(SAMPLE_ROW.id);
    expect(result?.key).toBe("chibi");
    expect(result?.skipBasePrefix).toBe(true);
    expect(result?.visibility).toBe("public");
  });

  test("行が無ければ null を返す", async () => {
    createAdminClientMock.mockReturnValue({
      from: buildSingleChain({ data: null, error: null }),
    });
    await expect(getPresetCategoryById("missing")).resolves.toBeNull();
  });

  test("error 時に例外を投げる", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    createAdminClientMock.mockReturnValue({
      from: buildSingleChain({ data: null, error: { message: "db" } }),
    });
    await expect(getPresetCategoryById("x")).rejects.toThrow(
      "カテゴリの取得に失敗しました",
    );
    consoleError.mockRestore();
  });
});

describe("getPresetCategoryByKey", () => {
  test("key 指定で取得できる", async () => {
    createAdminClientMock.mockReturnValue({
      from: buildSingleChain({ data: SAMPLE_ROW, error: null }),
    });
    const result = await getPresetCategoryByKey("chibi");
    expect(result?.id).toBe(SAMPLE_ROW.id);
  });
});

/** insert/update 用の chain (`insert/update().select().single()`) */
function buildMutationChain(result: { data: PresetCategoryRow | null; error: { message: string } | null }) {
  const single = jest.fn().mockResolvedValue(result);
  const select = jest.fn(() => ({ single }));
  return {
    insert: jest.fn(() => ({ select })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({ select })),
    })),
  };
}

describe("createPresetCategory", () => {
  test("デフォルト値を入れて insert し、戻り行を mapRow する", async () => {
    const fromBuilder = buildMutationChain({ data: SAMPLE_ROW, error: null });
    createAdminClientMock.mockReturnValue({ from: jest.fn(() => fromBuilder) });

    const result = await createPresetCategory({
      key: "chibi",
      displayNameJa: "ちびキャラ",
      displayNameEn: "Chibi",
    });

    expect(result.key).toBe("chibi");
    // insert に渡された default 値を確認
    const insertedArg = (fromBuilder.insert as jest.Mock).mock.calls[0]?.[0];
    expect(insertedArg.badge_color).toBe("#1f2937");
    expect(insertedArg.badge_text_color).toBe("#ffffff");
    expect(insertedArg.skip_base_prefix).toBe(false);
    expect(insertedArg.default_image_input_mode).toBe("single");
    expect(insertedArg.show_user_prompt_input).toBe(false);
    expect(insertedArg.visibility).toBe("admin_only");
    expect(insertedArg.is_active).toBe(true);
  });

  test("createPresetCategory: showUserPromptInput=true を渡すと insert にそのまま反映される", async () => {
    const fromBuilder = buildMutationChain({
      data: { ...SAMPLE_ROW, show_user_prompt_input: true },
      error: null,
    });
    createAdminClientMock.mockReturnValue({ from: jest.fn(() => fromBuilder) });

    await createPresetCategory({
      key: "chibi",
      displayNameJa: "ちびキャラ",
      displayNameEn: "Chibi",
      showUserPromptInput: true,
    });

    const insertedArg = (fromBuilder.insert as jest.Mock).mock.calls[0]?.[0];
    expect(insertedArg.show_user_prompt_input).toBe(true);
  });

  test("DB error なら例外", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const fromBuilder = buildMutationChain({
      data: null,
      error: { message: "unique violation" },
    });
    createAdminClientMock.mockReturnValue({ from: jest.fn(() => fromBuilder) });

    await expect(
      createPresetCategory({
        key: "x",
        displayNameJa: "x",
        displayNameEn: "x",
      }),
    ).rejects.toThrow("unique violation");
    consoleError.mockRestore();
  });
});

describe("updatePresetCategory", () => {
  test("payload が空なら getPresetCategoryById の値を返す", async () => {
    createAdminClientMock.mockReturnValue({
      from: buildSingleChain({ data: SAMPLE_ROW, error: null }),
    });
    const result = await updatePresetCategory(SAMPLE_ROW.id, {});
    expect(result.id).toBe(SAMPLE_ROW.id);
  });

  test("一部フィールド更新で update を呼ぶ", async () => {
    const fromBuilder = buildMutationChain({
      data: { ...SAMPLE_ROW, badge_color: "#000000" },
      error: null,
    });
    createAdminClientMock.mockReturnValue({ from: jest.fn(() => fromBuilder) });

    const result = await updatePresetCategory(SAMPLE_ROW.id, {
      badgeColor: "#000000",
      updatedBy: "admin-1",
    });
    expect(result.badgeColor).toBe("#000000");

    const updatedArg = (fromBuilder.update as jest.Mock).mock.calls[0]?.[0];
    expect(updatedArg.badge_color).toBe("#000000");
    expect(updatedArg.updated_by).toBe("admin-1");
    // 指定していないフィールドは payload に含まれない
    expect(updatedArg.display_name_ja).toBeUndefined();
  });

  test("payload 空 + getPresetCategoryById が null なら例外", async () => {
    createAdminClientMock.mockReturnValue({
      from: buildSingleChain({ data: null, error: null }),
    });
    await expect(updatePresetCategory("missing", {})).rejects.toThrow(
      "カテゴリが見つかりません",
    );
  });

  test("updatePresetCategory: showUserPromptInput=true を含めると update payload に show_user_prompt_input が乗る", async () => {
    const fromBuilder = buildMutationChain({
      data: { ...SAMPLE_ROW, show_user_prompt_input: true },
      error: null,
    });
    createAdminClientMock.mockReturnValue({ from: jest.fn(() => fromBuilder) });

    const result = await updatePresetCategory(SAMPLE_ROW.id, {
      showUserPromptInput: true,
    });
    expect(result.showUserPromptInput).toBe(true);

    const updatedArg = (fromBuilder.update as jest.Mock).mock.calls[0]?.[0];
    expect(updatedArg.show_user_prompt_input).toBe(true);
  });

  test("updatePresetCategory: showUserPromptInput=false (明示) も update payload に乗る", async () => {
    const fromBuilder = buildMutationChain({
      data: { ...SAMPLE_ROW, show_user_prompt_input: false },
      error: null,
    });
    createAdminClientMock.mockReturnValue({ from: jest.fn(() => fromBuilder) });

    await updatePresetCategory(SAMPLE_ROW.id, {
      showUserPromptInput: false,
    });

    const updatedArg = (fromBuilder.update as jest.Mock).mock.calls[0]?.[0];
    expect(updatedArg.show_user_prompt_input).toBe(false);
  });

  test("updatePresetCategory: showUserPromptInput を省略すると update payload に含まれない", async () => {
    const fromBuilder = buildMutationChain({
      data: SAMPLE_ROW,
      error: null,
    });
    createAdminClientMock.mockReturnValue({ from: jest.fn(() => fromBuilder) });

    await updatePresetCategory(SAMPLE_ROW.id, {
      badgeColor: "#abcdef",
    });

    const updatedArg = (fromBuilder.update as jest.Mock).mock.calls[0]?.[0];
    expect(updatedArg.show_user_prompt_input).toBeUndefined();
  });

  test("getPresetCategoryById: 取得結果の showUserPromptInput マッパー (true/null fallback)", async () => {
    createAdminClientMock.mockReturnValue({
      from: buildSingleChain({
        data: { ...SAMPLE_ROW, show_user_prompt_input: true },
        error: null,
      }),
    });
    const result = await updatePresetCategory(SAMPLE_ROW.id, {});
    expect(result.showUserPromptInput).toBe(true);

    createAdminClientMock.mockReturnValue({
      from: buildSingleChain({
        data: { ...SAMPLE_ROW, show_user_prompt_input: null },
        error: null,
      }),
    });
    const result2 = await updatePresetCategory(SAMPLE_ROW.id, {});
    expect(result2.showUserPromptInput).toBe(false);
  });

  test("update DB error なら例外", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const fromBuilder = buildMutationChain({
      data: null,
      error: { message: "permission" },
    });
    createAdminClientMock.mockReturnValue({ from: jest.fn(() => fromBuilder) });
    await expect(
      updatePresetCategory(SAMPLE_ROW.id, { badgeColor: "#000000" }),
    ).rejects.toThrow("permission");
    consoleError.mockRestore();
  });
});

describe("deactivatePresetCategory", () => {
  test("isActive=false を update する", async () => {
    const fromBuilder = buildMutationChain({
      data: { ...SAMPLE_ROW, is_active: false },
      error: null,
    });
    createAdminClientMock.mockReturnValue({ from: jest.fn(() => fromBuilder) });

    const result = await deactivatePresetCategory(SAMPLE_ROW.id, "admin-1");
    expect(result.isActive).toBe(false);

    const updatedArg = (fromBuilder.update as jest.Mock).mock.calls[0]?.[0];
    expect(updatedArg.is_active).toBe(false);
    expect(updatedArg.updated_by).toBe("admin-1");
  });
});
