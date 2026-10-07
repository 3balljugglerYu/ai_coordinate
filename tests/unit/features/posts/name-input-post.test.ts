import { isNameInputPost } from "@/features/posts/lib/name-input-post";

describe("isNameInputPost", () => {
  test("名前を使った投稿だけ true", () => {
    expect(isNameInputPost({ generation_metadata: { nameInputUsed: true } })).toBe(true);
    expect(isNameInputPost({ generation_metadata: { nameInputUsed: "true" } })).toBe(false);
    expect(isNameInputPost({ generation_metadata: {} })).toBe(false);
    expect(isNameInputPost({ generation_metadata: null })).toBe(false);
    expect(isNameInputPost({})).toBe(false);
  });
});
