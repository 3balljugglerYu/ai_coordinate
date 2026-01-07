import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deductPercoins } from "@/features/credits/lib/percoin-service";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const generationId = body?.generationId as string | undefined;
    const percoins = Number(body?.credits);

    if (!generationId || Number.isNaN(percoins) || percoins <= 0) {
      return NextResponse.json(
        { error: "generationId and positive percoins are required" },
        { status: 400 }
      );
    }

    // 生成した画像が本人のものか確認
    const { data: imageRecord, error: imageError } = await supabase
      .from("generated_images")
      .select("id, user_id")
      .eq("id", generationId)
      .single();

    if (imageError || !imageRecord) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    if (imageRecord.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await deductPercoins({
      userId: user.id,
      percoinAmount: percoins,
      relatedGenerationId: generationId,
      metadata: { reason: "image_generation" },
      supabaseClient: supabase,
    });

    return NextResponse.json({ balance: result.balance });
  } catch (error) {
    console.error("Percoin consumption error:", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
