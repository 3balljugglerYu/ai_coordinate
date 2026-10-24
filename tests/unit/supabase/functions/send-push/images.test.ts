/** @jest-environment node */

import {
  type ImageQueryClient,
  type ImageQueryFilter,
  lookupPushImageUrl,
} from "@/supabase/functions/send-push/images";

const BASE = "https://ref.supabase.co";
const url = (path: string) => `${BASE}/storage/v1/object/public/generated-images/${path}`;

type Result = { data: unknown; error: { message: string } | null };

/** テーブルごとの結果を返し、かけた条件を記録する偽物 */
function fakeClient(results: Record<string, Result>) {
  const calls: Array<{ table: string; columns: string; eq: [string, string | number] }> = [];
  const client: ImageQueryClient = {
    from(table) {
      return {
        select(columns) {
          const filter: ImageQueryFilter = {
            eq(column, value) {
              calls.push({ table, columns, eq: [column, value] });
              return filter;
            },
            maybeSingle: () => Promise.resolve(results[table] ?? { data: null, error: null }),
          };
          return filter;
        },
      };
    },
  };
  return { client, calls };
}

const visiblePost = {
  storage_path_thumb: "u/p_thumb.webp",
  storage_path_display: "u/p.webp",
  is_posted: true,
  moderation_status: "visible",
};

describe("lookupPushImageUrl", () => {
  test("投稿は公開中ならサムネイル", async () => {
    const { client, calls } = fakeClient({ generated_images: { data: visiblePost, error: null } });

    await expect(lookupPushImageUrl(client, BASE, { kind: "post", postId: "p1" }))
      .resolves.toBe(url("u/p_thumb.webp"));
    expect(calls[0]).toMatchObject({ table: "generated_images", eq: ["id", "p1"] });
    expect(calls[0].columns).toContain("moderation_status");
  });

  test("⭐公開停止・非公開の投稿は付けない", async () => {
    for (const state of [{ moderation_status: "removed" }, { is_posted: false }]) {
      const { client } = fakeClient({
        generated_images: { data: { ...visiblePost, ...state }, error: null },
      });
      await expect(lookupPushImageUrl(client, BASE, { kind: "post", postId: "p1" }))
        .resolves.toBeNull();
    }
  });

  test("コメントが対象なら、コメントの投稿を探す", async () => {
    const { client, calls } = fakeClient({
      comments: { data: { image_id: "p7" }, error: null },
      generated_images: { data: visiblePost, error: null },
    });

    await expect(lookupPushImageUrl(client, BASE, { kind: "comment", commentId: "c1" }))
      .resolves.toBe(url("u/p_thumb.webp"));
    expect(calls.map((c) => [c.table, ...c.eq])).toEqual([
      ["comments", "id", "c1"],
      ["generated_images", "id", "p7"],
    ]);
  });

  test("フォローはアイコン(https のときだけ)", async () => {
    const ok = fakeClient({ profiles: { data: { avatar_url: "https://a.example/a.png" }, error: null } });
    await expect(lookupPushImageUrl(ok.client, BASE, { kind: "avatar", userId: "u1" }))
      .resolves.toBe("https://a.example/a.png");

    const none = fakeClient({ profiles: { data: { avatar_url: null }, error: null } });
    await expect(lookupPushImageUrl(none.client, BASE, { kind: "avatar", userId: "u1" }))
      .resolves.toBeNull();
  });

  test.each([
    ["profiles", { kind: "avatar", userId: "u1" }],
    ["comments", { kind: "comment", commentId: "c1" }],
    ["generated_images", { kind: "post", postId: "p1" }],
  ] as const)("⭐読み込みの失敗(%s)は握りつぶさず投げる", async (table, source) => {
    const { client } = fakeClient({ [table]: { data: null, error: { message: "boom" } } });

    await expect(lookupPushImageUrl(client, BASE, source)).rejects.toThrow("boom");
  });
});

describe("lookupPushImageUrl(生成の完了)", () => {
  const source = { kind: "generated", imageJobId: "job-1", userId: "user-a" } as const;
  const own = {
    user_id: "user-a",
    is_posted: false,
    moderation_status: "visible",
    storage_path_thumb: "user-a/g_thumb.webp",
    storage_path_display: "user-a/g.webp",
  };

  test("ジョブの 1 枚目を、持ち主も含めて探し、小さい版を返す", async () => {
    const { client, calls } = fakeClient({ generated_images: { data: own, error: null } });

    await expect(lookupPushImageUrl(client, BASE, source)).resolves.toBe(url("user-a/g_thumb.webp"));
    expect(calls.map((c) => c.eq)).toEqual([
      ["image_job_id", "job-1"],
      ["image_job_result_index", 0],
    ]);
    expect(calls[0].table).toBe("generated_images");
    expect(calls[0].columns).toContain("user_id");
    expect(calls[0].columns).toContain("moderation_status");
  });

  test("⭐宛先と持ち主が違えば付けない", async () => {
    const { client } = fakeClient({
      generated_images: { data: { ...own, user_id: "user-b" }, error: null },
    });
    await expect(lookupPushImageUrl(client, BASE, source)).resolves.toBeNull();
  });

  test("まだ行が無ければ null・問い合わせの失敗は投げる", async () => {
    await expect(lookupPushImageUrl(fakeClient({}).client, BASE, source)).resolves.toBeNull();
    const { client } = fakeClient({
      generated_images: { data: null, error: { message: "db down" } },
    });
    await expect(lookupPushImageUrl(client, BASE, source)).rejects.toThrow("generated image: db down");
  });
});
