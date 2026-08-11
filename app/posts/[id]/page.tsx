import { connection } from "next/server";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { getPost } from "@/features/posts/lib/server-api";
import { getImageDimensions, getPostDisplayUrl } from "@/features/posts/lib/utils";
import { CachedPostDetail } from "@/features/posts/components/CachedPostDetail";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/env";
import { DEFAULT_TITLE_TAGLINE } from "@/constants";
import { DEFAULT_LOCALE, isLocale, localizePublicPath } from "@/i18n/config";
import { getPostPageCopy } from "@/i18n/page-copy";
import { getOneTapStylePresetMetadata } from "@/shared/generation/one-tap-style-metadata";
import {
  resolvePresetUnlockState,
  type PresetUnlockState,
} from "@/features/collections/lib/resolve-preset-unlock-state";

// Next.js 16では、動的ルートはデフォルトで動的レンダリングされる
// キャッシュはfetchのrevalidateオプションまたはReact.cache()で制御
interface PostDetailPageProps {
  params: Promise<{ id: string }>;
}

function buildSanitizedText(
  text: string | null | undefined,
  fallback: string,
  maxLength: number
) {
  if (!text) return fallback;

  const normalized = text
    .replace(/\s+/g, " ")
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .trim();

  if (!normalized) return fallback;

  return normalized.slice(0, maxLength);
}

export async function generateMetadata({ params }: PostDetailPageProps): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const copy = getPostPageCopy(locale);
  const { id } = await params;
  
  // 投稿情報を取得（認証不要で取得可能な情報のみ）
  // メタデータ生成時は常に閲覧数カウントをスキップ
  let post;
  try {
    post = await getPost(id, null, true);
  } catch {
    // エラーが発生した場合は404用のメタデータを返す
    return {
      title: copy.notFoundTitle,
      description: copy.notFoundDescription,
    };
  }

  if (!post) {
    return {
      title: copy.notFoundTitle,
      description: copy.notFoundDescription,
    };
  }

  const siteUrl = getSiteUrl();
  // 完走投稿も通常投稿と同じ詳細ページを正規URLとする(タップ先が詳細に
  // 統一されたため。没入シェアページ /m/... は共有用の別ページとして残る)。
  const postUrl = siteUrl
    ? `${siteUrl}${localizePublicPath(`/posts/${id}`, locale)}`
    : "";
  const imageUrl = getPostDisplayUrl(post);

  // タイトルを投稿ごとに差別化（caption があれば使用、50-60文字を考慮して45文字まで）
  const titleSource = buildSanitizedText(post.caption, "", 45);
  const title = titleSource
    ? `${titleSource} | Persta.AI`
    : `Persta.AI | ${DEFAULT_TITLE_TAGLINE}`;
  const description = buildSanitizedText(post.caption, copy.fallbackDescription, 120);
  const imageAlt = buildSanitizedText(post.caption, copy.fallbackAlt, 80);
  // 画像URLが絶対URLであることを保証
  const ogImage = imageUrl && imageUrl.startsWith("http")
    ? imageUrl
    : siteUrl && imageUrl
    ? `${siteUrl}${imageUrl}`
    : imageUrl;
  const imageDimensions = ogImage ? await getImageDimensions(ogImage) : null;

  const metadata: Metadata = {
    metadataBase: siteUrl ? new URL(siteUrl) : undefined,
    title,
    description,
    alternates: postUrl ? { canonical: postUrl } : undefined,
    openGraph: {
      title,
      description,
      url: postUrl,
      siteName: "Persta.AI",
      type: "article",
      ...(ogImage && {
        images: [
          {
            url: ogImage,
            ...(imageDimensions && {
              width: imageDimensions.width,
              height: imageDimensions.height,
            }),
            alt: imageAlt,
          },
        ],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage && {
        images: [ogImage],
      }),
    },
  };

  return metadata;
}


