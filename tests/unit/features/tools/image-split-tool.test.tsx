/**
 * 画像分割ツールの UI。
 *
 * 切り出しロジック(splitImageFile)は jsdom に Canvas が無いためモックし、
 * ここでは**ファイル選択 → 分割 → 保存/共有の流れと分岐**を固定する。
 * とくにスマホの主導線である Web Share の3分岐(成功 / ユーザーが閉じた /
 * 失敗)は、誤ると「共有シートを閉じただけでエラーが出る」体験になる。
 */

jest.mock("@/features/tools/lib/split-image", () => {
  const actual = jest.requireActual("@/features/tools/lib/split-image");
  return {
    ...actual,
    splitImageFile: jest.fn(),
  };
});

import { act, fireEvent, render, screen } from "@testing-library/react";
import { ImageSplitTool } from "@/features/tools/components/ImageSplitTool";
import { splitImageFile } from "@/features/tools/lib/split-image";

const mockSplit = splitImageFile as jest.MockedFunction<typeof splitImageFile>;

function makePieces(count = 4) {
  return Array.from({ length: count }, (_, i) => ({
    blob: new Blob([`piece-${i + 1}`], { type: "image/png" }),
    index: i + 1,
    width: 418,
    height: 941,
  }));
}

function imageFile(name = "fireworks.png") {
  return new File(["dummy"], name, { type: "image/png" });
}

