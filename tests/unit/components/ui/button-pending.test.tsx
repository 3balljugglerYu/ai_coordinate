import { fireEvent, render, screen } from "@testing-library/react";

import { Button } from "@/components/ui/button";

/**
 * 処理中のボタンの契約。
 *
 * ⭐ native の `disabled` にはしない。フォーカスされている要素を disabled に
 * するとフォーカスが body に落ち、支援技術の利用者が現在位置を見失う。
 * 代わりに `aria-disabled` + `aria-busy` を付ける。ただし `aria-disabled` は
 * クリックを止めないので、Button 側で止めるところまでが1組。
 */
describe("Button の pending", () => {
  it("native の disabled にはせず aria で伝える", () => {
    render(<Button pending>保存</Button>);

    const btn = screen.getByRole("button", { name: /保存/ });
    // ここが true になるとフォーカスが body に落ちる
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("処理中は押しても発火しない", () => {
    const onClick = jest.fn();
    render(
      <Button pending onClick={onClick}>
        保存
      </Button>,
    );

    fireEvent.click(screen.getByRole("button", { name: /保存/ }));

    // aria-disabled だけでは止まらないので、Button が止める
    expect(onClick).not.toHaveBeenCalled();
  });

  it("処理中でなければ普通に発火する", () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>保存</Button>);

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
  });

  it("処理中は回転を出す", () => {
    const { container } = render(<Button pending>保存</Button>);

    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("disabled と pending は別物として扱う", () => {
    // 「まだ押せる状態になっていない」だけのボタンは回さない
    render(<Button disabled>保存</Button>);

    const btn = screen.getByRole("button", { name: "保存" });
    expect(btn).toBeDisabled();
    expect(btn).not.toHaveAttribute("aria-busy");
    // native disabled と重ねると冗長なので付けない
    expect(btn).not.toHaveAttribute("aria-disabled");
  });

  it("asChild のときは子を増やさない", () => {
    // Slot は子を1つしか受け取れない。回転を差し込むと壊れる
    render(
      <Button asChild pending>
        <a href="/x">リンク</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "リンク" });
    expect(link).toHaveAttribute("aria-busy", "true");
    expect(link.querySelector(".animate-spin")).toBeNull();
  });
});