export default async function PostDetailPage({ params }: PostDetailPageProps) {
  await connection();

  const { id } = await params;

  // 現在のユーザーIDを取得（サーバーサイド）
  let currentUserId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    currentUserId = user?.id ?? null;
  } catch (error) {
    // 認証エラーは無視（ゲストユーザーとして扱う）
    console.error("Auth error:", error);
  }

  // 完走フィード投稿も通常投稿と同じ詳細を表示する(いいね・コメント可。
  // 没入シェアページへは詳細内の CTA から遷移)。
  // JSON-LD は公開情報しか使わないため viewer=null で取得する。generateMetadata の
  // getPost(id, null, true) と同一引数になり、React.cache が同一リクエスト内で
  // 重複取得を防ぐ。詳細本体(CachedPostDetail)は "use cache" の別キャッシュ単位
  // として自前の admin client で取得する(こちらはリクエスト間キャッシュが効く)。
  let postForJsonLd: Awaited<ReturnType<typeof getPost>> = null;
  try {
    postForJsonLd = await getPost(id, null, true);
  } catch (error) {
    // 取得失敗時は JSON-LD なしで通常の詳細表示にフォールバック
    console.error("post fetch for json-ld failed:", error);
  }

  /*
    One-Tap のスタイルカードで「まだ開放されていません」を出すための解放状態。

    `get_collection_progress` は auth.uid() を使うため cookie 認証済みの
    クライアントが要り、"use cache" の中(CachedPostDetail)では解決できない。
    ここ(キャッシュ境界の外)で解決して渡す。

    段階解放でないカテゴリなら resolvePresetUnlockState が問い合わせ無しで
    unlocked を返すので、通常のスタイルでは追加コストが出ない。
  */
  let presetUnlockState: PresetUnlockState = { status: "unknown" };
  const oneTapPresetId = postForJsonLd
    ? (getOneTapStylePresetMetadata(postForJsonLd)?.id ?? null)
    : null;
  if (oneTapPresetId) {
    try {
      presetUnlockState = await resolvePresetUnlockState(
        oneTapPresetId,
        currentUserId,
        await createClient()
      );
    } catch (error) {
      // 判定できないときは案内を出さない側へ倒す
      console.error("preset unlock state resolution failed:", error);
    }
  }

  // 画像検索での発見性を高める ImageObject 構造化データ。
  // (上の取得は generateMetadata と同一キーのため追加の DB 往復は発生しない)
  let imageJsonLd: Record<string, unknown> | null = null;
  if (postForJsonLd) {
    const localeValue = await getLocale();
    const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
    const copy = getPostPageCopy(locale);
    const siteUrl = getSiteUrl();
    const rawImageUrl = getPostDisplayUrl(postForJsonLd);
    const absoluteImageUrl =
      rawImageUrl && rawImageUrl.startsWith("http")
        ? rawImageUrl
        : siteUrl && rawImageUrl
          ? `${siteUrl}${rawImageUrl}`
          : null;

    if (absoluteImageUrl) {
      imageJsonLd = {
        "@context": "https://schema.org",
        "@type": "ImageObject",
        contentUrl: absoluteImageUrl,
        name: buildSanitizedText(postForJsonLd.caption, copy.fallbackAlt, 80),
        description: buildSanitizedText(
          postForJsonLd.caption,
          copy.fallbackDescription,
          120
        ),
        ...(postForJsonLd.posted_at
          ? { datePublished: postForJsonLd.posted_at }
          : {}),
        ...(postForJsonLd.user?.nickname
          ? {
              creator: {
                "@type": "Person",
                name: postForJsonLd.user.nickname,
              },
            }
          : {}),
      };
    }
  }

  // use cache でキャッシュして即時表示を優先（閲覧数はキャッシュ時スキップ）
  return (
    <>
      <CachedPostDetail
        postId={id}
        currentUserId={currentUserId}
        presetUnlockState={presetUnlockState}
      />
      {imageJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(imageJsonLd) }}
        />
      )}
    </>
  );
}
