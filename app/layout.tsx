import type { Metadata } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { LocaleShell } from "@/components/LocaleShell";
import { getSiteUrl } from "@/lib/env";
import { DEFAULT_LOCALE } from "@/i18n/config";
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
const defaultSiteCopy = getSiteCopy(DEFAULT_LOCALE);

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: defaultSiteCopy.title,
  description: defaultSiteCopy.description,
  alternates: {
    canonical: siteUrl,
    languages: {
      ja: `${siteUrl}/ja`,
      en: `${siteUrl}/en`,
      "x-default": `${siteUrl}/en`,
    },
  },
  robots: {
    index: true,
    follow: true,
  },
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
    <html lang={DEFAULT_LOCALE} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased pb-16 lg:pb-0`}
        suppressHydrationWarning
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
  const match = document.cookie.match(/(?:^|; )NEXT_LOCALE=(ja|en)/);
  if (match) {
    document.documentElement.lang = match[1];
  }
})();`,
          }}
        />
        <Suspense fallback={<div className="min-h-screen" />}>
          <LocaleShell>{children}</LocaleShell>
        </Suspense>
      </body>
    </html>
  );
}
