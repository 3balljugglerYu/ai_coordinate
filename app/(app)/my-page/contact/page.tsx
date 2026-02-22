import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "@/features/contact/components/ContactForm";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function ContactPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/my-page/contact");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/my-page" aria-label="マイページに戻る">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">お問い合わせ</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                改善要望やご意見をお聞かせください。3営業日以内にご連絡いたします。
              </p>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <ContactForm defaultEmail={user.email ?? ""} />
          </div>
        </div>
      </div>
    </div>
  );
}
