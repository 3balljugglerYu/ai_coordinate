import { Area } from "react-easy-crop";

/**
 * トリミング後の画像を生成するユーティリティ関数（円形対応）
 * react-easy-cropのcroppedAreaPixelsを使用
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas context is not available");
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
          reject(new Error("Canvas is empty"));
          return;
        }
        resolve(blob);
      },
      "image/png",
      1.0
    );
  });
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.src = url;
  });
}

