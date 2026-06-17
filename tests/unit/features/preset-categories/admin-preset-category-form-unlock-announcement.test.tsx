/**
 * AdminPresetCategoryFormClient の「解放お知らせ設定」セクションのテスト。
 * - セクションが描画されること
 * - 本文入力が submit の POST body に乗ること
 * - ヒーロー画像アップロードが API を叩き state(登録済み表示)へ反映されること
 *
 * 重い子コンポーネント(枠エディタ/プレビュー)と next/navigation・next/image・fetch はモックする。
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockRefresh = jest.fn();
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));

jest.mock("@/features/preset-categories/components/MountSlotEditor", () => ({
  MountSlotEditor: () => <div data-testid="mount-slot-editor" />,
}));
jest.mock(
  "@/features/preset-categories/components/ProgressModalColorPreview",
  () => ({
    ProgressModalColorPreview: () => <div data-testid="progress-preview" />,
  }),
);
jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { src: string; alt: string }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={props.src} alt={props.alt} />;
  },
}));

import { AdminPresetCategoryFormClient } from "@/features/preset-categories/components/AdminPresetCategoryFormClient";

function fillRequired() {
  fireEvent.change(screen.getByPlaceholderText("chibi"), {
    target: { value: "petit" },
  });
  fireEvent.change(screen.getByPlaceholderText("ちびキャラ"), {
    target: { value: "ぷち神" },
  });
  fireEvent.change(screen.getByPlaceholderText("Chibi"), {
    target: { value: "Petit" },
  });
}

describe("AdminPresetCategoryFormClient 解放お知らせ設定", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  test("解放お知らせ設定セクションが描画される", () => {
    render(<AdminPresetCategoryFormClient mode="create" />);
    expect(screen.getByText("解放お知らせ設定（任意）")).toBeInTheDocument();
    expect(
      screen.getByText("ヒーロー画像（初回モーダル・任意）"),
    ).toBeInTheDocument();
    expect(screen.getByText("初回モーダルの本文")).toBeInTheDocument();
    expect(screen.getByText("段階解放モーダルの本文")).toBeInTheDocument();
  });

  test("本文を入力して作成すると POST body に unlock_announcement_* が乗る", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ item: { id: "cat-1" } }),
    });

    render(<AdminPresetCategoryFormClient mode="create" />);
    fillRequired();
    fireEvent.change(
      screen.getByPlaceholderText(/コンプリート報酬の新しいスタイルが登場/),
      { target: { value: "カスタム初回文" } },
    );
    fireEvent.change(screen.getByPlaceholderText(/の続きが登場しました/), {
      target: { value: "カスタム段階文" },
    });

    fireEvent.click(screen.getByText("作成する"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("/api/admin/preset-categories");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body as string);
    expect(body.unlock_announcement_initial_body).toBe("カスタム初回文");
    expect(body.unlock_announcement_drip_body).toBe("カスタム段階文");
    // 未入力の項目は null で body に含まれる(フォールバック委譲)。
    expect(body.unlock_announcement_hero_path).toBeNull();
    expect(body.unlock_announcement_accent_color).toBeNull();
  });

  test("ヒーロー画像アップロードが API を叩き登録済み表示へ反映する", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ path: "collection-unlock-heroes/petit/x.png" }),
    });

    render(<AdminPresetCategoryFormClient mode="create" />);
    fillRequired();

    const heroInput = document.querySelector(
      'input[type="file"][accept="image/png,image/webp,image/jpeg"]',
    ) as HTMLInputElement;
    expect(heroInput).not.toBeNull();

    const file = new File(["dummy"], "hero.png", { type: "image/png" });
    fireEvent.change(heroInput, { target: { files: [file] } });

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/admin/collection-unlock-hero",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/登録済み: collection-unlock-heroes\/petit\/x\.png/),
      ).toBeInTheDocument(),
    );
  });
});
