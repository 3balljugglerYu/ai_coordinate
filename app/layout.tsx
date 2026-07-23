import type { Metadata } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import "./globals.css";
// 拡大表示用 Lightbox の CSS はルート遷移と独立して常にロードされる必要があるため、
// コンポーネント単位ではなく root layout でグローバル import する。
// （コンポーネント単位 import だと App Router の CSS チャンク切替で
//   2 回目のオープン時にアイコンが描画されない不具合が出ることがある。）
import "yet-another-react-lightbox/styles.css";
import { LocaleShell } from "@/components/LocaleShell";
import { env, getSiteUrl } from "@/lib/env";
import { DEFAULT_LOCALE, getLocaleDir, locales } from "@/i18n/config";
import { getSiteCopy } from "@/i18n/page-copy";

const geistSans = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  display: "swap",
});

const siteUrl = getSiteUrl() || "https://persta.ai";
const googleSiteVerification = env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
const defaultSiteCopy = getSiteCopy(DEFAULT_LOCALE);
const localeCookiePattern = locales.join("|");
const rtlLocales = locales.filter((locale) => getLocaleDir(locale) === "rtl");
const localeBootstrapScript = `(() => {
  var d = document.documentElement;
  var m = document.cookie.match(/(?:^|; )NEXT_LOCALE=(${localeCookiePattern})(?:;|$)/);
  if (m) {
    d.lang = m[1];
    d.dir = ${JSON.stringify(rtlLocales)}.indexOf(m[1]) === -1 ? "ltr" : "rtl";
  }
  d.classList.add("ppr-locale-ready");
})();`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: defaultSiteCopy.title,
  description: defaultSiteCopy.description,
  // 注意: ここに alternates(canonical)を置いてはならない。
  // root layout の alternates は「自分で alternates を定義しないすべてのページ」に
  // 継承され、全ページの canonical がトップページを指してしまう(= 検索エンジンに
  // 各ページを「トップの複製」と誤認させ、インデックスから除外させる)。
  // canonical/hreflang は各ページが createLocaleAlternates / createCanonicalAlternates
  // (lib/metadata.ts)で自己参照を宣言する。
  robots: {
    index: true,
    follow: true,
  },
  ...(googleSiteVerification
    ? { verification: { google: googleSiteVerification } }
    : {}),
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover" as const, // iOSセーフエリア対応
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang={DEFAULT_LOCALE}
      dir={getLocaleDir(DEFAULT_LOCALE)}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased pb-16 lg:pb-0`}
        suppressHydrationWarning
      >
        <script
          dangerouslySetInnerHTML={{
            __html: localeBootstrapScript,
          }}
        />
        <Suspense fallback={<div className="min-h-screen" />}>
          <LocaleShell>{children}</LocaleShell>
        </Suspense>
      </body>
    </html>
  );
}
