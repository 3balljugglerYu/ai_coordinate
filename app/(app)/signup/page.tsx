import { AuthForm } from "@/features/auth/components/AuthForm";
import { AuthPageContainer } from "@/features/auth/components/AuthPageContainer";

export default function SignupPage() {
  return (
    <AuthPageContainer>
      <AuthForm mode="signup" />
    </AuthPageContainer>
  );
}
