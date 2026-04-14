"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { User, Edit, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/features/auth/lib/auth-client";
import { UserMenuItems } from "@/features/auth/components/UserMenuItems";
import { ProfileEditModal } from "./ProfileEditModal";
import { AvatarUpload } from "./AvatarUpload";
import { CollapsibleText } from "@/features/posts/components/CollapsibleText";
import { FollowButton } from "@/features/users/components/FollowButton";
import { SubscriptionBadge } from "@/features/subscription/components/SubscriptionBadge";
import type { UserProfile } from "../lib/server-api";
import {
  DEFAULT_LOCALE,
  isLocale,
  localizePublicPath,
} from "@/i18n/config";

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
  const router = useRouter();
  const localeValue = useLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const navT = useTranslations("nav");
  const postsT = useTranslations("posts");
  const subscriptionT = useTranslations("subscription");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentProfile, setCurrentProfile] = useState(profile);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push(localizePublicPath("/", locale));
      router.refresh();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  // profile が変わったら state を同期（別アカウント切り替え時に古いユーザー情報が表示されるのを防ぐ）
  useEffect(() => {
    setCurrentProfile(profile);
  }, [profile]);

  const displayName =
    currentProfile.nickname ||
    currentProfile.email?.split("@")[0] ||
    postsT("anonymousUser");

  const handleProfileUpdate = (updatedProfile: UserProfile) => {
    setCurrentProfile(updatedProfile);
    onProfileUpdate?.(updatedProfile);
  };

  const handleAvatarUpdate = (avatarUrl: string) => {
    const updatedProfile = { ...currentProfile, avatar_url: avatarUrl };
    setCurrentProfile(updatedProfile);
    onProfileUpdate?.(updatedProfile);
  };

  const planBadge =
    currentProfile.subscription_plan && currentProfile.subscription_plan !== "free" ? (
      <Link
        href="/pricing"
        aria-label={subscriptionT("seePlansAction")}
        className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
      >
        <SubscriptionBadge
          plan={currentProfile.subscription_plan}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
        />
      </Link>
    ) : null;

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
                  aria-label={navT("openUserMenu")}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <UserMenuItems onSignOut={handleSignOut} />
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
                {planBadge}
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
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900">{displayName}</h2>
                {planBadge}
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
