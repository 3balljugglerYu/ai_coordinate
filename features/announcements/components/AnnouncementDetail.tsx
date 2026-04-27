"use client";

import type { Content } from "@tiptap/core";
import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { announcementTiptapExtensions } from "@/features/announcements/lib/tiptap-extensions";

interface AnnouncementDetailProps {
  bodyJson: unknown;
}

export function AnnouncementDetail({ bodyJson }: AnnouncementDetailProps) {
  const lastSerializedRef = useRef(JSON.stringify(bodyJson));
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: announcementTiptapExtensions,
    content: bodyJson as Content,
    editorProps: {
      attributes: {
        class:
          "ProseMirror focus:outline-none text-sm leading-7 text-slate-800",
      },
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const serialized = JSON.stringify(bodyJson);
    if (serialized === lastSerializedRef.current) {
      return;
    }

    lastSerializedRef.current = serialized;
    editor.commands.setContent(JSON.parse(serialized) as Content);
  }, [bodyJson, editor]);

  return (
    <EditorContent
      editor={editor}
      className="[&_.ProseMirror_img]:my-4 [&_.ProseMirror_img]:max-h-[420px] [&_.ProseMirror_img]:w-full [&_.ProseMirror_img]:rounded-xl [&_.ProseMirror_img]:border [&_.ProseMirror_img]:border-slate-200 [&_.ProseMirror_img]:object-contain [&_.ProseMirror_a]:text-sky-600 [&_.ProseMirror_a]:underline [&_.ProseMirror_a]:underline-offset-2 [&_.ProseMirror_a:hover]:text-sky-700"
    />
  );
}
