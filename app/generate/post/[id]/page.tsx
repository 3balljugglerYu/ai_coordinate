import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfileServer } from "@/features/my-page/lib/server-api";
import { PromptLockedGenerationScreen } from "@/features/generation/components/PromptLockedGenerationScreen";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * カタログから使う生成(派生生成)の、スマホの生成画面。
 *
 * 以前はボトムシートで開いていたが、名前の欄などでキーボードを出すとシートが上下し、
 * 欄がキーボードの裏に隠れた(2026-10-07)。通常のページにして、キーボードの扱いを
 * ブラウザ標準に任せる(投稿フォーム /posts/new と同じ考え方。#624)。
 * パソコンは今までどおりダイアログで開く(PromptLockedGenerationSheet)。
 *
 * 使えるかの判定は生成の受付と同じ `validate_derived_prompt_source`(フォロー・ブロック・原作の状態)。
 * 使えないときは理由を区別せず 404(ADR-005)。
 */
export default async function PromptLockedGeneratePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const user = await getUser();
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/generate/post/${id}`)}`);
  }

  const admin = createAdminClient();
  const { data: validation, error } = await admin
    .rpc("validate_derived_prompt_source", {
      p_source_post_id: id,
      p_requester_id: user.id,
    })
    .select("is_available, root_post_id")
    .maybeSingle();
  const validated = validation as { is_available?: boolean; root_post_id?: string | null } | null;
  if (error || !validated?.is_available || !validated.root_post_id) {
    notFound();
  }

  const [{ data: origin }, profile] = await Promise.all([
    admin
      .from("generated_images")
      .select("prompt_visibility")
      .eq("id", validated.root_post_id)
      .maybeSingle(),
    getUserProfileServer(user.id),
  ]);

  return (
    <PromptLockedGenerationScreen
      sourcePostId={validated.root_post_id}
      subscriptionPlan={profile?.subscription_plan ?? "free"}
      promptVisibility={
        (origin as { prompt_visibility?: string } | null)?.prompt_visibility === "public"
          ? "public"
          : "private"
      }
    />
  );
}
