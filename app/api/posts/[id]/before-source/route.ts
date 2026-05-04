import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getImageUrlFromStoragePath } from "@/features/posts/lib/utils";

/**
 * Before（生成元）画像 URL の解決 API
 *
 * 投稿モーダルから「投稿対象の画像に紐づく Before 画像」を取得するために使う。
 * 解決順序は getPostBeforeImageUrl と同じ:
 *   1. show_before_image === false → null（ユーザーが OFF 選択）
 *   2. pre_generation_storage_path の永続 WebP
 *   3. image_jobs.input_image_url（楽観 fallback）
 *   4. null
 *
 * 認可: server client + RLS 経由。自分の generated_images / image_jobs しか読めない。
 *       本人以外がアクセスしても 404 を返す（投稿前の画像は本人のみ閲覧可能のため）。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: gen, error: genError } = await supabase
    .from("generated_images")
    .select(
      "user_id, pre_generation_storage_path, image_job_id, show_before_image"
    )
    .eq("id", id)
    .maybeSingle();

  if (genError) {
    console.error("[before-source] generated_images fetch error:", genError);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
  if (!gen) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (gen.user_id !== user.id) {
    // 他ユーザーの Before 画像は返さない
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (gen.show_before_image === false) {
    return NextResponse.json({ before_image_url: null });
  }

  // 1. 永続パスがあれば公開 URL を返す
  if (gen.pre_generation_storage_path) {
    const url = getImageUrlFromStoragePath(gen.pre_generation_storage_path);
    if (url) {
      return NextResponse.json({ before_image_url: url });
    }
  }

  // 2. 永続化前は image_jobs.input_image_url にフォールバック
  if (gen.image_job_id) {
    const { data: job, error: jobError } = await supabase
      .from("image_jobs")
      .select("input_image_url")
      .eq("id", gen.image_job_id)
      .maybeSingle();
    if (jobError) {
      console.error("[before-source] image_jobs fetch error:", jobError);
    } else if (job?.input_image_url) {
      return NextResponse.json({ before_image_url: job.input_image_url });
    }
  }

  return NextResponse.json({ before_image_url: null });
}
