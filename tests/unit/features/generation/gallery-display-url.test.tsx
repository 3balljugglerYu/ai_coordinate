import { render, screen } from "@testing-library/react";

import { GeneratedImageGallery } from "@/features/generation/components/GeneratedImageGallery";
import type { GeneratedImageData } from "@/features/generation/types";

/**
 * 一覧は原本(PNG・平均 約1.9MB)ではなく表示用 WebP(長辺1280px・平均 約137kB)を出す。
 *
 * ⭐ `url` はダウンロード(`features/generation/lib/download-image.ts`)が読むので、
 * 表示用に差し替えてはいけない。表示だけ `displayUrl` に切り替える。
 *
 * ⭐ URL は投稿フォーム(`getPostDisplayUrl`)・拡大表示とそろえてある。同じ URL に
 * することで、画面をまたいでもブラウザが落とし直さない。ここが崩れると
 * 投稿フォームを開くたびに画像を取り直して表示が遅れる。
 */
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// lightbox は ESM のまま配布されていて jest が読めない。拡大表示はこのテストの
// 対象ではないので差し替える。
jest.mock("@/features/generation/components/ImageModal", () => ({
  ImageModal: () => null,
}));

const ORIGINAL = "https://example.test/storage/abc.png";
const DISPLAY = "https://example.test/storage/abc_display.webp";

function buildImage(overrides: Partial<GeneratedImageData> = {}): GeneratedImageData {
  return {
    id: "image-1",
    url: ORIGINAL,
    is_posted: false,
    ...overrides,
  } as GeneratedImageData;
}

function renderGallery(image: GeneratedImageData) {
  return render(
    <GeneratedImageGallery
      images={[image]}
      isGenerating={false}
      generatingCount={0}
    />,
  );
}

describe("一覧が出す画像", () => {
  it("表示用 WebP があればそちらを出す（原本は出さない）", () => {
    renderGallery(buildImage({ displayUrl: DISPLAY }));

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", DISPLAY);
  });

  it("表示用 WebP が無い行では原本へ落とす", () => {
    // WebP 化の前に作られた古い行と、生成直後でまだ変換が終わっていない行がある
    renderGallery(buildImage({ displayUrl: null }));

    expect(screen.getByRole("img")).toHaveAttribute("src", ORIGINAL);
  });

  it("遅延読み込みにしない", () => {
    // next/image を通すと既定が loading="lazy" になり表示が遅れる
    renderGallery(buildImage({ displayUrl: DISPLAY }));

    expect(screen.getByRole("img")).not.toHaveAttribute("loading", "lazy");
  });
});
