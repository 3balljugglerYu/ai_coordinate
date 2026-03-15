"use client";

import { Check, Circle } from "lucide-react";
import { useTranslations } from "next-intl";

const PASSWORD_REQUIREMENTS = [
  { key: "length", labelKey: "passwordRequirementLength", test: (p: string) => p.length >= 8 },
  { key: "uppercase", labelKey: "passwordRequirementUppercase", test: (p: string) => /[A-Z]/.test(p) },
  { key: "lowercase", labelKey: "passwordRequirementLowercase", test: (p: string) => /[a-z]/.test(p) },
  { key: "number", labelKey: "passwordRequirementNumber", test: (p: string) => /\d/.test(p) },
  {
    key: "symbol",
    labelKey: "passwordRequirementSymbol",
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
  const t = useTranslations("auth");

  if (!password) return null;

  return (
    <ul className={`mt-2 space-y-1.5 text-xs ${className ?? ""}`} role="list">
      {PASSWORD_REQUIREMENTS.map(({ key, labelKey, test }) => {
        const met = test(password);
        return (
          <li key={key} className="flex items-center gap-2">
            {met ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
            )}
            <span className={met ? "text-green-700" : "text-gray-500"}>{t(labelKey)}</span>
          </li>
        );
      })}
    </ul>
  );
}
