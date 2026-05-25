/**
 * @jest-environment node
 *
 * SupabaseAsyncGenerationJobRepository の全メソッドをユニットテストする。
 * Supabase クライアントは createAdminClient ごとモック化して、リポジトリが
 * 期待通り chain API を組み立てているか + 戻り値の正常/異常分岐を検証する。
 */

const fromMock = jest.fn();
const storageFromMock = jest.fn();
const rpcMock = jest.fn();
const createAdminClientMock = jest.fn(() => ({
  from: fromMock,
  storage: { from: storageFromMock },
  rpc: rpcMock,
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

import {
  SupabaseAsyncGenerationJobRepository,
  createAsyncGenerationJobRepository,
} from "@/features/generation/lib/async-generation-job-repository";

beforeEach(() => {
  fromMock.mockReset();
  storageFromMock.mockReset();
  rpcMock.mockReset();
  createAdminClientMock.mockClear();
});

/**
 * .from("...").select(...).eq(...).eq(...).single() / .maybeSingle() の chain を
 * 仕込むヘルパー。戻り値の resolved data / error を制御する。
 */
function setupSingleChain(result: { data: unknown; error: unknown }) {
  const single = jest.fn().mockResolvedValue(result);
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eq2 = jest.fn(() => ({ single, maybeSingle }));
  const eq1 = jest.fn(() => ({ eq: eq2, single, maybeSingle }));
  const select = jest.fn(() => ({ eq: eq1, single, maybeSingle }));
  fromMock.mockReturnValueOnce({ select });
  return { select, eq1, eq2, single, maybeSingle };
}

describe("SupabaseAsyncGenerationJobRepository", () => {
  describe("findSourceImageStock", () => {
    test("正常: data を返す", async () => {
      setupSingleChain({
        data: { id: "stock-1", image_url: "https://x/y.png" },
        error: null,
      });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.findSourceImageStock("stock-1", "user-1");
      expect(res.error).toBeNull();
      expect(res.data?.id).toBe("stock-1");
      expect(fromMock).toHaveBeenCalledWith("source_image_stocks");
    });

    test("not found: error を返す", async () => {
      setupSingleChain({ data: null, error: null });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.findSourceImageStock("missing", "user-1");
      expect(res.data).toBeNull();
      expect(res.error).toBeInstanceOf(Error);
    });

    test("supabase error: error をそのまま返す", async () => {
      const err = { message: "db down" };
      setupSingleChain({ data: null, error: err });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.findSourceImageStock("x", "user-1");
      expect(res.error).toBe(err);
    });
  });

  describe("findGeneratedImage", () => {
    test("正常: data を返す", async () => {
      setupSingleChain({
        data: { id: "gen-1", image_url: "https://x/g.png" },
        error: null,
      });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.findGeneratedImage("gen-1", "user-1");
      expect(res.data?.id).toBe("gen-1");
      expect(fromMock).toHaveBeenCalledWith("generated_images");
    });

    test("not found: 生成済み画像エラーを返す", async () => {
      setupSingleChain({ data: null, error: null });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.findGeneratedImage("missing", "user-1");
      expect(res.data).toBeNull();
      expect((res.error as Error).message).toContain("generated image");
    });

    test("supabase error: error をそのまま返す", async () => {
      const err = { message: "db boom" };
      setupSingleChain({ data: null, error: err });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.findGeneratedImage("x", "user-1");
      expect(res.error).toBe(err);
    });
  });

  describe("uploadSourceImage", () => {
    function setupStorageUpload(result: { data: unknown; error: unknown }) {
      const upload = jest.fn().mockResolvedValue(result);
      storageFromMock.mockReturnValueOnce({ upload });
      return upload;
    }

    test("正常: path を返す", async () => {
      setupStorageUpload({ data: { path: "u/123.png" }, error: null });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.uploadSourceImage(
        "u/123.png",
        Buffer.from("x"),
        "image/png",
      );
      expect(res.data?.path).toBe("u/123.png");
      expect(storageFromMock).toHaveBeenCalledWith("generated-images");
    });

    test("error 時は error を返す", async () => {
      const err = { message: "upload failed" };
      setupStorageUpload({ data: null, error: err });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.uploadSourceImage(
        "u/1.png",
        Buffer.from(""),
        "image/png",
      );
      expect(res.data).toBeNull();
      expect(res.error).toBe(err);
    });

    test("data 不在 + error null のときも default error を返す", async () => {
      setupStorageUpload({ data: null, error: null });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.uploadSourceImage(
        "u/1.png",
        Buffer.from(""),
        "image/png",
      );
      expect(res.error).toBeInstanceOf(Error);
    });
  });

  describe("getSourceImagePublicUrl", () => {
    test("storage.getPublicUrl の publicUrl を返す", () => {
      const getPublicUrl = jest.fn(() => ({
        data: { publicUrl: "https://cdn/p.png" },
      }));
      storageFromMock.mockReturnValueOnce({ getPublicUrl });
      const repo = new SupabaseAsyncGenerationJobRepository();
      expect(repo.getSourceImagePublicUrl("p.png")).toBe("https://cdn/p.png");
      expect(getPublicUrl).toHaveBeenCalledWith("p.png");
    });
  });

  describe("getUserCreditBalance", () => {
    test("正常: balance を返す", async () => {
      setupSingleChain({ data: { balance: 100 }, error: null });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.getUserCreditBalance("user-1");
      expect(res.data?.balance).toBe(100);
    });

    test("not found のとき error を返す", async () => {
      setupSingleChain({ data: null, error: null });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.getUserCreditBalance("missing");
      expect(res.error).toBeInstanceOf(Error);
    });
  });

  describe("getUserSubscriptionPlan", () => {
    test("正常: subscription_plan を返す", async () => {
      setupSingleChain({
        data: { subscription_plan: "pro" },
        error: null,
      });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.getUserSubscriptionPlan("user-1");
      expect(res.data?.subscription_plan).toBe("pro");
    });

    test("data 不在で warn して free fallback", async () => {
      setupSingleChain({ data: null, error: null });
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.getUserSubscriptionPlan("missing");
      expect(res.data?.subscription_plan).toBe("free");
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    test("error を返す", async () => {
      const err = { message: "boom" };
      setupSingleChain({ data: null, error: err });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.getUserSubscriptionPlan("x");
      expect(res.error).toBe(err);
    });
  });

  describe("createImageJob", () => {
    function setupInsertChain(result: { data: unknown; error: unknown }) {
      const single = jest.fn().mockResolvedValue(result);
      const select = jest.fn(() => ({ single }));
      const insert = jest.fn(() => ({ select }));
      fromMock.mockReturnValueOnce({ insert });
      return { insert, select, single };
    }

    test("正常: id/status を返す", async () => {
      setupInsertChain({
        data: { id: "job-1", status: "queued" },
        error: null,
      });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.createImageJob({
        user_id: "u",
        prompt_text: "p",
        input_image_url: "url",
        source_image_stock_id: null,
        source_image_type: "illustration",
        generation_type: "coordinate",
        model: "gemini-2.5-flash-image-preview",
        background_mode: "keep",
        generation_metadata: null,
        status: "queued",
        processing_stage: "queued",
        attempts: 0,
      });
      expect(res.data?.id).toBe("job-1");
    });

    test("error 時は error を返す", async () => {
      const err = { message: "db" };
      setupInsertChain({ data: null, error: err });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.createImageJob({
        user_id: "u",
        prompt_text: "p",
        input_image_url: "url",
        source_image_stock_id: null,
        source_image_type: "illustration",
        generation_type: "coordinate",
        model: "gemini-2.5-flash-image-preview",
        background_mode: "keep",
        generation_metadata: null,
        status: "queued",
        processing_stage: "queued",
        attempts: 0,
      });
      expect(res.error).toBe(err);
    });
  });

  describe("markImageJobFailed", () => {
    function setupUpdateChain(result: { error: unknown }) {
      const eq = jest.fn().mockResolvedValue(result);
      const update = jest.fn(() => ({ eq }));
      fromMock.mockReturnValueOnce({ update });
      return { update, eq };
    }

    test("正常: error null", async () => {
      setupUpdateChain({ error: null });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.markImageJobFailed("job-1", "msg");
      expect(res.error).toBeNull();
    });

    test("error 時はそのまま返す", async () => {
      const err = { message: "update failed" };
      setupUpdateChain({ error: err });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.markImageJobFailed("job-1", "msg");
      expect(res.error).toBe(err);
    });
  });

  describe("sendImageJobQueueMessage", () => {
    test("正常: pgmq_send を呼んで error null", async () => {
      rpcMock.mockResolvedValueOnce({ error: null });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.sendImageJobQueueMessage("job-1");
      expect(res.error).toBeNull();
      expect(rpcMock).toHaveBeenCalledWith(
        "pgmq_send",
        expect.objectContaining({ p_queue_name: "image_jobs" }),
      );
    });

    test("error 時はそのまま返す", async () => {
      const err = { message: "queue down" };
      rpcMock.mockResolvedValueOnce({ error: err });
      const repo = new SupabaseAsyncGenerationJobRepository();
      const res = await repo.sendImageJobQueueMessage("job-1");
      expect(res.error).toBe(err);
    });
  });

  describe("createAsyncGenerationJobRepository", () => {
    test("factory が SupabaseAsyncGenerationJobRepository を返す", () => {
      const repo = createAsyncGenerationJobRepository();
      expect(repo).toBeInstanceOf(SupabaseAsyncGenerationJobRepository);
    });
  });
});
