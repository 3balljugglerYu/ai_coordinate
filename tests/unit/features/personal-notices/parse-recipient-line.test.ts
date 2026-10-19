/** @jest-environment node */

import {
  parseRecipientLine,
  splitRecipientLines,
} from "@/features/personal-notices/lib/parse-recipient-line";

const ID = "b78f04b4-5c88-4b08-8a22-d4930a3248ec";

describe("parseRecipientLine", () => {
  test.each([
    [`https://www.persta.ai/posts/${ID}`],
    [`https://persta.ai/posts/${ID}?from=home#c`],
    [`https://www.persta.ai/en/posts/${ID}/`],
    [`https://www.persta.ai/zh-CN/posts/${ID}`],
    [`  https://www.persta.ai/posts/${ID.toUpperCase()}  `],
  ])("投稿のURLは投稿として読む: %s", (line) => {
    expect(parseRecipientLine(line)).toEqual({ kind: "post", postId: ID });
  });

  test.each([
    [`https://www.persta.ai/users/${ID}`],
    [`https://www.persta.ai/ja/users/${ID}?from=notifications`],
    [ID],
    [` ${ID.toUpperCase()} `],
  ])("プロフィールのURLとユーザーIDは人として読む: %s", (line) => {
    expect(parseRecipientLine(line)).toEqual({ kind: "user", userId: ID });
  });

  test.each([
    ["abc"],
    ["someone@example.com"],
    [`https://www.persta.ai/posts/${ID}/comments`],
    [`https://www.persta.ai/my-page/${ID}`],
    [`https://www.persta.ai/posts/not-a-uuid`],
    [`javascript:alert('${ID}')`],
    [`ftp://www.persta.ai/posts/${ID}`],
    [`${ID}x`],
  ])("どれでもないものは invalid: %s", (line) => {
    expect(parseRecipientLine(line)).toEqual({ kind: "invalid" });
  });
});

describe("splitRecipientLines", () => {
  test("空の行は数えず_行番号は貼った文の行のまま", () => {
    expect(splitRecipientLines("a\n\n  \r\nb  \n")).toEqual([
      { line: 1, input: "a" },
      { line: 4, input: "b" },
    ]);
  });
});
