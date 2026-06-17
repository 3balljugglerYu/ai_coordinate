import {
  parseTwoStageVisibility,
  isTwoStageModeAvailable,
  getCreatorLooksTwoStageVisibility,
  DEFAULT_TWO_STAGE_VISIBILITY,
} from "@/features/inspire/lib/creator-looks-two-stage";

describe("parseTwoStageVisibility", () => {
  test("'public' のみ public、その他は admin_only(安全側)", () => {
    expect(parseTwoStageVisibility("public")).toBe("public");
    expect(parseTwoStageVisibility("admin_only")).toBe("admin_only");
    expect(parseTwoStageVisibility("foo")).toBe("admin_only");
    expect(parseTwoStageVisibility(null)).toBe("admin_only");
    expect(parseTwoStageVisibility(undefined)).toBe("admin_only");
    expect(DEFAULT_TWO_STAGE_VISIBILITY).toBe("admin_only");
  });
});

describe("isTwoStageModeAvailable", () => {
  test("public は全員可、admin_only は admin のみ可", () => {
    expect(isTwoStageModeAvailable("public", false)).toBe(true);
    expect(isTwoStageModeAvailable("public", true)).toBe(true);
    expect(isTwoStageModeAvailable("admin_only", false)).toBe(false);
    expect(isTwoStageModeAvailable("admin_only", true)).toBe(true);
  });
});

describe("getCreatorLooksTwoStageVisibility", () => {
  function mockClient(opts: {
    value?: unknown;
    error?: unknown;
    throws?: boolean;
  }) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (opts.throws) throw new Error("table missing");
              return {
                data: opts.value === undefined ? null : { value: opts.value },
                error: opts.error ?? null,
              };
            },
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  test("'public' 行があれば public", async () => {
    expect(
      await getCreatorLooksTwoStageVisibility(mockClient({ value: "public" })),
    ).toBe("public");
  });

  test("行なし/不正値/エラー/例外はすべて admin_only に安全フォールバック", async () => {
    expect(await getCreatorLooksTwoStageVisibility(mockClient({}))).toBe(
      "admin_only",
    );
    expect(
      await getCreatorLooksTwoStageVisibility(mockClient({ value: "weird" })),
    ).toBe("admin_only");
    expect(
      await getCreatorLooksTwoStageVisibility(
        mockClient({ error: { message: "x" } }),
      ),
    ).toBe("admin_only");
    expect(
      await getCreatorLooksTwoStageVisibility(mockClient({ throws: true })),
    ).toBe("admin_only");
  });
});
