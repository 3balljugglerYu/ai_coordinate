"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageFullscreenProps {
  imageUrl: string;
  alt: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 画像の全画面表示コンポーネント
 * ピンチズームとダブルタップズームに対応
 */
export function ImageFullscreen({
  imageUrl,
  alt,
  isOpen,
  onClose,
}: ImageFullscreenProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(
    null
  );
  const [lastDoubleTapTime, setLastDoubleTapTime] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      // 閉じる時にリセット
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      // シングルタッチ：ドラッグ開始
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });

      // ダブルタップ検知
      const now = Date.now();
      if (now - lastDoubleTapTime < 300) {
        // ダブルタップ：ズームイン/アウト
        if (scale === 1) {
          setScale(2);
        } else {
          setScale(1);
          setPosition({ x: 0, y: 0 });
        }
      }
      setLastDoubleTapTime(now);
    } else if (e.touches.length === 2) {
      // ピンチズーム開始
      setIsDragging(false);
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
      );
      setLastTouchDistance(distance);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      // シングルタッチ：ドラッグ
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      });
    } else if (e.touches.length === 2 && lastTouchDistance !== null) {
      // ピンチズーム
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
      );
      const scaleChange = distance / lastTouchDistance;
      const newScale = Math.max(1, Math.min(scale * scaleChange, 5));
      setScale(newScale);
      setLastTouchDistance(distance);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setLastTouchDistance(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      // 左クリック：ドラッグ開始
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    // マウスホイールでズーム
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(1, Math.min(scale * delta, 5));
    setScale(newScale);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black p-4"
      onClick={(e) => {
        // 背景クリックで閉じる
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* 閉じるボタン */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4 z-10 rounded-full bg-black/50 text-white hover:bg-black/70"
        onClick={onClose}
      >
        <X className="h-5 w-5" />
      </Button>

      {/* 画像 */}
      <div
        className="relative max-h-full max-w-full"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transition: isDragging || lastTouchDistance !== null ? "none" : "transform 0.2s",
        }}
      >
        <Image
          src={imageUrl}
          alt={alt}
          width={1200}
          height={1200}
          className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] object-contain"
          style={{ userSelect: "none" }}
          draggable={false}
          sizes="100vw"
        />
      </div>
    </div>
  );
}

