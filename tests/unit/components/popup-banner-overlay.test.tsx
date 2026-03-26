import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PopupBannerOverlay } from "@/features/popup-banners/components/PopupBannerOverlay";
import { usePopupBanner } from "@/features/popup-banners/hooks/usePopupBanner";
import type { ActivePopupBanner } from "@/features/popup-banners/lib/schema";

const mockPopupBannerTranslations = {
  close: "閉じる",
  dialogTitle: "お知らせ",
  dialogDescription: "ポップアップバナー",
  dismissForever: "次回から表示しない",
  imageAltFallback: "お知らせバナー",
};

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { src: string }) => {
    const { alt, src, ...rest } = props;
    delete (rest as Record<string, unknown>).fill;
    delete (rest as Record<string, unknown>).priority;
    delete (rest as Record<string, unknown>).sizes;

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt={alt} src={src} {...rest} />
    );
  },
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("next-intl", () => {
  return {
    useTranslations: () => (key: string) =>
      mockPopupBannerTranslations[
        key as keyof typeof mockPopupBannerTranslations
      ] ?? key,
  };
});

jest.mock("@/features/popup-banners/hooks/usePopupBanner", () => ({
  usePopupBanner: jest.fn(),
}));

const usePopupBannerMock = usePopupBanner as jest.MockedFunction<
  typeof usePopupBanner
>;

function createBanner(
  overrides: Partial<ActivePopupBanner> = {}
): ActivePopupBanner {
  return {
    id: "banner-1",
    imageUrl: "https://cdn.example/banner.webp",
    linkUrl: "https://example.com/campaign",
    alt: "campaign banner",
    showOnceOnly: true,
    displayOrder: 1,
    ...overrides,
  };
}

class MockPreloadImage {
  static instances: MockPreloadImage[] = [];

  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  complete = false;
  private currentSrc = "";

  constructor() {
    MockPreloadImage.instances.push(this);
  }

  set src(value: string) {
    this.currentSrc = value;
  }

  get src() {
    return this.currentSrc;
  }

  triggerLoad() {
    this.complete = true;
    this.onload?.();
  }
}

function triggerLatestImageLoad() {
  const instance =
    MockPreloadImage.instances[MockPreloadImage.instances.length - 1];
  if (!instance) {
    throw new Error("preload image instance not found");
  }

  act(() => {
    instance.triggerLoad();
  });
}

describe("PopupBannerOverlay", () => {
  const originalImage = window.Image;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  let clickBannerMock: jest.Mock;
  let closeBannerMock: jest.Mock;
  let markBannerDisplayedMock: jest.Mock;

  beforeAll(() => {
    Object.defineProperty(window, "Image", {
      writable: true,
      configurable: true,
      value: MockPreloadImage,
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      writable: true,
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(window, "Image", {
      writable: true,
      configurable: true,
      value: originalImage,
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      writable: true,
      configurable: true,
      value: originalRequestAnimationFrame,
    });
  });

  beforeEach(() => {
    MockPreloadImage.instances = [];
    jest.clearAllMocks();
    clickBannerMock = jest.fn();
    closeBannerMock = jest.fn();
    markBannerDisplayedMock = jest.fn();

    usePopupBannerMock.mockReturnValue({
      currentBanner: createBanner(),
      isReady: true,
      clickBanner: clickBannerMock,
      closeBanner: closeBannerMock,
      markBannerDisplayed: markBannerDisplayedMock,
    });
  });

  test("PopupBannerOverlay_preload完了前は内容を表示せずdisplayed記録もしない", () => {
    // Spec: PBO-001
    render(<PopupBannerOverlay banners={[createBanner()]} />);

    expect(screen.queryByRole("img", { name: "campaign banner" })).toBeNull();
    expect(markBannerDisplayedMock).not.toHaveBeenCalled();
  });

  test("PopupBannerOverlay_preload完了後は内容を表示しmarkBannerDisplayedを呼ぶ", async () => {
    // Spec: PBO-002
    render(<PopupBannerOverlay banners={[createBanner()]} />);

    triggerLatestImageLoad();

    expect(await screen.findByRole("img", { name: "campaign banner" })).toBeVisible();
    expect(markBannerDisplayedMock).toHaveBeenCalledWith("banner-1");
  });

  test("PopupBannerOverlay_https外部リンクは新規タブanchorで包みclick時にclickBannerを呼ぶ", async () => {
    // Spec: PBO-003
    render(<PopupBannerOverlay banners={[createBanner()]} />);

    triggerLatestImageLoad();

    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com/campaign");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    fireEvent.click(link);
    expect(clickBannerMock).toHaveBeenCalledTimes(1);
  });

  test("PopupBannerOverlay_unsafeリンクはanchorをrenderしない", async () => {
    // Spec: PBO-004
    usePopupBannerMock.mockReturnValue({
      currentBanner: createBanner({
        linkUrl: "javascript:alert('xss')",
      }),
      isReady: true,
      clickBanner: clickBannerMock,
      closeBanner: closeBannerMock,
      markBannerDisplayed: markBannerDisplayedMock,
    });

    render(
      <PopupBannerOverlay
        banners={[createBanner({ linkUrl: "javascript:alert('xss')" })]}
      />
    );

    triggerLatestImageLoad();

    await screen.findByRole("img", { name: "campaign banner" });
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("PopupBannerOverlay_showOnceOnly時はcheckboxを表示しclose時にdismissForeverを反映する", async () => {
    // Spec: PBO-005
    render(<PopupBannerOverlay banners={[createBanner({ showOnceOnly: true })]} />);

    triggerLatestImageLoad();

    const checkbox = await screen.findByRole("checkbox", {
      name: "次回から表示しない",
    });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    await waitFor(() => {
      expect(closeBannerMock).toHaveBeenCalledWith(true);
    });
  });

  test("PopupBannerOverlay_showOnceOnlyがfalseならcheckboxを出さず通常closeする", async () => {
    // Spec: PBO-006
    usePopupBannerMock.mockReturnValue({
      currentBanner: createBanner({
        showOnceOnly: false,
        linkUrl: null,
      }),
      isReady: true,
      clickBanner: clickBannerMock,
      closeBanner: closeBannerMock,
      markBannerDisplayed: markBannerDisplayedMock,
    });

    render(
      <PopupBannerOverlay
        banners={[createBanner({ showOnceOnly: false, linkUrl: null })]}
      />
    );

    triggerLatestImageLoad();

    await screen.findByRole("img", { name: "campaign banner" });
    expect(
      screen.queryByRole("checkbox", { name: "次回から表示しない" })
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    await waitFor(() => {
      expect(closeBannerMock).toHaveBeenCalledWith(false);
    });
  });
});
