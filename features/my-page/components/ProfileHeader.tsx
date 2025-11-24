"use client";

import { useState } from "react";
import Image from "next/image";
import { User, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileEditModal } from "./ProfileEditModal";
import type { UserProfile } from "../lib/server-api";

interface ProfileHeaderProps {
  profile: UserProfile;
  isOwnProfile: boolean;
  onProfileUpdate?: (updatedProfile: UserProfile) => void;
}

export function ProfileHeader({
  profile,
  isOwnProfile,
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

  return (
    <>
      <div className="mb-6">
        <div className="flex items-start gap-4">
          {/* アバター */}
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

          {/* プロフィール情報 */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">{displayName}</h2>
              {isOwnProfile && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setIsEditModalOpen(true)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              )}
            </div>
            {currentProfile.bio && (
              <p className="mt-1 text-sm text-gray-600">{currentProfile.bio}</p>
            )}
          </div>
        </div>
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

