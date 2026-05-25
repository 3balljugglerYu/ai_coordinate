/**
 * @jest-environment jsdom
 */

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageSourcePickerTrigger } from "@/features/generation/components/ImageSourcePickerTrigger";

describe("ImageSourcePickerTrigger", () => {
  test("ラベルが表示され、クリックで onClick が呼ばれる", async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<ImageSourcePickerTrigger onClick={onClick} />);
    const button = screen.getByRole("button", { name: "triggerLabel" });
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("disabled のときクリックされない", async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<ImageSourcePickerTrigger onClick={onClick} disabled />);
    const button = screen.getByRole("button", { name: "triggerLabel" });
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  test("showUnreadDot のときドットが描画される", () => {
    render(<ImageSourcePickerTrigger onClick={() => {}} showUnreadDot />);
    const button = screen.getByRole("button");
    const dot = button.querySelector("span.bg-red-500");
    expect(dot).not.toBeNull();
  });
});
