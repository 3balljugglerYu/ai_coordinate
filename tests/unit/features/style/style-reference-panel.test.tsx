import { render, screen, fireEvent } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { StyleReferencePanel } from "@/features/style/components/StyleReferencePanel";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { alt?: string; src?: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={props.src ?? ""}
      alt={props.alt ?? ""}
      className={props.className}
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
});
