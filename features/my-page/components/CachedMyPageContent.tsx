import Link from "next/link";
import Image from "next/image";
import { Plus } from "lucide-react";
import { cacheLife, cacheTag } from "next/cache";
import { Card } from "@/components/ui/card";
import {
  getUserProfileServer,
  getUserStatsServer,
  getPercoinBalanceServer,
  getMyImagesServer,
} from "../lib/server-api";
import { ProfileHeader } from "./ProfileHeader";
import { UserStats } from "./UserStats";
import { MyPageImageGalleryClient } from "./MyPageImageGalleryClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROUTES } from "@/constants";

interface CachedMyPageContentProps {
  userId: string;
}

/**
 * マイページ用（use cache でサーバーキャッシュ）
 * userId を引数で受け取り、cookies を use cache 内で使わない
 */
export async function CachedMyPageContent({ userId }: CachedMyPageContentProps) {
  "use cache";
  cacheTag(`my-page-${userId}`);
  cacheLife("minutes");

  const supabase = createAdminClient();

  const [profile, stats, percoinBalance, images] = await Promise.all([
    getUserProfileServer(userId, supabase),
    getUserStatsServer(userId, supabase, { isOwnProfile: true }),
    getPercoinBalanceServer(userId, supabase),
    getMyImagesServer(userId, "all", 20, 0, supabase),
  ]);

  return (
    <>
      <ProfileHeader
        key={userId}
        profile={profile}
        isOwnProfile
        userId={userId}
        currentUserId={userId}
      />

      <UserStats stats={stats} />

      <div className="mb-6">
        <Link href={ROUTES.MY_PAGE_CREDITS_PURCHASE}>
          <Card className="p-4 transition-opacity hover:opacity-90 cursor-pointer">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full">
                  <Image
                    src="/percoin.png"
                    alt="ペルコイン"
                    width={48}
                    height={48}
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-gray-600">ペルコイン残高</p>
                  <p className="text-xl font-bold text-gray-900">
                    {percoinBalance.toLocaleString()} ペルコイン
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-600">
                <Plus className="h-4 w-4" />
                購入
              </span>
            </div>
          </Card>
        </Link>
        <div className="mt-2 flex justify-end pr-4">
          <Link
            href={ROUTES.MY_PAGE_CREDITS}
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            取引履歴
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          生成画像一覧
        </h2>
        <MyPageImageGalleryClient
          initialImages={images}
          currentUserId={userId}
        />
      </div>
    </>
  );
}
