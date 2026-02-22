"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";
import { NavigationBar } from "@/components/NavigationBar";
import { Footer } from "@/components/Footer";
import { StickyHeader } from "@/features/posts/components/StickyHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { GeneratedImageNotificationChecker } from "@/components/GeneratedImageNotificationChecker";
import { BonusNotificationToastListener } from "@/features/notifications/components/BonusNotificationToastListener";
import { TutorialTourProvider } from "@/features/tutorial/components/TutorialTourProvider";

/**
 * Persta のヘッダー・サイドバー・フッターを条件付きで表示。
 * /admin 配下では表示しない（admin は独自の UI を使用）
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

  useEffect(() => {
    if (isAdmin) {
      document.body.classList.add("admin-active");
    } else {
      document.body.classList.remove("admin-active");
    }
    return () => document.body.classList.remove("admin-active");
  }, [isAdmin]);

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
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
    </>
  );
}
