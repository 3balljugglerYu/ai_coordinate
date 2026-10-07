/**
 * @jest-environment jsdom
 *
 * 名前の入力欄: 上限(8文字)を超えた分を、打った時点で赤くする(2026-10-07 ユーザー指示)。
 */
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { NameTextInput } from "@/features/generation/components/NameTextInput";

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <NameTextInput aria-label="name" value={value} onValueChange={setValue} />;
}

const input = () => screen.getByLabelText("name") as HTMLInputElement;

describe("NameTextInput", () => {
  test("8文字までは重ねた文を出さず、文字はそのまま見せる", () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "ぺるこぺるこぺる" } });
    expect(screen.queryByTestId("name-text-overflow")).toBeNull();
    expect(input().className).not.toContain("text-transparent");
  });

  test("9文字目からを赤く重ねて見せる(見た目の1文字で数える)", () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "ぺるこぺるこぺる😺あ" } });
    expect(input().className).toContain("text-transparent");
    expect(screen.getByTestId("name-text-overflow").firstElementChild?.textContent).toBe("ぺるこぺるこぺる");
    expect(screen.getByTestId("name-text-overflow-excess").textContent).toBe("😺あ");
  });

  test("消して8文字に戻すと、赤い文は消える", () => {
    render(<Harness initial="123456789" />);
    expect(screen.getByTestId("name-text-overflow-excess").textContent).toBe("9");
    fireEvent.change(input(), { target: { value: "12345678" } });
    expect(screen.queryByTestId("name-text-overflow")).toBeNull();
  });
});
