import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { AdminHeader } from "./AdminHeader";
import { AdminSidebar } from "./AdminSidebar";
import { AdminMobileNav } from "./AdminMobileNav";
import { Fira_Code, Fira_Sans } from "next/font/google";

const firaCode = Fira_Code({
  variable: "--font-admin-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const firaSans = Fira_Sans({
  variable: "--font-admin-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
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
