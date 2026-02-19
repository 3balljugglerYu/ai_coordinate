"use client";

import { useState, useEffect } from "react";
import { Image as ImageIcon, ExternalLink } from "lucide-react";
import { SourceImageDisplaySkeleton } from "./SourceImageDisplaySkeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getSourceImageStock,
  type SourceImageStock,
} from "../lib/database";
import Image from "next/image";

interface SourceImageDisplayProps {
  stockId: string | null;
  storagePath?: string | null;
  className?: string;
}

export function SourceImageDisplay({
  stockId,
  storagePath,
  className,
}: SourceImageDisplayProps) {
  const [stock, setStock] = useState<SourceImageStock | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stockId) {
      setStock(null);
      return;
    }

    const loadStock = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getSourceImageStock(stockId);
        setStock(data);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "元画像の取得に失敗しました";
        setError(errorMessage);
        console.error("Failed to load source image:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadStock();
  }, [stockId]);

  if (!stockId) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={className}>
        <SourceImageDisplaySkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-lg border border-red-200 bg-red-50 p-4 ${className}`}>
        <p className="text-sm text-red-900">{error}</p>
      </div>
    );
  }

  if (!stock) {
    return (
      <div className={`flex flex-col items-center justify-center py-8 text-gray-500 ${className}`}>
        <ImageIcon className="mb-2 h-8 w-8 text-gray-300" />
        <p className="text-sm">元画像が見つかりません</p>
      </div>
    );
  }

  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="p-3 bg-gray-50 border-b">
        <h3 className="text-sm font-medium text-gray-700">元画像</h3>
      </div>
      <div className="relative aspect-video">
        <Image
          src={stock.image_url}
          alt={stock.name || "元画像"}
          fill
          className="object-contain"
          sizes="(max-width: 768px) 100vw, 50vw"
        />
      </div>
      {stock.name && (
        <div className="p-3 bg-gray-50">
          <p className="text-sm text-gray-700">{stock.name}</p>
          {stock.usage_count > 0 && (
            <p className="mt-1 text-xs text-gray-500">
              使用回数: {stock.usage_count}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

