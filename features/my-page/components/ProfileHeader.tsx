"use client";

import Image from "next/image";
import { User, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserProfile } from "../lib/server-api";

interface ProfileHeaderProps {
  profile: UserProfile;
  isOwnProfile: boolean;
}

export function ProfileHeader({ profile, isOwnProfile }: ProfileHeaderProps) {
  const displayName = profile.nickname || profile.email?.split("@")[0] || "ユーザー";

  return (
    <div className="mb-6">
      <div className="flex items-start gap-4">
        {/* アバター */}
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gray-200">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
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
              <Button variant="ghost" size="sm" className="h-7 px-2">
                <Edit className="h-4 w-4" />
              </Button>
            )}
          </div>
          {profile.bio && (
            <p className="mt-1 text-sm text-gray-600">{profile.bio}</p>
          )}
        </div>
      </div>
    </div>
  );
}

