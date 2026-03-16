"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, Loader2, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordForEmail } from "@/features/auth/lib/auth-client";

export function ResetPasswordRequestForm() {
  const router = useRouter();
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSuccess(false);

    if (!email) {
      setError(t("resetPasswordEmailRequired"));
      return;
    }

    setIsLoading(true);
    try {
      await resetPasswordForEmail(email);
      setIsSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("resetPasswordRequestFailed")
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:pt-1">
        <Card className="w-full max-w-md p-4 sm:p-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>

            <h2 className="mb-4 text-xl font-bold text-gray-900 sm:text-2xl">
              {t("resetPasswordEmailSentTitle")}
            </h2>

            <div className="mb-6 space-y-2 text-left">
              <p className="text-sm leading-relaxed text-gray-600">
                {t("resetPasswordEmailSentLine1")}
              </p>
              <p className="text-sm leading-relaxed text-gray-600">
                {t("resetPasswordEmailSentLine2")}
              </p>
            </div>

            <Button onClick={() => router.push("/login")} className="w-full" size="lg">
              {t("backToLogin")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:pt-1">
      <Card className="w-full max-w-md p-4 sm:p-6">
        <div className="mb-6 text-center">
          <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
            {t("resetPasswordRequestTitle")}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {t("resetPasswordRequestDescriptionLine1")}
            <br />
            {t("resetPasswordRequestDescriptionLine2")}
          </p>
        </div>

        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="reset-email">{t("emailLabel")}</Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="pl-10"
                disabled={isLoading}
                required
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("sendResetEmail")}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm">
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t("backToLogin")}
          </Link>
        </div>
      </Card>
    </div>
  );
}
