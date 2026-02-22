import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { NavigationBar } from "@/components/NavigationBar";
import { Footer } from "@/components/Footer";
import { Toaster } from "@/components/ui/toaster";
import { StickyHeader } from "@/features/posts/components/StickyHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { GeneratedImageNotificationChecker } from "@/components/GeneratedImageNotificationChecker";
import { BonusNotificationToastListener } from "@/features/notifications/components/BonusNotificationToastListener";
import { UnreadNotificationProvider } from "@/features/notifications/components/UnreadNotificationProvider";
import { TutorialTourProvider } from "@/features/tutorial/components/TutorialTourProvider";
import { getSiteUrl } from "@/lib/env";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
          <Suspense fallback={<div className="h-16" />}>
            <StickyHeader />
          </Suspense>
          <Suspense fallback={null}>
            <AppSidebar />
          </Suspense>
          <Suspense fallback={null}>
            <GeneratedImageNotificationChecker />
          </Suspense>
          <Suspense fallback={null}>
            <BonusNotificationToastListener />
          </Suspense>
          <div className="main-content">
            {children}
            <Footer />
          </div>
          <Suspense fallback={<div className="h-16" />}>
            <NavigationBar />
          </Suspense>
          <Suspense fallback={null}>
            <TutorialTourProvider />
          </Suspense>
          <Toaster />
          <Analytics />
          <SpeedInsights />
        </UnreadNotificationProvider>
      </body>
    </html>
  );
}
