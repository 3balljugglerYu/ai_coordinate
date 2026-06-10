import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getPublicMountByToken } from "@/features/collections/lib/public-mount-server-api";
import { mountAspectForCategory } from "@/features/collections/lib/mount-aspects";
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

  // X(summary_large_image)・Facebook 等は 2:1 横長想定。台紙は縦長なので
  // 横長 OGP(1200x630)を別途用意してそれを優先的に使う。
  // mount-{ts}.png → ogp-{ts}.png の対応(コミット 2026-06-09 以降に作成された
  // 台紙は OGP も併せて生成される)。旧台紙は OGP ファイルが無いので、その
  // 場合のみ縦長 mount をフォールバックに使う(中央クロップで一部が見切れる)。
  const ogpImageUrl = mount.mountImageUrl.includes("/mount-")
    ? mount.mountImageUrl.replace("/mount-", "/ogp-")
    : mount.mountImageUrl;

  return {
    ...base,
    openGraph: {
      title,
      description: SHARE_DESCRIPTION,
      type: "article",
      siteName: "Persta.AI",
      images: [{ url: ogpImageUrl, alt: title, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: SHARE_DESCRIPTION,
      images: [ogpImageUrl],
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

      <div
        className="relative w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 shadow-md"
        style={{ aspectRatio: mountAspectForCategory(mount.categoryKey) }}
      >
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
