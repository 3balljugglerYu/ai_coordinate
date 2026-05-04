/** @jest-environment node */

const ORIGINAL_ENV = process.env;

const createAdminClientMock = jest.fn();
const generateDisplayWebPMock = jest.fn();

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

jest.mock("@/features/generation/lib/webp-converter", () => ({
  generateDisplayWebP: (url: string) => generateDisplayWebPMock(url),
}));

import {
  deleteTempInputImageIfExists,
  extractStoragePathFromPublicUrl,
  getInputImageContextForGeneratedImage,
  isAllowedInputImageUrl,
  persistBeforeImageForGeneratedImage,
  persistBeforeImageFromUrl,
  updatePreGenerationStoragePath,
} from "@/features/posts/lib/before-image-storage";

const PROJECT_URL = "https://example.supabase.co";
const TEMP_URL = `${PROJECT_URL}/storage/v1/object/public/generated-images/temp/u1/123-abc.png`;
const STOCK_URL = `${PROJECT_URL}/storage/v1/object/public/generated-images/3f2504e0-4f89-11d3-9a0c-0305e82c3301/stocks/foo.png`;

beforeEach(() => {
  jest.resetAllMocks();
  process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_SUPABASE_URL: PROJECT_URL };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("isAllowedInputImageUrl", () => {
  test("Supabase URL が未設定なら拒否する", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(isAllowedInputImageUrl(TEMP_URL)).toBe(false);
  });

  test("temp/ 配下の URL を受理する", () => {
    expect(isAllowedInputImageUrl(TEMP_URL)).toBe(true);
  });

  test("{uuid}/stocks/ 配下の URL を受理する", () => {
    expect(isAllowedInputImageUrl(STOCK_URL)).toBe(true);
  });

  test("生成済み画像本体パス（uuid 直下のオブジェクト）は拒否する", () => {
    const url = `${PROJECT_URL}/storage/v1/object/public/generated-images/3f2504e0-4f89-11d3-9a0c-0305e82c3301/job1-0-abc.png`;
    expect(isAllowedInputImageUrl(url)).toBe(false);
  });

  test("pre-generation/ 配下は拒否する", () => {
    const url = `${PROJECT_URL}/storage/v1/object/public/generated-images/3f2504e0-4f89-11d3-9a0c-0305e82c3301/pre-generation/foo_display.webp`;
    expect(isAllowedInputImageUrl(url)).toBe(false);
  });

  test("第 1 階層が UUID でない /stocks/ は拒否する", () => {
    const url = `${PROJECT_URL}/storage/v1/object/public/generated-images/not-uuid/stocks/foo.png`;
    expect(isAllowedInputImageUrl(url)).toBe(false);
  });

  test("別バケットや別ホストは拒否する", () => {
    expect(
      isAllowedInputImageUrl(
        `${PROJECT_URL}/storage/v1/object/public/other-bucket/temp/foo.png`
      )
    ).toBe(false);
    expect(
      isAllowedInputImageUrl(
        "https://attacker.example.com/storage/v1/object/public/generated-images/temp/foo.png"
      )
    ).toBe(false);
  });
});

