"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
  const locale = useLocale();
  const t = useTranslations("auth");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formattedDeletionDate = deletionScheduledAt
    ? new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US").format(
        new Date(deletionScheduledAt)
      )
    : null;

  const handleReactivate = async () => {
    try {
      setError(null);
      setIsSubmitting(true);
      await reactivateAccount();
      router.push("/my-page");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reactivateErrorGeneric"));
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
      <h1 className="text-xl font-bold text-gray-900">{t("reactivateTitle")}</h1>
      <p className="mt-3 text-sm text-gray-600">
        {t("reactivateDescription")}
      </p>
      {formattedDeletionDate && (
        <p className="mt-2 text-sm font-medium text-red-700">
          {t("reactivateScheduledDeletion", { date: formattedDeletionDate })}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={handleSignOut} disabled={isSubmitting}>
          {t("reactivateLogout")}
        </Button>
        <Button type="button" onClick={handleReactivate} disabled={isSubmitting}>
          {isSubmitting ? t("reactivateSubmitting") : t("reactivateSubmit")}
        </Button>
      </div>
    </Card>
  );
}
