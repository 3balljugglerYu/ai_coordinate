import { env } from "@/lib/env";
import type { AnnouncementFontSize } from "./schema";

const ALLOWED_FONT_SIZES = new Set<AnnouncementFontSize>([
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "28px",
  "32px",
]);
const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
const STORAGE_PATH_PATTERN = /^(?!\/)(?!.*\.\.)[\w./-]+\.webp$/;

type RichTextNode = {
  type?: unknown;
  text?: unknown;
  marks?: unknown;
  attrs?: unknown;
  content?: unknown;
};

type RichTextMark = {
  type?: unknown;
  attrs?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getAnnouncementImagePublicPrefix() {
  const baseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!baseUrl) {
    return "";
  }

  return `${baseUrl}/storage/v1/object/public/announcement-images/`;
}

export function isSafeAnnouncementLinkUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return true;
  }

  return trimmed.startsWith("https://");
}

export function isValidAnnouncementImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }

  const publicPrefix = getAnnouncementImagePublicPrefix();
  if (publicPrefix && trimmed.startsWith(publicPrefix)) {
    return true;
  }

  return (
    trimmed.startsWith("https://") &&
    trimmed.includes("/storage/v1/object/public/announcement-images/")
  );
}

function isValidStoragePath(value: unknown): value is string {
  return typeof value === "string" && STORAGE_PATH_PATTERN.test(value.trim());
}

function validateMark(mark: unknown): string | null {
  if (!isObject(mark)) {
    return "mark が不正です";
  }

  const typedMark = mark as RichTextMark;
  if (typedMark.type === "bold") {
    return typedMark.attrs == null ? null : "bold mark の属性が不正です";
  }

  if (typedMark.type !== "textStyle") {
    return "許可されていない mark が含まれています";
  }

  if (typedMark.attrs == null) {
    return null;
  }

  if (!isObject(typedMark.attrs)) {
    return "textStyle mark の属性が不正です";
  }

  const attrs = typedMark.attrs;
  const keys = Object.keys(attrs);
  for (const key of keys) {
    if (!["color", "fontSize"].includes(key)) {
      return "許可されていない textStyle 属性が含まれています";
    }
  }

  if (
    "color" in attrs &&
    attrs.color != null &&
    (typeof attrs.color !== "string" || !COLOR_PATTERN.test(attrs.color))
  ) {
    return "文字色の指定が不正です";
  }

  if (
    "fontSize" in attrs &&
    attrs.fontSize != null &&
    (typeof attrs.fontSize !== "string" ||
      !ALLOWED_FONT_SIZES.has(attrs.fontSize as AnnouncementFontSize))
  ) {
    return "文字サイズの指定が不正です";
  }

  return null;
}

function validateNode(node: unknown): string | null {
  if (!isObject(node)) {
    return "body_json のノードが不正です";
  }

  const typedNode = node as RichTextNode;
  if (typedNode.type === "doc") {
    if (!Array.isArray(typedNode.content)) {
      return "doc ノードの content が不正です";
    }

    for (const child of typedNode.content) {
      const error = validateNode(child);
      if (error) {
        return error;
      }
    }
    return null;
  }

  if (typedNode.type === "paragraph") {
    if (typedNode.attrs != null) {
      return "paragraph ノードの属性はサポートされていません";
    }

    if (typedNode.content != null && !Array.isArray(typedNode.content)) {
      return "paragraph ノードの content が不正です";
    }

    for (const child of (typedNode.content as unknown[]) ?? []) {
      const error = validateNode(child);
      if (error) {
        return error;
      }
    }
    return null;
  }

  if (typedNode.type === "text") {
    if (typeof typedNode.text !== "string") {
      return "text ノードが不正です";
    }

    if (typedNode.attrs != null || typedNode.content != null) {
      return "text ノードの構造が不正です";
    }

    if (typedNode.marks != null && !Array.isArray(typedNode.marks)) {
      return "text ノードの marks が不正です";
    }

    for (const mark of (typedNode.marks as unknown[]) ?? []) {
      const error = validateMark(mark);
      if (error) {
        return error;
      }
    }
    return null;
  }

  if (typedNode.type === "hardBreak") {
    if (
      typedNode.text != null ||
      typedNode.attrs != null ||
      typedNode.content != null ||
      typedNode.marks != null
    ) {
      return "hardBreak ノードの構造が不正です";
    }
    return null;
  }

  if (typedNode.type === "image") {
    if (!isObject(typedNode.attrs)) {
      return "image ノードの属性が不正です";
    }

    const attrs = typedNode.attrs;
    const keys = Object.keys(attrs);
    for (const key of keys) {
      if (!["src", "alt", "storagePath", "title"].includes(key)) {
        return "許可されていない image 属性が含まれています";
      }
    }

    if (typeof attrs.src !== "string" || !isValidAnnouncementImageUrl(attrs.src)) {
      return "画像 URL が不正です";
    }

    if (!isValidStoragePath(attrs.storagePath)) {
      return "画像 storagePath が不正です";
    }

    if (
      attrs.alt != null &&
      (typeof attrs.alt !== "string" || attrs.alt.length > 200)
    ) {
      return "画像 alt 属性が不正です";
    }

    if (
      attrs.title != null &&
      (typeof attrs.title !== "string" || attrs.title.length > 200)
    ) {
      return "画像 title 属性が不正です";
    }

    if (
      typedNode.text != null ||
      typedNode.content != null ||
      typedNode.marks != null
    ) {
      return "image ノードの構造が不正です";
    }
    return null;
  }

  return "許可されていないノードが含まれています";
}

function walkNodes(
  node: unknown,
  visitor: (typedNode: RichTextNode) => void
): void {
  if (!isObject(node)) {
    return;
  }

  const typedNode = node as RichTextNode;
  visitor(typedNode);

  if (Array.isArray(typedNode.content)) {
    for (const child of typedNode.content) {
      walkNodes(child, visitor);
    }
  }
}

export function validateAnnouncementDocument(doc: unknown): {
  ok: true;
  bodyJson: Record<string, unknown>;
} | {
  ok: false;
  error: string;
} {
  if (!isObject(doc)) {
    return { ok: false, error: "本文データが不正です" };
  }

  const error = validateNode(doc);
  if (error) {
    return { ok: false, error };
  }

  return { ok: true, bodyJson: doc };
}

export function extractAnnouncementBodyText(doc: unknown): string {
  const chunks: string[] = [];

  walkNodes(doc, (node) => {
    if (node.type === "text" && typeof node.text === "string") {
      chunks.push(node.text);
    }

    if (node.type === "hardBreak" || node.type === "paragraph") {
      chunks.push("\n");
    }
  });

  return chunks
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractAnnouncementAssetPaths(doc: unknown): string[] {
  const assetPaths = new Set<string>();

  walkNodes(doc, (node) => {
    if (
      node.type === "image" &&
      isObject(node.attrs) &&
      isValidStoragePath(node.attrs.storagePath)
    ) {
      assetPaths.add(node.attrs.storagePath.trim());
    }
  });

  return [...assetPaths];
}

export function hasMeaningfulAnnouncementContent(
  bodyText: string,
  assetPaths: string[]
): boolean {
  return bodyText.trim().length > 0 || assetPaths.length > 0;
}
