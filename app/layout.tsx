import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/AppShell";
import { UnreadNotificationProvider } from "@/features/notifications/components/UnreadNotificationProvider";
import { getSiteUrl } from "@/lib/env";
import { Analytics } from "@vercel/analytics/react";
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
          <Suspense fallback={<div className="min-h-screen">{children}</div>}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </UnreadNotificationProvider>
        <Toaster />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
