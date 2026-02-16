"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TutorialStartModalProps {
  open: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}

export function TutorialStartModal({
  open,
  onConfirm,
  onDecline,
}: TutorialStartModalProps) {
  const [showDeclinedMessage, setShowDeclinedMessage] = useState(false);

  useEffect(() => {
    if (!open) setShowDeclinedMessage(false);
  }, [open]);

  const handleDeclineClick = () => {
    setShowDeclinedMessage(true);
  };

  const handleCloseDeclined = () => {
    setShowDeclinedMessage(false);
    onDecline();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          if (showDeclinedMessage) handleCloseDeclined();
          else onDecline();
        }
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        {showDeclinedMessage ? (
          <>
            <DialogHeader>
              <DialogTitle>
                「ミッション」から
                <br />
                いつでも始められます！
              </DialogTitle>
              <DialogDescription>
                お時間のある時に、ぜひチャレンジしてみてください。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:justify-end">
              <Button onClick={handleCloseDeclined} className="min-h-[44px]">
                閉じる
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>チュートリアルを開始しますか？</DialogTitle>
              <DialogDescription>
                着せ替え生成までの流れを、ご案内します！
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={handleDeclineClick}
                className="min-h-[44px]"
              >
                いいえ
              </Button>
              <Button onClick={onConfirm} className="min-h-[44px]">
                はい
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
