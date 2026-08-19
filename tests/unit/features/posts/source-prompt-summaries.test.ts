/** @jest-environment node */

/**
 * 一覧（フィード）用 CTA サマリのテスト（ADR-005）。
 *
 * ここが誤ると (a) 一覧にプロンプト本文やサムネイルが漏れる、
 * (b) 詳細では出ない導線が一覧に出る、(c) 同じ原作を何度も解決して
 * DB 負荷が跳ねる、のいずれかが起きる。
 */

import {
  resolveSourcePromptSummaries,
  toPromptActionSummary,
} from "@/features/posts/lib/source-prompt-reference";
import type { SourcePromptReference } from "@/features/posts/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const ORIGIN_A = "11111111-1111-4111-8111-111111111111";
const ORIGIN_B = "22222222-2222-4222-8222-222222222222";
const AUTHOR_ID = "33333333-3333-4333-8333-333333333333";
const DERIVER_ID = "44444444-4444-4444-8444-444444444444";
const DERIVED_1 = "55555555-5555-4555-8555-555555555555";
const DERIVED_2 = "66666666-6666-4666-8666-666666666666";
const COORDINATE_POST = "77777777-7777-4777-8777-777777777777";

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
});

afterAll(() => {
  if (originalSupabaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  }
});

/**
 * @param options.publiclyUsableOriginIds 公開導線から使える原作。
 *   未指定なら「問い合わせた原作すべてが公開中」として扱う。
 */
function createSupabaseStub(
  options: {
    isAvailable?: boolean;
    usageCount?: number;
    publiclyUsableOriginIds?: string[];
    /** 可否判定のバッチ RPC を失敗させる(fail closed の確認用) */
    availabilityRpcFails?: boolean;
  } = {}
) {
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  /** テーブルごとのバッチ SELECT 回数(往復数の回帰を見る) */
  const batchCalls: { generated_images: string[][]; profiles: string[][] } = {
    generated_images: [],
    profiles: [],
  };
  /** 個別 SELECT の回数(バッチ化できていれば 0 のまま) */
  let singleSelectCount = 0;

  function originRow(id: string) {
    return {
      id,
      user_id: AUTHOR_ID,
      prompt_visibility: "public",
      storage_path_thumb: "thumb/origin.webp",
      storage_path: null,
      image_url: null,
      width: 896,
      height: 1152,
      pre_generation_storage_path: "before/origin.webp",
      show_before_image: true,
      caption: "原作のキャプション",
    };
  }

  const supabase = {
    rpc: jest.fn((name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      /*
        一覧経路は配列版だけを使う。単体版(詳細経路)が呼ばれたら、
        原作数に比例した往復に戻っているということなので落とす。
      */
      if (name === "validate_derived_prompt_sources") {
        if (options.availabilityRpcFails) {
          return Promise.resolve({ data: null, error: { code: "XX000" } });
        }
        const typed = args as {
          p_source_post_ids: string[];
          p_requester_ids: string[];
        };
        return Promise.resolve({
          data: typed.p_source_post_ids.map((id, index) => ({
            source_post_id: id,
            requester_id: typed.p_requester_ids[index],
            is_available: options.isAvailable ?? true,
          })),
          error: null,
        });
      }
      if (name === "get_prompt_usage_counts") {
        const typed = args as { p_origin_post_ids: string[] };
        return Promise.resolve({
          data: typed.p_origin_post_ids.map((id) => ({
            origin_post_id: id,
            usage_count: options.usageCount ?? 3,
          })),
          error: null,
        });
      }
      throw new Error(`一覧経路で単体版 RPC が呼ばれた: ${name}`);
    }),
    from: jest.fn((table: string) => ({
      select: () => ({
        // バッチ SELECT: .in(ids) [.eq(...).eq(...)]
        in: (_column: string, ids: string[]) => {
          if (table === "profiles") {
            batchCalls.profiles.push(ids);
            return Promise.resolve({
              data: ids.map((id) => ({
                user_id: id,
                nickname: "原作者さん",
                avatar_url: "https://cdn/a.png",
              })),
              error: null,
            });
          }
          batchCalls.generated_images.push(ids);
          const allowed = options.publiclyUsableOriginIds ?? ids;
          const builder = { eq: jest.fn() };
          let remaining = 2;
          builder.eq = jest.fn(() => {
            remaining -= 1;
            return remaining === 0
              ? Promise.resolve({
                  data: ids.filter((id) => allowed.includes(id)).map(originRow),
                  error: null,
                })
              : builder;
          });
          return builder;
        },
        // 個別 SELECT(一覧経路では呼ばれないはず)
        eq: () => ({
          maybeSingle: () => {
            singleSelectCount += 1;
            return Promise.resolve({
              data:
                table === "profiles"
                  ? { nickname: "原作者さん", avatar_url: "https://cdn/a.png" }
                  : originRow(ORIGIN_A),
              error: null,
            });
          },
        }),
      }),
    })),
  };

  return {
    supabase: supabase as unknown as SupabaseClient,
    rpcCalls,
    batchCalls,
    getSingleSelectCount: () => singleSelectCount,
  };
}

