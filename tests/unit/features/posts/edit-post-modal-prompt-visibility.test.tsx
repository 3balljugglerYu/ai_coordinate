/**
 * 編集モーダルのプロンプト非公開トグルのテスト。
 *
 * 公開→非公開の切り替えは「もう回収できない」ことを伝えなければならない
 * （REQ-015）。逆に、元から非公開の投稿で毎回警告を出すと読み飛ばされるため、
 * 出す条件も固定する。
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { EditPostModal } from "@/features/posts/components/EditPostModal";
import { updatePostCaption } from "@/features/posts/lib/api";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock("@/features/posts/lib/api", () => ({
  updatePostCaption: jest.fn(),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    alt,
    src,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement("img", { alt, src, ...props }),
}));

jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;
const updatePostCaptionMock = updatePostCaption as jest.MockedFunction<
  typeof updatePostCaption
>;

const RETRACT_WARNING =
  "非公開に変えても、すでに見られた内容やコピーされた内容は取り消せません。";

const translations = {
  editModalTitle: "投稿を編集",
  editModalDescription: ({ max }: { max: number }) => `最大${max}文字`,
  captionLabel: "キャプション",
  captionPlaceholder: "説明",
  charactersRemaining: ({ count }: { count: number }) => `${count}文字残り`,
  captionTooLong: ({ max }: { max: number }) => `${max}文字以内`,
  cancel: "キャンセル",
  updateSubmit: "更新する",
  updateSubmitting: "更新中...",
  updateFailed: "更新に失敗しました",
  updateFailedRetry: "更新に失敗しました。もう一度お試しください。",
  afterImageAlt: "生成後画像",
  beforeImageAlt: "生成前画像",
  afterImageLabel: "After",
  beforeImageLabel: "Before",
  showBeforeImageLabel: "生成前画像も表示する",
  promptVisibilityLabel: "プロンプトの公開設定",
  promptVisibilityPublicOption: "プロンプトを公開する",
  promptVisibilityPrivateOption: "プロンプトを非公開にする",
  promptVisibilityPublicHint:
    "フォロワーはプロンプトをコピーできます。コピーから作られた分は利用数に入りません。",
  promptVisibilityPrivateHint: "プロンプトは誰にも見せません。",
  promptVisibilityRetractWarning: RETRACT_WARNING,
  showBeforeImageHint:
    "元画像も表示することで、どんな変化が起きるか伝わりやすくなります。",
} as const;

const translator = ((
  key: keyof typeof translations,
  values?: Record<string, unknown>
) => {
  const entry = translations[key];
  return typeof entry === "function" ? entry(values as never) : entry;
}) as unknown as ReturnType<typeof useTranslations>;

function renderModal(props: Record<string, unknown> = {}) {
  return render(
    <EditPostModal
      open
      onOpenChange={jest.fn()}
      imageId="image-1"
      generationType="free"
      {...props}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useTranslationsMock.mockReturnValue(translator);
  updatePostCaptionMock.mockResolvedValue({
    id: "image-1",
    is_posted: true,
    caption: null,
    posted_at: "2026-07-30T00:00:00.000Z",
  });
});

describe("選択肢の出し分け", () => {
  it("じゆうモードの root 投稿では選べる", () => {
    renderModal();

    expect(
      screen.getByLabelText("プロンプトを非公開にする")
    ).toBeInTheDocument();
  });

  it("coordinate では出さない", () => {
    renderModal({ generationType: "coordinate" });

    expect(
      screen.queryByLabelText("プロンプトを非公開にする")
    ).not.toBeInTheDocument();
  });

  it("派生投稿では出さない", () => {
    renderModal({ sourcePostId: "22222222-2222-4222-8222-222222222222" });

    expect(
      screen.queryByLabelText("プロンプトを非公開にする")
    ).not.toBeInTheDocument();
  });
});

describe("既存値の反映", () => {
  it("非公開の投稿は非公開が選ばれた状態で開く", () => {
    renderModal({ currentPromptVisibility: "private" });

    expect(screen.getByLabelText("プロンプトを非公開にする")).toBeChecked();
  });

  it("公開の投稿は公開が選ばれた状態で開く", () => {
    renderModal({ currentPromptVisibility: "public" });

    expect(screen.getByLabelText("プロンプトを公開する")).toBeChecked();
  });

  it("未設定は非公開として扱う", () => {
    // 新しい既定に合わせる
    renderModal();

    expect(screen.getByLabelText("プロンプトを非公開にする")).toBeChecked();
  });
});

describe("回収できないことの明示 (REQ-015)", () => {
  it("公開から非公開へ切り替えたときだけ警告を出す", () => {
    renderModal({ currentPromptVisibility: "public" });

    expect(screen.queryByText(RETRACT_WARNING)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("プロンプトを非公開にする"));

    expect(screen.getByText(RETRACT_WARNING)).toBeInTheDocument();
  });

  it("元から非公開の投稿では警告を出さない", () => {
    // 毎回出すと読み飛ばされる。状態が変わるときだけ伝える。
    renderModal({ currentPromptVisibility: "private" });

    expect(screen.queryByText(RETRACT_WARNING)).not.toBeInTheDocument();
  });

  it("非公開から公開へ戻すときは警告を出さない", () => {
    renderModal({ currentPromptVisibility: "private" });

    fireEvent.click(screen.getByLabelText("プロンプトを公開する"));

    expect(screen.queryByText(RETRACT_WARNING)).not.toBeInTheDocument();
  });
});

describe("送信内容", () => {
  it("選択肢を出している投稿では prompt_visibility を送る", async () => {
    renderModal({ currentPromptVisibility: "public" });

    fireEvent.click(screen.getByLabelText("プロンプトを非公開にする"));
    fireEvent.submit(screen.getByLabelText("キャプション").closest("form")!);

    await waitFor(() => {
      expect(updatePostCaptionMock).toHaveBeenCalledWith(
        expect.objectContaining({ prompt_visibility: "private" }),
        expect.anything()
      );
    });
  });

  it("選択肢を出していない投稿では列を触らない", async () => {
    // 送ってしまうと、UI に無い設定を勝手に上書きする
    renderModal({ generationType: "coordinate" });

    fireEvent.submit(screen.getByLabelText("キャプション").closest("form")!);

    await waitFor(() => {
      expect(updatePostCaptionMock).toHaveBeenCalled();
    });
    const payload = updatePostCaptionMock.mock.calls[0][0];
    expect("prompt_visibility" in payload).toBe(false);
  });
});
