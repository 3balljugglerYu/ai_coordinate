"use client";

import { useSearchParams } from "next/navigation";
import { AuthForm } from "@/features/auth/components/AuthForm";
import { AuthPageContainer } from "@/features/auth/components/AuthPageContainer";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || searchParams.get("next") || "/coordinate";

  return (
    <AuthPageContainer>
      <AuthForm mode="signin" redirectTo={redirect} />
    </AuthPageContainer>
  );
}
