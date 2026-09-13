import { fireEvent, render, screen } from "@testing-library/react";

import { StylePresetForm } from "@/app/(app)/admin/style-presets/StylePresetForm";

/**
 * 入力欄をタップしたら、その欄をラベルごと画面の上端へ寄せる。
 *
 * iOS ではキーボードの表示タイミングを制御できないため、フォーカスと同時に
 * アニメーションなしでスクロールを終わらせ、あとから上がってくるキーボードより
 * 先に位置を確定させている。`behavior: "instant"` を落とすと globals.css の
 * `scroll-behavior: smooth` に引きずられてキーボードと競走するので、
 * 指定ごと固定する。
 */
jest.mock("next/image", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

function renderForm(headerTitle?: string) {
  return render(
    <StylePresetForm
      categories={[]}
      creators={[]}
      onSuccess={() => {}}
      onCancel={() => {}}
      headerTitle={headerTitle}
    />,
  );
}

describe("StylePresetForm のフォーカス時スクロール", () => {
  const fields = [
    ["タイトル", "title"],
    ["Styling Prompt", "styling_prompt"],
    ["Background Prompt", "background_prompt"],
  ] as const;

  it.each(fields)("%s にフォーカスすると欄をラベルごと上端へ寄せる", (_label, id) => {
    renderForm();
    const field = document.getElementById(id);
    expect(field).not.toBeNull();

    const group = field?.closest("[data-field-group]");
    expect(group).not.toBeNull();

    const scrollIntoView = jest.fn();
    (group as HTMLElement).scrollIntoView = scrollIntoView;

    fireEvent.focus(field as HTMLElement);

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "instant",
    });
  });

  it("headerTitle を渡すと保存を上部バーに出し、最下部のキャンセルは出さない", () => {
    renderForm("スタイルを追加");

    expect(screen.getByText("スタイルを追加")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "閉じる" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /保存/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "キャンセル" }),
    ).not.toBeInTheDocument();
  });

  it("headerTitle が無ければ従来どおり最下部に保存とキャンセルを出す", () => {
    renderForm();

    expect(screen.getByRole("button", { name: "キャンセル" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "閉じる" }),
    ).not.toBeInTheDocument();
  });
});
