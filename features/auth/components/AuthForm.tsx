"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { signIn, signUp } from "../lib/auth-client";

interface AuthFormProps {
  mode: "signin" | "signup";
  onSuccess?: () => void;
  redirectTo?: string;
}

export function AuthForm({ mode, onSuccess, redirectTo = "/coordinate" }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === "signup";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // バリデーション
      if (!email || !password) {
        throw new Error("メールアドレスとパスワードを入力してください");
      }

      if (password.length < 6) {
        throw new Error("パスワードは6文字以上で入力してください");
      }

      if (isSignUp && password !== confirmPassword) {
        throw new Error("パスワードが一致しません");
      }

      // 認証処理
      if (isSignUp) {
        await signUp(email, password);
        // サインアップ成功
        setError(null);
        alert("確認メールを送信しました。メールを確認してアカウントを有効化してください。");
      } else {
        await signIn(email, password);
        // サインイン成功
        if (onSuccess) {
          onSuccess();
        } else {
          router.push(redirectTo);
          router.refresh();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md p-6">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          {isSignUp ? "新規登録" : "ログイン"}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          {isSignUp
            ? "アカウントを作成して、AI着せ替えを始めましょう"
            : "アカウントにログインしてください"}
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <p className="text-sm">{error}</p>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* メールアドレス */}
        <div>
          <Label htmlFor="email">メールアドレス</Label>
          <div className="relative mt-1">
            <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <Input
              id="email"
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

        {/* パスワード */}
        <div>
          <Label htmlFor="password">パスワード</Label>
          <div className="relative mt-1">
            <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="pl-10"
              disabled={isLoading}
              required
              minLength={6}
            />
          </div>
          {isSignUp && (
            <p className="mt-1 text-xs text-gray-500">6文字以上で入力してください</p>
          )}
        </div>

        {/* パスワード確認（サインアップのみ） */}
        {isSignUp && (
          <div>
            <Label htmlFor="confirmPassword">パスワード（確認）</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-10"
                disabled={isLoading}
                required
                minLength={6}
              />
            </div>
          </div>
        )}

        {/* 送信ボタン */}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSignUp ? "アカウントを作成" : "ログイン"}
        </Button>
      </form>

      {/* 切り替えリンク */}
      <div className="mt-6 text-center text-sm">
        {isSignUp ? (
          <p className="text-gray-600">
            すでにアカウントをお持ちですか？{" "}
            <a href="/login" className="font-medium text-primary hover:underline">
              ログイン
            </a>
          </p>
        ) : (
          <p className="text-gray-600">
            アカウントをお持ちでない方は{" "}
            <a href="/signup" className="font-medium text-primary hover:underline">
              新規登録
            </a>
          </p>
        )}
      </div>
    </Card>
  );
}

