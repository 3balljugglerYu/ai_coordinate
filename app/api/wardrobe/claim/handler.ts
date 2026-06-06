import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json-error";
import { getUser } from "@/lib/auth";
import { recordStyleUsageEvent } from "@/features/style/lib/style-usage-events";
import {
  saveWardrobeImage,
  countTodaysWardrobeClaims,
} from "./save-wardrobe-image";

/**
 * ゲストが生成した着せ替え画像を、ログイン後に本人のワードローブ
 * (`generated_images`) へ保存する claim エンドポイント。
 *
 * 設計: docs/planning は無いが、ログイン転換施策 (P1) の中核。
 * - ゲスト生成は ephemeral (UCL-003) のため、画像は client が data URL で運搬し、
 *   認証後にこの API が永続化する (= UCL-003 と矛盾しない: 保存は認証ユーザーのみ)。
 * - 純粋バリデーション (`parseWardrobeClaimRequest`) と I/O (Storage / DB / 計測) を分離し、
 *   ハンドラは DI で境界をモック可能にする。
 */

// Vercel の route handler 本文上限 (~4.5MB) を超えると 413 が handler に届かず
// errorCode 無しで不可視に失敗するため、base64 化 (約 ×1.37) しても 4.5MB に収まる
// デコード後 3MB を上限とする。client は送信前に normalizeSourceImage で縮小する想定。
export const WARDROBE_CLAIM_MAX_IMAGE_BYTES = 3 * 1024 * 1024;

// claim の 1 ユーザー 1 日あたり上限 (JST)。ゲスト生成が 1/日 のため整合させる。
// 任意画像の連投アップロード濫用を防ぐ最小限のガード。
export const WARDROBE_CLAIM_DAILY_CAP = 1;

export type WardrobeClaimErrorCode =
  | "MISSING_IMAGE"
  | "INVALID_IMAGE"
  | "IMAGE_TOO_LARGE";

export interface ParsedWardrobeClaim {
  imageBuffer: Buffer;
  contentType: string;
  styleId: string | null;
  prompt: string | null;
  width: number | null;
  height: number | null;
}

export type WardrobeClaimParseResult =
  | { ok: true; data: ParsedWardrobeClaim }
  | { ok: false; code: WardrobeClaimErrorCode };

// `data:image/<subtype>;base64,<payload>` のみ受理 (生 base64 や非画像は弾く)
const DATA_URL_RE = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i;

// Storage バケット (generated-images) の allowed_mime_types に揃える。
// gif / svg 等は弾く (svg は public バケットでの stored-XSS 防止も兼ねる)。
const WARDROBE_CLAIM_ALLOWED_CONTENT_TYPES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

function toTrimmedOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toPositiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

export function parseWardrobeClaimRequest(
  body: unknown,
): WardrobeClaimParseResult {
  const record = (body ?? {}) as Record<string, unknown>;
  const imageBase64 = record.imageBase64;

  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    return { ok: false, code: "MISSING_IMAGE" };
  }

  const match = DATA_URL_RE.exec(imageBase64);
  if (!match) {
    return { ok: false, code: "INVALID_IMAGE" };
  }

  const contentType = match[1].toLowerCase();
  if (!WARDROBE_CLAIM_ALLOWED_CONTENT_TYPES.has(contentType)) {
    return { ok: false, code: "INVALID_IMAGE" };
  }

  const imageBuffer = Buffer.from(match[2], "base64");
  if (imageBuffer.length === 0) {
    return { ok: false, code: "INVALID_IMAGE" };
  }
  if (imageBuffer.length > WARDROBE_CLAIM_MAX_IMAGE_BYTES) {
    return { ok: false, code: "IMAGE_TOO_LARGE" };
  }

  return {
    ok: true,
    data: {
      imageBuffer,
      contentType,
      styleId: toTrimmedOrNull(record.styleId),
      prompt: toTrimmedOrNull(record.prompt),
      width: toPositiveInt(record.width),
      height: toPositiveInt(record.height),
    },
  };
}

const ERROR_STATUS: Record<WardrobeClaimErrorCode, number> = {
  MISSING_IMAGE: 400,
  INVALID_IMAGE: 400,
  IMAGE_TOO_LARGE: 413,
};

export interface WardrobeClaimDependencies {
  getUserFn?: typeof getUser;
  saveWardrobeImageFn?: typeof saveWardrobeImage;
  recordStyleUsageEventFn?: typeof recordStyleUsageEvent;
  countTodaysWardrobeClaimsFn?: typeof countTodaysWardrobeClaims;
}

export async function postWardrobeClaimRoute(
  request: NextRequest,
  dependencies: WardrobeClaimDependencies = {},
): Promise<NextResponse> {
  const getUserFn = dependencies.getUserFn ?? getUser;
  const saveWardrobeImageFn =
    dependencies.saveWardrobeImageFn ?? saveWardrobeImage;
  const recordStyleUsageEventFn =
    dependencies.recordStyleUsageEventFn ?? recordStyleUsageEvent;
  const countTodaysWardrobeClaimsFn =
    dependencies.countTodaysWardrobeClaimsFn ?? countTodaysWardrobeClaims;

  try {
    const user = await getUserFn();
    if (!user) {
      return jsonError(
        "Login is required to save to your wardrobe.",
        "WARDROBE_CLAIM_UNAUTHORIZED",
        401,
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = parseWardrobeClaimRequest(body);
    if (!parsed.ok) {
      return jsonError(
        "The image could not be saved.",
        `WARDROBE_CLAIM_${parsed.code}`,
        ERROR_STATUS[parsed.code],
      );
    }

    // 1 日上限ガード (H3)。count 取得に失敗したら fail-open で保存を優先する
    // (転換を取りこぼさない。濫用は稀な count 失敗時のみすり抜ける程度)。
    try {
      const todaysClaims = await countTodaysWardrobeClaimsFn(user.id);
      if (todaysClaims >= WARDROBE_CLAIM_DAILY_CAP) {
        return jsonError(
          "You have reached today's save limit.",
          "WARDROBE_CLAIM_DAILY_CAP_EXCEEDED",
          429,
        );
      }
    } catch (error) {
      console.error("Wardrobe claim: cap count failed (fail-open)", error);
    }

    let saved: { id: string };
    try {
      saved = await saveWardrobeImageFn({
        userId: user.id,
        imageBuffer: parsed.data.imageBuffer,
        contentType: parsed.data.contentType,
        styleId: parsed.data.styleId,
        prompt: parsed.data.prompt,
        model: null,
        width: parsed.data.width,
        height: parsed.data.height,
      });
    } catch (error) {
      console.error("Wardrobe claim: save failed", error);
      return jsonError(
        "The image could not be saved.",
        "WARDROBE_CLAIM_SAVE_FAILED",
        500,
      );
    }

    // 計測記録は非致命: 保存済みなので失敗しても成功応答を返す (孤児イベントも作らない)
    try {
      await recordStyleUsageEventFn({
        userId: user.id,
        authState: "authenticated",
        eventType: "wardrobe_save_completed",
        styleId: parsed.data.styleId,
      });
    } catch (error) {
      console.error("Wardrobe claim: event record failed", error);
    }

    return NextResponse.json({ ok: true, id: saved.id });
  } catch (error) {
    console.error("Wardrobe claim route error", error);
    return jsonError(
      "An unexpected error occurred.",
      "WARDROBE_CLAIM_INTERNAL_ERROR",
      500,
    );
  }
}

export const wardrobeClaimRouteHandlers = { postWardrobeClaimRoute };
