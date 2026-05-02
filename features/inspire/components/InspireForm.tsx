"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface InspireFormCopy {
  formImageLabel: string;
  formCountLabel: string;
  formModelLabel: string;
  formGenerateButton: string;
  formGenerating: string;
  formImageRequired: string;
}

interface InspireFormProps {
  allowedModels: string[];
  submitting: boolean;
  onGenerate: (file: File, model: string, count: number) => Promise<void>;
  copy: InspireFormCopy;
}

const ACCEPTED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
];

const MAX_BYTES = 10 * 1024 * 1024;

export function InspireForm({
  allowedModels,
  submitting,
  onGenerate,
  copy,
}: InspireFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [model, setModel] = useState<string>(allowedModels[0] ?? "gpt-image-2-low");
  const [count, setCount] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const next = e.target.files?.[0] ?? null;
    if (!next) {
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    if (!ACCEPTED_MIME.includes(next.type.toLowerCase())) {
      setError("形式: PNG / JPEG / WebP / HEIC");
      return;
    }
    if (next.size > MAX_BYTES) {
      setError("10MB 以下にしてください");
      return;
    }
    setFile(next);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(next));
  };

  const handleSubmit = async () => {
    if (!file) {
      setError(copy.formImageRequired);
      return;
    }
    await onGenerate(file, model, count);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="inspire-character-file">{copy.formImageLabel}</Label>
        <Input
          id="inspire-character-file"
          type="file"
          accept={ACCEPTED_MIME.join(",")}
          onChange={handleFileChange}
          disabled={submitting}
        />
        {previewUrl && (
          <div className="mt-2 overflow-hidden rounded-md border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="character preview"
              className="max-h-48 w-full object-contain"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="inspire-model">{copy.formModelLabel}</Label>
          <Select
            value={model}
            onValueChange={(v) => setModel(v)}
            disabled={submitting}
          >
            <SelectTrigger id="inspire-model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowedModels.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="inspire-count">{copy.formCountLabel}</Label>
          <Select
            value={String(count)}
            onValueChange={(v) => setCount(Number(v))}
            disabled={submitting}
          >
            <SelectTrigger id="inspire-count">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        onClick={handleSubmit}
        disabled={!file || submitting}
        className="w-full"
      >
        {submitting ? copy.formGenerating : copy.formGenerateButton}
      </Button>
    </div>
  );
}
