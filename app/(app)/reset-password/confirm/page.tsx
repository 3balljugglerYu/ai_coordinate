"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updatePassword } from "@/features/auth/lib/auth-client";
import {
  PasswordRequirements,
  isPasswordValid,
} from "@/features/auth/components/PasswordRequirements";

export default function ResetPasswordConfirmPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // リアルタイムバリデーション
  const passwordError =
    password.length > 0 && password.length < 8
      ? "パスワードは8文字以上で入力してください"
      : null;
  const confirmPasswordError =
    confirmPassword.length > 0 && password !== confirmPassword
      ? "パスワードが一致しません"
      : null;
  const passwordRequirementsNotMet =
    password.length > 0 && !isPasswordValid(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!password || !confirmPassword) {
      setError("新しいパスワードを2回入力してください");
      return;
    }

    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください");
      return;
    }

    if (!isPasswordValid(password)) {
      setError(
        "パスワードは英大文字・英小文字・数字・記号をそれぞれ1文字以上含めてください"
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    setIsLoading(true);
    try {
      await updatePassword(password);
      setSuccessMessage("パスワードを更新しました。ログイン画面に移動します。");
      // 少し待ってからログイン画面へ遷移
      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "パスワードの更新に失敗しました。リンクの有効期限が切れている可能性があります。"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:pt-1">
      <Card className="w-full max-w-md p-4 sm:p-6">
        <div className="mb-6 text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">新しいパスワードの設定</h2>
          <p className="mt-2 text-sm text-gray-600">
            新しいパスワードを入力してください。
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert className="mb-4">
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="new-password">新しいパスワード</Label>
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
                className="absolute right-0 inset-y-0 flex items-center justify-center px-3 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded cursor-pointer"
                disabled={isLoading}
                aria-label={showPassword ? "パスワードを非表示" : "パスワードを表示"}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            {passwordError && (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {passwordError}
              </p>
            )}
            {password.length > 0 &&
              passwordRequirementsNotMet &&
              !passwordError && (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  パスワードの要件をすべて満たしてください。
                </p>
              )}
            <PasswordRequirements password={password} />
          </div>

          <div>
            <Label htmlFor="confirm-new-password">新しいパスワード（確認）</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                id="confirm-new-password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className={confirmPasswordError ? "pl-10 pr-10 border-destructive" : "pl-10 pr-10"}
                disabled={isLoading}
                required
                minLength={8}
                aria-invalid={!!confirmPasswordError}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-0 inset-y-0 flex items-center justify-center px-3 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded cursor-pointer"
                disabled={isLoading}
                aria-label={showConfirmPassword ? "パスワードを非表示" : "パスワードを表示"}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            {confirmPasswordError && (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {confirmPasswordError}
              </p>
            )}
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
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            パスワードを更新
          </Button>
        </form>

        <div className="mt-6 text-center text-sm">
          <a href="/login" className="font-medium text-primary hover:underline">
            ログイン画面に戻る
          </a>
        </div>
      </Card>
    </div>
  );
}


