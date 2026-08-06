/**
 * features/style-presets/lib/style-preset-usage-recording のテスト。
 *
 * 「公開中でないプリセットに紐づく利用イベント(style_usage_events)は記録しない」
 * 共有述語。判定条件はクリエイター通知の記録ゲート(#479)と同一:
 *   status='published' × visibility='public' × is_active × 表示期間 [starts, ends)
 */
import { shouldRecordStylePresetUsage } from "@/features/style-presets/lib/style-preset-usage-recording";

function buildPreset(overrides: {
  status?: "draft" | "pending" | "published" | "rejected";
  visibility?: string;
  isActive?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}) {
  return {
    ...(overrides.status !== undefined ? { status: overrides.status } : {}),
    category: {
      visibility: overrides.visibility ?? "public",
      isActive: overrides.isActive ?? true,
      collectionDisplayStartsAt: overrides.startsAt ?? null,
      collectionDisplayEndsAt: overrides.endsAt ?? null,
    },
  };
}

describe("shouldRecordStylePresetUsage", () => {
  test("公開中(public × active × 期間制限なし)は記録する", () => {
    expect(shouldRecordStylePresetUsage(buildPreset({}))).toBe(true);
  });

  test("status を持つ型では published のみ記録する", () => {
    expect(
      shouldRecordStylePresetUsage(buildPreset({ status: "published" })),
    ).toBe(true);
    expect(shouldRecordStylePresetUsage(buildPreset({ status: "draft" }))).toBe(
      false,
    );
    expect(
      shouldRecordStylePresetUsage(buildPreset({ status: "pending" })),
    ).toBe(false);
    expect(
      shouldRecordStylePresetUsage(buildPreset({ status: "rejected" })),
    ).toBe(false);
  });

  test("status 未定義(PublicSummary 型)は published とみなす", () => {
    // getPublishedStylePresetById は published のみ返すため
    expect(shouldRecordStylePresetUsage(buildPreset({}))).toBe(true);
  });

  test("admin_only カテゴリは記録しない(公開前テスト除外)", () => {
    expect(
      shouldRecordStylePresetUsage(buildPreset({ visibility: "admin_only" })),
    ).toBe(false);
  });

  test("inactive カテゴリは記録しない", () => {
    expect(
      shouldRecordStylePresetUsage(buildPreset({ isActive: false })),
    ).toBe(false);
  });

  test("表示期間 [starts, ends) を尊重する(開始前・終了後は記録しない)", () => {
    const past = "2020-01-01T00:00:00Z";
    const future = "2099-01-01T00:00:00Z";
    // 期間内
    expect(
      shouldRecordStylePresetUsage(
        buildPreset({ startsAt: past, endsAt: future }),
      ),
    ).toBe(true);
    // 開始前
    expect(
      shouldRecordStylePresetUsage(buildPreset({ startsAt: future })),
    ).toBe(false);
    // 終了後(ends は排他端)
    expect(shouldRecordStylePresetUsage(buildPreset({ endsAt: past }))).toBe(
      false,
    );
  });

  test("期間フィールドが undefined でも「制限なし」として扱う(テスト用最小形の互換)", () => {
    expect(
      shouldRecordStylePresetUsage({
        category: { visibility: "public", isActive: true },
      }),
    ).toBe(true);
  });
});
