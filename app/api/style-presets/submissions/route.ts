import { connection, NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isCreatorLooksEnabledForUser } from "@/lib/auth/creator-looks";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { creatorPromptSubmissionSchema } from "@/features/style-presets/lib/creator-submission";
import { submitCreatorStylePreset } from "@/features/style-presets/lib/style-preset-repository";
import { getPresetCategoryByKey } from "@/features/style-presets/lib/preset-category-repository";
import {
  deleteStylePresetImage,
  uploadStylePresetImage,
} from "@/features/style-presets/lib/style-preset-storage";
import { validateStylePresetImageFile } from "@/features/style-presets/lib/validate-style-preset-image-file";

/** クリエイター提供プロンプトを置く公開カテゴリ key(初期 admin_only → 確認後 public)。 */
const CREATOR_PROMPT_CATEGORY_KEY = "creator_prompts";

/**
 * クリエイター提供プロンプトの申請 API(Phase 1)。
 * - 招待制: isCreatorLooksEnabledForUser(admin もしくは allowlist)。DB の RPC でも再検証。
 * - 3:4 サムネを style_presets バケットへ保存し、styling_prompt(=提供prompt)を pending で作成。
 * - submittedByUserId は **サーバセッション(getUser)から解決**(クライアント body 不可)。
 */
export async function POST(request: NextRequest) {
  await connection();

  // CSRF: cookie 認証 mutation route は Same-Origin 検証
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  let uploadedThumbnailPath: string | null = null;

  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    // 招待制ゲート(admin もしくは allowlist)。DB の submit RPC でも fail-closed で再検証。
    const allowed = await isCreatorLooksEnabledForUser(user);
    if (!allowed) {
      return NextResponse.json(
        { error: "この機能は招待されたクリエイターのみ利用できます", errorCode: "CREATOR_PROMPT_NOT_ALLOWED" },
        { status: 403 }
      );
    }

    const formData = await request.formData();

    // 本文(JSON 文字列フィールド payload)+ サムネ(file)を受け取る。
    const payloadRaw = formData.get("payload");
    if (typeof payloadRaw !== "string") {
      return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
    }
    let payloadJson: unknown;
    try {
      payloadJson = JSON.parse(payloadRaw);
    } catch {
      return NextResponse.json({ error: "入力の解析に失敗しました" }, { status: 400 });
    }

    const parsed = creatorPromptSubmissionSchema.safeParse(payloadJson);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "入力が不正です" },
        { status: 400 }
      );
    }

    const thumbnail = formData.get("thumbnail");
    if (!(thumbnail instanceof File)) {
      return NextResponse.json(
        { error: "サムネイル画像を選択してください" },
        { status: 400 }
      );
    }
    const fileError = validateStylePresetImageFile(thumbnail);
    if (fileError) {
      return NextResponse.json({ error: fileError }, { status: 400 });
    }

    // 公開カテゴリの解決。
    const category = await getPresetCategoryByKey(CREATOR_PROMPT_CATEGORY_KEY);
    if (!category) {
      console.error(
        "[creator-prompt-submission] category not found:",
        CREATOR_PROMPT_CATEGORY_KEY
      );
      return NextResponse.json(
        { error: "カテゴリ設定が見つかりません(運営にお問い合わせください)" },
        { status: 500 }
      );
    }

    // サムネをアップロード(presetId を先に確定し RPC と一致させる)。
    const presetId = crypto.randomUUID();
    const upload = await uploadStylePresetImage(
      thumbnail,
      presetId,
      crypto.randomUUID()
    );
    uploadedThumbnailPath = upload.storagePath;

    const data = parsed.data;
    const created = await submitCreatorStylePreset({
      id: presetId,
      submittedByUserId: user.id,
      title: data.title,
      stylingPrompt: data.prompt,
      backgroundPrompt: data.backgroundPrompt ?? null,
      categoryId: category.id,
      thumbnailImageUrl: upload.imageUrl,
      thumbnailStoragePath: upload.storagePath,
      thumbnailWidth: upload.width,
      thumbnailHeight: upload.height,
      targetProviders: data.targetProviders,
      recommendedProvider: data.recommendedProvider ?? null,
      submissionConsents: {
        ...data.consents,
        acknowledged_at: data.consents.acknowledged_at ?? new Date().toISOString(),
      },
    });

    return NextResponse.json({ id: created.id, status: created.status });
  } catch (error) {
    // 失敗時はアップロード済みサムネを後始末。
    if (uploadedThumbnailPath) {
      try {
        await deleteStylePresetImage(uploadedThumbnailPath);
      } catch (cleanupError) {
        console.error(
          "[creator-prompt-submission] thumbnail cleanup failed:",
          cleanupError
        );
      }
    }
    console.error("[creator-prompt-submission] POST error:", error);
    const message =
      error instanceof Error ? error.message : "申請に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
