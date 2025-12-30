import { AuthForm } from "@/features/auth/components/AuthForm";
import { AuthPageContainer } from "@/features/auth/components/AuthPageContainer";

export default function LoginPage() {
  return (
    <AuthPageContainer>
      <AuthForm mode="signin" />
    </AuthPageContainer>
  );
}
