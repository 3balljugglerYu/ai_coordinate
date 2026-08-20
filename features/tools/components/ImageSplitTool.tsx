"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, Share2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isMobileUserAgent } from "@/features/generation/lib/download-image";
import {
  pieceFileName,
  splitImageFile,
  type SplitMode,
  type SplitPiece,
} from "../lib/split-image";

interface PieceView extends SplitPiece {
  /** プレビュー表示用の objectURL(unmount 時に revoke する) */
  url: string;
}

/**
 * X 投稿用の画像分割ツール。**すべてブラウザ内で完結**し、画像はどこにも送らない。
 *
 * ## 保存動線は既存の生成画像と同じ分け方にする
 *
 * `shareOrDownloadGeneratedImage`(features/generation/lib/download-image)と同じく、
 * **モバイル(UA判定)は Web Share、PC は `<a download>`** で分ける。
 *
 * - iOS Safari は連続ダウンロードで「現在進行中のダウンロードは停止します」と
 *   **前のダウンロードを潰す**ため、モバイルに「まとめてダウンロード」は出せない。
 *   保存先も写真ではなく「ファイル」になる。
 * - 共有シートの「4枚の画像を保存」なら写真アプリに入る。
 * - **X の iOS 共有拡張は Web からの複数画像ファイルを受け取らない**
 *   (共有シートに LINE や Gmail は並ぶのに X は出ない)。したがって
 *   「共有シートから直接 X へ」は成立しない。正しい導線は
 *   写真に保存 → X アプリで4枚選んで投稿、で、文言もそう案内する。
 */
