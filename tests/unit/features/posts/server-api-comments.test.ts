/** @jest-environment node */

import { shouldExposeParentComment } from "@/features/posts/lib/server-api";

describe("shouldExposeParentComment", () => {
  test("未削除の親コメントは返信数に関係なく表示対象にする", () => {
    expect(
      shouldExposeParentComment({ deleted_at: null }, 0)
    ).toBe(true);
    expect(
      shouldExposeParentComment({ deleted_at: null }, 3)
    ).toBe(true);
  });

  test("返信が残る tombstone 親コメントは表示対象にする", () => {
    expect(
      shouldExposeParentComment(
        { deleted_at: "2026-04-17T01:26:52.061095+00:00" },
        1
      )
    ).toBe(true);
  });

  test("返信がない tombstone 親コメントは表示対象から除外する", () => {
    expect(
      shouldExposeParentComment(
        { deleted_at: "2026-04-17T01:26:52.061095+00:00" },
        0
      )
    ).toBe(false);
  });
});
