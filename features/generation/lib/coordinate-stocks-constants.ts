/**
 * COORDINATE_STOCKS_LINK_MAX_JOBS:
 * `PATCH /api/generation-status/link-stock` が一度に紐付けられる jobIds 上限。
 * 同時生成数の上限と同期しているため、変更時は API ハンドラ・client helper・
 * バリデーション schema の 3 箇所が同じ値を使うよう本モジュールから参照する。
 */
export const COORDINATE_STOCKS_LINK_MAX_JOBS = 4;
