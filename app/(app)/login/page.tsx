import { AuthForm } from "@/features/auth/components/AuthForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:pt-1">
      <AuthForm mode="signin" />
    </div>
  );
}

