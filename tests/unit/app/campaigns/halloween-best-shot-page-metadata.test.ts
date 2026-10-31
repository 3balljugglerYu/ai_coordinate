/** @jest-environment node */

/**
 * ハロウィン企画のページを検索に出す(2026-10-17 ユーザー指示「企画ページの noindex を外してください」)。
 *
 * - noindex を付けない(root layout の index: true をそのまま使う)
 * - 正規の URL(canonical)は企画ページ自身。広告などの目印が付いた URL を別のページと数えさせない
 * - 応募規約のページは今までどおり検索に出さない(halloween-best-shot-terms.test.tsx)
 */

// 見た目と投稿の読み込みはこのテストの関心の外(DB に届かせない)
jest.mock("@/features/campaigns/halloween/components/HalloweenBestShotPage", () => ({
  HalloweenBestShotPage: () => null,
}));
jest.mock("@/features/campaigns/hashtag-campaign/get-submission-pages", () => ({
  getCampaignSubmissionPages: jest.fn(async () => []),
}));

import Page, { metadata } from "@/app/campaigns/halloween-best-shot/page";
import { HalloweenBestShotPage } from "@/features/campaigns/halloween/components/HalloweenBestShotPage";

describe("ハロウィン企画のページは、終わったあとの表示で描く(2026-11-01 ユーザー指示)", () => {
  test("ended を付けて、読んだ対象作品と一緒に渡す", async () => {
    const element = await Page();
    const child = element.props.children;
    expect(child.type).toBe(HalloweenBestShotPage);
    expect(child.props.ended).toBe(true);
    expect(child.props.submissionPages).toEqual([]);
  });
});

describe("ハロウィン企画のページを検索に出す", () => {
  test("noindex を付けない(root layout の index: true をそのまま使う)", () => {
    expect(metadata.robots).toBeUndefined();
  });

  test("正規の URL は企画ページ自身", () => {
    const canonical = metadata.alternates?.canonical;
    expect(typeof canonical).toBe("string");
    expect(canonical as string).toMatch(/(^|\/\/[^/]+)\/campaigns\/halloween-best-shot$/);
  });
});
