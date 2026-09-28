#!/usr/bin/env node
/**
 * スタイルプリセットを、管理画面にログインせずに本番へ登録する。
 *
 *   node scripts/register-style-presets.mjs <manifest.json> [--dry-run]
 *
 * 画像の保存とプリセットの作成は、管理画面の API と同じ部品
 * (features/style-presets/lib の uploadStylePresetImage / createStylePreset)で行う。
 * マニフェストの書き方は --help。本体は scripts/style-presets/register-style-presets.ts。
 *
 * 鍵は .env.local から NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY だけを読む
 * (CLAUDE.md の許可範囲。ほかのキーは読み込まない)。すでに環境変数にあればそちらを使う。
 */
import "./lib/register-typescript.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ⭐ lib/env.ts は import された瞬間に process.env を読んで固定する。
//    鍵を入れてから本体を import すること(順番を入れ替えると接続先が空になる)
const { applyAllowedEnvFile, SUPABASE_ADMIN_ENV_KEYS } = await import(
  "./lib/allowed-env.ts"
);
applyAllowedEnvFile(path.join(repoRoot, ".env.local"), SUPABASE_ADMIN_ENV_KEYS);

const { runRegisterStylePresets } = await import(
  "./style-presets/register-style-presets.ts"
);
process.exitCode = await runRegisterStylePresets(process.argv.slice(2));
