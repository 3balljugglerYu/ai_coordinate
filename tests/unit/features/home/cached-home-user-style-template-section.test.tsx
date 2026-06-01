/** @jest-environment node */

jest.mock("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/features/inspire/lib/repository", () => ({
  listVisibleStyleTemplates: jest.fn(),
  createStyleTemplateSignedUrls: jest.fn(),
}));

// Carousel はテストで render しないため何でも良い (= ReactElement.props.templates だけ覗く)
jest.mock("@/features/home/components/HomeUserStyleTemplateCarousel", () => ({
  HomeUserStyleTemplateCarousel: function Carousel() {
    return null;
  },
}));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  listVisibleStyleTemplates,
  createStyleTemplateSignedUrls,
} from "@/features/inspire/lib/repository";
import { CachedHomeUserStyleTemplateSection } from "@/features/home/components/CachedHomeUserStyleTemplateSection";

const mockAdmin = createAdminClient as jest.Mock;
const mockList = listVisibleStyleTemplates as jest.Mock;
const mockSign = createStyleTemplateSignedUrls as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockAdmin.mockReturnValue({});
  mockSign.mockResolvedValue({ urls: [] });
});

function row(id: string, isCreatorLooks: boolean) {
  return {
    id,
    submitted_by_user_id: "u-1",
    alt: `alt ${id}`,
    storage_path: `${id}.webp`,
    moderation_status: "visible",
    moderation_reason: null,
    moderation_updated_at: null,
    moderation_approved_at: null,
    moderation_decided_by: null,
    copyright_consent_at: null,
    preview_openai_image_url: null,
    preview_gemini_image_url: null,
    preview_generated_at: null,
    display_order: 0,
    created_at: "2026-06-03",
    updated_at: "2026-06-03",
    is_creator_looks: isCreatorLooks,
  };
}

function templatesFromNode(
  node: React.ReactElement | null,
): Array<{ id: string; is_creator_looks?: boolean }> {
  if (!node) return [];
  // ReactElement.props.templates を直接覗く (= React は render しない)
  const props = (node as unknown as { props: { templates?: Array<{ id: string; is_creator_looks?: boolean }> } }).props;
  return props.templates ?? [];
}

describe("CachedHomeUserStyleTemplateSection — includeCreatorLooks gating (Phase 8)", () => {
  test("includeCreatorLooks=false (= 一般ユーザー): Creator Looks 投稿を除外", async () => {
    mockList.mockResolvedValue({
      data: [
        row("inspire-1", false),
        row("creator-1", true),
        row("inspire-2", false),
      ],
      error: null,
    });
    const node = await CachedHomeUserStyleTemplateSection({
      includeCreatorLooks: false,
    });
    const templates = templatesFromNode(node);
    expect(templates.map((t) => t.id)).toEqual(["inspire-1", "inspire-2"]);
    expect(templates.every((t) => t.is_creator_looks !== true)).toBe(true);
  });

  test("includeCreatorLooks=true (= admin/allowlist): Creator Looks 投稿も含む", async () => {
    mockList.mockResolvedValue({
      data: [row("inspire-1", false), row("creator-1", true)],
      error: null,
    });
    const node = await CachedHomeUserStyleTemplateSection({
      includeCreatorLooks: true,
    });
    const templates = templatesFromNode(node);
    expect(templates.map((t) => t.id)).toEqual(["inspire-1", "creator-1"]);
    const cl = templates.find((t) => t.id === "creator-1");
    expect(cl?.is_creator_looks).toBe(true);
  });

  test("includeCreatorLooks 未指定 (= デフォルト false) でも Creator Looks 投稿は除外", async () => {
    mockList.mockResolvedValue({
      data: [row("creator-only", true)],
      error: null,
    });
    const node = await CachedHomeUserStyleTemplateSection();
    // Creator Looks 投稿しかなく、フィルタ後 0 件なので null を返す
    expect(node).toBeNull();
  });

  test("error / data 空のとき null", async () => {
    mockList.mockResolvedValue({ data: [], error: null });
    const node = await CachedHomeUserStyleTemplateSection({
      includeCreatorLooks: false,
    });
    expect(node).toBeNull();
  });
});
