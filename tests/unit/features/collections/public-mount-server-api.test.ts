/** @jest-environment node */

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

import { withOgpVersion } from "@/features/collections/lib/public-mount-server-api";

describe("withOgpVersion", () => {
  it("null はそのまま null を返す", () => {
    expect(withOgpVersion(null)).toBeNull();
  });

  it("クエリ無しURLに ?v=N を付与する", () => {
    expect(
      withOgpVersion("https://example.supabase.co/storage/v1/object/public/generated-images/a/ogp-123.png"),
    ).toBe(
      "https://example.supabase.co/storage/v1/object/public/generated-images/a/ogp-123.png?v=2",
    );
  });

  it("既存クエリがあるURLには & で追加し、既存パラメータを保持する", () => {
    expect(withOgpVersion("https://example.com/img.png?foo=1")).toBe(
      "https://example.com/img.png?foo=1&v=2",
    );
  });

  it("既に v がある場合は重複させず上書きする", () => {
    expect(withOgpVersion("https://example.com/img.png?v=1")).toBe(
      "https://example.com/img.png?v=2",
    );
  });

  it("URLとして解釈できない文字列はそのまま返す", () => {
    expect(withOgpVersion("not-a-url")).toBe("not-a-url");
  });
});