describe("getInputImageContextForGeneratedImage", () => {
  function buildLookupMock(opts: {
    generatedImageResult: SupabaseQueryResult<{
      user_id: string | null;
      image_job_id: string | null;
    } | null>;
    imageJobResult?: SupabaseQueryResult<{ input_image_url: string | null } | null>;
  }) {
    const fromTable = jest.fn((table: string) => {
      if (table === "generated_images") {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn().mockResolvedValue(opts.generatedImageResult),
            })),
          })),
        };
      }
      if (table === "image_jobs") {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest
                .fn()
                .mockResolvedValue(
                  opts.imageJobResult ?? { data: null, error: null }
                ),
            })),
          })),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    });

    return { from: fromTable };
  }

  test("generated_images 取得エラーなら null を返す", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    createAdminClientMock.mockReturnValue(
      buildLookupMock({
        generatedImageResult: {
          data: null,
          error: { message: "generated lookup failed" },
        },
      })
    );

    await expect(
      getInputImageContextForGeneratedImage("img-1")
    ).resolves.toBeNull();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test("generated_images に user_id が無ければ null を返す", async () => {
    createAdminClientMock.mockReturnValue(
      buildLookupMock({
        generatedImageResult: {
          data: { user_id: null, image_job_id: "job-1" },
          error: null,
        },
      })
    );

    await expect(
      getInputImageContextForGeneratedImage("img-1")
    ).resolves.toBeNull();
  });

  test("image_jobs 取得エラーなら userId と null URL を返す", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    createAdminClientMock.mockReturnValue(
      buildLookupMock({
        generatedImageResult: {
          data: { user_id: "u1", image_job_id: "job-1" },
          error: null,
        },
        imageJobResult: {
          data: null,
          error: { message: "job lookup failed" },
        },
      })
    );

    await expect(
      getInputImageContextForGeneratedImage("img-1")
    ).resolves.toEqual({ userId: "u1", inputImageUrl: null });

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("persistBeforeImageFromUrl", () => {
  function buildStorageUploadMock(uploadFn: jest.Mock) {
    return {
      storage: {
        from: jest.fn(() => ({
          upload: uploadFn,
        })),
      },
    };
  }

  test("許可外 URL はアップロード前に拒否する", async () => {
    await expect(
      persistBeforeImageFromUrl("https://attacker.example/foo.png", "u1", "img-1")
    ).rejects.toThrow("input URL is not under generated-images bucket");

    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  test("upload エラーは maxRetries 到達時に再throwする", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const uploadFn = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "upload failed" },
    });
    createAdminClientMock.mockReturnValue(buildStorageUploadMock(uploadFn));
    generateDisplayWebPMock.mockResolvedValue(Buffer.from("webp-bytes"));

    await expect(
      persistBeforeImageFromUrl(TEMP_URL, "u1", "img-1", 1)
    ).rejects.toThrow("Before WebP upload failed: upload failed");

    expect(uploadFn).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test("一時的な upload エラー後に retry して成功する", async () => {
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const setTimeoutSpy = jest
      .spyOn(global, "setTimeout")
      .mockImplementation((callback: TimerHandler) => {
        if (typeof callback === "function") {
          callback();
        }
        return 0 as unknown as NodeJS.Timeout;
      });
    const uploadFn = jest
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { message: "temporary upload failure" },
      })
      .mockResolvedValueOnce({
        data: { path: "u1/pre-generation/img-1_display.webp" },
        error: null,
      });
    createAdminClientMock.mockReturnValue(buildStorageUploadMock(uploadFn));
    generateDisplayWebPMock.mockResolvedValue(Buffer.from("webp-bytes"));

    await expect(
      persistBeforeImageFromUrl(TEMP_URL, "u1", "img-1", 2)
    ).resolves.toBe("u1/pre-generation/img-1_display.webp");

    expect(uploadFn).toHaveBeenCalledTimes(2);
    expect(consoleWarn).toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
    consoleWarn.mockRestore();
  });
});

describe("updatePreGenerationStoragePath", () => {
  test("更新エラーなら例外を投げる", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const mock = buildSupabaseMock({
      generatedImageRow: {
        user_id: "u1",
        pre_generation_storage_path: null,
        image_job_id: null,
      },
      imageJobRow: null,
      updateResult: { error: { message: "update failed" } },
    });
    createAdminClientMock.mockReturnValue(mock.client);

    await expect(
      updatePreGenerationStoragePath("img-1", "u1", "u1/pre-generation/img-1.webp")
    ).rejects.toThrow("pre_generation_storage_path update failed: update failed");

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

type SupabaseQueryResult<T> = {
  data: T;
  error: { message: string } | null;
};

function buildSupabaseMock(opts: {
  generatedImageRow:
    | { user_id: string; pre_generation_storage_path: string | null; image_job_id: string | null }
    | null;
  imageJobRow: { input_image_url: string | null } | null;
  uploadResult?: SupabaseQueryResult<{ path: string } | null>;
  removeResult?: SupabaseQueryResult<unknown>;
  updateResult?: { error: { message: string } | null };
}) {
  const updateEqEq = jest
    .fn()
    .mockResolvedValue(opts.updateResult ?? { error: null });
  const updateEq1 = jest.fn(() => ({ eq: updateEqEq }));
  const updateFn = jest.fn(() => ({ eq: updateEq1 }));

  const uploadFn = jest
    .fn()
    .mockResolvedValue(
      opts.uploadResult ?? {
        data: { path: "u1/pre-generation/img-1_display.webp" },
        error: null,
      }
    );
  const removeFn = jest
    .fn()
    .mockResolvedValue(opts.removeResult ?? { data: [], error: null });

  const fromTable = jest.fn((table: string) => {
    if (table === "generated_images") {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            // existing path lookup uses .eq("id").eq("user_id").maybeSingle()
            eq: jest.fn(() => ({
              maybeSingle: jest.fn().mockResolvedValue({
                data: opts.generatedImageRow,
                error: null,
              }),
            })),
            // first-step lookup uses .eq("id").maybeSingle()
            maybeSingle: jest.fn().mockResolvedValue({
              data: opts.generatedImageRow,
              error: null,
            }),
          })),
        })),
        update: updateFn,
      };
    }
    if (table === "image_jobs") {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: opts.imageJobRow,
              error: null,
            }),
          })),
        })),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  const storageFrom = jest.fn(() => ({
    upload: uploadFn,
    remove: removeFn,
  }));

  return {
    client: {
      from: fromTable,
      storage: { from: storageFrom },
    },
    uploadFn,
    removeFn,
    updateFn,
  };
}

