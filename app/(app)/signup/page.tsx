import { AuthForm } from "@/features/auth/components/AuthForm";
import { StickyHeader } from "@/features/posts/components/StickyHeader";

export default function SignupPage() {
  return (
    <>
      <StickyHeader showBackButton={false} />
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 pt-1">
        <AuthForm mode="signup" />
      </div>
    </>
  );
}

