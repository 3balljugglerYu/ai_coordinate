/** @jest-environment node */

import { resolveStylePresetProvider } from "@/features/style-presets/lib/schema";

describe("resolveStylePresetProvider", () => {
  test("プリセット単位の provider を優先する", () => {
    expect(
      resolveStylePresetProvider({
        providerUserId: "preset-user",
        providerNickname: "mario",
        providerAvatarUrl: "https://example.com/m.png",
        category: {
          providerUserId: "cat-user",
          providerNickname: "someone",
          providerAvatarUrl: "https://example.com/c.png",
        },
      }),
    ).toEqual({
      userId: "preset-user",
      nickname: "mario",
      avatarUrl: "https://example.com/m.png",
    });
  });

  test("プリセット未設定ならカテゴリ単位にフォールバック", () => {
    expect(
      resolveStylePresetProvider({
        providerUserId: null,
        providerNickname: null,
        category: {
          providerUserId: "cat-user",
          providerNickname: "someone",
          providerAvatarUrl: null,
        },
      }),
    ).toEqual({ userId: "cat-user", nickname: "someone", avatarUrl: null });
  });

  test("どちらも無ければ null", () => {
    expect(
      resolveStylePresetProvider({ category: { providerUserId: null } }),
    ).toBeNull();
    expect(resolveStylePresetProvider({})).toBeNull();
  });

  test("null / undefined を渡しても安全に null を返す", () => {
    expect(resolveStylePresetProvider(null)).toBeNull();
    expect(resolveStylePresetProvider(undefined)).toBeNull();
  });

  test("userId はあるが nickname が無い場合はカテゴリへフォールバック", () => {
    // プリセットは userId のみ(nickname 欠落)→ 表示できないのでカテゴリへ
    expect(
      resolveStylePresetProvider({
        providerUserId: "preset-user",
        providerNickname: null,
        category: {
          providerUserId: "cat-user",
          providerNickname: "someone",
          providerAvatarUrl: null,
        },
      }),
    ).toEqual({ userId: "cat-user", nickname: "someone", avatarUrl: null });
  });

  test("nickname のみ(userId なし)でも表示対象になり userId は null", () => {
    // 旧カテゴリクレジット(nickname のみ)互換: カードは nickname だけで表示できる
    expect(
      resolveStylePresetProvider({
        category: { providerNickname: "mario335599", providerAvatarUrl: null },
      }),
    ).toEqual({ userId: null, nickname: "mario335599", avatarUrl: null });
  });
});
