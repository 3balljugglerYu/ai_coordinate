"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { signIn, signUp, signInWithOAuth } from "../lib/auth-client";
import { useToast } from "@/components/ui/use-toast";

interface AuthFormProps {
  mode: "signin" | "signup";
  onSuccess?: () => void;
  redirectTo?: string;
}

export function AuthForm({ mode, onSuccess, redirectTo }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { toast } = useToast();

  const isSignUp = mode === "signup";

  // URLクエリパラメータから紹介コードを取得
  const referralCode = searchParams.get("ref");

  // コンポーネントマウント時またはmode変更時にローディング状態をリセット
  useEffect(() => {
    setIsLoading(false);
    setError(null);
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const redirectTarget = redirectTo ?? "/";

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
        await signUp(email, password, referralCode || undefined);
        // サインアップ成功
        setError(null);
        toast({
          title: "確認メールを送信しました。",
          description: "新規登録を受け付けました。メールをご確認ください。",
        });
        router.push("/login");
      } else {
        await signIn(email, password);
        // サインイン成功
        // 1秒間ローディング表示を継続
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (onSuccess) {
          setIsLoading(false);
          onSuccess();
        } else {
          // ローディングは遷移まで継続（遷移により自動的にアンマウントされる）
          router.push(redirectTarget);
          router.refresh();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setIsLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: "google" | "github" | "x") => {
    try {
      setError(null);
      setIsLoading(true);
      const redirectTarget = redirectTo ?? "/";
      await signInWithOAuth(provider, redirectTarget, referralCode || undefined);
      // OAuthプロバイダーのページにリダイレクトされる
    } catch (err) {
      setError(err instanceof Error ? err.message : "OAuth認証に失敗しました");
      setIsLoading(false);
    }
  };

  return (
    <Card className="relative w-full max-w-md p-4 sm:p-6">
      {/* ローディングオーバーレイ */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-gray-700">
              {isSignUp ? "アカウントを作成中..." : "ログイン中..."}
            </p>
          </div>
        </div>
      )}

      <div className="mb-6 text-center">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
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
          <AlertDescription>{error}</AlertDescription>
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
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="pl-10 pr-10"
              disabled={isLoading}
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
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
          {isSignUp ? (
            <p className="mt-1 text-xs text-gray-500">
              6文字以上で入力してください
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">
              パスワードをお忘れの方は{" "}
              <a
                href="/reset-password"
                className="font-medium text-primary hover:underline"
              >
                こちら
              </a>
              から再設定できます
            </p>
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
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-10 pr-10"
                disabled={isLoading}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
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
          </div>
        )}

        {/* 送信ボタン */}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSignUp ? "アカウントを作成" : "ログイン"}
        </Button>
      </form>

      {/* SNSログイン */}
      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-2 text-gray-500">または</span>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {/* Google */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => handleOAuthSignIn("google")}
            disabled={isLoading}
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Googleで続ける
          </Button>

          {/* X (Twitter) */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => handleOAuthSignIn("x")}
            disabled={isLoading}
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            X (Twitter)で続ける
          </Button>

          {/* GitHub */}
          {/*
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => handleOAuthSignIn("github")}
            disabled={isLoading}
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            GitHubで続ける
          </Button>
          */}
        </div>
      </div>

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
