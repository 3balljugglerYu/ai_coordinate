/**
 * @jest-environment jsdom
 */

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PickerImageTile } from "@/features/generation/components/ImageSourcePicker/PickerImageTile";

describe("PickerImageTile", () => {
  test("クリックで onSelect が発火する", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(
      <PickerImageTile
        imageUrl="https://cdn.example/x.jpg"
        alt="alt"
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByRole("button", { name: "selectImageAria" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test("selected=true で aria-pressed=true", () => {
    render(
      <PickerImageTile
        imageUrl="https://cdn.example/x.jpg"
        alt="alt"
        onSelect={() => {}}
        selected
      />,
    );
    expect(
      screen.getByRole("button", { name: "selectImageAria" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("onDelete が渡されると削除ボタンが描画され、stopPropagation で onSelect は呼ばれない", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    const onDelete = jest.fn();
    render(
      <PickerImageTile
        imageUrl="https://cdn.example/x.jpg"
        alt="alt"
        onSelect={onSelect}
        onDelete={onDelete}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "stockDeleteAria" }),
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("disabled でクリック無効", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(
      <PickerImageTile
        imageUrl="https://cdn.example/x.jpg"
        alt="alt"
        onSelect={onSelect}
        disabled
      />,
    );
    const btn = screen.getByRole("button", { name: "selectImageAria" });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
