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

  test("既定はラベル行がスマホで縦積み(flex-col)", () => {
    render(
      <PromptInputField
        value=""
        onChange={() => {}}
        label="ラベル"
        clearLabel="クリア"
      />,
    );
    const row = screen.getByText("ラベル").parentElement;
    expect(row?.className).toContain("flex-col");
  });

  test("labelRowSingleLine=true でラベル行を常に 1 行(flex-row・縦積みなし)にする", () => {
    render(
      <PromptInputField
        value=""
        onChange={() => {}}
        label="生成したい内容"
        clearLabel="クリア"
        labelRowSingleLine
      />,
    );
    const row = screen.getByText("生成したい内容").parentElement;
    expect(row?.className).toContain("flex-row");
    expect(row?.className).not.toContain("flex-col");
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


  test("高さに上限を持ち、超えたぶんは欄の中でスクロールする", () => {
    /*
      長いプロンプトで入力欄がページを埋め尽くし、文字数・クリア・生成ボタンが
      画面外へ出ていた。畳んで隠すのではなく、上限で止めて中をスクロールさせる。
    */
    render(
      <PromptInputField value={"行\n".repeat(40)} onChange={() => {}} label="L" />
    );

    const textarea = screen.getByRole("textbox");
    expect(textarea.className).toContain("max-h-[min(32.5rem,55vh)]");
    expect(textarea.className).toContain("overflow-y-auto");
  });

  test("長い値でも文字は削らずそのまま保持する", () => {
    const value = "あ".repeat(3000);
    render(<PromptInputField value={value} onChange={() => {}} label="L" maxLength={5000} />);

    expect(screen.getByRole("textbox")).toHaveValue(value);
  });


  test("下にまだ続くときは、続きがあることを示すぼかしを出す", () => {
    /*
      iOS はスクロール中しかバーを出さないため、上限で止まった欄が
      「そこで終わっている」ように見える。下端のぼかしが唯一の手掛かりになる。
    */
    render(<PromptInputField value={"行\n".repeat(40)} onChange={() => {}} label="L" />);

    const textarea = screen.getByRole("textbox");
    // jsdom は高さを持たないので、スクロール可能な状態を作って再計算させる
    Object.defineProperty(textarea, "scrollHeight", { value: 800, configurable: true });
    Object.defineProperty(textarea, "clientHeight", { value: 300, configurable: true });
    fireEvent.scroll(textarea, { target: { scrollTop: 0 } });

    expect(screen.getByTestId("prompt-scroll-hint")).toBeInTheDocument();
  });

  test("最後まで見えているときはぼかしを出さない", () => {
    render(<PromptInputField value="短い" onChange={() => {}} label="L" />);

    expect(screen.queryByTestId("prompt-scroll-hint")).not.toBeInTheDocument();
  });

  test("末尾までスクロールしたらぼかしを消す", () => {
    render(<PromptInputField value={"行\n".repeat(40)} onChange={() => {}} label="L" />);

    const textarea = screen.getByRole("textbox");
    Object.defineProperty(textarea, "scrollHeight", { value: 800, configurable: true });
    Object.defineProperty(textarea, "clientHeight", { value: 300, configurable: true });
    fireEvent.scroll(textarea, { target: { scrollTop: 0 } });
    expect(screen.getByTestId("prompt-scroll-hint")).toBeInTheDocument();

    Object.defineProperty(textarea, "scrollTop", { value: 500, configurable: true });
    fireEvent.scroll(textarea);

    expect(screen.queryByTestId("prompt-scroll-hint")).not.toBeInTheDocument();
  });


  test("スクロールできるときは位置を示すつまみを自前で描く", () => {
    /*
      iOS Safari は scrollbar-width などの指定を無視し、標準のバーも
      スクロール中しか出さない。常時見せるには自分で描くしかない。
    */
    render(<PromptInputField value={"行\n".repeat(40)} onChange={() => {}} label="L" />);

    const textarea = screen.getByRole("textbox");
    Object.defineProperty(textarea, "scrollHeight", { value: 900, configurable: true });
    Object.defineProperty(textarea, "clientHeight", { value: 300, configurable: true });
    fireEvent.scroll(textarea, { target: { scrollTop: 0 } });

    const thumb = screen.getByTestId("prompt-scroll-thumb");
    expect(thumb).toBeInTheDocument();
    // 全体の1/3が見えている → つまみは高さの約1/3
    expect(thumb).toHaveStyle({ height: "100px" });
  });

  test("スクロールするとつまみが下へ動く", () => {
    render(<PromptInputField value={"行\n".repeat(40)} onChange={() => {}} label="L" />);

    const textarea = screen.getByRole("textbox");
    Object.defineProperty(textarea, "scrollHeight", { value: 900, configurable: true });
    Object.defineProperty(textarea, "clientHeight", { value: 300, configurable: true });
    fireEvent.scroll(textarea, { target: { scrollTop: 0 } });
    const initialTop = screen.getByTestId("prompt-scroll-thumb").style.top;

    Object.defineProperty(textarea, "scrollTop", { value: 600, configurable: true });
    fireEvent.scroll(textarea);

    const movedTop = screen.getByTestId("prompt-scroll-thumb").style.top;
    expect(parseFloat(movedTop)).toBeGreaterThan(parseFloat(initialTop));
  });

  test("スクロール不要な短さならつまみを出さない", () => {
    render(<PromptInputField value="短い" onChange={() => {}} label="L" />);

    expect(screen.queryByTestId("prompt-scroll-thumb")).not.toBeInTheDocument();
  });
});
