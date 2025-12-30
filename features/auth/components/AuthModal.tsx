import { useEffect } from "react";
import { X } from "lucide-react";
import { AuthForm } from "./AuthForm";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  redirectTo?: string;
}

export function AuthModal({ open, onClose, redirectTo = "/" }: AuthModalProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-white/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md">
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="absolute -right-3 -top-3 z-10 rounded-full bg-white ring-1 ring-gray-200 shadow-lg transition hover:shadow-xl focus:outline-none"
        >
          <span className="sr-only">閉じる</span>
          <X className="h-5 w-5 m-2 text-gray-600" />
        </button>
        <div className="relative rounded-2xl bg-white shadow-2xl">
          <AuthForm mode="signin" redirectTo={redirectTo} />
        </div>
      </div>
    </div>
  );
}
