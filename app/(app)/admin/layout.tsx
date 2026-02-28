import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { AdminHeader } from "./AdminHeader";
import { AdminSidebar } from "./AdminSidebar";
import { AdminMobileNav } from "./AdminMobileNav";
import localFont from "next/font/local";

const firaCode = localFont({
  src: "../../fonts/geist-mono-latin.woff2",
  variable: "--font-admin-heading",
  display: "swap",
});

const firaSans = localFont({
  src: "../../fonts/geist-latin.woff2",
  variable: "--font-admin-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "管理画面 | Persta",
  description: "Persta 運営管理画面",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  const adminUserIds = getAdminUserIds();

  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  return (
    <div
      className={`${firaCode.variable} ${firaSans.variable} min-h-screen bg-[#FAF5FF]`}
      data-admin-layout
      style={
        {
          ["--admin-sidebar-width"]: "256px",
        } as React.CSSProperties
      }
    >
      <AdminHeader />
      <AdminSidebar />
      <main
        className="pt-16 lg:pl-[var(--admin-sidebar-width,256px)] transition-[padding] duration-200 min-h-screen"
        role="main"
        aria-label="管理画面メインコンテンツ"
      >
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
          <AdminMobileNav />
          {children}
        </div>
      </main>
    </div>
  );
}
