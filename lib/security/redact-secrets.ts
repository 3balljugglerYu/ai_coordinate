/**
 * 機密情報マスクヘルパー
 *
 * 設計判断: docs/planning/creator-looks-implementation-plan.md ADR-009 (= レッドライン)
 *
 * 目的:
 *   - Creator Looks の `hidden_prompt` を始め、各種 secret がログ / レスポンス /
 *     通知本文 / Sentry breadcrumb / Slack 等に意図せず漏れることを防ぐ。
 *   - 全ての logger / 通知 body / API レスポンスは投入前にこのヘルパを通すルール。
 *
 * アプローチ:
 *   - **キー名ベース** の deep 再帰置換 (= 値の中身は判定しない)
 *   - 機密キー (例: hidden_prompt, password, secret, api_key, authorization) を `[REDACTED]` に置換
 *   - 機密キーは小文字化して比較 (大文字小文字を吸収)
 *   - サブ文字列マッチも対応 (= "user_hidden_prompt" なども redact)
 *   - 循環参照は WeakSet で 1 回だけ訪問
 *
 * 注意:
 *   - 値 (string) の中に hidden_prompt が文字列として埋め込まれているケースは
 *     完全には防げない (= 個別文脈で文字列マッチングする責任は呼出側にある)。
 *   - 本ヘルパは pure (= 副作用なし)、入力 obj を mutate しない。
 */

const REDACTED_PLACEHOLDER = "[REDACTED]";

/**
 * このサブ文字列を含むキー (= 大文字小文字無視) はマスクする。
 * 部分一致なので "user_hidden_prompt" や "openai_api_key" も拾える。
 */
const SENSITIVE_KEY_SUBSTRINGS = [
  // Creator Looks 関連 (= ADR-009 第一優先)
  "hidden_prompt",
  "extracted_prompt",
  "meta_extractor_output",
  "creator_looks_prompt",

  // 一般的な secret 系
  "authorization",
  "api_key",
  "apikey",
  "secret",
  "password",
  "bearer",
  "service_role",
  "access_token",
  "refresh_token",
  "private_key",
] as const;

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_SUBSTRINGS.some((sub) => lower.includes(sub));
}

/**
 * 任意の値を deep 再帰でマスクする。
 *
 * 動作:
 *   - primitive (string, number, boolean, null, undefined) → そのまま返す
 *   - Array → 各要素を再帰
 *   - Date / RegExp / Error → toString された別物として扱う (= 中身は再帰しない、ただし string 化)
 *   - object → 各キーを評価し、機密キーは `[REDACTED]` に置換、非機密キーは値を再帰
 *   - 循環参照 → 同じ object は 2 度目以降 "[CIRCULAR]" として返す
 *
 * Error はそのまま return すると下流で stack trace が見えなくなるため、
 * { name, message, stack } の 3 属性を持つ plain object に変換する。
 * 注意: stack 内に secret 文字列が混じっていても本ヘルパは検知できない。
 */
export function redactSecrets<T>(value: T): T {
  return _redact(value, new WeakSet()) as T;
}

function _redact(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean" || t === "bigint") {
    return value;
  }
  if (t === "function" || t === "symbol") {
    return REDACTED_PLACEHOLDER;
  }

  // Error は plain object 化 (= stack を確認したいので残す、機密混在は別途呼出側責任)
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  // Date / RegExp は string 化 (= 機密ではないので素通し)
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();

  if (typeof value === "object") {
    const objValue = value as Record<string, unknown> | unknown[];
    if (seen.has(objValue as object)) {
      return "[CIRCULAR]";
    }
    seen.add(objValue as object);

    if (Array.isArray(objValue)) {
      return objValue.map((v) => _redact(v, seen));
    }

    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(objValue)) {
      if (isSensitiveKey(k)) {
        result[k] = REDACTED_PLACEHOLDER;
      } else {
        result[k] = _redact(v, seen);
      }
    }
    return result;
  }

  return value;
}

/**
 * テスト / 呼出側のデバッグ用エクスポート
 */
export const REDACTED = REDACTED_PLACEHOLDER;
export const SENSITIVE_KEYS = SENSITIVE_KEY_SUBSTRINGS;
