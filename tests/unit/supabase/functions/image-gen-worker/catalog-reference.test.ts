/** @jest-environment node */

/**
 * worker が課金の前に、ジョブが使う見本(参照画像)を解決する(resolveCatalogReferenceForJob)。
 *
 * ここで守ること(計画書 REQ-003・REQ-013・ADR-003):
 *  - 見本の id も元の投稿も無いジョブでは、DB に聞かない
 *  - 作者の見本・派生生成のどちらも、DB の resolve_catalog_reference_for_job に job の id を渡して確かめる
 *  - DB が断った(一覧から外れた・作り直し など)ら CATALOG_REFERENCE_UNAVAILABLE。ログに場所を出さない
 *  - 自分の見本を指しているのに引けなければ CATALOG_REFERENCE_UNAVAILABLE。見本の無い派生生成は null
 *  - 見本を使えるのはじゆうモードだけ
 */

import {
  CATALOG_REFERENCE_UNAVAILABLE,
  resolveCatalogReferenceForJob,
} from "@/supabase/functions/image-gen-worker/catalog-reference";

function client(result: { data: unknown; error: { code?: string; message?: string } | null }) {
  const rpc = jest.fn(async () => result);
  return { supabase: { rpc }, rpc };
}

const logError = jest.fn();
const FREE_OWN = { id: "job1", generation_type: "free", catalog_reference_id: "ref1", origin_post_id: null };
const FREE_DERIVED = { id: "job2", generation_type: "free", catalog_reference_id: null, origin_post_id: "post1" };

beforeEach(() => {
  logError.mockReset();
});

test("見本の id も元の投稿も無いジョブでは、DB に聞かずに null", async () => {
  const { supabase, rpc } = client({ data: [], error: null });

  await expect(
    resolveCatalogReferenceForJob(supabase, { id: "job0", generation_type: "free" }, logError),
  ).resolves.toBeNull();
  expect(rpc).not.toHaveBeenCalled();
});

test("作者の見本: job の id で DB に確かめ、場所とまねるものを返す", async () => {
  const { supabase, rpc } = client({
    data: [{ storage_path: "u1/ref.webp", takes: ["outfit", "pose"] }],
    error: null,
  });

  await expect(resolveCatalogReferenceForJob(supabase, FREE_OWN, logError)).resolves.toEqual({
    storagePath: "u1/ref.webp",
    takes: ["outfit", "pose"],
  });
  expect(rpc).toHaveBeenCalledWith("resolve_catalog_reference_for_job", { p_job_id: "job1" });
});

test("DB が断ったら CATALOG_REFERENCE_UNAVAILABLE。ログは job の id とコードだけ", async () => {
  const { supabase } = client({
    data: null,
    error: { code: "P0001", message: "CATALOG_REFERENCE_UNAVAILABLE u1/ref.webp" },
  });

  await expect(resolveCatalogReferenceForJob(supabase, FREE_OWN, logError)).rejects.toThrow(
    CATALOG_REFERENCE_UNAVAILABLE,
  );
  expect(logError).toHaveBeenCalledWith(expect.any(String), { jobId: "job1", code: "P0001" });
});

test("自分の見本を指しているのに引けなければ CATALOG_REFERENCE_UNAVAILABLE", async () => {
  const { supabase } = client({ data: [], error: null });

  await expect(resolveCatalogReferenceForJob(supabase, FREE_OWN, logError)).rejects.toThrow(
    CATALOG_REFERENCE_UNAVAILABLE,
  );
});

test("見本の無い派生生成は null(今までどおり生成する)", async () => {
  const { supabase, rpc } = client({ data: [], error: null });

  await expect(resolveCatalogReferenceForJob(supabase, FREE_DERIVED, logError)).resolves.toBeNull();
  expect(rpc).toHaveBeenCalledWith("resolve_catalog_reference_for_job", { p_job_id: "job2" });
});

test("見本つきの作品からの派生生成は、元の見本を返す", async () => {
  const { supabase } = client({ data: [{ storage_path: "u9/ref.png", takes: null }], error: null });

  await expect(resolveCatalogReferenceForJob(supabase, FREE_DERIVED, logError)).resolves.toEqual({
    storagePath: "u9/ref.png",
    takes: [],
  });
});

test("じゆうモード以外で見本が出てきたら CATALOG_REFERENCE_UNAVAILABLE", async () => {
  const { supabase } = client({ data: [{ storage_path: "u9/ref.png", takes: ["outfit"] }], error: null });

  await expect(
    resolveCatalogReferenceForJob(supabase, { ...FREE_DERIVED, generation_type: "coordinate" }, logError),
  ).rejects.toThrow(CATALOG_REFERENCE_UNAVAILABLE);
});
