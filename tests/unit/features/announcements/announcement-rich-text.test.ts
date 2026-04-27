/** @jest-environment node */

import {
  isSafeAnnouncementLinkUrl,
  validateAnnouncementDocument,
} from "@/features/announcements/lib/announcement-rich-text";

const safeLinkMark = {
  type: "link",
  attrs: {
    href: "https://example.com/news",
    target: "_blank",
    rel: "noopener noreferrer nofollow",
  },
};

function linkMarkDocument(mark: unknown) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "お知らせ",
            marks: [
              mark,
            ],
          },
        ],
      },
    ],
  };
}

function linkDocument(markAttrs: Record<string, unknown>) {
  return linkMarkDocument({
    type: "link",
    attrs: markAttrs,
  });
}

describe("announcement rich text link validation", () => {
  describe("isSafeAnnouncementLinkUrl", () => {
    test("https URL と内部リンクを許可する", () => {
      expect(isSafeAnnouncementLinkUrl("https://example.com/news")).toBe(true);
      expect(isSafeAnnouncementLinkUrl("/notifications/announcements")).toBe(
        true
      );
    });

    test("不正または危険な URL を拒否する", () => {
      expect(isSafeAnnouncementLinkUrl("http://example.com")).toBe(false);
      expect(isSafeAnnouncementLinkUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeAnnouncementLinkUrl("https://")).toBe(false);
      expect(isSafeAnnouncementLinkUrl("//example.com")).toBe(false);
      expect(isSafeAnnouncementLinkUrl("/\\example.com")).toBe(false);
      expect(isSafeAnnouncementLinkUrl(" https://example.com")).toBe(false);
      expect(isSafeAnnouncementLinkUrl("x".repeat(2049))).toBe(false);
    });
  });

  describe("validateAnnouncementDocument", () => {
    test("安全属性を持つ link mark を許可する", () => {
      expect(validateAnnouncementDocument(linkDocument(safeLinkMark.attrs))).toEqual(
        {
          ok: true,
          bodyJson: linkDocument(safeLinkMark.attrs),
        }
      );
    });

    test("attrs が不正な link mark を拒否する", () => {
      expect(
        validateAnnouncementDocument(linkMarkDocument({ type: "link" }))
      ).toEqual({
        ok: false,
        error: "link mark の属性が不正です",
      });
    });

    test("許可されていない link 属性を拒否する", () => {
      expect(
        validateAnnouncementDocument(
          linkDocument({
            ...safeLinkMark.attrs,
            onclick: "alert(1)",
          })
        )
      ).toEqual({
        ok: false,
        error: "許可されていない link 属性が含まれています",
      });
    });

    test("不正な href を持つ link mark を拒否する", () => {
      expect(
        validateAnnouncementDocument(
          linkDocument({
            ...safeLinkMark.attrs,
            href: "http://example.com",
          })
        )
      ).toEqual({
        ok: false,
        error: "リンク URL が不正です",
      });
    });

    test("target が欠落した link mark を拒否する", () => {
      const attrs: Record<string, unknown> = { ...safeLinkMark.attrs };
      delete attrs.target;

      expect(validateAnnouncementDocument(linkDocument(attrs))).toEqual({
        ok: false,
        error: "リンクの target 属性が不正です",
      });
    });

    test("rel が欠落した link mark を拒否する", () => {
      const attrs: Record<string, unknown> = { ...safeLinkMark.attrs };
      delete attrs.rel;

      expect(validateAnnouncementDocument(linkDocument(attrs))).toEqual({
        ok: false,
        error: "リンクの rel 属性が不正です",
      });
    });

    test("target または rel が null の link mark を拒否する", () => {
      expect(
        validateAnnouncementDocument(
          linkDocument({ ...safeLinkMark.attrs, target: null })
        )
      ).toEqual({
        ok: false,
        error: "リンクの target 属性が不正です",
      });

      expect(
        validateAnnouncementDocument(
          linkDocument({ ...safeLinkMark.attrs, rel: null })
        )
      ).toEqual({
        ok: false,
        error: "リンクの rel 属性が不正です",
      });
    });

    test("class 属性を持つ link mark を拒否する", () => {
      expect(
        validateAnnouncementDocument(
          linkDocument({
            ...safeLinkMark.attrs,
            class: "text-red-500",
          })
        )
      ).toEqual({
        ok: false,
        error: "リンクの class 属性は指定できません",
      });
    });

    test("長すぎる title 属性を持つ link mark を拒否する", () => {
      expect(
        validateAnnouncementDocument(
          linkDocument({
            ...safeLinkMark.attrs,
            title: "x".repeat(201),
          })
        )
      ).toEqual({
        ok: false,
        error: "リンクの title 属性が不正です",
      });
    });

    test("noopener noreferrer が揃っていない link mark を拒否する", () => {
      expect(
        validateAnnouncementDocument(
          linkDocument({
            ...safeLinkMark.attrs,
            rel: "noopener nofollow",
          })
        )
      ).toEqual({
        ok: false,
        error: "リンクの rel 属性が不正です",
      });
    });
  });
});
