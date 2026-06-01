/** @jest-environment jsdom */

// next-intl は ESM-only で Jest の SWC transform に通らないため mock する
// (= 既存 inspire-page-client.test.tsx と同じパターン)
const stableTranslate = (key: string) => key;
jest.mock("next-intl", () => ({
  useTranslations: () => stableTranslate,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

import { render, screen } from "@testing-library/react";
import {
  HomeUserStyleTemplateCarousel,
  type HomeUserStyleTemplateCardData,
} from "@/features/home/components/HomeUserStyleTemplateCarousel";

function renderCarousel(templates: HomeUserStyleTemplateCardData[]) {
  return render(<HomeUserStyleTemplateCarousel templates={templates} />);
}

describe("HomeUserStyleTemplateCarousel — Creator Looks バッジ", () => {
  test("is_creator_looks=true のカードに「Creator Looks」バッジを表示", () => {
    renderCarousel([
      {
        id: "tpl-creator-1",
        alt: "spring formal",
        image_url: "https://example.com/img.webp",
        is_creator_looks: true,
      },
    ]);
    const badges = screen.getAllByText("Creator Looks");
    expect(badges.length).toBeGreaterThan(0);
  });

  test("is_creator_looks=false / 未定義 のカードはバッジを表示しない", () => {
    renderCarousel([
      {
        id: "tpl-inspire-1",
        alt: "regular inspire",
        image_url: "https://example.com/img.webp",
        is_creator_looks: false,
      },
      {
        id: "tpl-inspire-2",
        alt: "regular inspire 2",
        image_url: "https://example.com/img2.webp",
        // is_creator_looks 未定義
      },
    ]);
    expect(screen.queryByText("Creator Looks")).toBeNull();
  });

  test("Creator Looks と既存 Inspire が混在する場合、Creator Looks のみにバッジ", () => {
    renderCarousel([
      {
        id: "tpl-creator",
        alt: "creator looks card",
        image_url: "https://example.com/c.webp",
        is_creator_looks: true,
      },
      {
        id: "tpl-inspire",
        alt: "inspire card",
        image_url: "https://example.com/i.webp",
        is_creator_looks: false,
      },
    ]);
    const badges = screen.getAllByText("Creator Looks");
    expect(badges).toHaveLength(1);
  });

  test("templates が空ならカルーセル全体を render しない", () => {
    const { container } = renderCarousel([]);
    expect(container.firstChild).toBeNull();
  });
});
