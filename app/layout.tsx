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
  title: "Persta.AI",
  description: "AI-powered image generation platform",
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
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased pb-16 lg:pb-0`}
        suppressHydrationWarning
      >
        <Suspense fallback={<div className="h-16" />}>
          <StickyHeader />
        </Suspense>
        <Suspense fallback={null}>
          <AppSidebar />
        </Suspense>
        <Suspense fallback={null}>
          <GeneratedImageNotificationChecker />
        </Suspense>
        <div className="main-content">
          {children}
          <Footer />
        </div>
        <Suspense fallback={<div className="h-16" />}>
          <NavigationBar />
        </Suspense>
        <Toaster />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
