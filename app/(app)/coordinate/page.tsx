"use client";

import { useState } from "react";
import { ImageUploader } from "@/features/generation/components/ImageUploader";
import type { UploadedImage } from "@/features/generation/types";

export default function CoordinatePage() {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);

  const handleImageUpload = (image: UploadedImage) => {
    setUploadedImage(image);
    console.log("画像がアップロードされました:", {
      name: image.file.name,
      size: image.file.size,
      dimensions: `${image.width}x${image.height}`,
    });
  };

  const handleImageRemove = () => {
    setUploadedImage(null);
    console.log("画像が削除されました");
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-8 text-3xl font-bold text-gray-900">
          コーディネート画面
        </h1>

        <div className="rounded-lg bg-white p-6 shadow-sm">
          <ImageUploader
            onImageUpload={handleImageUpload}
            onImageRemove={handleImageRemove}
          />

          {uploadedImage && (
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-700">
                アップロード情報
              </h2>
              <dl className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between">
                  <dt className="font-medium">ファイル名:</dt>
                  <dd>{uploadedImage.file.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium">サイズ:</dt>
                  <dd>{(uploadedImage.file.size / 1024).toFixed(2)} KB</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium">形式:</dt>
                  <dd>{uploadedImage.file.type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium">寸法:</dt>
                  <dd>
                    {uploadedImage.width} × {uploadedImage.height} px
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

