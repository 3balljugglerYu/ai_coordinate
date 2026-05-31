/** @jest-environment jsdom */

import { render, screen, fireEvent } from "@testing-library/react";
import { PromptInputField } from "@/features/generation/components/PromptInputField";

describe("PromptInputField", () => {
  test("label / textarea / placeholder を描画する", () => {
    render(
      <PromptInputField
        value=""
        onChange={() => {}}
        label="ラベル"
        placeholder="入力例"
      />,
    );
    expect(screen.getByText("ラベル")).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText("入力例");
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  test("ユーザー入力で onChange が呼ばれる", () => {
    const onChange = jest.fn();
    render(<PromptInputField value="" onChange={onChange} label="L" />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("abc");
  });

  test("clearLabel 指定時にクリアボタンが出て、押すと onChange('') が呼ばれる", () => {
    const onChange = jest.fn();
    render(
      <PromptInputField
        value="something"
        onChange={onChange}
        label="L"
        clearLabel="クリア"
      />,
    );
    const clearBtn = screen.getByRole("button", { name: "クリア" });
    expect(clearBtn).not.toBeDisabled();
    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith("");
  });

  test("clearLabel 指定でも value が空ならクリアボタンは disabled", () => {
    render(
      <PromptInputField
        value=""
        onChange={() => {}}
        label="L"
        clearLabel="クリア"
      />,
    );
    const clearBtn = screen.getByRole("button", { name: "クリア" });
    expect(clearBtn).toBeDisabled();
  });

  test("clearLabel 指定なしならクリアボタンは描画されない", () => {
    render(<PromptInputField value="x" onChange={() => {}} label="L" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("hint / characterCount を渡すと表示される", () => {
    render(
      <PromptInputField
        value="ab"
        onChange={() => {}}
        label="L"
        hint="ヒント文"
        characterCount="2/1500"
      />,
    );
    expect(screen.getByText("ヒント文")).toBeInTheDocument();
    expect(screen.getByText("2/1500")).toBeInTheDocument();
  });

  test("maxLength が textarea に反映される", () => {
    render(
      <PromptInputField
        value=""
        onChange={() => {}}
        label="L"
        maxLength={120}
      />,
    );
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveAttribute("maxLength", "120");
  });

  test("disabled=true で textarea とクリアボタン両方が disabled", () => {
    render(
      <PromptInputField
        value="x"
        onChange={() => {}}
        label="L"
        clearLabel="クリア"
        disabled
      />,
    );
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "クリア" })).toBeDisabled();
  });

  test("invalid=true のとき aria-invalid が true", () => {
    render(
      <PromptInputField value="x" onChange={() => {}} label="L" invalid />,
    );
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  test("value が maxLength を超えると aria-invalid が自動で true (= 上限到達検知)", () => {
    render(
      <PromptInputField
        value="abcdefg"
        onChange={() => {}}
        label="L"
        maxLength={3}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  test("id prop が textarea に反映される (label の htmlFor 対応)", () => {
    render(
      <PromptInputField
        value=""
        onChange={() => {}}
        label="L"
        id="my-prompt"
      />,
    );
    expect(screen.getByRole("textbox")).toHaveAttribute("id", "my-prompt");
  });

  test("containerProps で data-tour 等の属性をラッパー div に渡せる", () => {
    const { container } = render(
      <PromptInputField
        value=""
        onChange={() => {}}
        label="L"
        containerProps={{ "data-tour": "tour-foo" }}
      />,
    );
    const wrapper = container.querySelector('[data-tour="tour-foo"]');
    expect(wrapper).not.toBeNull();
  });
});
