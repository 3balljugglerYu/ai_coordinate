"use client";

import type { Content } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { announcementTiptapExtensions } from "@/features/announcements/lib/tiptap-extensions";
import { ANNOUNCEMENT_FONT_SIZE_VALUES } from "@/features/announcements/lib/schema";
import { cn } from "@/lib/utils";

const EMPTY_DOC = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

interface AnnouncementEditorProps {
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

function normalizeContent(value: unknown): Content {
  return (value && typeof value === "object" ? value : EMPTY_DOC) as Content;
}

export function AnnouncementEditor({
  value,
  onChange,
  disabled = false,
}: AnnouncementEditorProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSerializedRef = useRef(JSON.stringify(normalizeContent(value)));
  const [selectionTick, setSelectionTick] = useState(0);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: announcementTiptapExtensions,
    content: normalizeContent(value),
    editorProps: {
      attributes: {
        class:
          "ProseMirror min-h-[240px] focus:outline-none px-4 py-3 text-sm leading-7 text-slate-900",
      },
    },
    onUpdate({ editor: currentEditor }) {
      const json = currentEditor.getJSON();
      lastSerializedRef.current = JSON.stringify(json);
      onChange(json);
    },
    onSelectionUpdate() {
      setSelectionTick((previous) => previous + 1);
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const serialized = JSON.stringify(normalizeContent(value));
    if (serialized === lastSerializedRef.current) {
      return;
    }

    lastSerializedRef.current = serialized;
    editor.commands.setContent(JSON.parse(serialized) as Content);
  }, [editor, value]);

  const currentTextStyle = editor?.getAttributes("textStyle") as {
    color?: string | null;
    fontSize?: string | null;
  };

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/announcements/images", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; publicUrl?: string; storagePath?: string }
        | null;

      if (!response.ok || !payload?.publicUrl || !payload?.storagePath) {
        throw new Error(payload?.error || "画像のアップロードに失敗しました");
      }

      editor
        ?.chain()
        .focus()
        .insertContent({
          type: "image",
          attrs: {
            src: payload.publicUrl,
            alt: file.name,
            storagePath: payload.storagePath,
          },
        })
        .run();
    } catch (error) {
      toast({
        title: "エラー",
        description:
          error instanceof Error
            ? error.message
            : "画像のアップロードに失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  void selectionTick;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
        <Button
          type="button"
          variant={editor?.isActive("bold") ? "default" : "outline"}
          size="sm"
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className="min-h-[40px] cursor-pointer"
        >
          太字
        </Button>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          文字サイズ
          <select
            value={currentTextStyle?.fontSize ?? ""}
            disabled={!editor || disabled}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (!editor) {
                return;
              }

              if (!nextValue) {
                editor
                  .chain()
                  .focus()
                  .setMark("textStyle", { fontSize: null })
                  .removeEmptyTextStyle()
                  .run();
                return;
              }

              editor
                .chain()
                .focus()
                .setMark("textStyle", { fontSize: nextValue })
                .run();
            }}
            className="min-h-[40px] rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">標準</option>
            {ANNOUNCEMENT_FONT_SIZE_VALUES.map((fontSize) => (
              <option key={fontSize} value={fontSize}>
                {fontSize}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          文字色
          <input
            type="color"
            value={currentTextStyle?.color ?? "#111827"}
            disabled={!editor || disabled}
            onChange={(event) => {
              const nextColor = event.target.value;
              if (!editor) {
                return;
              }

              editor.chain().focus().setColor(nextColor).run();
            }}
            className="h-10 w-12 cursor-pointer rounded border border-slate-200 bg-white p-1"
          />
        </label>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!editor || disabled || isUploadingImage}
          onClick={() => fileInputRef.current?.click()}
          className="min-h-[40px] cursor-pointer"
        >
          <ImagePlus className="mr-2 h-4 w-4" aria-hidden />
          {isUploadingImage ? "アップロード中..." : "画像を挿入"}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          onChange={handleImageUpload}
          className="hidden"
        />
      </div>

      <div
        className={cn(
          "rounded-xl border border-slate-200 bg-white shadow-inner",
          disabled && "pointer-events-none opacity-70"
        )}
      >
        <EditorContent
          editor={editor}
          className="[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-slate-400 [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-['本文を入力してください'] [&_.ProseMirror_img]:my-3 [&_.ProseMirror_img]:max-h-[360px] [&_.ProseMirror_img]:rounded-lg [&_.ProseMirror_img]:border [&_.ProseMirror_img]:border-slate-200 [&_.ProseMirror_img]:object-contain"
        />
      </div>
    </div>
  );
}
