import { AuthForm } from "@/features/auth/components/AuthForm";

export default function SignupPage() {
  return (
    <div className="flex min-h-[calc(100vh-var(--app-header-height,64px))] flex-col bg-gray-50 px-4 pt-4 pb-8 sm:min-h-screen sm:items-center sm:justify-center sm:pt-1">
      <AuthForm mode="signup" />
    </div>
  );
}
