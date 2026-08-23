"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Share2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isMobileUserAgent } from "@/features/generation/lib/download-image";
import {
  trackImageSplitFailed,
  trackImageSplitRun,
  trackImageSplitSaveAll,
  trackImageSplitSavePiece,
} from "../lib/image-split-events";
import { SplitBoundaryEditor } from "./SplitBoundaryEditor";
import {
  createEqualBoundaries,
  isEqualBoundaries,
  redistributeDividers,
  resetBoundaries,
  type SplitBoundaries,
} from "../lib/split-boundaries";
import {
  buildSplitMode,
  parseSplitMode,
  pieceFileName,
  splitImageFile,
  splitPieceCount,
  SPLIT_COUNTS,
  type SplitAxis,
  type SplitMode,
  type SplitPiece,
} from "../lib/split-image";

interface PieceView extends SplitPiece {
  /** プレビュー表示用の objectURL(unmount 時に revoke する) */
  url: string;
}

/**
 * 分割方法の選択肢。**軸 × 枚数の表**にして、増えても一列に並べない。
 * 2/3/4 を横並びのピルにすると7個になり、スマホで折り返して読めなくなる。
 */
const AXIS_ROWS: readonly {
  axis: SplitAxis;
  label: string;
  note: string;
}[] = [
  { axis: "vertical", label: "縦に分割", note: "横長向け" },
  { axis: "horizontal", label: "横に分割", note: "縦長向け" },
];