async function selectFile(file: File) {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

describe("ImageSplitTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSplit.mockResolvedValue(makePieces());
    // jsdom に無い API をモックする
    URL.createObjectURL = jest.fn(() => `blob:mock-${Math.random()}`);
    URL.revokeObjectURL = jest.fn();
    Object.assign(navigator, {
      canShare: jest.fn(() => true),
      share: jest.fn().mockResolvedValue(undefined),
    });
  });

  test("初期表示: アップロード領域と3つの分割モードが出る", () => {
    render(<ImageSplitTool />);

    expect(screen.getByText("画像を選ぶ / ドラッグ&ドロップ")).toBeInTheDocument();
    expect(
      screen.getByText("画像はブラウザ内で処理され、サーバーにはアップロードされません"),
    ).toBeInTheDocument();
    expect(screen.getByText("縦に4分割（横長向け）")).toBeInTheDocument();
    expect(screen.getByText("横に4分割（縦長向け）")).toBeInTheDocument();
    expect(screen.getByText("2×2に4分割")).toBeInTheDocument();
  });

  test("画像を選ぶと4枚のプレビューと保存導線が出る", async () => {
    render(<ImageSplitTool />);

    await selectFile(imageFile());

    expect(mockSplit).toHaveBeenCalledWith(expect.any(File), "vertical4");
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(screen.getByText("4枚まとめて共有（Xへ投稿）")).toBeInTheDocument();
    expect(screen.getByText("4枚まとめて保存")).toBeInTheDocument();
    expect(screen.getAllByText("保存")).toHaveLength(4);
  });

  test("⭐画像以外のファイルは弾いて分割を走らせない", async () => {
    render(<ImageSplitTool />);

    await selectFile(new File(["x"], "note.txt", { type: "text/plain" }));

    expect(screen.getByText("画像ファイルを選んでください。")).toBeInTheDocument();
    expect(mockSplit).not.toHaveBeenCalled();
  });

  test("⭐モードを切り替えると同じ画像で再分割される", async () => {
    render(<ImageSplitTool />);
    await selectFile(imageFile());

    await act(async () => {
      fireEvent.click(screen.getByText("横に4分割（縦長向け）"));
    });

    expect(mockSplit).toHaveBeenCalledTimes(2);
    expect(mockSplit).toHaveBeenLastCalledWith(expect.any(File), "horizontal4");
  });

  test("画像を選ぶ前のモード切り替えは分割を走らせない", async () => {
    render(<ImageSplitTool />);

    await act(async () => {
      fireEvent.click(screen.getByText("2×2に4分割"));
    });

    expect(mockSplit).not.toHaveBeenCalled();
  });

  test("分割に失敗したらエラー文言を出してプレビューを消す", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockSplit.mockRejectedValueOnce(new Error("decode failed"));
    render(<ImageSplitTool />);

    await selectFile(imageFile());

    expect(
      screen.getByText(/この画像を読み込めませんでした/),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    errorSpy.mockRestore();
  });

  describe("共有(スマホの主導線)", () => {
    test("4枚の File を元ファイル名ベースの連番で navigator.share に渡す", async () => {
      render(<ImageSplitTool />);
      await selectFile(imageFile("fireworks.png"));

      await act(async () => {
        fireEvent.click(screen.getByText("4枚まとめて共有（Xへ投稿）"));
      });

      const shared = (navigator.share as jest.Mock).mock.calls[0][0] as {
        files: File[];
      };
      expect(shared.files).toHaveLength(4);
      expect(shared.files.map((f) => f.name)).toEqual([
        "fireworks_1.png",
        "fireworks_2.png",
        "fireworks_3.png",
        "fireworks_4.png",
      ]);
    });

    test("⭐共有シートを閉じただけ(AbortError)ではエラーを出さない", async () => {
      const abort = new DOMException("cancelled", "AbortError");
      (navigator.share as jest.Mock).mockRejectedValueOnce(abort);
      render(<ImageSplitTool />);
      await selectFile(imageFile());

      await act(async () => {
        fireEvent.click(screen.getByText("4枚まとめて共有（Xへ投稿）"));
      });

      expect(screen.queryByText(/共有に失敗しました/)).not.toBeInTheDocument();
    });

    test("共有の失敗(AbortError以外)は1枚ずつの保存へ誘導する", async () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      (navigator.share as jest.Mock).mockRejectedValueOnce(
        new DOMException("denied", "NotAllowedError"),
      );
      render(<ImageSplitTool />);
      await selectFile(imageFile());

      await act(async () => {
        fireEvent.click(screen.getByText("4枚まとめて共有（Xへ投稿）"));
      });

      expect(
        screen.getByText("共有に失敗しました。1枚ずつ保存してください。"),
      ).toBeInTheDocument();
      errorSpy.mockRestore();
    });

    test("⭐canShare が無い環境では共有ボタンを出さない(PC はダウンロードのみ)", async () => {
      Object.assign(navigator, { canShare: undefined, share: undefined });
      render(<ImageSplitTool />);
      await selectFile(imageFile());

      expect(
        screen.queryByText("4枚まとめて共有（Xへ投稿）"),
      ).not.toBeInTheDocument();
      expect(screen.getByText("4枚まとめて保存")).toBeInTheDocument();
    });
  });

  test("ドラッグ&ドロップでも分割が走る(PC の主要導線)", async () => {
    render(<ImageSplitTool />);
    const dropZone = screen
      .getByText("画像を選ぶ / ドラッグ&ドロップ")
      .closest("label") as HTMLLabelElement;

    fireEvent.dragOver(dropZone);
    await act(async () => {
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [imageFile("dropped.png")] },
      });
    });

    expect(mockSplit).toHaveBeenCalledWith(expect.any(File), "vertical4");
    expect(screen.getAllByRole("img")).toHaveLength(4);
  });

  test("ドラッグが外れたらハイライトが戻る", () => {
    render(<ImageSplitTool />);
    const dropZone = screen
      .getByText("画像を選ぶ / ドラッグ&ドロップ")
      .closest("label") as HTMLLabelElement;

    fireEvent.dragOver(dropZone);
    expect(dropZone.className).toContain("border-pink-400");
    fireEvent.dragLeave(dropZone);
    expect(dropZone.className).not.toContain("border-pink-400");
  });

  describe("ダウンロード", () => {
    test("まとめて保存は4枚を時間差で落とす(同時発火だと2枚目以降が落ちない)", async () => {
      jest.useFakeTimers();
      const clicks: string[] = [];
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        clicks.push(this.download);
      };
      try {
        render(<ImageSplitTool />);
        const input = document.querySelector(
          'input[type="file"]',
        ) as HTMLInputElement;
        await act(async () => {
          fireEvent.change(input, { target: { files: [imageFile("photo.jpg")] } });
        });

        fireEvent.click(screen.getByText("4枚まとめて保存"));
        act(() => {
          jest.advanceTimersByTime(1000);
        });

        expect(clicks).toEqual([
          "photo_1.png",
          "photo_2.png",
          "photo_3.png",
          "photo_4.png",
        ]);
      } finally {
        HTMLAnchorElement.prototype.click = originalClick;
        jest.useRealTimers();
      }
    });

    test("1枚ずつの保存ボタンはその1枚だけ落とす", async () => {
      const clicks: string[] = [];
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        clicks.push(this.download);
      };
      try {
        render(<ImageSplitTool />);
        await selectFile(imageFile("photo.jpg"));

        fireEvent.click(screen.getAllByText("保存")[2]);

        expect(clicks).toEqual(["photo_3.png"]);
      } finally {
        HTMLAnchorElement.prototype.click = originalClick;
      }
    });
  });
});
