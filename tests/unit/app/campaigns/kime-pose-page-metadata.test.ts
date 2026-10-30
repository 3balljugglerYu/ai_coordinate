/** @jest-environment node */

/**
 * 決めポーズ企画のページは検索に出す(ハロウィン企画と同じ)。
 * 正規の URL(canonical)は企画ページ自身。広告などの目印が付いた URL を別のページと数えさせない。
 */

// 見た目と投稿の読み込みはこのテストの関心の外(DB に届かせない)
jest.mock("@/features/campaigns/kime-pose/components/KimePosePage", () => ({
  KimePosePage: () => null,
}));
jest.mock("@/features/campaigns/hashtag-campaign/get-submission-pages", () => ({
  getCampaignSubmissionPages: jest.fn(async () => []),
}));

import { metadata } from "@/app/campaigns/kime-pose/page";

describe("決めポーズ企画のページを検索に出す", () => {
  test("noindex を付けない(root layout の index: true をそのまま使う)", () => {
    expect(metadata.robots).toBeUndefined();
  });

  test("正規の URL は企画ページ自身", () => {
    const canonical = metadata.alternates?.canonical;
    expect(typeof canonical).toBe("string");
    expect(canonical as string).toMatch(/(^|\/\/[^/]+)\/campaigns\/kime-pose$/);
  });
});
