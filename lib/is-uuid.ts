const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 4122 形式の UUID 文字列か判定する。 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
