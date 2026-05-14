/**
 * `process.env.NEXT_PUBLIC_GEMINI_GENERATION_ENABLED` を一時的に切り替えて
 * `@/features/generation/lib/model-config` を fresh に再ロードするテストヘルパー。
 *
 * `GEMINI_GENERATION_ENABLED` 定数は `process.env` をモジュール load 時に 1 回だけ
 * 読むため、env 切替後の挙動を検証するにはモジュール自体を再ロードする必要がある。
 * このヘルパーは `jest.isolateModules` でモジュールを fresh に評価し、評価後は
 * env を元の値に戻す（取り回しを各テストに分散させない）。
 *
 * 主な利用先:
 *   - tests/unit/features/generation/inspire-model-config.test.ts
 *   - tests/unit/features/generation/model-config.test.ts
 */
export function loadConfigWithGemini(
  enabled: boolean
): typeof import("@/features/generation/lib/model-config") {
  const KEY = "NEXT_PUBLIC_GEMINI_GENERATION_ENABLED";
  const original = process.env[KEY];
  process.env[KEY] = enabled ? "true" : "false";
  let mod!: typeof import("@/features/generation/lib/model-config");
  jest.isolateModules(() => {
    // `jest.requireActual` を使うと @typescript-eslint/no-require-imports に引っかからない。
    // isolateModules 内で呼ぶことで env 切替後のモジュールを fresh に load する。
    mod = jest.requireActual<
      typeof import("@/features/generation/lib/model-config")
    >("@/features/generation/lib/model-config");
  });
  if (original === undefined) {
    delete process.env[KEY];
  } else {
    process.env[KEY] = original;
  }
  return mod;
}
