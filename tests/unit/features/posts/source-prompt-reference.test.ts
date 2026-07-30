/** @jest-environment node */

/**
 * 参照カードの解決のテスト。
 *
 * ここが誤ると (a) 利用不可の原作へ生成を促す、(b) 利用不可の原因が
 * サムネイルの有無から推測できる、(c) 原作者のクレジットが失われる、
 * のいずれかが起きる（計画書 REQ-011 / REQ-013 / REQ-014 / ADR-005）。
 */

import {
  resolveOriginPostId,
  resolveSourcePromptReference,
} from "@/features/posts/lib/source-prompt-reference";
import type { SupabaseClient } from "@supabase/supabase-js";

const POST_ID = "11111111-1111-4111-8111-111111111111";
const ORIGIN_POST_ID = "22222222-2222-4222-8222-222222222222";
const AUTHOR_ID = "33333333-3333-4333-8333-333333333333";
const DERIVER_ID = "44444444-4444-4444-8444-444444444444";

// サムネイル URL の組み立ては Storage の公開 URL を必要とする
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

interface StubOptions {
  isAvailable?: boolean;
  validationError?: { code: string };
  usageCount?: number;
  usageError?: { code: string };
  profile?: { nickname: string | null; avatar_url: string | null } | null;
  originRow?: {
    id: string;
    user_id: string | null;
    storage_path_thumb: string | null;
    storage_path: string | null;
    image_url: string | null;
    width: number | null;
    height: number | null;
    pre_generation_storage_path: string | null;
    show_before_image: boolean | null;
  } | null;
}

/** RPC 呼び出しの記録つきスタブ。連鎖の形は実装が使う呼び方に合わせる。 */
function createSupabaseStub(options: StubOptions = {}) {
  const rpcCalls: Array<{ name: string; args: unknown }> = [];

  const supabase = {
    rpc: jest.fn((name: string, args: unknown) => {
      rpcCalls.push({ name, args });

      if (name === "validate_derived_prompt_source") {
        return {
          select: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: options.validationError
                  ? null
                  : { is_available: options.isAvailable ?? true },
                error: options.validationError ?? null,
              }),
          }),
        };
      }

      // get_prompt_usage_count はスカラーを返す
      return Promise.resolve({
        data: options.usageError ? null : options.usageCount ?? 0,
        error: options.usageError ?? null,
      });
    }),
    from: jest.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data:
                    options.profile === undefined
                      ? { nickname: "原作者さん", avatar_url: "https://cdn/a.png" }
                      : options.profile,
                  error: null,
                }),
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data:
                  options.originRow === undefined
                    ? {
                        id: ORIGIN_POST_ID,
                        user_id: AUTHOR_ID,
                        storage_path_thumb: "thumb/origin.webp",
                        storage_path: null,
                        image_url: null,
                        width: 896,
                        height: 1152,
                        pre_generation_storage_path: "before/origin.webp",
                        show_before_image: true,
                      }
                    : options.originRow,
                error: null,
              }),
          }),
        }),
      };
    }),
  };

  return { supabase: supabase as unknown as SupabaseClient, rpcCalls };
}

describe("resolveOriginPostId", () => {
  it("派生投稿は source_post_id を指す", () => {
    expect(
      resolveOriginPostId({
        id: POST_ID,
        user_id: DERIVER_ID,
        source_post_id: ORIGIN_POST_ID,
      })
    ).toBe(ORIGIN_POST_ID);
  });

  it("root の非公開投稿は自分自身を指す", () => {
    expect(
      resolveOriginPostId({
        id: POST_ID,
        user_id: AUTHOR_ID,
        prompt_visibility: "private",
      })
    ).toBe(POST_ID);
  });

  it("公開投稿はカード不要", () => {
    expect(
      resolveOriginPostId({
        id: POST_ID,
        user_id: AUTHOR_ID,
        prompt_visibility: "public",
      })
    ).toBeNull();
  });

  it("列が無い既存レコードもカード不要", () => {
    expect(resolveOriginPostId({ id: POST_ID, user_id: AUTHOR_ID })).toBeNull();
  });
});

