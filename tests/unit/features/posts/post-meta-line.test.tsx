import { render, screen } from "@testing-library/react";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(() => (key: string) => {
    const messages: Record<string, string> = {
      metaModelLabel: "生成モデル",
      metaSizeLabel: "サイズ",
    };
    return messages[key] ?? key;
  }),
}));

import { PostMetaLine } from "@/features/posts/components/PostMetaLine";

describe("PostMetaLine", () => {
  it("renders brand name and dimensions when both model and width/height are present", () => {
    render(<PostMetaLine model="gpt-image-2-low" width={1024} height={1536} />);
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
});
