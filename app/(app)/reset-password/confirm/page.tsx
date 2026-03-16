import { connection } from "next/server";
import { ResetPasswordConfirmForm } from "@/features/auth/components/ResetPasswordConfirmForm";

export default async function ResetPasswordConfirmPage() {
  await connection();

  return <ResetPasswordConfirmForm />;
}