describe("persistBeforeImageForGeneratedImage", () => {
  test("already-persisted: 既存パスがあれば再変換せず skipped を返す", async () => {
    const mock = buildSupabaseMock({
      generatedImageRow: {
        user_id: "u1",
        pre_generation_storage_path: "u1/pre-generation/img-1_display.webp",
        image_job_id: "job-1",
      },
      imageJobRow: null,
    });
    createAdminClientMock.mockReturnValue(mock.client);

    const result = await persistBeforeImageForGeneratedImage("img-1");

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("already-persisted");
    expect(generateDisplayWebPMock).not.toHaveBeenCalled();
    expect(mock.uploadFn).not.toHaveBeenCalled();
    expect(mock.removeFn).not.toHaveBeenCalled();
  });

  test("no-input-image-url: image_job_id が無ければ skipped を返す", async () => {
    const mock = buildSupabaseMock({
      generatedImageRow: {
        user_id: "u1",
        pre_generation_storage_path: null,
        image_job_id: null,
      },
      imageJobRow: null,
    });
    createAdminClientMock.mockReturnValue(mock.client);

    const result = await persistBeforeImageForGeneratedImage("img-1");

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("no-input-image-url");
    expect(mock.uploadFn).not.toHaveBeenCalled();
  });

  test("invalid-input-url: ホワイトリスト外の URL なら skipped を返す", async () => {
    const mock = buildSupabaseMock({
      generatedImageRow: {
        user_id: "u1",
        pre_generation_storage_path: null,
        image_job_id: "job-1",
      },
      imageJobRow: {
        input_image_url: "https://attacker.example.com/foo.png",
      },
    });
    createAdminClientMock.mockReturnValue(mock.client);

    const result = await persistBeforeImageForGeneratedImage("img-1");

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("invalid-input-url");
    expect(generateDisplayWebPMock).not.toHaveBeenCalled();
    expect(mock.uploadFn).not.toHaveBeenCalled();
    expect(mock.removeFn).not.toHaveBeenCalled();
  });

  test("temp/ 由来: 永続化成功後に temp/ を同期削除する", async () => {
    const mock = buildSupabaseMock({
      generatedImageRow: {
        user_id: "u1",
        pre_generation_storage_path: null,
        image_job_id: "job-1",
      },
      imageJobRow: { input_image_url: TEMP_URL },
    });
    createAdminClientMock.mockReturnValue(mock.client);
    generateDisplayWebPMock.mockResolvedValue(Buffer.from("webp-bytes"));

    const result = await persistBeforeImageForGeneratedImage("img-1");

    expect(result.status).toBe("persisted");
    expect(generateDisplayWebPMock).toHaveBeenCalledWith(TEMP_URL);
    expect(mock.uploadFn).toHaveBeenCalledWith(
      "u1/pre-generation/img-1_display.webp",
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/webp", upsert: true })
    );
    expect(mock.updateFn).toHaveBeenCalled();
    expect(mock.removeFn).toHaveBeenCalledWith([
      "temp/u1/123-abc.png",
    ]);
  });

  test("stocks/ 由来: 永続化成功するが temp/ 削除は呼ばれない", async () => {
    const mock = buildSupabaseMock({
      generatedImageRow: {
        user_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        pre_generation_storage_path: null,
        image_job_id: "job-1",
      },
      imageJobRow: { input_image_url: STOCK_URL },
    });
    createAdminClientMock.mockReturnValue(mock.client);
    generateDisplayWebPMock.mockResolvedValue(Buffer.from("webp-bytes"));

    const result = await persistBeforeImageForGeneratedImage("img-1");

    expect(result.status).toBe("persisted");
    expect(mock.uploadFn).toHaveBeenCalled();
    expect(mock.removeFn).not.toHaveBeenCalled();
  });
});