describe("toPromptActionSummary", () => {
  const reference: SourcePromptReference = {
    postId: ORIGIN_A,
    isAvailable: true,
    authorId: AUTHOR_ID,
    authorNickname: "原作者さん",
    authorAvatarUrl: "https://cdn/a.png",
    thumbnailUrl: "https://cdn/thumb.webp",
    thumbnailWidth: 896,
    thumbnailHeight: 1152,
    beforeThumbnailUrl: "https://cdn/before.webp",
    promptVisibility: "public",
    usageCount: 7,
  };

  it("CTA に要る項目だけを残す", () => {
    expect(toPromptActionSummary(reference, "原作のキャプション")).toEqual({
      originPostId: ORIGIN_A,
      isAvailable: true,
      originAuthorId: AUTHOR_ID,
      originAuthorNickname: "原作者さん",
      originAuthorAvatarUrl: "https://cdn/a.png",
      originThumbnailUrl: "https://cdn/thumb.webp",
      originCaption: "原作のキャプション",
      usageCount: 7,
      promptVisibility: "public",
    });
  });

  it("Before サムネイルと実寸は載せない(引用カードでは使わない)", () => {
    const summary = toPromptActionSummary(reference) as Record<string, unknown>;
    expect(summary.beforeThumbnailUrl).toBeUndefined();
    expect(summary.thumbnailWidth).toBeUndefined();
    expect(summary.thumbnailHeight).toBeUndefined();
  });
});

