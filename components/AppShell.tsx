"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";
import { NavigationBar } from "@/components/NavigationBar";
import { Footer } from "@/components/Footer";
import { StickyHeader } from "@/features/posts/components/StickyHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { GeneratedImageNotificationChecker } from "@/components/GeneratedImageNotificationChecker";
import { CollectionProgressChecker } from "@/components/CollectionProgressChecker";
import { CollectionUnlockDripListener } from "@/features/collections/components/CollectionUnlockDripListener";
import { BonusNotificationToastListener } from "@/features/notifications/components/BonusNotificationToastListener";
import { TutorialTourProvider } from "@/features/tutorial/components/TutorialTourProvider";
import { SignupSourceCapture } from "@/features/auth/components/SignupSourceCapture";
import { stripLocalePrefix } from "@/i18n/config";

/**
 * Persta のヘッダー・サイドバー・フッターを条件付きで表示。
 * /admin 配下では表示しない（admin は独自の UI を使用）
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");
  const isStandaloneDocs = pathname?.startsWith("/api-docs");
  // 絵師カタログのリーダー画面 (/catalog/[slug] と /catalog/[slug]/p/[entryId]) は
  // 没入ビューにするため、Persta の chrome (Header / Sidebar / NavigationBar / Footer) を
  // 一切表示せずに children だけを描画する。
  // /catalog 一覧と /catalog/submit 系は通常 chrome を維持する。
  const isCatalogReader = (() => {
    if (!pathname) return false;
    const { pathname: stripped } = stripLocalePrefix(pathname);
    if (
      stripped === "/catalog" ||
      stripped.startsWith("/catalog/submit")
    ) {
      return false;
    }
    return /^\/catalog\/[^/]+(?:\/p\/[^/]+)?\/?$/.test(stripped);
  })();
  // クリエイター提供プロンプトの申請は集中フォーム画面にするため共通 chrome
  // (Header / Sidebar / NavigationBar / Footer) を出さない。戻るはページ側の専用ヘッダで行う。
  const isCreatorPromptSubmit = (() => {
    if (!pathname) return false;
    return stripLocalePrefix(pathname).pathname === "/creators/submit";
  })();
  // コレクション完走の「めくれる日記帳」シェアは没入ビュー(/m/<token>/book)。
  const isCollectionBook = (() => {
    if (!pathname) return false;
    return /^\/m\/[^/]+\/book\/?$/.test(stripLocalePrefix(pathname).pathname);
  })();
  const shouldBypassAppShell =
    isAdmin ||
    isStandaloneDocs ||
    isCatalogReader ||
    isCreatorPromptSubmit ||
    isCollectionBook;

  useEffect(() => {
    if (isAdmin) {
      document.body.classList.add("admin-active");
    } else {
      document.body.classList.remove("admin-active");
    }
    return () => document.body.classList.remove("admin-active");
  }, [isAdmin]);

  if (shouldBypassAppShell) {
    return <>{children}</>;
  }

  return (
    <>
      <SignupSourceCapture />
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
        <CollectionProgressChecker />
      </Suspense>
      <Suspense fallback={null}>
        <CollectionUnlockDripListener />
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
