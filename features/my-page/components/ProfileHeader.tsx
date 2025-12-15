"use client";

import { useState } from "react";
import Image from "next/image";
import { User, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <div className="mb-6">
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
          <div className="flex items-start gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gray-200">
              {currentProfile.avatar_url ? (
                <Image
                  src={currentProfile.avatar_url}
                  alt={displayName}
                  width={80}
                  height={80}
                  className="rounded-full object-cover"
                />
              ) : (
                <User className="h-10 w-10 text-gray-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold text-gray-900">{displayName}</h2>
                <FollowButton userId={userId} currentUserId={currentUserId} />
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
          </div>
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

