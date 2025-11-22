"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProfileHeader } from "./ProfileHeader";
import { UserStats } from "./UserStats";
import { MyPageImageGallery } from "./MyPageImageGallery";
import type { ImageFilter } from "./ImageTabs";
import { deleteMyImage } from "../lib/api";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";
import type { UserProfile, UserStats as UserStatsType } from "../lib/server-api";

interface MyPageContentProps {
  profile: UserProfile;
  stats: UserStatsType;
  images: GeneratedImageRecord[];
  creditBalance: number;
  currentUserId?: string | null;
}

export function MyPageContent({
  profile,
  stats,
  images: initialImages,
  creditBalance,
  currentUserId,
}: MyPageContentProps) {
  const [images, setImages] = useState(initialImages);
  const [filter, setFilter] = useState<ImageFilter>("all");

  const handleDelete = async (imageId: string) => {
    try {
      await deleteMyImage(imageId);
      setImages((prev) => prev.filter((img) => img.id !== imageId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  return (
    <>
      {/* プロフィールヘッダー */}
      <ProfileHeader profile={profile} isOwnProfile={true} />

      {/* 統計情報 */}
      <UserStats stats={stats} />

      {/* クレジット残高カード */}
      <Link href="/my-page/credits" className="block mb-6">
        <Card className="p-4 hover:bg-gray-50 transition-colors cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                <CreditCard className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">クレジット残高</p>
                <p className="text-xl font-bold text-gray-900">
                  {creditBalance.toLocaleString()} クレジット
                </p>
              </div>
            </div>
            <div className="text-sm font-medium text-gray-600">購入</div>
          </div>
        </Card>
      </Link>

      {/* 画像一覧 */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          生成画像一覧
        </h2>
        <MyPageImageGallery
          initialImages={images}
          filter={filter}
          onFilterChange={setFilter}
          onDelete={handleDelete}
          currentUserId={currentUserId}
        />
      </div>
    </>
  );
}
