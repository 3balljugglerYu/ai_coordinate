import { AccountManagementPage } from "@/features/account/components/AccountManagementPage";

export default function MyPageAccountPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">アカウントについて</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              ブロック、通報履歴、退会申請を管理できます。
            </p>
          </div>
          <AccountManagementPage />
        </div>
      </div>
    </div>
  );
}
