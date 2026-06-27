import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import {
  getCollectionBookByToken,
  getPublicMountByToken,
} from "@/features/collections/lib/public-mount-server-api";
import { mountAspectForCategory } from "@/features/collections/lib/mount-aspects";
import { MountShareButton } from "@/features/collections/components/MountShareButton";
import { MountCelebrationBackground } from "@/features/collections/components/MountCelebrationBackground";

interface PublicMountPageProps {
  params: Promise<{ token: string }>;
}

// 注: i18n は Phase 7 で整える。当面は企画(JP)向けに日本語コピーを用いる。
const SHARE_DESCRIPTION =
  "うちの子のシールを集めて作ったコンプリートカード。あなたのうちの子でも作れます。";

export async function generateMetadata({
  params,
}: PublicMountPageProps): Promise<Metadata> {
  const { token } = await params;

  // book(めくれる日記帳)完走は /m/<id>/book にリダイレクトする。リダイレクトを辿らない
  // クローラ向けにも、book では台紙ではなく日記帳のタイトル/OGP を返す。
  const book = await getCollectionBookByToken(token);
  if (book) {
    const bookTitle = `${book.displayNameJa} | Persta.AI`;
    const bookDescription =
      "うちの子の旅行日記(スクラップブック)。あなたのうちの子でも作れます。";
    const bookBase: Metadata = {
      title: bookTitle,
      description: bookDescription,
      robots: { index: false, follow: true },
    };
    if (!book.ogpImageUrl) return bookBase;
    return {
      ...bookBase,
      openGraph: {
        title: bookTitle,
        description: bookDescription,
        type: "article",
        siteName: "Persta.AI",
        images: [
          { url: book.ogpImageUrl, alt: bookTitle, width: 1200, height: 630 },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: bookTitle,
        description: bookDescription,
        images: [book.ogpImageUrl],
      },
    };
  }

  const mount = await getPublicMountByToken(token);
  const title = mount
    ? `${mount.displayNameJa} コンプリートカード | Persta.AI`
    : "コンプリートカード | Persta.AI";

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

  // book(めくれる日記帳)完走は没入の本リーダーへ。/m/<id> への既存導線を全てカバーする。
  const book = await getCollectionBookByToken(token);
  if (book) {
    redirect(`/m/${token}/book`);
  }

  const mount = await getPublicMountByToken(token);
  if (!mount) {
    notFound();
  }

  const viewer = await getUser();
  const isOwner = viewer?.id === mount.ownerId;

  return (
    <>
      <MountCelebrationBackground />
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center gap-6 px-4 py-8">
      <h1 className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 bg-clip-text text-center text-2xl font-extrabold text-transparent">
        {mount.displayNameJa}
        <br />
        コンプリート！
      </h1>

      <div
        className="relative w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 shadow-md"
        style={{
          aspectRatio: mountAspectForCategory(
            mount.categoryKey,
            mount.mountTemplateWidth,
            mount.mountTemplateHeight,
          ),
        }}
      >
        <Image
          src={mount.mountImageUrl}
          alt={`${mount.displayNameJa} コンプリートカード`}
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
          <br />
          シールを集めてコンプリートを目指そう！
        </p>
        <div className="mt-3">
          <Link
            href="/collections/wafer"
            className="text-xs text-gray-500 underline hover:text-gray-700"
          >
            遊び方をみる
          </Link>
        </div>
      </section>
      </main>
    </>
  );
}
