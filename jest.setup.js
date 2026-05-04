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
