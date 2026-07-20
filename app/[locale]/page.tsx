import type { Metadata } from "next";
import { getImageProps } from "next/image";
import { Suspense } from "react";
import { preload } from "react-dom";
import { getSiteUrl } from "@/lib/env";
import { getUser } from "@/lib/auth";
import { isCreatorLooksEnabledForUser } from "@/lib/auth/creator-looks";
import { isAdminViewer as checkIsAdminViewer } from "@/lib/env";
import { getActivePopupBanners } from "@/features/popup-banners/lib/get-active-popup-banners";
import { POPUP_BANNER_IMAGE_SIZES } from "@/features/popup-banners/lib/popup-banner-image";
import { PopupBannerOverlay } from "@/features/popup-banners/components/PopupBannerOverlay";
import { CachedHomeBannerSection } from "@/features/home/components/CachedHomeBannerSection";
import { CachedHomePostListSection } from "@/features/home/components/CachedHomePostListSection";
import { CachedHomeStylePresetSection } from "@/features/home/components/CachedHomeStylePresetSection";
import { HomePetitUnlockPreview } from "@/features/home/components/HomePetitUnlockPreview";
import { CachedHomeUserStyleTemplateSection } from "@/features/home/components/CachedHomeUserStyleTemplateSection";
import { HomeBannerSkeleton } from "@/features/home/components/HomeBannerSkeleton";
import { HomeHeading } from "@/features/home/components/HomeHeading";
import { HomeStylePresetCarouselSkeleton } from "@/features/home/components/HomeStylePresetCarouselSkeleton";
import { HomeUserStyleTemplateCarouselSkeleton } from "@/features/home/components/HomeUserStyleTemplateCarouselSkeleton";
import { PostListSkeleton } from "@/features/posts/components/PostListSkeleton";
import {
  createLocaleAlternates,
  getDefaultOpenGraphImages,
  getDefaultTwitterImages,
} from "@/lib/metadata";
import {
  DEFAULT_LOCALE,
  isLocale,
  localizePublicPath,
  type Locale,
} from "@/i18n/config";
import { getHomeCopy } from "@/i18n/page-copy";

const E2E_POPUP_BANNER_QUERY_PARAM = "popupBannerE2E";

function getE2EPopupBannersFixture(enabled: boolean) {
  if (!enabled) {
    return null;
  }

  return [
    {
      id: "e2e-popup-banner",
      imageUrl: "/icon.png",
      linkUrl: null,
      alt: "E2E Popup Banner",
      showOnceOnly: false,
      displayOrder: 0,
    },
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = isLocale(localeParam) ? localeParam : DEFAULT_LOCALE;
  const copy = getHomeCopy(locale);
  const siteUrl = getSiteUrl();
  const localizedPath = localizePublicPath("/", locale);
  const localizedUrl = siteUrl ? `${siteUrl}${localizedPath}` : localizedPath;

  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    alternates: createLocaleAlternates("/", locale),
    openGraph: {
      title: copy.metadataTitle,
      description: copy.metadataDescription,
      url: localizedUrl,
      siteName: "Persta.AI",
      type: "website",
      images: getDefaultOpenGraphImages(siteUrl),
    },
    twitter: {
      card: "summary_large_image",
      title: copy.metadataTitle,
      description: copy.metadataDescription,
      images: getDefaultTwitterImages(siteUrl),
    },
  };
}

function HomeStructuredData({ locale }: { locale: Locale }) {
  const copy = getHomeCopy(locale);
  const siteUrl = getSiteUrl() || "https://persta.ai";

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Persta.AI",
    "alternateName": ["Persta", "ペルスタ"],
    "url": siteUrl,
    "logo": `${siteUrl}/icons/icon-512.png`,
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Persta.AI",
    "alternateName": ["Persta", "ペルスタ"],
    "url": siteUrl,
    "description": copy.organizationDescription,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteSchema),
        }}
      />
    </>
  );
}

