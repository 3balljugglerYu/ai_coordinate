"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { INSPIRE_ALLOWED_MODELS } from "@/features/generation/lib/model-config";
import { AsyncGenerationStatus } from "@/features/generation/components/AsyncGenerationStatus";
import { InspireForm } from "./InspireForm";

interface InspireTemplate {
  id: string;
  alt: string | null;
  image_url: string | null;
  submitted_by_user_id: string;
}

interface InspirePageClientCopy {
  formTitle: string;
  formDescription: string;
  formImageLabel: string;
  formCountLabel: string;
  formModelLabel: string;
  formGenerateButton: string;
  formGenerating: string;
  formImageRequired: string;
  formGenerationFailed: string;
  submittedByLabel: string;
}

interface InspirePageClientProps {
  template: InspireTemplate;
  copy: InspirePageClientCopy;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.replace(/^data:[^;]+;base64,/, ""));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function InspirePageClient({ template, copy }: InspirePageClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleGenerate = async (
    file: File,
    model: string,
    count: number
  ): Promise<void> => {
    setSubmitting(true);
    try {
      const base64 = await fileToBase64(file);
      const response = await fetch("/api/generate-async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "inspire",
          sourceImageBase64: base64,
          sourceImageMimeType: file.type,
          generationType: "inspire",
          model,
          count,
          styleTemplateId: template.id,
          // overrideTarget は MVP では keep_all 固定 (Phase 6 で個別オーバーライド有効化、ADR-013)
        }),
      });
      if (!response.ok) {
        toast({
          title: copy.formGenerationFailed,
          variant: "destructive",
        });
        return;
      }
      const data = (await response.json()) as { jobId: string };
      setActiveJobId(data.jobId);
    } catch (err) {
      console.error("[inspire] generate failed", err);
      toast({
        title: copy.formGenerationFailed,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="aspect-square overflow-hidden rounded-md border bg-muted">
            {template.image_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={template.image_url}
                alt={template.alt ?? ""}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          {template.alt && (
            <p className="text-xs text-muted-foreground">{template.alt}</p>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold">{copy.formTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {copy.formDescription}
          </p>
          <InspireForm
            allowedModels={[...INSPIRE_ALLOWED_MODELS]}
            submitting={submitting}
            onGenerate={handleGenerate}
            copy={{
              formImageLabel: copy.formImageLabel,
              formCountLabel: copy.formCountLabel,
              formModelLabel: copy.formModelLabel,
              formGenerateButton: copy.formGenerateButton,
              formGenerating: copy.formGenerating,
              formImageRequired: copy.formImageRequired,
            }}
          />
        </div>
      </div>

      {activeJobId && (
        <div className="mt-6">
          <AsyncGenerationStatus
            jobId={activeJobId}
            onComplete={() => {
              router.refresh();
            }}
          />
        </div>
      )}
    </div>
  );
}
