import { requireAuth } from "@/lib/auth";

export default async function DashboardPage() {
  // 認証が必要なページ
  await requireAuth();

  return (
    <>
      <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground mt-2">
        Welcome to your dashboard. This is a protected route.
      </p>
    </div>
    </>
  );
}