async function HomePopupBannerSection({
  searchParams,
}: {
  searchParams: Promise<{ popupBannerE2E?: string }>;
}) {
  const query = await searchParams;
  const useE2EPopupBannerFixture =
    query[E2E_POPUP_BANNER_QUERY_PARAM] === "1" &&
    (process.env.NODE_ENV !== "production" ||
      process.env.PLAYWRIGHT_E2E === "1");
  const e2ePopupBanners = getE2EPopupBannersFixture(useE2EPopupBannerFixture);
  const popupBanners = e2ePopupBanners
    ? e2ePopupBanners
    : await getActivePopupBanners();

  // ポップアップはクライアントで hydration 後に表示されるため、そのままだと
  // 画像の取得開始が数秒遅れて LCP を悪化させる(実測で Load Delay 約5.6秒)。
  // 表示候補の先頭バナーを <link rel="preload"> で先行ダウンロードさせ、
  // Overlay の <Image> と同じ srcset/sizes を getImageProps で再現して
  // ブラウザのキャッシュに確実にヒットさせる。
  // (表示済みで実際には出ないユーザーにも1枚分の DL が発生するが、
  //  HTTP キャッシュに乗るため再訪時の実コストはほぼ無い)
  const preloadBanner = popupBanners[0];
  if (preloadBanner?.imageUrl) {
    const { props: imgProps } = getImageProps({
      src: preloadBanner.imageUrl,
      alt: "",
      fill: true,
      sizes: POPUP_BANNER_IMAGE_SIZES,
    });
    preload(imgProps.src, {
      as: "image",
      imageSrcSet: imgProps.srcSet,
      imageSizes: imgProps.sizes,
      fetchPriority: "high",
    });
  }

  return <PopupBannerOverlay banners={popupBanners} />;
}

export default async function LocaleHome({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ popupBannerE2E?: string; petitUnlockPreview?: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = isLocale(localeParam) ? localeParam : DEFAULT_LOCALE;

  // Creator Looks: admin / allowlist 該当ユーザーのみカルーセルに含める (= Stage 1 厳密化)
  // 非該当ユーザーには Creator Looks 投稿を完全非表示にし、既存 Inspire 投稿のみ表示する
  const currentUser = await getUser();
  const includeCreatorLooks = await isCreatorLooksEnabledForUser(currentUser);
  // 公開前カテゴリ(admin_only)を admin / プレビュー admin にだけ表示する
  const isAdminViewer = checkIsAdminViewer(currentUser?.id ?? null);

  // 解放お知らせのプレビュー(開発/E2E のみ)。?petitUnlockPreview=initial|drip で強制表示。
  const previewParam = (await searchParams).petitUnlockPreview;
  const petitUnlockPreview =
    (previewParam === "initial" || previewParam === "drip") &&
    (process.env.NODE_ENV !== "production" ||
      process.env.PLAYWRIGHT_E2E === "1")
      ? previewParam
      : null;

  return (
    <div className="mx-auto max-w-6xl px-1 pb-8 pt-6 sm:px-4 md:pt-8">
      <HomeStructuredData locale={locale} />
      <Suspense fallback={null}>
        <HomePopupBannerSection searchParams={searchParams} />
      </Suspense>
      {petitUnlockPreview && (
        <Suspense fallback={null}>
          <HomePetitUnlockPreview mode={petitUnlockPreview} />
        </Suspense>
      )}
      <HomeHeading />
      <Suspense fallback={<HomeBannerSkeleton />}>
        <CachedHomeBannerSection />
      </Suspense>
      <Suspense fallback={<HomeStylePresetCarouselSkeleton />}>
        <CachedHomeStylePresetSection
          isAdminViewer={isAdminViewer}
          userId={currentUser?.id ?? null}
        />
      </Suspense>
      {/*
        Inspire ホームカルーセル（ADR-013）。
        env フラグ NEXT_PUBLIC_INSPIRE_HOME_CAROUSEL_ENABLED が 'true' のときのみマウント。
        MVP リリース時は未設定 = OFF で、ホームには何も追加されない。
        admin が visible 化したテンプレも露出しないので、UI 設計が固まるまで安全。
      */}
      {process.env.NEXT_PUBLIC_INSPIRE_HOME_CAROUSEL_ENABLED === "true" && (
        <Suspense fallback={<HomeUserStyleTemplateCarouselSkeleton />}>
          <CachedHomeUserStyleTemplateSection
            includeCreatorLooks={includeCreatorLooks}
          />
        </Suspense>
      )}
      <Suspense fallback={<PostListSkeleton />}>
        <CachedHomePostListSection />
      </Suspense>
    </div>
  );
}
