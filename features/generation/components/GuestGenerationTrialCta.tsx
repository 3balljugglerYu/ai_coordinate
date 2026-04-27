import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GuestGenerationTrialCtaProps {
  title: string;
  description: string;
  actionLabel: string;
  testId: string;
}

export function GuestGenerationTrialCta({
  title,
  description,
  actionLabel,
  testId,
}: GuestGenerationTrialCtaProps) {
  return (
    <div
      data-testid={testId}
      className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3 sm:items-center">
        <Sparkles
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 sm:mt-0"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-semibold text-amber-900">{title}</p>
          <p className="mt-1 text-xs text-amber-800">{description}</p>
        </div>
      </div>
      <Button
        asChild
        variant="default"
        size="sm"
        className="self-end sm:self-auto"
      >
        <Link href="/login">{actionLabel}</Link>
      </Button>
    </div>
  );
}
