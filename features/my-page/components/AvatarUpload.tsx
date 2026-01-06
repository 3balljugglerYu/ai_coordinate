"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { User, Camera, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import Cropper, { Area } from "react-easy-crop";
import { getCroppedImg } from "../lib/cropImage";
import type { UserProfile } from "../lib/server-api";

interface AvatarUploadProps {
  profile: UserProfile;
  onAvatarUpdate: (avatarUrl: string) => void;
}

export function AvatarUpload({ profile, onAvatarUpdate }: AvatarUploadProps) {
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isCropMode, setIsCropMode] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHeifFormat, setIsHeifFormat] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewBlobUrlRef = useRef<string | null>(null);

  // Blob URLのクリーンアップ
  useEffect(() => {
    return () => {
      if (previewBlobUrlRef.current) {
        URL.revokeObjectURL(previewBlobUrlRef.current);
        previewBlobUrlRef.current = null;
      }
    };
  }, []);

  // profile.avatar_urlが更新されたら、previewをクリア
  useEffect(() => {
    if (profile.avatar_url && previewBlobUrlRef.current) {
      URL.revokeObjectURL(previewBlobUrlRef.current);
      previewBlobUrlRef.current = null;
      setPreview(null);
    }
  }, [profile.avatar_url]);

  const displayAvatar = preview || profile.avatar_url;

  const handleAvatarClick = () => {
    setIsFullscreenOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ファイルタイプの検証
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルのみ選択可能です");
      return;
    }

    // HEIF形式の検出と警告
    const detectedIsHeifFormat = file.type === "image/heic" || file.type === "image/heif";
    setIsHeifFormat(detectedIsHeifFormat);
    if (detectedIsHeifFormat) {
      // HEIF形式の場合、ブラウザがサポートしていない可能性があるため警告を表示
      // ただし、処理は続行（getCroppedImg関数でPNG形式に変換される）
      console.warn("HEIF形式のファイルが検出されました。PNG形式に変換されます。");
    }

    // ファイルサイズの検証（10MB制限）
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      setError("ファイルサイズは10MB以下にしてください");
      return;
    }

    setError(null);

    // 画像を読み込んでトリミング画面を表示
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageSrc(reader.result as string);
      setIsCropMode(true);
      setZoom(1);
      setCrop({ x: 0, y: 0 });
    };
    reader.onerror = () => {
      // HEIF形式をサポートしていないブラウザの場合、エラーが発生する可能性がある
      if (detectedIsHeifFormat) {
        setError("HEIF形式のファイルは、お使いのブラウザではサポートされていません。JPEGまたはPNG形式のファイルをご利用ください。");
      } else {
        setError("画像の読み込みに失敗しました");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  const handleCropComplete = async (croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleCropDone = async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    setIsUploading(true);
    setError(null);

    try {
      // トリミング後の画像を生成
      const croppedImageBlob = await getCroppedImg(
        imageSrc,
        croppedAreaPixels,
        isHeifFormat
      );

      // BlobをFileに変換
      const file = new File([croppedImageBlob], "avatar.png", {
        type: "image/png",
      });

      // プレビューを生成
      const previewUrl = URL.createObjectURL(croppedImageBlob);
      // 以前のBlob URLをクリーンアップ
      if (previewBlobUrlRef.current) {
        URL.revokeObjectURL(previewBlobUrlRef.current);
      }
      previewBlobUrlRef.current = previewUrl;
      setPreview(previewUrl);

      // アップロード
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/users/${profile.id}/avatar`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "画像のアップロードに失敗しました");
      }

      const { avatar_url } = await response.json();
      
      // アップロード成功後は、すぐにpreviewをクリアしてサーバーのURLを使用
      // Blob URLをクリーンアップ
      if (previewBlobUrlRef.current) {
        URL.revokeObjectURL(previewBlobUrlRef.current);
        previewBlobUrlRef.current = null;
      }
      setPreview(null);
      
      onAvatarUpdate(avatar_url);
      // 他コンポーネント（ヘッダー等）に即時反映させるため通知
      window.dispatchEvent(
        new CustomEvent("profile:avatarUpdated", {
          detail: { avatarUrl: avatar_url },
        })
      );
      
      // クリーンアップ
      setIsCropMode(false);
      setImageSrc(null);
      setIsFullscreenOpen(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像のアップロードに失敗しました");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    // Blob URLをクリーンアップ
    if (previewBlobUrlRef.current) {
      URL.revokeObjectURL(previewBlobUrlRef.current);
      previewBlobUrlRef.current = null;
    }
    setPreview(null);
    setImageSrc(null);
    setIsCropMode(false);
    setError(null);
    setIsHeifFormat(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    setIsFullscreenOpen(false);
    handleCancel();
  };

  return (
    <>
      <div className="flex items-center gap-4">
        {/* アバター（クリック可能） */}
        <button
          type="button"
          onClick={handleAvatarClick}
          className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-gray-200 overflow-hidden hover:opacity-80 transition-opacity cursor-pointer"
        >
          {displayAvatar ? (
            <Image
              src={displayAvatar}
              alt="プロフィール画像"
              width={96}
              height={96}
              className="rounded-full object-cover"
              onError={() => {
                // Blob URLが無効な場合、previewをクリア
                if (previewBlobUrlRef.current) {
                  URL.revokeObjectURL(previewBlobUrlRef.current);
                  previewBlobUrlRef.current = null;
                }
                setPreview(null);
              }}
            />
          ) : (
            <User className="h-12 w-12 text-gray-500" />
          )}
        </button>
      </div>

      {/* ファイル入力（非表示） */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* 全画面表示ダイアログ */}
      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent 
          className="!max-w-full !w-full !h-full !max-h-screen !p-0 !bg-black/95 !border-none !rounded-none !translate-x-0 !translate-y-0 !top-0 !left-0" 
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">プロフィール画像</DialogTitle>
          
          {isCropMode && imageSrc ? (
            // トリミングモード
            <>
              <div className="relative w-full h-[70vh] min-h-[400px] bg-black">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={handleCropComplete}
                  style={{
                    containerStyle: {
                      width: "100%",
                      height: "100%",
                      position: "relative",
                    },
                  }}
                />
              </div>
              {/* ズームコントロール */}
              <div className="px-4 py-2 bg-black/50 border-t border-gray-700">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-white min-w-[3rem]">ズーム</span>
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm text-white min-w-[3rem] text-right">
                    {zoom.toFixed(1)}x
                  </span>
                </div>
              </div>
              <DialogFooter className="border-t border-gray-700 bg-black/50 p-4 pb-32 safe-area-inset-bottom">
                <div className="flex gap-2 w-full">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isUploading}
                    className="flex-1 bg-transparent text-white border-gray-600 hover:bg-gray-800"
                  >
                    <X className="h-4 w-4 mr-2" />
                    キャンセル
                  </Button>
                  <Button
                    type="button"
                    onClick={handleCropDone}
                    disabled={isUploading || !croppedAreaPixels}
                    className="flex-1 bg-white text-black hover:bg-gray-200"
                  >
                    {isUploading ? (
                      "アップロード中..."
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        完了
                      </>
                    )}
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : (
            // 通常表示モード
            <>
              <div className="relative flex items-center justify-center h-full min-h-[50vh] p-4">
                {/* 閉じるボタン */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-4 top-4 z-10 rounded-full bg-black/50 text-white hover:bg-black/70"
                  onClick={handleClose}
                >
                  <X className="h-5 w-5" />
                </Button>

                {/* アバター画像 */}
                <div className="flex-1 flex items-center justify-center">
                  {displayAvatar ? (
                    <Image
                      src={displayAvatar}
                      alt="プロフィール画像"
                      width={400}
                      height={400}
                      className="rounded-full object-cover max-w-[80vw] max-h-[80vh] aspect-square"
                      onError={() => {
                        // Blob URLが無効な場合、previewをクリア
                        if (previewBlobUrlRef.current) {
                          URL.revokeObjectURL(previewBlobUrlRef.current);
                          previewBlobUrlRef.current = null;
                        }
                        setPreview(null);
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-center w-64 h-64 rounded-full bg-gray-200">
                      <User className="h-32 w-32 text-gray-500" />
                    </div>
                  )}
                </div>

                {/* 右下の写真アイコン */}
                <div className="absolute bottom-4 right-4">
                  <Button
                    type="button"
                    size="icon"
                    className="h-14 w-14 rounded-full bg-white/90 hover:bg-white shadow-lg"
                    onClick={handleCameraClick}
                    disabled={isUploading}
                  >
                    <Camera className="h-7 w-7 text-gray-900" />
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* エラーメッセージ */}
          {error && (
            <div className="absolute bottom-20 left-4 right-4 rounded-md bg-red-50 p-3 border border-red-200">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
