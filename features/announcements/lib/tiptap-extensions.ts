import { Extension } from "@tiptap/core";
import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { isSafeAnnouncementLinkUrl } from "./announcement-rich-text";

export const ANNOUNCEMENT_LINK_REL = "noopener noreferrer nofollow";
export const ANNOUNCEMENT_LINK_TARGET = "_blank";

export const AnnouncementImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      storagePath: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-storage-path"),
        renderHTML: (attributes) =>
          attributes.storagePath
            ? { "data-storage-path": attributes.storagePath }
            : {},
      },
    };
  },
});

export const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) {
                return {};
              }

              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },
});

export const AnnouncementLink = Link.configure({
  autolink: false,
  linkOnPaste: true,
  openOnClick: false,
  HTMLAttributes: {
    target: ANNOUNCEMENT_LINK_TARGET,
    rel: ANNOUNCEMENT_LINK_REL,
  },
  isAllowedUri: (url) => isSafeAnnouncementLinkUrl(url),
  shouldAutoLink: (url) => isSafeAnnouncementLinkUrl(url),
});

export const announcementTiptapExtensions = [
  StarterKit.configure({
    blockquote: false,
    bulletList: false,
    code: false,
    codeBlock: false,
    dropcursor: false,
    gapcursor: false,
    heading: false,
    horizontalRule: false,
    italic: false,
    link: false,
    listItem: false,
    orderedList: false,
    strike: false,
    underline: false,
  }),
  TextStyle,
  Color,
  FontSize,
  AnnouncementImage,
  AnnouncementLink,
];
