"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { User, Edit, Menu, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileEditModal } from "./ProfileEditModal";
import { AvatarUpload } from "./AvatarUpload";
import { CollapsibleText } from "@/features/posts/components/CollapsibleText";
import { FollowButton } from "@/features/users/components/FollowButton";
import type { UserProfile } from "../lib/server-api";

interface ProfileHeaderProps {
  profile: UserProfile;
  isOwnProfile: boolean;
  userId: string;
  currentUserId?: string | null;
  onProfileUpdate?: (updatedProfile: UserProfile) => void;
}

export function ProfileHeader({
  profile,
  isOwnProfile,
  userId,
  currentUserId,
  onProfileUpdate,
}: ProfileHeaderProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentProfile, setCurrentProfile] = useState(profile);

  // profile が変わったら state を同期（別アカウント切り替え時に古いユーザー情報が表示されるのを防ぐ）
  useEffect(() => {
    setCurrentProfile(profile);
  }, [profile]);

  const displayName =
    currentProfile.nickname ||
    currentProfile.email?.split("@")[0] ||
    "ユーザー";

  const handleProfileUpdate = (updatedProfile: UserProfile) => {
    setCurrentProfile(updatedProfile);
    onProfileUpdate?.(updatedProfile);
  };

  const handleAvatarUpdate = (avatarUrl: string) => {
    const updatedProfile = { ...currentProfile, avatar_url: avatarUrl };
    setCurrentProfile(updatedProfile);
    onProfileUpdate?.(updatedProfile);
  };

  return (
    <>
      <div className="relative mb-6">
        {isOwnProfile && (
          <div className="absolute right-0 top-0 z-10">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="メニューを開く"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem asChild>
                  <Link href="/my-page/account">アカウントについて</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/my-page/contact" className="flex items-center">
                    <MessageCircle className="mr-2 h-4 w-4" />
                    お問い合わせ
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {isOwnProfile ? (
          // 自分のプロフィールの場合: アバターアップロード機能付き
          <>
            <AvatarUpload
              profile={currentProfile}
              onAvatarUpdate={handleAvatarUpdate}
            />
            {/* プロフィール情報 */}
            <div className="mt-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900">{displayName}</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setIsEditModalOpen(true)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
              {currentProfile.bio && (
                <div className="mt-1">
                  <CollapsibleText
                    text={currentProfile.bio}
                    maxLines={3}
                    textClassName="text-sm text-gray-600"
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          // 他ユーザーのプロフィールの場合: アバター表示とフォローボタン
          <>
            <div className="flex items-end justify-between">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-gray-200">
                {currentProfile.avatar_url ? (
                  <Image
                    src={currentProfile.avatar_url}
                    alt={displayName}
                    width={96}
                    height={96}
                    className="rounded-full object-cover"
                  />
                ) : (
                  <User className="h-12 w-12 text-gray-500" />
                )}
              </div>
              <FollowButton userId={userId} currentUserId={currentUserId} />
            </div>
            {/* プロフィール情報 */}
            <div className="mt-4">
              <h2 className="text-xl font-bold text-gray-900">{displayName}</h2>
              {currentProfile.bio && (
                <div className="mt-1">
                  <CollapsibleText
                    text={currentProfile.bio}
                    maxLines={3}
                    textClassName="text-sm text-gray-600"
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {isOwnProfile && (
        <ProfileEditModal
          profile={currentProfile}
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          onUpdate={handleProfileUpdate}
        />
      )}
    </>
  );
}
