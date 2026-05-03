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
  isAllowedInputImageUrl,
  persistBeforeImageForGeneratedImage,
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
