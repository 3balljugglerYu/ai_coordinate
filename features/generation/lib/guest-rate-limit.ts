import "server-only";

/**
 * 画面横断ゲスト生成レート制限の薄いラッパ。
 *
 * `/style` と `/coordinate` のゲスト経路は同一の RPC（`reserve_style_guest_generate_attempt`）と
 * テーブル（`style_guest_generate_attempts`）を共有し、IP + 永続 Cookie の SHA-256 ハッシュで
 * 識別する。Phase 3 のゲスト sync ルートはこのモジュール越しにレート制限を呼ぶため、
 * 将来的に画面横断ゲスト用にロジックを切り出した際の単一参照点となる。
 *
 * 関連:
 * - 計画書: docs/planning/unify-style-coordinate-usage-limits-plan.md
 * - 既存実装: features/style/lib/style-rate-limit.ts
 *
 * 既存実装からの再 export なので、振る舞いは同等。テーブル名 / RPC 名は ADR-002 に従い据え置き。
 */
export {
  checkAndConsumeStyleGenerateRateLimit as checkAndConsumeGuestGenerateRateLimit,
  releaseStyleGenerateRateLimitAttempt as releaseGuestGenerateRateLimitAttempt,
  type StyleGenerateAttemptReservation as GuestGenerateAttemptReservation,
  type StyleGenerateRateLimitReason as GuestGenerateRateLimitReason,
  type StyleGenerateRateLimitResult as GuestGenerateRateLimitResult,
  type StyleAttemptReleaseReason as GuestAttemptReleaseReason,
} from "@/features/style/lib/style-rate-limit";
