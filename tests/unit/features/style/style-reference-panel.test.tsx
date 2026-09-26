import { render, screen, fireEvent } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { StyleReferencePanel } from "@/features/style/components/StyleReferencePanel";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: {
    alt?: string;
    src?: string;
    className?: string;
    onLoad?: () => void;
    onError?: () => void;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={props.src ?? ""}
      alt={props.alt ?? ""}
      className={props.className}
      onLoad={props.onLoad}
      onError={props.onError}
      data-testid="ref-image"
    />
  ),
}));

const T: Record<string, string> = {
  styleImageZoomAria: "スタイル画像を拡大表示",
};

beforeEach(() => {
  (useTranslations as jest.Mock).mockReturnValue((key: string) => T[key] ?? key);
});

function renderPanel() {
  return render(
    <StyleReferencePanel
      label="Style"
      imageSrc="https://example.com/style.webp"
      imageAlt="選択中のスタイル画像"
      aspectRatio={1.5}
    />,
  );
}

describe("StyleReferencePanel", () => {
  test("ズームボタン(aria-label)が描画され、初期状態ではライトボックス(dialog)は無い", () => {
    renderPanel();
    expect(
      screen.getByRole("button", { name: "スタイル画像を拡大表示" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("ズームボタンをクリックすると全画面ライトボックス(dialog)が開く", () => {
    renderPanel();
    fireEvent.click(
      screen.getByRole("button", { name: "スタイル画像を拡大表示" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // ライトボックス内にスタイル画像(意味のある alt)が入っている
    const dialogImg = dialog.querySelector('img[alt="選択中のスタイル画像"]');
    expect(dialogImg).not.toBeNull();
  });

  test("拡大表示(ライトボックス)にも providerOverlay(提供者クレジット)を表示する", () => {
    render(
      <StyleReferencePanel
        label="Style"
        imageSrc="https://example.com/style.webp"
        imageAlt="選択中のスタイル画像"
        aspectRatio={1.5}
        providerOverlay={<span>提供 氷洞つらら</span>}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "スタイル画像を拡大表示" }),
    );
    const dialog = screen.getByRole("dialog");
    // インライン側と拡大側の両方に描画される(計2箇所)。
    expect(screen.getAllByText("提供 氷洞つらら")).toHaveLength(2);
    expect(dialog.textContent).toContain("提供 氷洞つらら");
  });

  test("インライン画像のボタンは aria-label を持ち、内側 Image は装飾(alt空)", () => {
    renderPanel();
    const btn = screen.getByRole("button", {
      name: "スタイル画像を拡大表示",
    });
    // ボタン内の Image は alt="" (二重読み上げ防止)
    const innerImg = btn.querySelector("img");
    expect(innerImg).not.toBeNull();
    expect(innerImg?.getAttribute("alt")).toBe("");
  });

  /*
    /styles の生成シートは開いた瞬間にこの画像を読み始めるので、読み込むまで
    スケルトンを出す(showLoadingSkeleton)。/style では出さない(既定)。
  */
  describe("読み込み中のスケルトン", () => {
    const inlineImage = () =>
      screen
        .getByRole("button", { name: "スタイル画像を拡大表示" })
        .querySelector("img") as HTMLImageElement;

    test("既定では出さない", () => {
      renderPanel();

      expect(screen.queryByTestId("style-reference-skeleton")).toBeNull();
    });

    test("showLoadingSkeleton では読み込むまで出し、読み込んだら消す", () => {
      render(
        <StyleReferencePanel
          label="Style"
          imageSrc="https://example.com/style.webp"
          imageAlt="選択中のスタイル画像"
          aspectRatio={1.5}
          showLoadingSkeleton
        />,
      );

      expect(screen.getByTestId("style-reference-skeleton")).toBeTruthy();
      expect(inlineImage().className).toContain("opacity-0");

      fireEvent.load(inlineImage());

      expect(screen.queryByTestId("style-reference-skeleton")).toBeNull();
      expect(inlineImage().className).toContain("opacity-100");
    });

    test("読み込みに失敗してもスケルトンを残さない", () => {
      render(
        <StyleReferencePanel
          label="Style"
          imageSrc="https://example.com/broken.webp"
          imageAlt="選択中のスタイル画像"
          showLoadingSkeleton
        />,
      );

      fireEvent.error(inlineImage());

      expect(screen.queryByTestId("style-reference-skeleton")).toBeNull();
    });

    test("画像が変わったら、新しい画像を読み込むまでまた出す", () => {
      const { rerender } = render(
        <StyleReferencePanel
          label="Style"
          imageSrc="https://example.com/a.webp"
          imageAlt="選択中のスタイル画像"
          showLoadingSkeleton
        />,
      );
      fireEvent.load(inlineImage());
      expect(screen.queryByTestId("style-reference-skeleton")).toBeNull();

      rerender(
        <StyleReferencePanel
          label="Style"
          imageSrc="https://example.com/b.webp"
          imageAlt="選択中のスタイル画像"
          showLoadingSkeleton
        />,
      );

      expect(screen.getByTestId("style-reference-skeleton")).toBeTruthy();
    });
  });
});
