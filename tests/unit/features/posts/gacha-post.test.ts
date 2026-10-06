import { isGachaPost } from "@/features/posts/lib/gacha-post";

describe("isGachaPost", () => {
  test("何番が出たかの記録(gachaPicks)があればガチャで作った投稿", () => {
    expect(isGachaPost({ generation_metadata: { gachaPicks: [{ number: 1, total: 3 }] } })).toBe(true);
  });

  test.each([
    ["記録が無い", { generation_metadata: { geminiAttempts: [] } }],
    ["空の記録", { generation_metadata: { gachaPicks: [] } }],
    ["配列でない", { generation_metadata: { gachaPicks: "1" } }],
    ["metadata が null", { generation_metadata: null }],
    ["metadata が無い", {}],
  ])("%s ときはガチャではない", (_, post) => {
    expect(isGachaPost(post)).toBe(false);
  });
});