export function ImageSplitTool() {
  const [mode, setMode] = useState<SplitMode>("vertical4");
  const [fileName, setFileName] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [pieces, setPieces] = useState<PieceView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // UA と navigator.canShare はクライアントでしか判定できない(SSR とのズレ防止で effect)
  useEffect(() => {
    setIsMobile(isMobileUserAgent());
    const probe = new File([""], "probe.png", { type: "image/png" });
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        !!navigator.canShare &&
        navigator.canShare({ files: [probe] }),
    );
  }, []);

  // objectURL の後始末
  useEffect(() => {
    return () => {
      pieces.forEach((p) => URL.revokeObjectURL(p.url));
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    };
  }, [pieces, sourceUrl]);

  const runSplit = useCallback(async (file: File, nextMode: SplitMode) => {
    setBusy(true);
    setError(null);
    try {
      const result = await splitImageFile(file, nextMode);
      setPieces((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.url));
        return result.map((piece) => ({
          ...piece,
          url: URL.createObjectURL(piece.blob),
        }));
      });
    } catch (e) {
      console.error("[image-split] failed:", e);
      setError(
        "この画像を読み込めませんでした。別の画像でお試しください(HEIC など一部の形式は非対応です)。",
      );
      setPieces([]);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError("画像ファイルを選んでください。");
        return;
      }
      setFileName(file.name);
      setSourceFile(file);
      setSourceUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      await runSplit(file, mode);
    },
    [mode, runSplit],
  );

  const handleModeChange = useCallback(
    async (nextMode: SplitMode) => {
      setMode(nextMode);
      if (sourceFile) await runSplit(sourceFile, nextMode);
    },
    [sourceFile, runSplit],
  );

  const downloadPiece = useCallback(
    (piece: PieceView) => {
      const a = document.createElement("a");
      a.href = piece.url;
      a.download = pieceFileName(fileName ?? "image", piece.index);
      a.click();
    },
    [fileName],
  );

  const toShareFile = useCallback(
    (piece: PieceView) =>
      new File([piece.blob], pieceFileName(fileName ?? "image", piece.index), {
        type: "image/png",
      }),
    [fileName],
  );

  /**
   * 1枚の保存。既存の生成画像と同じで、モバイルは共有シート
   * (写真に保存できる)を優先し、閉じただけなら何もしない。
   * 共有できない環境と PC は `<a download>`。
   */
  const savePiece = useCallback(
    async (piece: PieceView) => {
      if (isMobile && canShareFiles) {
        try {
          await navigator.share({ files: [toShareFile(piece)] });
          return;
        } catch (e) {
          if ((e as DOMException)?.name === "AbortError") return;
          // 失敗したらダウンロードへフォールバック(既存ヘルパと同じ方針)
        }
      }
      downloadPiece(piece);
    },
    [isMobile, canShareFiles, toShareFile, downloadPiece],
  );

  /*
    PC 用のまとめてダウンロード。**モバイルでは呼ばない**。
    iOS Safari は新しいダウンロードが始まるたびに進行中のものを停止するため、
    連続ダウンロードは1枚しか残らない。
  */
  const downloadAll = useCallback(() => {
    // 同時に発火するとブラウザが2枚目以降を落とすことがあるため少しずらす
    pieces.forEach((piece, i) => {
      setTimeout(() => downloadPiece(piece), i * 300);
    });
  }, [pieces, downloadPiece]);

  const shareAll = useCallback(async () => {
    try {
      await navigator.share({ files: pieces.map(toShareFile) });
    } catch (e) {
      // ユーザーが共有シートを閉じただけの AbortError は正常系
      if ((e as DOMException)?.name !== "AbortError") {
        console.error("[image-split] share failed:", e);
        setError(
          "まとめて保存に失敗しました。お手数ですが1枚ずつ保存してください。",
        );
      }
    }
  }, [pieces, toShareFile]);

  const gridClass =
    mode === "vertical4"
      ? "grid-cols-4"
      : mode === "horizontal4"
        ? "grid-cols-1 max-w-md"
        : "grid-cols-2 max-w-md";

  const showMobileShare = isMobile && canShareFiles;

  return (
    <div className="space-y-6">
      {/* アップロード */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging
            ? "border-pink-400 bg-pink-50"
            : "border-slate-300 bg-white hover:border-pink-300 hover:bg-pink-50/40"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            // 同じファイルをもう一度選べるようにする
            e.target.value = "";
          }}
        />
        <Upload className="h-8 w-8 text-pink-500" aria-hidden />
        <p className="text-sm font-semibold text-slate-800">
          画像を選ぶ / ドラッグ&ドロップ
        </p>
        <p className="text-xs text-slate-500">
          画像はブラウザ内で処理され、サーバーにはアップロードされません
        </p>
      </label>

      {/* 分割モード */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-600">分割方法:</span>
        {(
          [
            { value: "vertical4", label: "縦に4分割（横長向け）" },
            { value: "horizontal4", label: "横に4分割（縦長向け）" },
            { value: "grid4", label: "2×2に4分割" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => void handleModeChange(option.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === option.value
                ? "border-pink-500 bg-pink-500 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:border-pink-300"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {busy ? <p className="text-sm text-slate-500">分割中…</p> : null}

      {/* 結果 */}
      {pieces.length > 0 && !busy ? (
        <div className="space-y-4">
          <div className={`grid gap-1 ${gridClass}`}>
            {pieces.map((piece) => (
              <figure key={piece.index} className="space-y-1">
                {/* 切り出した Blob のプレビュー。next/image は objectURL に使えない */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={piece.url}
                  alt={`分割 ${piece.index} 枚目`}
                  className="w-full rounded-md border border-slate-200"
                />
                <figcaption className="flex items-center justify-between px-0.5">
                  <span className="text-[11px] tabular-nums text-slate-500">
                    {piece.index}枚目
                  </span>
                  <button
                    type="button"
                    onClick={() => void savePiece(piece)}
                    className="text-[11px] font-medium text-pink-600 underline hover:text-pink-800"
                  >
                    保存
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {showMobileShare ? (
              <Button type="button" onClick={() => void shareAll()}>
                <Share2 className="mr-1.5 h-4 w-4" aria-hidden />
                4枚をまとめて保存・共有
              </Button>
            ) : !isMobile ? (
              <Button type="button" onClick={downloadAll}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden />
                4枚まとめて保存
              </Button>
            ) : null /* モバイルで共有不可なら1枚ずつのみ(連続DLはiOSが潰す) */}
          </div>
          {showMobileShare ? (
            <p className="text-xs leading-5 text-slate-600">
              開いたシートで<strong>「4枚の画像を保存」</strong>
              を選ぶと写真アプリに入ります。Xアプリの投稿画面で、
              写真から1枚目→4枚目の順に選んで投稿してください
              （タイムラインでは2×2に並び、タップしてスワイプするとつながって見えます）。
            </p>
          ) : (
            <p className="text-xs leading-5 text-slate-500">
              Xでは1枚目から順に選んで投稿してください。タイムラインでは2×2に並び、
              タップしてスワイプすると1枚ずつつながって見えます。
            </p>
          )}
        </div>
      ) : null}

      {/* Persta への導線(ツール単体で完結させつつ、さりげなく) */}
      <div className="rounded-2xl border border-pink-200/70 bg-gradient-to-r from-pink-50 to-orange-50 px-4 py-3">
        <p className="text-xs leading-5 text-slate-600">
          分割する画像がまだないときは、
          <Link href="/style" className="font-semibold text-pink-600 underline">
            Persta.AI でうちの子の画像を生成
          </Link>
          してから分割できます。
        </p>
      </div>
    </div>
  );
}
