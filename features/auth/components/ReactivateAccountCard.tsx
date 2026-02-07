"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { reactivateAccount, signOut } from "@/features/auth/lib/auth-client";

interface ReactivateAccountCardProps {
  deletionScheduledAt: string | null;
}

export function ReactivateAccountCard({
  deletionScheduledAt,
}: ReactivateAccountCardProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formattedDeletionDate = deletionScheduledAt
    ? new Date(deletionScheduledAt).toLocaleDateString("ja-JP")
    : null;

  const handleReactivate = async () => {
    try {
      setError(null);
      setIsSubmitting(true);
      await reactivateAccount();
      router.push("/my-page");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アカウント復帰に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <Card className="mx-auto w-full max-w-lg p-6">
      <h1 className="text-xl font-bold text-gray-900">アカウントは退会処理中です</h1>
      <p className="mt-3 text-sm text-gray-600">
        現在アカウントは凍結状態です。30日以内であれば利用を再開できます。再開しない場合は期限後に完全削除されます。
      </p>
      {formattedDeletionDate && (
        <p className="mt-2 text-sm font-medium text-red-700">
          削除予定日時: {formattedDeletionDate}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={handleSignOut} disabled={isSubmitting}>
          ログアウト
        </Button>
        <Button type="button" onClick={handleReactivate} disabled={isSubmitting}>
          {isSubmitting ? "処理中..." : "利用を再開する"}
        </Button>
      </div>
    </Card>
  );
}