/**
 * 画像分割ツール。**すべてブラウザ内で完結**し、画像はどこにも送らない。
 * 縦・横それぞれ 2/3/4 分割と、2×2 の4分割に対応する。
 *
 * ## 保存動線は既存の生成画像と同じ分け方にする
 *
 * `shareOrDownloadGeneratedImage`(features/generation/lib/download-image)と同じく、
 * **モバイル(UA判定)は Web Share、PC は `<a download>`** で分ける。
 *
 * - iOS Safari は連続ダウンロードで「現在進行中のダウンロードは停止します」と
 *   **前のダウンロードを潰す**ため、モバイルに「まとめてダウンロード」は出せない。
 *   保存先も写真ではなく「ファイル」になる。
 * - 共有シートの「N枚の画像を保存」なら写真アプリに入る。
 * - **X の iOS 共有拡張は Web からの複数画像ファイルを受け取らない**
 *   (共有シートに LINE や Gmail は並ぶのに X は出ない)。したがって
 *   「共有シートから直接 X へ」は成立しない。正しい導線は
 *   写真に保存 → X アプリで選んで投稿、で、文言もそう案内する。
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
  /*
    分割位置(使う範囲 + 仕切り)。等分だと切れ目がキャラクターを横切ることが
    あるため、ユーザーが動かせるようにしている(features/tools/lib/split-boundaries)。
  */
  const [boundaries, setBoundaries] = useState<SplitBoundaries>(() =>
    createEqualBoundaries(4),
  );
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

  const runSplit = useCallback(
    async (
      file: File,
      nextMode: SplitMode,
      nextBoundaries: SplitBoundaries,
    ) => {
    setBusy(true);
    setError(null);
    try {
      const result = await splitImageFile(file, nextMode, nextBoundaries);
      setPieces((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.url));
        return result.map((piece) => ({
          ...piece,
          url: URL.createObjectURL(piece.blob),
        }));
      });
      // 分母は page_view、分子がこれ。成功したときだけ数える
      trackImageSplitRun(nextMode, result.length);
    } catch (e) {
      console.error("[image-split] failed:", e);
      setError(
        "この画像を読み込めませんでした。別の画像でお試しください(HEIC など一部の形式は非対応です)。",
      );
      setPieces([]);
      trackImageSplitFailed("decode_failed");
    } finally {
      setBusy(false);
    }
    },
    [],
  );

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError("画像ファイルを選んでください。");
        trackImageSplitFailed("not_an_image");
        return;
      }
      setFileName(file.name);
      setSourceFile(file);
      setSourceUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      // 別の画像に替えたら位置調整はやり直し(前の絵に合わせた位置は意味を持たない)
      const fresh = createEqualBoundaries(splitPieceCount(mode));
      setBoundaries(fresh);
      await runSplit(file, mode, fresh);
    },
    [mode, runSplit],
  );

  const handleModeChange = useCallback(
    async (nextMode: SplitMode) => {
      setMode(nextMode);
      /*
        ⭐枚数を変えても**詰めた端は保つ**。ここで全部リセットすると、
        せっかく合わせたトリミングが枚数を変えるたびに戻ってやり直しになる。
      */
      const next = redistributeDividers(
        boundaries,
        splitPieceCount(nextMode),
      );
      setBoundaries(next);
      if (sourceFile) await runSplit(sourceFile, nextMode, next);
    },
    [sourceFile, runSplit, boundaries],
  );

  /**
   * 分割線を動かしたとき。**ドラッグ中は切り直さない**(1本動かすたびに
   * 画像を4枚デコードすると指に追従しなくなる)。線の位置だけ先に反映し、
   * 指を離してから切り直す。
   */
  const handleBoundariesChange = useCallback((next: SplitBoundaries) => {
    setBoundaries(next);
  }, []);

  const handleBoundariesCommit = useCallback(
    (next: SplitBoundaries) => {
      if (sourceFile) void runSplit(sourceFile, mode, next);
    },
    [sourceFile, mode, runSplit],
  );

  const handleResetBoundaries = useCallback(() => {
    const next = resetBoundaries(splitPieceCount(mode));
    setBoundaries(next);
    if (sourceFile) void runSplit(sourceFile, mode, next);
  }, [mode, sourceFile, runSplit]);

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
          trackImageSplitSavePiece("share");
          return;
        } catch (e) {
          // 共有シートを閉じただけなら保存していないので数えない
          if ((e as DOMException)?.name === "AbortError") return;
          // 失敗したらダウンロードへフォールバック(既存ヘルパと同じ方針)
        }
      }
      downloadPiece(piece);
      trackImageSplitSavePiece("download");
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
    trackImageSplitSaveAll("download", pieces.length);
  }, [pieces, downloadPiece]);

  const shareAll = useCallback(async () => {
    try {
      await navigator.share({ files: pieces.map(toShareFile) });
      trackImageSplitSaveAll("share", pieces.length);
    } catch (e) {
      // ユーザーが共有シートを閉じただけの AbortError は正常系(数えない)
      if ((e as DOMException)?.name !== "AbortError") {
        console.error("[image-split] share failed:", e);
        setError(
          "まとめて保存に失敗しました。お手数ですが1枚ずつ保存してください。",
        );
      }
    }
  }, [pieces, toShareFile]);

  const parsed = parseSplitMode(mode);
  /** 2×2(grid4)は軸が2つあるので、線の調整は出さない。 */
  const splitAxis = parsed?.axis ?? null;
  const isVerticalSplit = splitAxis === "vertical";
  /*
    縦分割は flex で幅を比率配分するのでここは通らない。
    2×2 は2列、横分割は1列に積む(どちらも元画像の並びと同じ)。
  */
  const gridClass =
    parsed === null ? "grid-cols-2 max-w-md" : "grid-cols-1 max-w-md";

  const showMobileShare = isMobile && canShareFiles;
  /*
    文言の「N枚」は**実際に切り出した枚数**から出す(モードから計算しない)。
    分割方法を変えた直後にプレビューと枚数がずれるのを防ぐ。
  */
  const pieceCount = pieces.length;
  /*
    X のタイムラインで 2×2 に畳まれ、スワイプでつながって見えるのは
    **4枚のときだけ**。2枚・3枚では並び方が違うので、この案内は出さない。
  */
  const isFourPieces = pieceCount === 4;

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

      {/* 分割方法(軸 × 枚数) */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-slate-600">分割方法</span>
        {AXIS_ROWS.map((row) => (
          <div key={row.axis} className="flex items-center gap-2">
            <span className="w-[7.5rem] shrink-0 text-xs text-slate-600">
              {row.label}
              <span className="text-slate-400">（{row.note}）</span>
            </span>
            {SPLIT_COUNTS.map((count) => {
              const value = buildSplitMode(row.axis, count);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => void handleModeChange(value)}
                  aria-pressed={mode === value}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === value
                      ? "border-pink-500 bg-pink-500 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:border-pink-300"
                  }`}
                >
                  {count}分割
                </button>
              );
            })}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="w-[7.5rem] shrink-0 text-xs text-slate-600">
            そのほか
          </span>
          <button
            type="button"
            onClick={() => void handleModeChange("grid4")}
            aria-pressed={mode === "grid4"}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "grid4"
                ? "border-pink-500 bg-pink-500 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:border-pink-300"
            }`}
          >
            2×2に4分割
          </button>
        </div>
      </div>

      {/*
        分割位置の調整。等分だと切れ目がキャラクターを横切ることがあるので、
        元画像の上で線を動かせるようにする。両端も動かせる(=トリミング)。
        2×2 は軸が2つあり同じ操作にできないため、いまは等分のまま。
      */}
      {sourceUrl && splitAxis ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600">
              分割位置（線をドラッグ）
            </span>
            {!isEqualBoundaries(boundaries, splitPieceCount(mode)) ? (
              <button
                type="button"
                onClick={handleResetBoundaries}
                className="text-xs font-medium text-pink-600 underline hover:text-pink-800"
              >
                均等に戻す
              </button>
            ) : null}
          </div>
          <SplitBoundaryEditor
            imageUrl={sourceUrl}
            axis={splitAxis}
            boundaries={boundaries}
            onChange={handleBoundariesChange}
            onCommit={handleBoundariesCommit}
            disabled={busy}
          />
          <p className="text-xs leading-5 text-slate-500">
            両端を内側へ動かすと、その外側は切り取られます。
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {busy ? <p className="text-sm text-slate-500">分割中…</p> : null}

      {/* 結果 */}
      {pieces.length > 0 && !busy ? (
        <div className="space-y-4">
          <div className={isVerticalSplit ? "flex gap-1" : `grid gap-1 ${gridClass}`}>
            {pieces.map((piece) => (
              <figure
                key={piece.index}
                className="min-w-0 space-y-1"
                /*
                  ⭐ 縦分割は**幅を元の比率どおりに配る**。等幅の枠に流し込むと、
                  元が細い断片ほど引き伸ばされて**縦に伸びる**(分割位置を動かすと
                  高さがバラバラになる。実機で報告された)。
                  幅を比率にすれば、どの断片も元の高さのままなので高さが揃い、
                  並べたときに元画像と同じ見え方になる。
                */
                style={
                  isVerticalSplit
                    ? { flex: `${piece.width} 0 0%` }
                    : undefined
                }
              >
                <div className="relative">
                  {/* 切り出した Blob のプレビュー。next/image は objectURL に使えない */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={piece.url}
                    alt={`分割 ${piece.index} 枚目`}
                    /*
                      枠線は border ではなく ring(box-shadow)にする。border は
                      幅に関わらず 2px を占めるので、細い断片ほど中身の比率が狂い、
                      **高さが揃わない**(実測 185/194/192/192)。ring は
                      レイアウトに影響しない。
                    */
                    className="block w-full rounded-md ring-1 ring-slate-200"
                  />
                  {/*
                    順番は画像の上に置く。分割位置を動かすと断片が細くなることが
                    あり、下に文字で置くと「1/枚/目」と折り返して並びが崩れる。
                  */}
                  <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/55 px-1 text-[10px] font-bold leading-tight text-white">
                    {piece.index}
                  </span>
                </div>
                <figcaption className="px-0.5 text-center">
                  <button
                    type="button"
                    onClick={() => void savePiece(piece)}
                    className="whitespace-nowrap text-[11px] font-medium text-pink-600 underline hover:text-pink-800"
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
                {pieceCount}枚をまとめて保存・共有
              </Button>
            ) : !isMobile ? (
              <Button type="button" onClick={downloadAll}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden />
                {pieceCount}枚まとめて保存
              </Button>
            ) : null /* モバイルで共有不可なら1枚ずつのみ(連続DLはiOSが潰す) */}
          </div>
          {showMobileShare ? (
            <p className="text-xs leading-5 text-slate-600">
              開いたシートで
              <strong>「{pieceCount}枚の画像を保存」</strong>
              を選ぶと写真アプリに入ります。Xアプリの投稿画面で、
              写真から1枚目→{pieceCount}枚目の順に選んで投稿してください
              {isFourPieces
                ? "（タイムラインでは2×2に並び、タップしてスワイプするとつながって見えます）"
                : ""}
              。
            </p>
          ) : (
            <p className="text-xs leading-5 text-slate-500">
              Xでは1枚目から順に選んで投稿してください。
              {isFourPieces
                ? "タイムラインでは2×2に並び、タップしてスワイプすると1枚ずつつながって見えます。"
                : ""}
            </p>
          )}
        </div>
      ) : null}

    </div>
  );
}
