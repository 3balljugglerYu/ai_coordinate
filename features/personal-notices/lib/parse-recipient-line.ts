const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_ONLY = new RegExp(`^${UUID}$`, "i");
// /posts/<id> と /users/<id>。言語つき(/en/posts/<id>)も受ける
const POST_PATH = new RegExp(`^/(?:[a-z]{2}(?:-[A-Za-z]{2})?/)?posts/(${UUID})/?$`, "i");
const USER_PATH = new RegExp(`^/(?:[a-z]{2}(?:-[A-Za-z]{2})?/)?users/(${UUID})/?$`, "i");

export type ParsedRecipientLine =
  | { kind: "post"; postId: string }
  | { kind: "user"; userId: string }
  | { kind: "invalid" };

/**
 * 宛先の1行を読む。投稿の URL → 投稿した人(作品つき)、プロフィールの URL か
 * ユーザーID → その人(文だけ)。メールアドレスは扱わない(計画書 ADR)。
 */
export function parseRecipientLine(line: string): ParsedRecipientLine {
  const value = line.trim();
  if (UUID_ONLY.test(value)) {
    return { kind: "user", userId: value.toLowerCase() };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { kind: "invalid" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { kind: "invalid" };
  }

  const post = url.pathname.match(POST_PATH);
  if (post) {
    return { kind: "post", postId: post[1].toLowerCase() };
  }
  const user = url.pathname.match(USER_PATH);
  if (user) {
    return { kind: "user", userId: user[1].toLowerCase() };
  }
  return { kind: "invalid" };
}

/** 貼った文を行に分ける。空の行は数えない(行番号は貼った文の行のまま) */
export function splitRecipientLines(
  text: string
): Array<{ line: number; input: string }> {
  return text
    .split(/\r?\n/)
    .map((input, index) => ({ line: index + 1, input: input.trim() }))
    .filter((row) => row.input.length > 0);
}
