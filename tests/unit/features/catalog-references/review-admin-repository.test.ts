/** @jest-environment node */

/**
 * 運営の審査ページで読む、審査待ちの見本つきの作品(listPendingCatalogReviews)。
 *
 * ここで守ること:
 *  - 審査待ち(pending)を申請の古い順に読む。無ければほかの表を読まずに空
 *  - 見本は非公開の置き場所なので、期限つきの URL(10分)にする
 *  - 派生の作品(作品そのものに見本の情報が無い)は、元の作品の見本とプロンプトを使い、派生と分かる
 *  - 作者の名前・元の画像・できた画像・まねたものを合わせる。読めなければ投げる
 *  - 見本がほかの作品の審査で作り直しになっていれば、印を付ける
 *  - 申請のあとに公開停止などになった作品に、印を付ける
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { listPendingCatalogReviews } from "@/features/catalog-references/lib/review-admin-repository";

type Result = { data: unknown; error: { message: string } | null };

function client(tables: Record<string, Result>, signed: Result = { data: [], error: null }) {
  const calls: Array<[string, string, unknown[]]> = [];
  const from = jest.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "limit"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push([table, method, args]);
        return chain;
      };
    }
    chain.then = (resolve: (value: Result) => unknown) => resolve(tables[table] ?? { data: [], error: null });
    return chain;
  });
  const createSignedUrls = jest.fn(async () => signed);
  const storage = { from: jest.fn(() => ({ createSignedUrls })) };
  return { supabase: { from, storage } as unknown as SupabaseClient, calls, from, createSignedUrls, storage };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ref.supabase.co";
});

test("審査待ちが無ければ、ほかの表を読まずに空", async () => {
  const { supabase, from, calls } = client({ generated_image_catalog_reviews: { data: [], error: null } });

  await expect(listPendingCatalogReviews(supabase)).resolves.toEqual([]);
  expect(from).toHaveBeenCalledTimes(1);
  expect(calls).toEqual(
    expect.arrayContaining([
      ["generated_image_catalog_reviews", "eq", ["status", "pending"]],
      ["generated_image_catalog_reviews", "order", ["submitted_at", { ascending: true }]],
    ]),
  );
});

test("作品・見本(期限つきの URL)・まねたもの・プロンプト・作者を合わせる。派生は元の作品の見本を使う", async () => {
  const { supabase, createSignedUrls, storage } = client(
    {
      generated_image_catalog_reviews: {
        data: [
          { image_id: "img-own", user_id: "u1", submitted_at: "2026-10-30T01:00:00Z" },
          { image_id: "img-derived", user_id: "u1", submitted_at: "2026-10-30T02:00:00Z" },
        ],
        error: null,
      },
      generated_images: {
        data: [
          {
            id: "img-own",
            image_url: "https://cdn/after1.webp",
            pre_generation_storage_path: "before/1.webp",
            source_post_id: null,
            moderation_status: "visible",
          },
          {
            id: "img-derived",
            image_url: "https://cdn/after2.webp",
            pre_generation_storage_path: null,
            source_post_id: "img-own",
            moderation_status: "visible",
          },
        ],
        error: null,
      },
      generated_image_reference_secrets: {
        data: [{ image_id: "img-own", reference_id: "ref-1", takes: ["outfit", "pose"] }],
        error: null,
      },
      generated_image_prompt_secrets: { data: [{ image_id: "img-own", prompt: "猫耳の衣装" }], error: null },
      profiles: { data: [{ user_id: "u1", nickname: "はな" }], error: null },
      catalog_reference_images: { data: [{ id: "ref-1", storage_path: "u1/ref.webp", rejected_at: null }], error: null },
    },
    { data: [{ path: "u1/ref.webp", signedUrl: "https://signed/ref" }], error: null },
  );

  const items = await listPendingCatalogReviews(supabase);

  expect(storage.from).toHaveBeenCalledWith("catalog-references");
  expect(createSignedUrls).toHaveBeenCalledWith(["u1/ref.webp"], 600);
  expect(items).toEqual([
    {
      imageId: "img-own",
      userId: "u1",
      nickname: "はな",
      submittedAt: "2026-10-30T01:00:00Z",
      afterUrl: "https://cdn/after1.webp",
      beforeUrl: expect.stringContaining("before/1.webp"),
      referenceUrl: "https://signed/ref",
      takes: ["outfit", "pose"],
      prompt: "猫耳の衣装",
      derived: false,
      referenceId: "ref-1",
      referenceRejected: false,
      imageUnavailable: false,
    },
    {
      imageId: "img-derived",
      userId: "u1",
      nickname: "はな",
      submittedAt: "2026-10-30T02:00:00Z",
      afterUrl: "https://cdn/after2.webp",
      beforeUrl: null,
      referenceUrl: "https://signed/ref",
      takes: ["outfit", "pose"],
      prompt: "猫耳の衣装",
      derived: true,
      referenceId: "ref-1",
      referenceRejected: false,
      imageUnavailable: false,
    },
  ]);
});

test.each(["generated_image_catalog_reviews", "generated_images", "generated_image_reference_secrets", "profiles"])(
  "%s が読めなければ投げる",
  async (table) => {
    const tables: Record<string, Result> = {
      generated_image_catalog_reviews: { data: [{ image_id: "img", user_id: "u1", submitted_at: null }], error: null },
      generated_images: { data: [{ id: "img", image_url: null, pre_generation_storage_path: null, source_post_id: null }], error: null },
    };
    tables[table] = { data: null, error: { message: "timeout" } };
    jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(listPendingCatalogReviews(client(tables).supabase)).rejects.toThrow("審査待ちの作品の取得に失敗しました");
  },
);

test("見本がほかの作品の審査で作り直しになっている・作品が公開停止なら、印を付ける", async () => {
  const { supabase } = client(
    {
      generated_image_catalog_reviews: { data: [{ image_id: "img", user_id: "u1", submitted_at: null }], error: null },
      generated_images: {
        data: [{ id: "img", image_url: null, pre_generation_storage_path: null, source_post_id: null, moderation_status: "removed" }],
        error: null,
      },
      generated_image_reference_secrets: { data: [{ image_id: "img", reference_id: "ref-1", takes: ["pose"] }], error: null },
      catalog_reference_images: {
        data: [{ id: "ref-1", storage_path: "u1/ref.webp", rejected_at: "2026-10-30T00:00:00Z" }],
        error: null,
      },
    },
    { data: [{ path: "u1/ref.webp", signedUrl: "https://signed/ref" }], error: null },
  );

  const [item] = await listPendingCatalogReviews(supabase);

  expect(item.referenceRejected).toBe(true);
  expect(item.referenceUrl).toBe("https://signed/ref");
  expect(item.imageUnavailable).toBe(true);
});
