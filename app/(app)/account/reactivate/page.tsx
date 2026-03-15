import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { ReactivateAccountCard } from "@/features/auth/components/ReactivateAccountCard";
import { createClient } from "@/lib/supabase/server";
import { connection } from "next/server";

async function AccountReactivatePageContent() {
  await connection();
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("deletion_scheduled_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <ReactivateAccountCard deletionScheduledAt={profile?.deletion_scheduled_at ?? null} />
    </div>
  );
}

export default function AccountReactivatePage() {
  return (
    <Suspense fallback={<div className="mx-auto min-h-[240px] w-full max-w-lg rounded-xl bg-white" />}>
      <AccountReactivatePageContent />
    </Suspense>
  );
}
