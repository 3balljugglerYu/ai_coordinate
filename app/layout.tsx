import type { Metadata } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/AppShell";
import { UnreadNotificationProvider } from "@/features/notifications/components/UnreadNotificationProvider";
import { Ga4Script } from "@/features/analytics/components/Ga4Script";
import { VercelAnalyticsScripts } from "@/features/analytics/components/VercelAnalyticsScripts";
import { getSiteUrl } from "@/lib/env";

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

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl() || "https://persta.ai"),
  title: "Persta.AI (ペルスタ) - 着てみたいも、なりたいも。AIスタイリングプラットフォーム",
  description: "Persta（ペルスタ）は、AIでファッション・キャラクターなどのビジュアル表現を自由にスタイリングできるプラットフォームです。persta.aiで、みんなの作品を見て、インスピレーションを得ましょう。",
  alternates: {
    canonical: getSiteUrl() || "https://persta.ai",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased pb-16 lg:pb-0`}
        suppressHydrationWarning
      >
        <UnreadNotificationProvider>
          <Suspense fallback={<div className="min-h-screen">{children}</div>}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </UnreadNotificationProvider>
        <Toaster />
        <Ga4Script />
        <VercelAnalyticsScripts />
      </body>
    </html>
  );
}
