"use client";

import { useSearchParams } from "next/navigation";
import { AuthForm } from "@/features/auth/components/AuthForm";
import { AuthPageContainer } from "@/features/auth/components/AuthPageContainer";
import { pickSafeRedirectPath } from "@/lib/security/safe-redirect-path";

export default function LoginPage() {
  const searchParams = useSearchParams();
  // 移る先はこのサイトの中のパスだけ(lib/security/safe-redirect-path.ts)
  const redirect = pickSafeRedirectPath([searchParams.get("redirect"), searchParams.get("next")]);

  return (
    <AuthPageContainer>
      <AuthForm mode="signin" redirectTo={redirect} />
    </AuthPageContainer>
  );
}
