import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StylePresetFormPage } from "@/app/(app)/admin/style-presets/StylePresetFormPage";

/**
 * 専用ページは保存・キャンセルのどちらでも一覧へ戻る。
 *
 * 一覧はサーバーコンポーネントで取得しているので、push だけでは保存内容が
 * 反映されない（クライアント側のキャッシュが使われる）。refresh も呼ぶこと
 * までを固定する。
 */
const push = jest.fn();
const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

describe("StylePresetFormPage", () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
  });

  function renderPage() {
    return render(
      <StylePresetFormPage
        categories={[]}
        creators={[]}
        headerTitle="スタイルを追加"
      />,
    );
  }

  it("上部バーに閉じると保存を出す", () => {
    renderPage();

    expect(screen.getByText("スタイルを追加")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "閉じる" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /保存/ })).toBeInTheDocument();
  });

  it("閉じるを押すと一覧へ戻り、一覧を取り直す", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "閉じる" }));

    expect(push).toHaveBeenCalledWith("/admin/style-presets");
    // push だけだとサーバーで取得済みの一覧が古いまま表示される
    expect(refresh).toHaveBeenCalled();
  });
});
