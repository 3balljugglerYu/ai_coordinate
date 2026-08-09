/** @jest-environment jsdom */

/**
 * 完走フィード投稿の編集モーダル(caption-only 編集)のテスト。
 *
 * 完走投稿は生成物ではないため、編集モーダルに After ラベルや
 * 「生成前の画像も表示する」設定を出さず、更新 payload にも
 * show_before_image を含めない(レビュー指摘: 所有者導線の生成物専用UI露出)。
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditPostModal } from "@/features/posts/components/EditPostModal";
import { updatePostCaption } from "@/features/posts/lib/api";

jest.mock("next-intl", () => ({
  useLocale: () => "ja",
  // i18n キーをそのまま返し、どのキーが描画されたかで判定する
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string) => key;
    return t;
  },
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, src }: { alt?: string; src?: string }) =>
    React.createElement("img", { alt, src }),
}));

jest.mock("@/features/posts/lib/api", () => ({
  updatePostCaption: jest.fn().mockResolvedValue({}),
}));

const updatePostCaptionMock = updatePostCaption as jest.MockedFunction<
  typeof updatePostCaption
>;

function renderModal(overrides: Partial<React.ComponentProps<typeof EditPostModal>> = {}) {
  return render(
    <EditPostModal
      open
      onOpenChange={() => {}}
      imageId="img-1"
      currentCaption="もとのキャプション"
      currentShowBeforeImage={true}
      afterImageUrl="https://cdn.example/after.png"
      beforeImageUrl={null}
      {...overrides}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("EditPostModal の完走投稿対応", () => {
  it("完走投稿では After ラベルと Before 表示設定を出さない", () => {
    renderModal({ isCompletion: true });
    expect(screen.queryByText("afterImageLabel")).toBeNull();
    expect(screen.queryByText("showBeforeImageLabel")).toBeNull();
  });

  it("通常投稿では従来どおり After ラベルと Before 表示設定が出る", () => {
    renderModal({ isCompletion: false });
    expect(screen.getByText("afterImageLabel")).toBeInTheDocument();
    expect(screen.getByText("showBeforeImageLabel")).toBeInTheDocument();
  });

  it("完走投稿の保存 payload に show_before_image を含めない(列を触らない)", async () => {
    renderModal({ isCompletion: true });
    fireEvent.click(screen.getByText("updateSubmit"));
    await waitFor(() => expect(updatePostCaptionMock).toHaveBeenCalled());
    const payload = updatePostCaptionMock.mock.calls[0][0];
    expect(payload).not.toHaveProperty("show_before_image");
    expect(payload.id).toBe("img-1");
  });

  it("通常投稿の保存 payload には show_before_image を含める(既存挙動)", async () => {
    renderModal({ isCompletion: false });
    fireEvent.click(screen.getByText("updateSubmit"));
    await waitFor(() => expect(updatePostCaptionMock).toHaveBeenCalled());
    const payload = updatePostCaptionMock.mock.calls[0][0];
    expect(payload).toHaveProperty("show_before_image", true);
  });
});
