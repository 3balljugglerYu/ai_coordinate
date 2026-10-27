/**
 * applyViewerToSourceReference のテスト（投稿詳細と /api/posts/[id]/source-reference の参照カード）。
 *
 * 原作者が原作を取り消したり公開停止になったりしたあとも、派生投稿のカードに原作の
 * サムネイルと生成前の画像（Before）が出続けていた。見ているのが原作者でなければ、
 * 原作が公開中でないとき・ブロックし合っているときは「使えない」にする。
 */

import { applyViewerToSourceReference } from "@/features/posts/lib/source-prompt-reference";
import type { SourcePromptReference } from "@/features/posts/types";

const ORIGIN = "11111111-1111-4111-8111-111111111111";
const AUTHOR = "22222222-2222-4222-8222-222222222222";
const VIEWER = "33333333-3333-4333-8333-333333333333";

const REFERENCE: SourcePromptReference = {
  postId: ORIGIN,
  isAvailable: true,
  authorId: AUTHOR,
  authorNickname: "原作者さん",
  authorAvatarUrl: null,
  thumbnailUrl: "https://cdn/thumb.webp",
  thumbnailWidth: 768,
  thumbnailHeight: 1376,
  beforeThumbnailUrl: "https://cdn/before.webp",
  promptVisibility: "public",
  usageCount: 12,
};

function stub({
  originPublic = true,
  blocked = false,
  blockError = false,
}: { originPublic?: boolean; blocked?: boolean; blockError?: boolean } = {}) {
  const calls: string[] = [];
  const supabase = {
    from: (table: string) => {
      calls.push(table);
      if (table === "generated_images") {
        const chain = {
          select: () => chain,
          in: () => chain,
          eq: () => chain,
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: originPublic ? [{ id: ORIGIN }] : [], error: null }),
        };
        return chain;
      }
      const blocks = {
        select: () => blocks,
        or: () => blocks,
        limit: () =>
          Promise.resolve(
            blockError
              ? { data: null, error: { code: "x" } }
              : { data: blocked ? [{ id: "b" }] : [], error: null }
          ),
      };
      return blocks;
    },
  };
  return { supabase: supabase as never, calls };
}

it("keeps the card when the original is public and nobody blocks", async () => {
  const { supabase } = stub();
  expect(await applyViewerToSourceReference(REFERENCE, VIEWER, supabase)).toEqual(REFERENCE);
});

it.each([
  ["the original was withdrawn or suspended", { originPublic: false }, VIEWER],
  ["a guest looks at a withdrawn original", { originPublic: false }, null],
  ["the viewer and the author block each other", { blocked: true }, VIEWER],
  ["blocks cannot be read (fail closed)", { blockError: true }, VIEWER],
])("drops the pictures and the author when %s", async (_name, options, viewer) => {
  const { supabase } = stub(options);
  const result = await applyViewerToSourceReference(REFERENCE, viewer, supabase);
  // 一覧の unavailableSummary と同じく、原作の系譜(作者・利用数)も返さない
  expect(result).toEqual({
    postId: ORIGIN,
    isAvailable: false,
    authorId: null,
    authorNickname: null,
    authorAvatarUrl: null,
    thumbnailUrl: null,
    thumbnailWidth: null,
    thumbnailHeight: null,
    beforeThumbnailUrl: null,
    promptVisibility: "private",
    usageCount: 0,
  });
});

it("moderators still see the original (material for reports)", async () => {
  const { supabase, calls } = stub({ originPublic: false, blocked: true });
  expect(
    await applyViewerToSourceReference(REFERENCE, VIEWER, supabase, { isModerator: true })
  ).toEqual(REFERENCE);
  expect(calls).toEqual([]);
});

it("the original's author still sees their own (e.g. a draft) without any check", async () => {
  const { supabase, calls } = stub({ originPublic: false });
  expect(await applyViewerToSourceReference(REFERENCE, AUTHOR, supabase)).toEqual(REFERENCE);
  expect(calls).toEqual([]);
});

it("leaves an unavailable card or no card as it is", async () => {
  const { supabase, calls } = stub();
  const unavailable = { ...REFERENCE, isAvailable: false };
  expect(await applyViewerToSourceReference(unavailable, VIEWER, supabase)).toBe(unavailable);
  expect(await applyViewerToSourceReference(null, VIEWER, supabase)).toBeNull();
  expect(calls).toEqual([]);
});

it("does not look up blocks for a guest", async () => {
  const { supabase, calls } = stub();
  await applyViewerToSourceReference(REFERENCE, null, supabase);
  expect(calls).toEqual(["generated_images"]);
});
