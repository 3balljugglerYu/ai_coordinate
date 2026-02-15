"use client";

import { Check, Circle } from "lucide-react";

const PASSWORD_REQUIREMENTS = [
  { key: "length", label: "8文字以上", test: (p: string) => p.length >= 8 },
  { key: "uppercase", label: "英大文字を含む", test: (p: string) => /[A-Z]/.test(p) },
  { key: "lowercase", label: "英小文字を含む", test: (p: string) => /[a-z]/.test(p) },
  { key: "number", label: "数字を含む", test: (p: string) => /\d/.test(p) },
  {
    key: "symbol",
    label: "記号を含む",
    test: (p: string) => /[!@#$%^&*()_+\-=[\]{};':"|<>?,./`~]/.test(p),
  },
] as const;

/** パスワードが全要件を満たしているか判定（Supabaseの要件と一致） */
export function isPasswordValid(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every((r) => r.test(password));
}

interface PasswordRequirementsProps {
  password: string;
  className?: string;
}

export function PasswordRequirements({ password, className }: PasswordRequirementsProps) {
  if (!password) return null;

  return (
    <ul className={`mt-2 space-y-1.5 text-xs ${className ?? ""}`} role="list">
      {PASSWORD_REQUIREMENTS.map(({ key, label, test }) => {
        const met = test(password);
        return (
          <li key={key} className="flex items-center gap-2">
            {met ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
            )}
            <span className={met ? "text-green-700" : "text-gray-500"}>{label}</span>
          </li>
        );
      })}
    </ul>
  );
}
