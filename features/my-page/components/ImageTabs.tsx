"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ImageFilter = "all" | "posted" | "unposted";

interface ImageTabsProps {
  value: ImageFilter;
  onChange: (value: ImageFilter) => void;
}

export function ImageTabs({ value, onChange }: ImageTabsProps) {
  const tabs: { value: ImageFilter; label: string }[] = [
    { value: "all", label: "すべて" },
    { value: "posted", label: "投稿済み" },
    { value: "unposted", label: "未投稿" },
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

