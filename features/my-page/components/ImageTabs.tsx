"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ImageFilter = "all" | "posted" | "unposted";

interface ImageTabsProps {
  value: ImageFilter;
  onChange: (value: ImageFilter) => void;
}

export function ImageTabs({ value, onChange }: ImageTabsProps) {
  const t = useTranslations("myPage");
  const tabs: { value: ImageFilter; label: string }[] = [
    { value: "all", label: t("imageTabAll") },
    { value: "posted", label: t("imageTabPosted") },
    { value: "unposted", label: t("imageTabUnposted") },
  ];

  return (
    <div className="mb-4 flex space-x-2 rounded-md bg-gray-100 p-1">
      {tabs.map((tab) => (
        <Button
          key={tab.value}
          variant="ghost"
          size="sm"
          className={cn(
            "flex-1",
            value === tab.value && "bg-white shadow-sm text-primary"
          )}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
}
