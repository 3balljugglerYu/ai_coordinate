import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getPublicMountByToken } from "@/features/collections/lib/public-mount-server-api";
import { MountShareButton } from "@/features/collections/components/MountShareButton";

interface PublicMountPageProps {
  params: Promise<{ token: string }>;
}

// 注: i18n は Phase 7 で整える。当面は企画(JP)向けに日本語コピーを用いる。
const SHARE_DESCRIPTION =
  "うちの子のシールを集めて作ったコンプリート台紙。あなたのうちの子でも作れます。";

export async function generateMetadata({
  params,
}: PublicMountPageProps): Promise<Metadata> {
  const { token } = await params;
  const mount = await getPublicMountByToken(token);
  const title = mount
    ? `${mount.displayNameJa} コンプリート台紙 | Persta.AI`
    : "コンプリート台紙 | Persta.AI";

  // link-only(一覧化しない)。検索インデックスには載せない。
  const base: Metadata = {
    title,
    description: SHARE_DESCRIPTION,
    robots: { index: false, follow: true },
  };
  if (!mount) return base;

  return {
    ...base,
    openGraph: {
      title,
      description: SHARE_DESCRIPTION,
      type: "article",
      siteName: "Persta.AI",
      images: [{ url: mount.mountImageUrl, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: SHARE_DESCRIPTION,
      images: [mount.mountImageUrl],
    },
  };
}

export default async function PublicMountPage({
  params,
}: PublicMountPageProps) {
  await connection();
  const { token } = await params;

  const mount = await getPublicMountByToken(token);
  if (!mount) {
    notFound();
  }

  const viewer = await getUser();
  const isOwner = viewer?.id === mount.ownerId;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center gap-6 px-4 py-8">
      <h1 className="text-center text-xl font-bold text-gray-900">
        {mount.displayNameJa} コンプリート台紙
      </h1>

      <div className="relative aspect-[525/612] w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 shadow-md">
        <Image
          src={mount.mountImageUrl}
          alt={`${mount.displayNameJa} コンプリート台紙`}
          fill
          sizes="(max-width: 480px) 92vw, 384px"
          className="object-cover"
          priority
        />
      </div>

      {isOwner ? (
        <MountShareButton
          completionId={mount.completionId}
          mountImageUrl={mount.mountImageUrl}
          displayName={mount.displayNameJa}
        />
      ) : null}

      <section className="w-full rounded-xl bg-gray-50 p-5 text-center">
        <p className="text-sm font-medium text-gray-800">
          あなたのうちの子でも作れる！
        </p>
        <p className="mt-1 text-xs text-gray-500">
          シールを集めてコンプリート台紙を作ろう。
        </p>
        <Link
          href="/style"
          className="mt-3 inline-block rounded-md bg-primary px-6 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Persta で作ってみる
        </Link>
        <div className="mt-2">
          <Link
            href="/collections/wafer"
            className="text-xs text-gray-500 underline hover:text-gray-700"
          >
            遊び方をみる
          </Link>
        </div>
      </section>
    </main>
  );
}
