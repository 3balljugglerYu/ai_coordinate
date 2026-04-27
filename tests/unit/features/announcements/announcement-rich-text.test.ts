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

function linkDocument(markAttrs: Record<string, unknown>) {
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
              {
                type: "link",
                attrs: markAttrs,
              },
            ],
          },
        ],
      },
    ],
  };
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