describe("resolveSourcePromptReference", () => {
  it("公開投稿では null を返す（カードを出さない）", async () => {
    const { supabase, rpcCalls } = createSupabaseStub();

    const result = await resolveSourcePromptReference(
      { id: POST_ID, user_id: AUTHOR_ID, prompt_visibility: "public" },
      supabase
    );

    expect(result).toBeNull();
    // 不要な RPC を投げない
    expect(rpcCalls).toHaveLength(0);
  });

  it("閲覧者依存の条件を外すため requester に原作者自身を渡す", async () => {
    // ここが閲覧者の ID になると、フォロー有無がカードの可否に混ざり
    // use cache の粒度と噛み合わなくなる。
    const { supabase, rpcCalls } = createSupabaseStub();

    await resolveSourcePromptReference(
      {
        id: POST_ID,
        user_id: DERIVER_ID,
        source_post_id: ORIGIN_POST_ID,
        source_author_id: AUTHOR_ID,
      },
      supabase
    );

    expect(rpcCalls).toEqual(
      expect.arrayContaining([
        {
          name: "validate_derived_prompt_source",
          args: {
            p_source_post_id: ORIGIN_POST_ID,
            p_requester_id: AUTHOR_ID,
          },
        },
      ])
    );
  });

  it("利用可能ならサムネイルと利用数を含む", async () => {
    const { supabase } = createSupabaseStub({
      isAvailable: true,
      usageCount: 42,
    });

    const result = await resolveSourcePromptReference(
      {
        id: POST_ID,
        user_id: DERIVER_ID,
        source_post_id: ORIGIN_POST_ID,
        source_author_id: AUTHOR_ID,
      },
      supabase
    );

    expect(result).toMatchObject({
      postId: ORIGIN_POST_ID,
      isAvailable: true,
      authorId: AUTHOR_ID,
      authorNickname: "原作者さん",
      usageCount: 42,
      // カードのアスペクト比に使う原作の実寸
      thumbnailWidth: 896,
      thumbnailHeight: 1152,
    });
    expect(result?.thumbnailUrl).toBeTruthy();
  });

  it("原作が生成元画像を表示する設定なら Before も返す", async () => {
    // プロンプトが見えない閲覧者にとって Before/After が判断材料になる
    const { supabase } = createSupabaseStub({ isAvailable: true });

    const result = await resolveSourcePromptReference(
      {
        id: POST_ID,
        user_id: DERIVER_ID,
        source_post_id: ORIGIN_POST_ID,
        source_author_id: AUTHOR_ID,
      },
      supabase
    );

    expect(result?.beforeThumbnailUrl).toContain("before/origin.webp");
  });

  it("原作者が生成元画像を非表示にしていたら Before を返さない", async () => {
    // 「生成前の画像も表示する」を外している設定を尊重する
    const { supabase } = createSupabaseStub({
      isAvailable: true,
      originRow: {
        id: ORIGIN_POST_ID,
        user_id: AUTHOR_ID,
        storage_path_thumb: "thumb/origin.webp",
        storage_path: null,
        image_url: null,
        width: 896,
        height: 1152,
        pre_generation_storage_path: "before/origin.webp",
        show_before_image: false,
      },
    });

    const result = await resolveSourcePromptReference(
      {
        id: POST_ID,
        user_id: DERIVER_ID,
        source_post_id: ORIGIN_POST_ID,
        source_author_id: AUTHOR_ID,
      },
      supabase
    );

    expect(result?.thumbnailUrl).toBeTruthy();
    expect(result?.beforeThumbnailUrl).toBeNull();
  });

  it("生成元画像が永続化されていなければ Before を返さない", async () => {
    // 他人のジョブ行 (input_image_url) へは踏み込まない
    const { supabase } = createSupabaseStub({
      isAvailable: true,
      originRow: {
        id: ORIGIN_POST_ID,
        user_id: AUTHOR_ID,
        storage_path_thumb: "thumb/origin.webp",
        storage_path: null,
        image_url: null,
        width: 896,
        height: 1152,
        pre_generation_storage_path: null,
        show_before_image: true,
      },
    });

    const result = await resolveSourcePromptReference(
      {
        id: POST_ID,
        user_id: DERIVER_ID,
        source_post_id: ORIGIN_POST_ID,
        source_author_id: AUTHOR_ID,
      },
      supabase
    );

    expect(result?.beforeThumbnailUrl).toBeNull();
  });

  it("利用不可なら形状を変えずサムネイルだけ落とす", async () => {
    // 原因（削除・投稿取消・公開停止・公開へ戻された）を区別できると
    // 原作の状態を推測できてしまう（ADR-005 / REQ-014）
    const { supabase } = createSupabaseStub({ isAvailable: false });

    const result = await resolveSourcePromptReference(
      {
        id: POST_ID,
        user_id: DERIVER_ID,
        source_post_id: ORIGIN_POST_ID,
        source_author_id: AUTHOR_ID,
      },
      supabase
    );

    expect(result).toEqual({
      postId: ORIGIN_POST_ID,
      isAvailable: false,
      authorId: AUTHOR_ID,
      authorNickname: "原作者さん",
      authorAvatarUrl: "https://cdn/a.png",
      thumbnailUrl: null,
      thumbnailWidth: null,
      thumbnailHeight: null,
      beforeThumbnailUrl: null,
      usageCount: 0,
    });
  });

  it("原作が削除されていてもクレジットは保持する", async () => {
    // source_author_id はスナップショットなので原作行が消えても残る（REQ-011）
    const { supabase } = createSupabaseStub({
      isAvailable: false,
      originRow: null,
    });

    const result = await resolveSourcePromptReference(
      {
        id: POST_ID,
        user_id: DERIVER_ID,
        source_post_id: ORIGIN_POST_ID,
        source_author_id: AUTHOR_ID,
      },
      supabase
    );

    expect(result?.authorId).toBe(AUTHOR_ID);
    expect(result?.authorNickname).toBe("原作者さん");
    expect(result?.isAvailable).toBe(false);
  });

  it("検証RPCがエラーなら利用不可にする（fail closed）", async () => {
    // 判定できないまま有効化すると、押してから生成APIで弾かれる
    const { supabase } = createSupabaseStub({
      validationError: { code: "PGRST202" },
    });

    const result = await resolveSourcePromptReference(
      {
        id: POST_ID,
        user_id: DERIVER_ID,
        source_post_id: ORIGIN_POST_ID,
        source_author_id: AUTHOR_ID,
      },
      supabase
    );

    expect(result?.isAvailable).toBe(false);
    expect(result?.thumbnailUrl).toBeNull();
  });

  it("利用数が取れなくてもカードは出す", async () => {
    // カードの本質は「このプロンプトで作れる」ことなので、人数が出ないだけで
    // カード全体を落とさない
    const { supabase } = createSupabaseStub({
      isAvailable: true,
      usageError: { code: "42501" },
    });

    const result = await resolveSourcePromptReference(
      {
        id: POST_ID,
        user_id: DERIVER_ID,
        source_post_id: ORIGIN_POST_ID,
        source_author_id: AUTHOR_ID,
      },
      supabase
    );

    expect(result?.isAvailable).toBe(true);
    expect(result?.usageCount).toBe(0);
  });

  it("root の非公開投稿では投稿者が原作者になる", async () => {
    const { supabase, rpcCalls } = createSupabaseStub({ isAvailable: true });

    const result = await resolveSourcePromptReference(
      { id: POST_ID, user_id: AUTHOR_ID, prompt_visibility: "private" },
      supabase
    );

    expect(result?.postId).toBe(POST_ID);
    expect(result?.authorId).toBe(AUTHOR_ID);
    expect(rpcCalls).toEqual(
      expect.arrayContaining([
        {
          name: "validate_derived_prompt_source",
          args: { p_source_post_id: POST_ID, p_requester_id: AUTHOR_ID },
        },
      ])
    );
  });

  it("原作者が分からない場合は系譜だけ残して利用不可にする", async () => {
    const { supabase, rpcCalls } = createSupabaseStub();

    const result = await resolveSourcePromptReference(
      { id: POST_ID, user_id: null, source_post_id: ORIGIN_POST_ID },
      supabase
    );

    expect(result).toEqual({
      postId: ORIGIN_POST_ID,
      isAvailable: false,
      authorId: null,
      authorNickname: null,
      authorAvatarUrl: null,
      thumbnailUrl: null,
      thumbnailWidth: null,
      thumbnailHeight: null,
      beforeThumbnailUrl: null,
      usageCount: 0,
    });
    // 原作者が無いと requester を決められないので RPC も呼ばない
    expect(rpcCalls).toHaveLength(0);
  });

  it("プロフィールが取れなくてもカードは出す", async () => {
    const { supabase } = createSupabaseStub({
      isAvailable: true,
      profile: null,
    });

    const result = await resolveSourcePromptReference(
      {
        id: POST_ID,
        user_id: DERIVER_ID,
        source_post_id: ORIGIN_POST_ID,
        source_author_id: AUTHOR_ID,
      },
      supabase
    );

    expect(result?.isAvailable).toBe(true);
    expect(result?.authorNickname).toBeNull();
  });

  it("返す値にプロンプト本文を含めない", async () => {
    // カードの payload へ本文が混ざると、クライアントへ渡した時点で漏れる
    const { supabase } = createSupabaseStub({ isAvailable: true });

    const result = await resolveSourcePromptReference(
      {
        id: POST_ID,
        user_id: DERIVER_ID,
        source_post_id: ORIGIN_POST_ID,
        source_author_id: AUTHOR_ID,
      },
      supabase
    );

    expect(Object.keys(result ?? {}).sort()).toEqual([
      "authorAvatarUrl",
      "authorId",
      "authorNickname",
      "beforeThumbnailUrl",
      "isAvailable",
      "postId",
      "thumbnailHeight",
      "thumbnailUrl",
      "thumbnailWidth",
      "usageCount",
    ]);
  });
});
