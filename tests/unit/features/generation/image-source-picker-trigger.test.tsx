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

  test("未読の赤丸は出さない", () => {
    /*
      以前は「自分がストックに入れた画像をまだストックタブで見ていない」ときに
      右上へ赤丸を出していた。ただしピッカーの既定タブが「生成済み」で、
      ストックタブを開かない限り既読にならず、消えないまま残り続けていた。
      ストック機能自体は現役（今日も作成されている）なので残し、通知としての
      役目だけをやめた。
    */
    render(<ImageSourcePickerTrigger onClick={() => {}} />);
    expect(
      screen.getByRole("button").querySelector("span.bg-red-500"),
    ).toBeNull();
  });
});
