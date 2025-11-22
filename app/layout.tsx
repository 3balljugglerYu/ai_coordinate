import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { NavigationBar } from "@/components/NavigationBar";
import { Toaster } from "@/components/ui/toaster";
import { StickyHeader } from "@/features/posts/components/StickyHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Coordinate",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased pb-16 md:pb-0`}
        suppressHydrationWarning
      >
        <Suspense fallback={<div className="h-16" />}>
          <StickyHeader showBackButton={false} />
        </Suspense>
        <Suspense fallback={<div className="h-16" />}>
          <NavigationBar />
        </Suspense>
        {children}
        <Toaster />
        <footer className="mt-8 border-t bg-white/80">
          <div className="mx-auto max-w-7xl px-4 py-6 text-center text-xs text-gray-600 md:text-sm">
            <a href="/tokushoho" className="text-gray-700 underline underline-offset-2 hover:text-gray-900">
              特定商取引法に基づく表記
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
