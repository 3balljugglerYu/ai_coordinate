/** @jest-environment node */

/**
 * 生成結果一覧の「自分のプロンプトで作ったものだけ」の絞り込み。
 *
 * ⭐ カタログ刷新(公開前は運営だけ)では、/free は「カタログをつくる(CREATE)」のタブになる。
 * CREATE の一覧には、自分でプロンプトを書いて作ったものだけを出す。ほかの人のプロンプトで
 * 作ったもの(派生生成。generated_images.source_post_id に元の投稿が入る)は混ぜない
 * (2026-09-29 ユーザー指示)。最初の読み込み(サーバー)と続きの読み込み(ブラウザ)の両方で絞る。
 */

type Call = [method: string, ...args: unknown[]];

/** 呼ばれたメソッドと引数を記録する PostgREST ビルダーの代わり。await すると空の結果を返す */
function createRecordingBuilder(calls: Call[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order", "range"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: [], error: null });
  return builder;
}

let browserCalls: Call[] = [];
jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => createRecordingBuilder(browserCalls) }),
}));
jest.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => createRecordingBuilder([]) }),
}));
jest.mock("@/features/generation/lib/prompt-secrets", () => ({
  resolveVisiblePrompts: async (rows: unknown[]) => rows,
}));
jest.mock("@/features/generation/lib/prompt-secrets-client", () => ({
  resolveOwnVisiblePrompts: async (rows: unknown[]) => rows,
}));

import { getGeneratedImagesServer } from "@/features/generation/lib/server-database";
import { getGeneratedImages } from "@/features/generation/lib/database";

function serverClient(calls: Call[]) {
  return { from: () => createRecordingBuilder(calls) } as never;
}

beforeEach(() => {
  browserCalls = [];
});

describe("getGeneratedImagesServer(最初の読み込み)", () => {
  test("自分のプロンプトだけにすると、派生生成(source_post_id あり)を除く", async () => {
    const calls: Call[] = [];
    await getGeneratedImagesServer("user-1", 4, 0, "free", serverClient(calls), {
      ownPromptsOnly: true,
    });

    expect(calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(calls).toContainEqual(["eq", "generation_type", "free"]);
    expect(calls).toContainEqual(["is", "source_post_id", null]);
  });

  test("指定しなければ今までどおり(派生生成も含める)", async () => {
    const calls: Call[] = [];
    await getGeneratedImagesServer("user-2", 4, 0, "free", serverClient(calls));

    expect(calls).toContainEqual(["eq", "generation_type", "free"]);
    expect(calls.some(([method]) => method === "is")).toBe(false);
  });
});

describe("getGeneratedImages(続きの読み込み)", () => {
  test("自分のプロンプトだけにすると、派生生成(source_post_id あり)を除く", async () => {
    await getGeneratedImages("user-1", 4, 8, "free", { ownPromptsOnly: true });

    expect(browserCalls).toContainEqual(["eq", "generation_type", "free"]);
    expect(browserCalls).toContainEqual(["is", "source_post_id", null]);
    expect(browserCalls).toContainEqual(["range", 8, 11]);
  });

  test("指定しなければ今までどおり(派生生成も含める)", async () => {
    await getGeneratedImages("user-1", 4, 0, "free");

    expect(browserCalls.some(([method]) => method === "is")).toBe(false);
  });
});


/*
  「カタログから生成」のシート(カタログ刷新後)の一覧: 開いたカタログで作ったものだけ。
*/
describe("getGeneratedImages(開いたカタログで絞る)", () => {
  test("User ORIGINAL: 元の投稿(source_post_id)で絞る", async () => {
    await getGeneratedImages("user-1", 8, 0, "free", { sourcePostId: "origin-1" });

    expect(browserCalls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(browserCalls).toContainEqual(["eq", "source_post_id", "origin-1"]);
    expect(browserCalls).toContainEqual(["range", 0, 7]);
  });

  test("Persta ORIGINAL: 生成時に記録したスタイルの id で絞る", async () => {
    await getGeneratedImages("user-1", 8, 8, "one_tap_style", { stylePresetId: "preset-1" });

    expect(browserCalls).toContainEqual(["eq", "generation_type", "one_tap_style"]);
    expect(browserCalls).toContainEqual([
      "eq",
      "generation_metadata->oneTapStyle->>id",
      "preset-1",
    ]);
    expect(browserCalls).toContainEqual(["range", 8, 15]);
  });

  test("指定しなければ絞らない", async () => {
    await getGeneratedImages("user-1", 4, 0, "free", {});

    expect(browserCalls.some(([, column]) => column === "source_post_id")).toBe(false);
    expect(
      browserCalls.some(([, column]) => column === "generation_metadata->oneTapStyle->>id")
    ).toBe(false);
  });
});
