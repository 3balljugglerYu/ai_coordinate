/**
 * canViewerSeePost のテスト(投稿詳細 getPost と /api/posts/[id]/source-reference が使う)。
 */

import { canViewerSeePost } from "@/features/posts/lib/post-viewer-gate";

const POST = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const VIEWER = "33333333-3333-4333-8333-333333333333";

function stub({ blocks = false, reported = false } = {}) {
  const tables: string[] = [];
  const supabase = {
    from: (table: string) => {
      tables.push(table);
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data:
              (table === "user_blocks" && blocks) || (table === "post_reports" && reported)
                ? { id: "x" }
                : null,
          }),
      };
      return chain;
    },
  };
  return { supabase: supabase as never, tables };
}

const posted = { id: POST, user_id: OWNER, is_posted: true, moderation_status: "visible" };

it.each([
  ["a posted, visible post to a guest", posted, null, false, true],
  ["an unposted post to someone else", { ...posted, is_posted: false }, VIEWER, false, false],
  ["an unposted post to its owner", { ...posted, is_posted: false }, OWNER, false, true],
  ["an unposted post to an admin", { ...posted, is_posted: false }, VIEWER, true, true],
  ["a pending post to someone else", { ...posted, moderation_status: "pending" }, VIEWER, false, false],
  ["a pending post to its owner", { ...posted, moderation_status: "pending" }, OWNER, false, true],
  ["a removed post to its owner", { ...posted, moderation_status: "removed" }, OWNER, false, false],
])("%s", async (_name, row, viewer, isAdmin, expected) => {
  const { supabase } = stub();
  expect(await canViewerSeePost(supabase, row, viewer, isAdmin)).toBe(expected);
});

it("hides a post when the viewer and the author block each other", async () => {
  const { supabase } = stub({ blocks: true });
  expect(await canViewerSeePost(supabase, posted, VIEWER, false)).toBe(false);
});

it("hides a post the viewer reported", async () => {
  const { supabase } = stub({ reported: true });
  expect(await canViewerSeePost(supabase, posted, VIEWER, false)).toBe(false);
});

it("does not look up blocks for a guest", async () => {
  const { supabase, tables } = stub({ blocks: true });
  expect(await canViewerSeePost(supabase, posted, null, false)).toBe(true);
  expect(tables).toEqual([]);
});
