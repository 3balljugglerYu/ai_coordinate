import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import {
  getSiteUrl,
  isUserStylesAvailable,
  isUserStylesPubliclyEnabled,
} from "@/lib/env";
import { getUserStylesCopy } from "@/i18n/page-copy";
import { createMarketingPageMetadata } from "@/lib/metadata";
import {
  DEFAULT_LOCALE,
  isLocale,
  localizePublicPath,
  type Locale,
} from "@/i18n/config";
import { UserStylesFeedClient } from "@/features/user-styles/components/UserStylesFeedClient";
import { UserStylesFeedSkeleton } from "@/features/user-styles/components/UserStylesFeedSkeleton";
import { getUserStylePage } from "@/features/user-styles/lib/get-user-style-page";
import { getPublicUserStyleFirstPage } from "@/features/user-styles/lib/get-public-user-style-page";

/**
 * User ORIGINAL 一覧（/user-styles）。
 *
 * 構造は `app/styles/page.tsx` に合わせてある: 見出し・説明・掲載条件の注記は
 * ページ本体で描き、リクエスト依存（認証）の一覧だけを `<Suspense>` の中に隔離する。
 *
 * ## 段階公開のゲートと静的シェルの両立
 *
 * ⭐ **一般公開されているあいだは認証を引かない。** 引くとページ全体が
 * リクエスト依存になり、静的シェルの前提が崩れる（`app/styles/page.tsx` 冒頭と同じ理由）。
 * 公開前だけ、運営かどうかを見るために認証を引く（そのときページは動的になる）。
 * 判定そのものは `isUserStylesAvailable` に通すので、認可のルールは1本のまま。
 *
 * ## locale
 *
 * cookie 依存の `getLocale()` ではなく URL パラメータから解決する
 * （`getLocale` はリクエスト依存の動的 API のため静的シェルから外れる）。
 * ロケール無しの直アクセスは proxy が `/{locale}/user-styles` へリダイレクトする。
 */
interface UserStylesPageProps {
  params: Promise<{ locale?: string }>;
}

export async function generateMetadata({
  params,
}: UserStylesPageProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = isLocale(localeParam) ? localeParam : DEFAULT_LOCALE;
  const copy = getUserStylesCopy(locale);

  return createMarketingPageMetadata({
    title: copy.indexTitle,
    description: copy.indexDescription,
    path: "/user-styles",
    locale,
    // indexTitle にはブランド名が含まれるため、OG 側は見出しをベースにする
    ogTitle: copy.indexHeading,
  });
}

/**
 * 一覧本体。閲覧者に依存する除外（双方向ブロック・本人の通報）があるため、
 * ここで認証を引く。
 *
 * ⭐ **必ず独立した `<Suspense>` の中に置くこと。** 認証をページ本体で待つと
 * 見出しと注記まで一緒に遅れる。
 */
async function UserStylesFeedSection() {
  const user = await getUser();
  /*
    未ログインは閲覧者依存の除外（双方向ブロック・本人の通報）が無いので、
    JSON-LD と同じキャッシュを使い回せる（往復を1回に抑える）。
    ⭐ ログイン済みには**絶対にこれを使わない**。除外の結果を他人と共有してしまう。
  */
  const { posts, nextCursor } = user
    ? await getUserStylePage({ currentUserId: user.id })
    : await getPublicUserStyleFirstPage();

  return (
    <UserStylesFeedClient
      initialPosts={posts}
      initialCursor={nextCursor}
      currentUserId={user?.id ?? null}
    />
  );
}

export default async function UserStylesPage({ params }: UserStylesPageProps) {
  const { locale: localeParam } = await params;
  const locale: Locale = isLocale(localeParam) ? localeParam : DEFAULT_LOCALE;
  const copy = getUserStylesCopy(locale);

  // 段階公開。公開後は認証を引かない（静的シェルを保つため）。
  if (!isUserStylesPubliclyEnabled()) {
    const user = await getUser();
    if (!isUserStylesAvailable(user?.id)) {
      notFound();
    }
  }

  /*
    ItemList: 検索エンジンに「一覧」と「投稿詳細」の関係を伝える。

    ⭐ **閲覧者に依らない公開分だけ**で組む（`/styles` と同じ方針）。
    検索エンジンに出す一覧が閲覧者によって変わらないようにするため。
    ⭐ 作品のキャプションは入れない。ユーザーの本文を一覧ページの構造化データへ
    複製する必要はなく、URL の関係を伝えるだけで目的は足りる。
  */
  const { posts: publicPosts } = await getPublicUserStyleFirstPage();
  // HomeStructuredData と同じ方針: 環境変数未設定時も既定ドメインで JSON-LD を出す
  const siteUrl = getSiteUrl() || "https://persta.ai";
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: copy.indexHeading,
    itemListElement: publicPosts
      .filter((post) => !!post.id)
      .slice(0, 50)
      .map((post, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${siteUrl}${localizePublicPath(`/posts/${post.id}`, locale)}`,
      })),
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-6 md:pt-8">
        <header className="mb-6 space-y-2 md:mb-8">
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
            {copy.indexHeading}
          </h1>
          <p className="max-w-3xl text-sm text-gray-600 md:text-base">
            {copy.indexIntro}
          </p>
          {/*
            ⭐ 掲載条件を必ず出す（REQ-015）。書かずに並べると、運営が見繕って
            いるように見えて「勝手に使われている」と受け取られる。並び順の根拠を
            書けるのは、機械的な条件であるうちだけ。
          */}
          <p className="max-w-3xl text-xs text-gray-500">{copy.listingNote}</p>
        </header>

        <Suspense fallback={<UserStylesFeedSkeleton />}>
          <UserStylesFeedSection />
        </Suspense>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
    </main>
  );
}
