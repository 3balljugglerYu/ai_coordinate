import { SUBMISSION_IMAGE_MIN_DIMENSION } from "@/features/inspire/lib/submission-image-constraints";

/**
 * 見本(参照画像)を上げる前に、手元で縮める。
 * POST /api/catalog-references の決まり(縦横とも 768〜4096px・4MB まで)に合わせる。
 *
 * 元の画像の縮め方(normalizeSourceImage)は、2MB を超えると長い辺を 1024px まで縮めるので、
 * 縦長・横長の見本は短い辺が 768px を下回って必ず断られる。見本は短い辺を残す縮め方にする。
 */

/** 送る大きさの上限(API は 4MB。基盤の本文の上限が約 4.5MB なので余裕をみる) */
export const REFERENCE_UPLOAD_MAX_BYTES = 3.5 * 1024 * 1024;
/** 縦横の上限(サーバーの MAX_DIMENSION と同じ) */
export const REFERENCE_IMAGE_MAX_DIMENSION = 4096;
/** 縮めるときの長い辺のめやす(短い辺が 768px を下回るときは、短い辺を優先する) */
const TARGET_LONG_EDGE = 2048;
const JPEG_QUALITIES = [0.85, 0.7] as const;
const AS_IS_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ReferenceImageProblem = "load_failed" | "too_small" | "too_large";

export class ReferenceImageError extends Error {
  constructor(readonly problem: ReferenceImageProblem) {
    super(problem);
    this.name = "ReferenceImageError";
  }
}

export type ReferenceResizePlan =
  | { kind: "as_is" }
  | { kind: "resize"; width: number; height: number }
  | { kind: "reject"; problem: Exclude<ReferenceImageProblem, "load_failed"> };

/** 縮め方を決める(画像の読み書きとは分けて、テストできるようにする) */
export function planReferenceResize(input: {
  width: number;
  height: number;
  bytes: number;
  type: string;
}): ReferenceResizePlan {
  const { width, height, bytes, type } = input;
  const short = Math.min(width, height);
  const long = Math.max(width, height);

  if (short < SUBMISSION_IMAGE_MIN_DIMENSION) {
    return { kind: "reject", problem: "too_small" };
  }
  if (bytes <= REFERENCE_UPLOAD_MAX_BYTES && long <= REFERENCE_IMAGE_MAX_DIMENSION && AS_IS_TYPES.has(type)) {
    return { kind: "as_is" };
  }

  // 長い辺をめやすまで縮める。短い辺が下限を下回るなら、短い辺を下限に合わせる。長い辺は上限を超えない
  let scale = Math.min(1, TARGET_LONG_EDGE / long);
  if (short * scale < SUBMISSION_IMAGE_MIN_DIMENSION) {
    scale = SUBMISSION_IMAGE_MIN_DIMENSION / short;
  }
  scale = Math.min(scale, REFERENCE_IMAGE_MAX_DIMENSION / long);
  const resizedShort = Math.round(short * scale);
  if (resizedShort < SUBMISSION_IMAGE_MIN_DIMENSION) {
    // 細長すぎて、上限と下限を両方は守れない
    return { kind: "reject", problem: "too_large" };
  }
  return {
    kind: "resize",
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ReferenceImageError("load_failed"));
    };
    img.src = url;
  });
}

function toJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ReferenceImageError("load_failed"))),
      "image/jpeg",
      quality,
    );
  });
}

/** 見本を、API が受け取れる形にする。受け取れないときは ReferenceImageError を投げる */
export async function prepareCatalogReferenceImage(file: File): Promise<File> {
  const image = await loadImage(file);
  const plan = planReferenceResize({
    width: image.naturalWidth,
    height: image.naturalHeight,
    bytes: file.size,
    type: file.type,
  });
  if (plan.kind === "reject") throw new ReferenceImageError(plan.problem);
  if (plan.kind === "as_is") return file;

  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext("2d");
  if (!context) throw new ReferenceImageError("load_failed");
  context.drawImage(image, 0, 0, plan.width, plan.height);

  for (const quality of JPEG_QUALITIES) {
    const blob = await toJpegBlob(canvas, quality);
    if (blob.size <= REFERENCE_UPLOAD_MAX_BYTES) {
      const name = file.name.replace(/\.[^.]+$/, "") || "reference";
      return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
    }
  }
  throw new ReferenceImageError("too_large");
}