describe("extractStoragePathFromPublicUrl", () => {
  test("Supabase URL が未設定なら null を返す", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(extractStoragePathFromPublicUrl(TEMP_URL)).toBeNull();
  });

  test("generated-images バケット配下の URL から object path を抜き出す", () => {
    expect(extractStoragePathFromPublicUrl(TEMP_URL)).toBe(
      "temp/u1/123-abc.png"
    );
    expect(extractStoragePathFromPublicUrl(STOCK_URL)).toBe(
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301/stocks/foo.png"
    );
  });

  test("別バケット / 別ホストの URL は null を返す", () => {
    expect(
      extractStoragePathFromPublicUrl(
        `${PROJECT_URL}/storage/v1/object/public/other-bucket/foo.png`
      )
    ).toBeNull();
    expect(
      extractStoragePathFromPublicUrl(
        "https://attacker.example/storage/v1/object/public/generated-images/temp/foo.png"
      )
    ).toBeNull();
  });
});

describe("deleteTempInputImageIfExists", () => {
  function buildStorageOnlyMock(removeResult: {
    data: unknown;
    error: { message: string } | null;
  }) {
    const removeFn = jest.fn().mockResolvedValue(removeResult);
    const storageFrom = jest.fn(() => ({ remove: removeFn }));
    return {
      client: { storage: { from: storageFrom } },
      removeFn,
    };
  }

  test("temp/ 配下の URL なら storage.remove が呼ばれる", async () => {
    const mock = buildStorageOnlyMock({ data: [], error: null });
    createAdminClientMock.mockReturnValue(mock.client);

    await deleteTempInputImageIfExists(TEMP_URL);

    expect(mock.removeFn).toHaveBeenCalledWith(["temp/u1/123-abc.png"]);
  });

  test("stocks/ 由来 (temp/ 配下でない) の URL では remove を呼ばない", async () => {
    const mock = buildStorageOnlyMock({ data: [], error: null });
    createAdminClientMock.mockReturnValue(mock.client);

    await deleteTempInputImageIfExists(STOCK_URL);

    expect(mock.removeFn).not.toHaveBeenCalled();
  });

  test("generated-images バケット外の URL では remove を呼ばない (no-op)", async () => {
    const mock = buildStorageOnlyMock({ data: [], error: null });
    createAdminClientMock.mockReturnValue(mock.client);

    await deleteTempInputImageIfExists(
      "https://attacker.example/storage/v1/object/public/other/foo.png"
    );

    expect(mock.removeFn).not.toHaveBeenCalled();
  });

  test("Storage の削除エラーは握りつぶす（例外を投げない）", async () => {
    const mock = buildStorageOnlyMock({
      data: null,
      error: { message: "boom" },
    });
    createAdminClientMock.mockReturnValue(mock.client);

    await expect(deleteTempInputImageIfExists(TEMP_URL)).resolves.toBeUndefined();
    expect(mock.removeFn).toHaveBeenCalled();
  });
});

describe("persistBeforeImageForGeneratedImage error boundaries", () => {
  function buildExistingLookupMock(result: SupabaseQueryResult<unknown>) {
    return {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue(result),
          })),
        })),
      })),
    };
  }

  test("既存パス確認で DB エラーなら failed を返す", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    createAdminClientMock.mockReturnValue(
      buildExistingLookupMock({
        data: null,
        error: { message: "lookup failed" },
      })
    );

    await expect(
      persistBeforeImageForGeneratedImage("img-1")
    ).resolves.toEqual({ status: "failed", reason: "lookup-failed" });

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test("generated_images が存在しなければ skipped を返す", async () => {
    createAdminClientMock.mockReturnValue(
      buildExistingLookupMock({
        data: null,
        error: null,
      })
    );

    await expect(
      persistBeforeImageForGeneratedImage("img-1")
    ).resolves.toEqual({
      status: "skipped",
      reason: "generated-image-not-found",
    });
  });

  test("予期しない例外は failed に丸める", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    createAdminClientMock.mockImplementation(() => {
      throw new Error("client unavailable");
    });

    await expect(
      persistBeforeImageForGeneratedImage("img-1")
    ).resolves.toEqual({
      status: "failed",
      reason: "client unavailable",
    });

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
