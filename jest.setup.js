require('@testing-library/jest-dom');

// Cache Components 対応で各 route に追加した `await connection()` は Next.js
// のリクエストスコープ内でのみ動作する。integration テストはモック済み
// NextRequest を直接 handler に渡すためスコープが存在しないので、グローバル
// に no-op としてモックする（本番ランタイムでは本物が動的レンダリング判定に効く）。
jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  connection: jest.fn().mockResolvedValue(undefined),
}));
