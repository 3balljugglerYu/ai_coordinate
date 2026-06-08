import { useEffect } from "react";
import { X } from "lucide-react";
import { AuthForm } from "./AuthForm";
import type { SignupSource } from "../lib/signup-source";

export interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  redirectTo?: string;
  /** 任意の文脈見出し（例: クローゼット保存導線）。指定時はフォーム上部に表示。 */
  title?: string;
  /** 見出しの下に出すメリット説明文。 */
  description?: string;
  /** 既定で表示する認証モード。保存導線では "signup" を渡す。 */
  mode?: "signin" | "signup";
  /** ログイン↔新規登録の切替リンクを隠す(signup 固定にしたいとき)。 */
  hideModeSwitch?: boolean;
  /** 流入元の明示指定(保存導線など)。AuthForm に引き渡す。 */
  signupSource?: SignupSource | null;
}

export function AuthModal({
  open,
  onClose,
  redirectTo = "/",
  title,
  description,
  mode = "signin",
  hideModeSwitch,
  signupSource,
}: AuthModalProps) {
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-4 py-6">
      <div className="absolute inset-0 bg-white/70 backdrop-blur-sm" />
      <div className="relative z-10 my-auto w-full max-w-md">
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="absolute -right-3 -top-3 z-10 rounded-full bg-white ring-1 ring-gray-200 shadow-lg transition hover:shadow-xl focus:outline-none"
        >
          <span className="sr-only">閉じる</span>
          <X className="h-5 w-5 m-2 text-gray-600" />
        </button>
        <div className="relative max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
          {title || description ? (
            <div className="border-b border-gray-100 px-6 pb-4 pt-6 text-center">
              {title ? (
                <h2 className="text-lg font-bold text-gray-900">{title}</h2>
              ) : null}
              {description ? (
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  {description}
                </p>
              ) : null}
            </div>
          ) : null}
          <AuthForm
            mode={mode}
            redirectTo={redirectTo}
            hideModeSwitch={hideModeSwitch}
            signupSource={signupSource}
            hideHeading={Boolean(title || description)}
          />
        </div>
      </div>
    </div>
  );
}
