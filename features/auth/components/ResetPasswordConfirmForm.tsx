"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword } from "@/features/auth/lib/auth-client";
import {
  PasswordRequirements,
  isPasswordValid,
} from "@/features/auth/components/PasswordRequirements";

export function ResetPasswordConfirmForm() {
  const router = useRouter();
  const t = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordError =
    password.length > 0 && password.length < 8
      ? t("validationPasswordTooShort")
      : null;
  const confirmPasswordError =
    confirmPassword.length > 0 && password !== confirmPassword
      ? t("validationPasswordMismatch")
      : null;
  const passwordRequirementsNotMet =
    password.length > 0 && !isPasswordValid(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!password || !confirmPassword) {
      setError(t("resetPasswordConfirmMissing"));
      return;
    }

    if (password.length < 8) {
      setError(t("validationPasswordTooShort"));
      return;
    }

    if (!isPasswordValid(password)) {
      setError(t("validationPasswordRequirements"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("validationPasswordMismatch"));
      return;
    }

    setIsLoading(true);
    try {
      await updatePassword(password);
      setSuccessMessage(t("resetPasswordUpdateSuccess"));
      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("resetPasswordUpdateFailed")
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:pt-1">
      <Card className="w-full max-w-md p-4 sm:p-6">
        <div className="mb-6 text-center">
          <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
            {t("resetPasswordConfirmTitle")}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {t("resetPasswordConfirmDescription")}
          </p>
        </div>

        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {successMessage ? (
          <Alert className="mb-4">
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="new-password">{t("newPasswordLabel")}</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={
                  passwordError || passwordRequirementsNotMet
                    ? "pl-10 pr-10 border-destructive"
                    : "pl-10 pr-10"
                }
                disabled={isLoading}
                required
                minLength={8}
                aria-invalid={!!passwordError || !!passwordRequirementsNotMet}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center justify-center rounded px-3 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                disabled={isLoading}
                aria-label={showPassword ? t("hidePassword") : t("showPassword")}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            {passwordError ? (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {passwordError}
              </p>
            ) : null}
            {password.length > 0 &&
            passwordRequirementsNotMet &&
            !passwordError ? (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {t("passwordRequirementsHint")}
              </p>
            ) : null}
            <PasswordRequirements password={password} />
          </div>

          <div>
            <Label htmlFor="confirm-new-password">{t("newPasswordConfirmLabel")}</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                id="confirm-new-password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className={
                  confirmPasswordError
                    ? "pl-10 pr-10 border-destructive"
                    : "pl-10 pr-10"
                }
                disabled={isLoading}
                required
                minLength={8}
                aria-invalid={!!confirmPasswordError}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 flex items-center justify-center rounded px-3 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                disabled={isLoading}
                aria-label={
                  showConfirmPassword ? t("hidePassword") : t("showPassword")
                }
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            {confirmPasswordError ? (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {confirmPasswordError}
              </p>
            ) : null}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={
              isLoading ||
              !!passwordError ||
              !!confirmPasswordError ||
              !!passwordRequirementsNotMet
            }
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("resetPasswordSubmit")}
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
