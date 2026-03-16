import { connection } from "next/server";
import { ResetPasswordRequestForm } from "@/features/auth/components/ResetPasswordRequestForm";

export default async function ResetPasswordRequestPage() {
  await connection();

  return <ResetPasswordRequestForm />;
}
