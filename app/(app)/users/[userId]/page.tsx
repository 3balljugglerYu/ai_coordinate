import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getUserProfileServer,
  getUserStatsServer,
  getUserPostsServer,
} from "@/features/my-page/lib/server-api";
import { UserProfilePage } from "@/features/my-page/components/UserProfilePage";
import { UserProfilePageSkeleton } from "@/features/my-page/components/UserProfilePageSkeleton";
import { getSiteUrl } from "@/lib/env";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<Metadata> {
  const { userId } = await params;

  // プロフィール情報を取得
  let profile;
  try {
    profile = await getUserProfileServer(userId);
  } catch (error) {
    // エラーが発生した場合は404用のメタデータを返す
    return {
      title: "ユーザーが見つかりません | AI Coordinate",
      description: "指定されたユーザーは見つかりませんでした。",
    };
  }

  if (!profile || !profile.nickname) {
    return {
      title: "ユーザーが見つかりません | AI Coordinate",
      description: "指定されたユーザーは見つかりませんでした。",
    };
  }

  const siteUrl = getSiteUrl();
  const userUrl = siteUrl ? `${siteUrl}/users/${userId}` : "";
  const title = `${profile.nickname} | AI Coordinate`;
  const description = profile.bio || `${profile.nickname}のプロフィールページ`;

  // プロフィール画像のURLを取得（絶対URLに変換）
  let avatarUrl: string | undefined;
  if (profile.avatar_url) {
    // 既に絶対URLの場合はそのまま使用、相対URLの場合はサイトURLを付与
    if (profile.avatar_url.startsWith("http")) {
      avatarUrl = profile.avatar_url;
    } else if (siteUrl) {
      avatarUrl = `${siteUrl}${profile.avatar_url}`;
    }
  }

  const metadata: Metadata = {
    title,
    description,
    openGraph: {
      title,
      description,
      url: userUrl,
      siteName: "AI Coordinate",
      type: "profile",
      ...(avatarUrl && {
        images: [
          {
            url: avatarUrl,
            width: 400,
            height: 400,
            alt: `${profile.nickname}のプロフィール画像`,
          },
        ],
      }),
    },
    twitter: {
      card: "summary",
      title,
      description,
      ...(avatarUrl && {
        images: [avatarUrl],
      }),
    },
  };

  return metadata;
}

async function UserProfileData({ userId }: { userId: string }) {
  const [profile, stats, posts] = await Promise.all([
    getUserProfileServer(userId),
    getUserStatsServer(userId),
    getUserPostsServer(userId, 20, 0),
  ]);

  // プロフィールが存在しない場合は404を返す
  if (!profile || !profile.nickname) {
    notFound();
  }

  return (
    <UserProfilePage
      profile={profile}
      stats={stats}
      posts={posts}
      userId={userId}
    />
  );
}

export default async function UserProfilePageRoute({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-1 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          {/* 動的コンテンツ */}
          <Suspense fallback={<UserProfilePageSkeleton />}>
            <UserProfileData userId={userId} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

