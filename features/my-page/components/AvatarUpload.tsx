"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { User, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserProfile } from "../lib/server-api";

interface AvatarUploadProps {
  profile: UserProfile;
  onAvatarUpdate: (avatarUrl: string) => void;
}

export function AvatarUpload({ profile, onAvatarUpdate }: AvatarUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ファイルタイプの検証
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルのみ選択可能です");
      return;
    }

    // ファイルサイズの検証（10MB制限）
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      setError("ファイルサイズは10MB以下にしてください");
      return;
    }

    setError(null);

    // プレビューを生成
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
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
      onAvatarUpdate(avatar_url);
      setPreview(null);
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
    setPreview(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const displayAvatar = preview || profile.avatar_url;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {/* アバタープレビュー */}
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gray-200 overflow-hidden">
          {displayAvatar ? (
            <Image
              src={displayAvatar}
              alt="プロフィール画像"
              width={80}
              height={80}
              className="rounded-full object-cover"
            />
          ) : (
            <User className="h-10 w-10 text-gray-500" />
          )}
        </div>

        {/* アップロードボタン */}
        <div className="flex-1 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
            id="avatar-upload"
          />
          <label htmlFor="avatar-upload">
            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
              disabled={isUploading}
            >
              <span>
                <Upload className="h-4 w-4 mr-2" />
                画像を選択
              </span>
            </Button>
          </label>
          {preview && (
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleUpload}
                disabled={isUploading}
              >
                {isUploading ? "アップロード中..." : "アップロード"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isUploading}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* エラーメッセージ */}
      {error && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
}

