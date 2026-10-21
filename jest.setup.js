require('@testing-library/jest-dom');

// jsdom には ResizeObserver が未実装のため、Radix UI などが内部的に呼ぶ箇所で
// ReferenceError が出ないよう no-op の polyfill を入れる。
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Cache Components 対応で各 route に追加した `await connection()` は Next.js
// のリクエストスコープ内でのみ動作する。integration テストはモック済み
// NextRequest を直接 handler に渡すためスコープが存在しないので、グローバル
// に no-op としてモックする（本番ランタイムでは本物が動的レンダリング判定に効く）。
jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  connection: jest.fn().mockResolvedValue(undefined),
}));

// ハロウィン企画の対象作品の判定(useHalloweenTargets)は、期間中(ブラウザの時刻)だけ API を呼ぶ。
// そのままでは、投稿カードや投稿の詳細を描く既存のテストが「テストを流した日時」で
// 結果を変えてしまう(期間中だけ fetch が飛び、ラベルが付く)。全体では「対象作品なし」に固定し、
// 判定そのものは専用のテストで jest.requireActual して確かめる。
jest.mock('@/features/campaigns/halloween/hooks/useHalloweenTargets', () => ({
  useHalloweenTargetPostIds: jest.fn(() => new Set()),
  useIsHalloweenTarget: jest.fn(() => false),
  refreshHalloweenTargetsAfterPostChange: jest.fn(),
  resetHalloweenTargetsForTest: jest.fn(),
}));

// 同じ理由で、みんなのカタログの企画のタブを出すか(useHalloweenCampaignOpen)も全体では「期間外」に固定する
jest.mock('@/features/campaigns/halloween/hooks/useHalloweenCampaignOpen', () => ({
  useHalloweenCampaignOpen: jest.fn(() => false),
}));
