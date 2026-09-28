import fs from "node:fs";

/**
 * 登録スクリプトが .env.local から読んでよいキー。
 *
 * CLAUDE.md が許す Supabase の鍵のうち、プリセットの登録に要る2つだけ。
 * .env.local には Stripe や OpenAI の鍵も並んでいるが、それらは読み込まない。
 */
export const SUPABASE_ADMIN_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

// `#` で始まる行(コメントアウト)はキー名の位置で外れる
const ENV_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/** 値の部分から、引用符と行末コメントを取り除く。 */
function parseValue(raw: string): string {
  const value = raw.trim();
  const quote = value[0];
  if (quote === '"' || quote === "'") {
    const end = value.indexOf(quote, 1);
    if (end > 0) {
      return value.slice(1, end);
    }
  }
  return value.replace(/\s+#.*$/, "");
}

/**
 * .env 形式の文字列から、許可したキーだけを取り出す。
 *
 * 同じキーが2回あれば後の値を使う。Next.js(@next/env → dotenv)と同じ規則に
 * しておかないと、アプリとスクリプトが別のデータベースを向いてしまう。
 */
export function parseAllowedEnv(
  content: string,
  allowedKeys: readonly string[]
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = ENV_LINE.exec(line);
    if (!match || !allowedKeys.includes(match[1])) {
      continue;
    }
    values[match[1]] = parseValue(match[2]);
  }
  return values;
}

/**
 * .env ファイルの許可したキーを env に入れ、入れたキー名を返す。
 *
 * すでに値のあるキーは上書きしない(実行環境で指定した値を優先する)。
 * ファイルが無ければ何もしない(CI やクラウドのセッションには .env.local が無い)。
 */
export function applyAllowedEnvFile(
  filePath: string,
  allowedKeys: readonly string[],
  env: Record<string, string | undefined> = process.env
): string[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const values = parseAllowedEnv(fs.readFileSync(filePath, "utf8"), allowedKeys);
  const applied: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (env[key] !== undefined) {
      continue;
    }
    env[key] = value;
    applied.push(key);
  }
  return applied;
}