describe("resolveSourcePromptSummaries", () => {
  it("CTA 対象でない投稿は含めない(coordinate など)", async () => {
    const { supabase, rpcCalls } = createSupabaseStub();

    const summaries = await resolveSourcePromptSummaries(
      [
        {
          id: COORDINATE_POST,
          user_id: AUTHOR_ID,
          generation_type: "coordinate",
          source_post_id: null,
        },
      ],
      supabase
    );

    expect(summaries).toEqual({});
    expect(rpcCalls).toHaveLength(0);
  });

  it("free の root は自分自身を原作として解決する", async () => {
    const { supabase } = createSupabaseStub({ usageCount: 5 });

    const summaries = await resolveSourcePromptSummaries(
      [{ id: ORIGIN_A, user_id: AUTHOR_ID, generation_type: "free", source_post_id: null }],
      supabase
    );

    expect(summaries[ORIGIN_A]).toMatchObject({
      originPostId: ORIGIN_A,
      isAvailable: true,
      originAuthorId: AUTHOR_ID,
      originAuthorNickname: "原作者さん",
      originAuthorAvatarUrl: "https://cdn/a.png",
      usageCount: 5,
      promptVisibility: "public",
    });
  });

  it("同じ原作を指す派生投稿は1回だけ解決して両方に配る", async () => {
    const { supabase, rpcCalls } = createSupabaseStub();

    const summaries = await resolveSourcePromptSummaries(
      [
        {
          id: DERIVED_1,
          user_id: DERIVER_ID,
          generation_type: "free",
          source_post_id: ORIGIN_A,
          source_author_id: AUTHOR_ID,
        },
        {
          id: DERIVED_2,
          user_id: DERIVER_ID,
          generation_type: "free",
          source_post_id: ORIGIN_A,
          source_author_id: AUTHOR_ID,
        },
      ],
      supabase
    );

    expect(summaries[DERIVED_1]).toEqual(summaries[DERIVED_2]);
    expect(summaries[DERIVED_1].originPostId).toBe(ORIGIN_A);
    // 検証にかける組は原作1件ぶんだけ
    const validation = rpcCalls.find(
      (call) => call.name === "validate_derived_prompt_sources"
    );
    expect((validation?.args as { p_source_post_ids: string[] }).p_source_post_ids).toEqual([
      ORIGIN_A,
    ]);
  });

  it("原作が違えばそれぞれ解決する", async () => {
    const { supabase, rpcCalls } = createSupabaseStub();

    await resolveSourcePromptSummaries(
      [
        {
          id: DERIVED_1,
          user_id: DERIVER_ID,
          generation_type: "free",
          source_post_id: ORIGIN_A,
          source_author_id: AUTHOR_ID,
        },
        {
          id: DERIVED_2,
          user_id: DERIVER_ID,
          generation_type: "free",
          source_post_id: ORIGIN_B,
          source_author_id: AUTHOR_ID,
        },
      ],
      supabase
    );

    const validation = rpcCalls.find(
      (call) => call.name === "validate_derived_prompt_sources"
    );
    expect(
      (validation?.args as { p_source_post_ids: string[] }).p_source_post_ids.sort()
    ).toEqual([ORIGIN_A, ORIGIN_B].sort());
  });

  it("利用不可の原作も形状は同じで isAvailable=false になる", async () => {
    const { supabase } = createSupabaseStub({ isAvailable: false });

    const summaries = await resolveSourcePromptSummaries(
      [{ id: ORIGIN_A, user_id: AUTHOR_ID, generation_type: "free", source_post_id: null }],
      supabase
    );

    expect(summaries[ORIGIN_A].isAvailable).toBe(false);
    // 利用不可のときは公開設定も開示側へ倒さない
    expect(summaries[ORIGIN_A].promptVisibility).toBe("private");
  });

  it("返り値にプロンプト本文につながる値が一切含まれない(PROMPT-SECRECY-001)", async () => {
    const { supabase } = createSupabaseStub();

    const summaries = await resolveSourcePromptSummaries(
      [{ id: ORIGIN_A, user_id: AUTHOR_ID, generation_type: "free", source_post_id: null }],
      supabase
    );

    const serialized = JSON.stringify(summaries);
    expect(serialized).not.toContain("prompt_text");
    expect(serialized).not.toContain("hidden_prompt");
    expect(Object.keys(summaries[ORIGIN_A]).sort()).toEqual([
      "isAvailable",
      "originAuthorAvatarUrl",
      "originAuthorId",
      "originAuthorNickname",
      "originCaption",
      "originPostId",
      "originThumbnailUrl",
      "promptVisibility",
      "usageCount",
    ]);
  });

  it("投稿取消された原作は CTA を出さない(RPC の本人例外を打ち消す)", async () => {
    /*
      validate_derived_prompt_source は本人に限り未投稿の原作を許すが、
      resolveSourcePromptReference は requester に原作者自身を渡すため
      この例外が常に効いてしまう。一覧は公開導線なので打ち消す必要がある。
      打ち消さないと「押せたのに生成APIで弾かれる」状態になる。
    */
    const { supabase } = createSupabaseStub({
      isAvailable: true,
      publiclyUsableOriginIds: [],
    });

    const summaries = await resolveSourcePromptSummaries(
      [
        {
          id: DERIVED_1,
          user_id: DERIVER_ID,
          generation_type: "free",
          source_post_id: ORIGIN_A,
          source_author_id: AUTHOR_ID,
        },
      ],
      supabase
    );

    expect(summaries[DERIVED_1]).toEqual({
      originPostId: ORIGIN_A,
      isAvailable: false,
      // 取り消した投稿の系譜メタデータは公開 API に載せない
      originAuthorId: null,
      originAuthorNickname: null,
      originAuthorAvatarUrl: null,
      originThumbnailUrl: null,
      originCaption: null,
      usageCount: 0,
      promptVisibility: "private",
    });
  });

  it("原作の行とプロフィールはまとめて1回ずつ引き_個別SELECTをしない", async () => {
    const { supabase, batchCalls, getSingleSelectCount } = createSupabaseStub();

    await resolveSourcePromptSummaries(
      [
        {
          id: DERIVED_1,
          user_id: DERIVER_ID,
          generation_type: "free",
          source_post_id: ORIGIN_A,
          source_author_id: AUTHOR_ID,
        },
        {
          id: DERIVED_2,
          user_id: DERIVER_ID,
          generation_type: "free",
          source_post_id: ORIGIN_B,
          source_author_id: AUTHOR_ID,
        },
      ],
      supabase
    );

    // 原作数に比例した往復にしない(Disk IO の観点)
    expect(batchCalls.generated_images).toHaveLength(1);
    expect(batchCalls.generated_images[0].sort()).toEqual([ORIGIN_A, ORIGIN_B].sort());
    expect(batchCalls.profiles).toHaveLength(1);
    expect(getSingleSelectCount()).toBe(0);
  });

  /*
    ここが崩れると原作数に比例して DB 往復が増える。50件のバッチで原作45件なら
    それだけで90往復になり、スクロール復元では一度に2バッチ走る。
  */
  describe("⭐往復数が原作数に依存しないこと", () => {
    function manyOrigins(count: number) {
      return Array.from({ length: count }, (_, index) => ({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`,
        user_id: AUTHOR_ID,
        generation_type: "free",
        source_post_id: null,
      }));
    }

    it("原作が10件でも RPC は2回(可否・利用数のバッチ各1)", async () => {
      const { supabase, rpcCalls } = createSupabaseStub();

      await resolveSourcePromptSummaries(manyOrigins(10), supabase);

      expect(rpcCalls.map((call) => call.name).sort()).toEqual([
        "get_prompt_usage_counts",
        "validate_derived_prompt_sources",
      ]);
    });

    it("原作が1件でも10件でも RPC の回数は変わらない", async () => {
      const one = createSupabaseStub();
      const ten = createSupabaseStub();

      await resolveSourcePromptSummaries(manyOrigins(1), one.supabase);
      await resolveSourcePromptSummaries(manyOrigins(10), ten.supabase);

      expect(ten.rpcCalls).toHaveLength(one.rpcCalls.length);
    });
  });

  /*
    派生投稿は原作者をスナップショット(source_author_id)で持つ。同じ原作でも
    レコードによって requester が変わり得るので、原作 ID だけをキーにすると
    別人の判定結果を取り違える。
  */
  it("⭐可否は(原作ID, requester)の組で引く", async () => {
    const { supabase, rpcCalls } = createSupabaseStub();

    await resolveSourcePromptSummaries(
      [
        {
          id: DERIVED_1,
          user_id: DERIVER_ID,
          generation_type: "free",
          source_post_id: ORIGIN_A,
          source_author_id: AUTHOR_ID,
        },
        {
          // 同じ原作を指すが、スナップショットされた原作者が違う
          id: DERIVED_2,
          user_id: DERIVER_ID,
          generation_type: "free",
          source_post_id: ORIGIN_A,
          source_author_id: DERIVER_ID,
        },
      ],
      supabase
    );

    const args = rpcCalls.find(
      (call) => call.name === "validate_derived_prompt_sources"
    )?.args as { p_source_post_ids: string[]; p_requester_ids: string[] };

    // 2組ぶん送る。配列は添字で対応するので長さも揃っていること
    expect(args.p_source_post_ids).toEqual([ORIGIN_A, ORIGIN_A]);
    expect(args.p_requester_ids).toEqual([AUTHOR_ID, DERIVER_ID]);
    expect(args.p_source_post_ids).toHaveLength(args.p_requester_ids.length);
  });

  it("可否のバッチRPCが失敗したら利用不可にする(fail closed)", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = createSupabaseStub({ availabilityRpcFails: true });

    const summaries = await resolveSourcePromptSummaries(
      [{ id: ORIGIN_A, user_id: AUTHOR_ID, generation_type: "free", source_post_id: null }],
      supabase
    );

    expect(summaries[ORIGIN_A].isAvailable).toBe(false);
    errorSpy.mockRestore();
  });

  it("利用数が0の原作でもカードは描ける", async () => {
    const { supabase } = createSupabaseStub({ usageCount: 0 });

    const summaries = await resolveSourcePromptSummaries(
      [{ id: ORIGIN_A, user_id: AUTHOR_ID, generation_type: "free", source_post_id: null }],
      supabase
    );

    expect(summaries[ORIGIN_A].usageCount).toBe(0);
    expect(summaries[ORIGIN_A].isAvailable).toBe(true);
  });

  it("利用数は原作ごとの値を取り違えずに配る", async () => {
    const { supabase } = createSupabaseStub();

    const summaries = await resolveSourcePromptSummaries(
      [
        { id: ORIGIN_A, user_id: AUTHOR_ID, generation_type: "free", source_post_id: null },
        { id: ORIGIN_B, user_id: AUTHOR_ID, generation_type: "free", source_post_id: null },
      ],
      supabase
    );

    expect(summaries[ORIGIN_A].originPostId).toBe(ORIGIN_A);
    expect(summaries[ORIGIN_B].originPostId).toBe(ORIGIN_B);
    expect(summaries[ORIGIN_A].usageCount).toBe(3);
    expect(summaries[ORIGIN_B].usageCount).toBe(3);
  });

  it("空配列なら問い合わせない", async () => {
    const { supabase, rpcCalls } = createSupabaseStub();
    await expect(resolveSourcePromptSummaries([], supabase)).resolves.toEqual({});
    expect(rpcCalls).toHaveLength(0);
  });
});
