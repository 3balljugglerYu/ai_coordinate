/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/use-toast";
import { SaveSourceImageToStockDialog } from "@/features/generation/components/SaveSourceImageToStockDialog";
import {
  deleteSourceImageStock,
  getSourceImageStocks,
  linkSourceImageStockToJobs,
} from "@/features/generation/lib/database";
import { COORDINATE_STOCK_SAVE_PROMPT_DISMISSED_STORAGE_KEY } from "@/features/generation/lib/form-preferences";
import { normalizeSourceImage } from "@/features/generation/lib/normalize-source-image";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: jest.fn(),
}));

jest.mock("@/features/generation/lib/database", () => ({
  deleteSourceImageStock: jest.fn(),
  getSourceImageStocks: jest.fn(),
  linkSourceImageStockToJobs: jest.fn(),
}));

jest.mock("@/features/generation/lib/normalize-source-image", () => ({
  normalizeSourceImage: jest.fn(),
}));

const messages: Record<string, string> = {
  imageLoadFailed: "画像の読み込みに失敗しました",
  imageConvertFailed: "画像の変換に失敗しました",
  imageContextUnavailable: "画像処理に失敗しました",
  linkStockFailed: "ストックの紐づけに失敗しました",
  loginRequired: "ログインが必要です",
  saveStockAction: "保存する",
  saveStockDecline: "今回は不要",
  saveStockDeleteAndAddAction: "削除して追加",
  saveStockDeleteAndAddConfirm:
    "このイラストを削除し、先ほどのイラストを追加します",
  saveStockDialogDescription: "次回以降、探す手間がなくなります♪",
  saveStockDialogTitle: "着せ替え前のイラストも保存しますか？",
  saveStockDoNotShowAgain: "次回から表示しない",
  saveStockFailed: "ストックの保存に失敗しました",
  saveStockLater: "保存しない",
  saveStockLimitDescription:
    "元画像を保存するには、不要なストック画像を削除して空きを作るか、サブスクプランで保存上限を増やしてください。",
  saveStockLimitTitle: "ストック画像の上限に達しています",
  saveStockManageDescription:
    "削除するストックを選ぶと、先ほどのイラストを追加します。",
  saveStockManageLoading: "ストック画像を読み込み中...",
  saveStockSaving: "保存中...",
  saveStockSucceeded: "ストックに保存しました",
  seeSubscriptionPlansAction: "サブスクを検討する",
  sourceImageAlt: "元画像",
  stockDeleteFailed: "ストック画像の削除に失敗しました",
  stockFetchFailed: "ストック画像の取得に失敗しました",
  stockImageAlt: "ストック画像",
  stockListEmptyTitle: "ストック画像がありません",
  manageStocksAction: "ストックを整理する",
};

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;
const useToastMock = useToast as jest.MockedFunction<typeof useToast>;
const getSourceImageStocksMock =
  getSourceImageStocks as jest.MockedFunction<typeof getSourceImageStocks>;
const deleteSourceImageStockMock =
  deleteSourceImageStock as jest.MockedFunction<typeof deleteSourceImageStock>;
const linkSourceImageStockToJobsMock =
  linkSourceImageStockToJobs as jest.MockedFunction<
    typeof linkSourceImageStockToJobs
  >;
const normalizeSourceImageMock =
  normalizeSourceImage as jest.MockedFunction<typeof normalizeSourceImage>;

function createJsonResponse(
  ok: boolean,
  body: Record<string, unknown>,
): Response {
  return {
    ok,
    headers: new Headers({ "content-type": "application/json" }),
    json: jest.fn().mockResolvedValue(body),
    statusText: ok ? "OK" : "Bad Request",
  } as unknown as Response;
}

function renderDialog(props: Partial<React.ComponentProps<typeof SaveSourceImageToStockDialog>> = {}) {
  const originalFile = new File(["source"], "source.png", {
    type: "image/png",
  });

  return render(
    <SaveSourceImageToStockDialog
      open
      onOpenChange={jest.fn()}
      originalFile={originalFile}
      jobIds={["job-1"]}
      {...props}
    />,
  );
}

describe("SaveSourceImageToStockDialog", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTranslationsMock.mockReturnValue(
      ((key: string) => messages[key] ?? key) as never,
    );
    useToastMock.mockReturnValue({
      toast: jest.fn(),
      dismiss: jest.fn(),
      toasts: [],
    });
    normalizeSourceImageMock.mockImplementation(async (file) => file);
    getSourceImageStocksMock.mockResolvedValue([]);
    deleteSourceImageStockMock.mockResolvedValue();
    linkSourceImageStockToJobsMock.mockResolvedValue({
      updatedGeneratedImageIds: [],
      updatedJobIds: [],
    });
    window.URL.createObjectURL = jest.fn(() => "blob:source-preview");
    window.URL.revokeObjectURL = jest.fn();
    window.confirm = jest.fn(() => true);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("次回から表示しないをlocalStorageに保存する", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("checkbox", { name: "次回から表示しない" }));

    expect(
      window.localStorage.getItem(
        COORDINATE_STOCK_SAVE_PROMPT_DISMISSED_STORAGE_KEY,
      ),
    ).toBe("true");
  });

  it("上限到達後にストックを整理し、削除確認後に先ほどのイラストを追加する", async () => {
    const onOpenChange = jest.fn();
    const onSaved = jest.fn();
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse(false, {
          errorCode: "SOURCE_IMAGE_LIMIT_REACHED",
          error: "ストックの上限に達しています",
        }),
      )
      .mockResolvedValueOnce(createJsonResponse(true, { id: "stock-new" }));
    getSourceImageStocksMock.mockResolvedValue([
      {
        id: "stock-old",
        user_id: "user-1",
        image_url: "https://example.com/old.png",
        storage_path: "old.png",
        name: null,
        usage_count: 0,
        created_at: "2026-04-29T00:00:00.000Z",
        updated_at: "2026-04-29T00:00:00.000Z",
      },
    ]);

    renderDialog({ onOpenChange, onSaved });

    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    expect(await screen.findByRole("button", { name: "ストックを整理する" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ストックを整理する" }));

    expect(await screen.findByAltText("ストック画像")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "削除して追加" }));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(
        "このイラストを削除し、先ほどのイラストを追加します",
      );
      expect(deleteSourceImageStockMock).toHaveBeenCalledWith("stock-old");
      expect(onSaved).toHaveBeenCalledWith("stock-new");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
