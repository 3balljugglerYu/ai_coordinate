import { render, screen } from "@testing-library/react";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(() => (key: string) => {
    const messages: Record<string, string> = {
      metaModelLabel: "生成モデル",
      metaModeLabel: "生成モード",
      metaSizeLabel: "サイズ",
      modeCoordinate: "Coordinate",
      modeOneTapStyle: "One-Tap Style",
      modeInspire: "Creator Style",
      modeFree: "Free Style",
    };
    return messages[key] ?? key;
  }),
}));

import { PostMetaLine } from "@/features/posts/components/PostMetaLine";

describe("PostMetaLine", () => {
  it("renders brand name and dimensions when both model and width/height are present", () => {
    render(<PostMetaLine model="gpt-image-2-low-1k" width={1024} height={1536} />);
    const node = screen.getByTestId("post-meta-line");
    expect(node.textContent).toBe("ChatGPT Images 2.0 / 1024×1536");
    expect(node.getAttribute("aria-label")).toBe(
      "生成モデル: ChatGPT Images 2.0, サイズ: 1024×1536",
    );
  });

  it("renders brand name only when width or height is missing", () => {
    const { rerender } = render(
      <PostMetaLine model="gemini-3-pro-image-2k" width={null} height={null} />,
    );
    let node = screen.getByTestId("post-meta-line");
    expect(node.textContent).toBe("Nano Banana Pro");
    expect(node.getAttribute("aria-label")).toBe(
      "生成モデル: Nano Banana Pro",
    );

    // 片方だけ揃っているケースも brand only に丸める
    rerender(
      <PostMetaLine model="gemini-3-pro-image-2k" width={1024} height={null} />,
    );
    node = screen.getByTestId("post-meta-line");
    expect(node.textContent).toBe("Nano Banana Pro");
  });

  it("renders nothing when the model is unknown / null / empty", () => {
    const { rerender, container } = render(
      <PostMetaLine model={null} width={1024} height={1024} />,
    );
    expect(container.firstChild).toBeNull();

    rerender(<PostMetaLine model="" width={1024} height={1024} />);
    expect(container.firstChild).toBeNull();

    rerender(<PostMetaLine model="dall-e-3" width={1024} height={1024} />);
    expect(container.firstChild).toBeNull();
  });

  it("ignores non-positive dimensions", () => {
    render(
      <PostMetaLine model="gemini-2.5-flash-image" width={0} height={1024} />,
    );
    const node = screen.getByTestId("post-meta-line");
    expect(node.textContent).toBe("Nano Banana 2");
  });

  it("prepends the generation mode label before the model / size", () => {
    render(
      <PostMetaLine
        model="gpt-image-2-low-1k"
        width={1024}
        height={1536}
        generationType="free"
      />,
    );
    const node = screen.getByTestId("post-meta-line");
    expect(node.textContent).toBe("Free Style ・ ChatGPT Images 2.0 / 1024×1536");
    expect(node.getAttribute("aria-label")).toBe(
      "生成モード: Free Style, 生成モデル: ChatGPT Images 2.0, サイズ: 1024×1536",
    );
  });

  it("shows the mode label even when the model is unknown", () => {
    render(
      <PostMetaLine
        model={null}
        width={null}
        height={null}
        generationType="coordinate"
      />,
    );
    const node = screen.getByTestId("post-meta-line");
    expect(node.textContent).toBe("Coordinate");
    expect(node.getAttribute("aria-label")).toBe("生成モード: Coordinate");
  });

  it("collapses coordinate-family types into a single Coordinate label", () => {
    for (const type of [
      "specified_coordinate",
      "full_body",
      "chibi",
    ] as const) {
      const { unmount } = render(
        <PostMetaLine
          model={null}
          width={null}
          height={null}
          generationType={type}
        />,
      );
      expect(screen.getByTestId("post-meta-line").textContent).toBe(
        "Coordinate",
      );
      unmount();
    }
  });

  it("maps one_tap_style and inspire to their own labels", () => {
    const { rerender } = render(
      <PostMetaLine
        model={null}
        width={null}
        height={null}
        generationType="one_tap_style"
      />,
    );
    expect(screen.getByTestId("post-meta-line").textContent).toBe(
      "One-Tap Style",
    );

    rerender(
      <PostMetaLine
        model={null}
        width={null}
        height={null}
        generationType="inspire"
      />,
    );
    expect(screen.getByTestId("post-meta-line").textContent).toBe(
      "Creator Style",
    );
  });

  it("renders nothing when both the mode and the model are unknown", () => {
    const { container } = render(
      <PostMetaLine
        model={null}
        width={1024}
        height={1024}
        generationType={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
