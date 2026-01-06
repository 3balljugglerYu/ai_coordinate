import { Area } from "react-easy-crop";

/**
 * トリミング後の画像を生成するユーティリティ関数（円形対応）
 * react-easy-cropのcroppedAreaPixelsを使用
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  isHeifFormat?: boolean
): Promise<Blob> {
  const image = await createImage(imageSrc, isHeifFormat);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvasコンテキストを取得できませんでした");
  }

  // キャンバスサイズをトリミングサイズに設定
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // 画像をトリミングして描画
  // pixelCropは既に実際の画像サイズに対するピクセル座標なので、そのまま使用
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  // 円形にクリップ
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  ctx.arc(
    pixelCrop.width / 2,
    pixelCrop.height / 2,
    pixelCrop.width / 2,
    0,
    2 * Math.PI
  );
  ctx.fill();

  return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("画像の生成に失敗しました"));
            return;
          }
          resolve(blob);
        },
        "image/png",
        1.0
      );
  });
}

function createImage(url: string, isHeifFormat?: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => {
      // HEIF形式の場合のみ、HEIF形式に関するエラーメッセージを表示
      if (isHeifFormat) {
        reject(new Error("画像の読み込みに失敗しました。HEIF形式のファイルは、お使いのブラウザではサポートされていない可能性があります。JPEGまたはPNG形式のファイルをご利用ください。"));
      } else {
        reject(new Error("画像の読み込みに失敗しました。ファイルが破損しているか、サポートされていない形式の可能性があります。"));
      }
    });
    image.src = url;
  });
}

