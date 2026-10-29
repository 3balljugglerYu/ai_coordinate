import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  AD_PLATFORMS,
  AD_SIGNUP_SOURCE_PATTERN,
  type AdPlatform,
} from "@/features/admin-dashboard/lib/ad-stats/ad-stats-types";
import { updateAdSignupSource } from "@/features/admin-dashboard/lib/ad-stats/ad-stats-repository";

type Input = { platform: AdPlatform; adKey: string; signupSource: string | null };

function validate(body: unknown): { ok: true; value: Input } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "入力が不正です" };
  const { platform, adKey, signupSource } = body as Record<string, unknown>;
  if (typeof platform !== "string" || !(AD_PLATFORMS as readonly string[]).includes(platform)) {
    return { ok: false, error: "媒体が不正です" };
  }
  if (typeof adKey !== "string" || adKey.length === 0 || adKey.length > 300) {
    return { ok: false, error: "広告が不正です" };
  }
  if (signupSource === null || signupSource === undefined || signupSource === "") {
    return { ok: true, value: { platform: platform as AdPlatform, adKey, signupSource: null } };
  }
  if (typeof signupSource !== "string") return { ok: false, error: "目印が不正です" };
  const normalized = signupSource.trim().toLowerCase();
  if (!AD_SIGNUP_SOURCE_PATTERN.test(normalized)) {
    return { ok: false, error: "目印は半角の英小文字・数字・_・- で40文字までです" };
  }
  return { ok: true, value: { platform: platform as AdPlatform, adKey, signupSource: normalized } };
}

/** PATCH: 広告の目印（signup_source）を選ぶ。空にすると外す。 */
export async function PATCH(request: NextRequest) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }
  const input = validate(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  try {
    const found = await updateAdSignupSource({ ...input.value, updatedBy: adminUser.id });
    if (!found) return NextResponse.json({ error: "広告が見つかりません" }, { status: 404 });
  } catch (error) {
    console.error("[admin ad-stats ads] PATCH error:", error);
    return NextResponse.json({ error: "目印の保存に失敗しました" }, { status: 500 });
  }

  await logAdminAction({
    adminUserId: adminUser.id,
    actionType: "ad_signup_source_update",
    targetType: "ad_platform_ads",
    targetId: `${input.value.platform}:${input.value.adKey}`,
    metadata: { signupSource: input.value.signupSource },
  });
  return NextResponse.json(input.value);
}
