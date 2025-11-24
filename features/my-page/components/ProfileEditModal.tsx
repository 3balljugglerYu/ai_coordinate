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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { UserProfile } from "../lib/server-api";

const MAX_NICKNAME_LENGTH = 20;
const MAX_BIO_LENGTH = 200;

interface ProfileEditModalProps {
  profile: UserProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (updatedProfile: UserProfile) => void;
}

export function ProfileEditModal({
  profile,
  open,
  onOpenChange,
  onUpdate,
}: ProfileEditModalProps) {
  const [nickname, setNickname] = useState(profile.nickname || "");
  const [bio, setBio] = useState(profile.bio || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // プロフィールが変更されたらフォームを更新
  useEffect(() => {
    setNickname(profile.nickname || "");
    setBio(profile.bio || "");
    setError(null);
  }, [profile, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/users/${profile.id}/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nickname: nickname.trim() || null,
          // bioは改行を保持するため、先頭と末尾の空白のみ削除
          bio: bio.replace(/^\s+|\s+$/g, "") || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "プロフィールの更新に失敗しました");
      }

      const updatedProfile = await response.json();
      onUpdate(updatedProfile);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "プロフィールの更新に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const nicknameLength = nickname.length;
  const bioLength = bio.length;
  const isNicknameValid = nicknameLength <= MAX_NICKNAME_LENGTH;
  const isBioValid = bioLength <= MAX_BIO_LENGTH;
  const hasChanges =
    nickname.trim() !== (profile.nickname || "") ||
    bio.replace(/^\s+|\s+$/g, "") !== (profile.bio || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>プロフィールを編集</DialogTitle>
          <DialogDescription>
            ニックネームと自己紹介を編集できます。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* ニックネーム */}
            <div className="space-y-2">
              <Label htmlFor="nickname">
                ニックネーム
                <span className="text-gray-500 ml-1">
                  ({nicknameLength}/{MAX_NICKNAME_LENGTH})
                </span>
              </Label>
              <Input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={MAX_NICKNAME_LENGTH}
                placeholder="ニックネームを入力"
                aria-invalid={!isNicknameValid}
              />
              {!isNicknameValid && (
                <p className="text-sm text-red-600">
                  {MAX_NICKNAME_LENGTH}文字以内で入力してください
                </p>
              )}
            </div>

            {/* 自己紹介 */}
            <div className="space-y-2">
              <Label htmlFor="bio">
                自己紹介
                <span className="text-gray-500 ml-1">
                  ({bioLength}/{MAX_BIO_LENGTH})
                </span>
              </Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={MAX_BIO_LENGTH}
                placeholder="自己紹介を入力"
                rows={4}
                aria-invalid={!isBioValid}
              />
              {!isBioValid && (
                <p className="text-sm text-red-600">
                  {MAX_BIO_LENGTH}文字以内で入力してください
                </p>
              )}
            </div>

            {/* エラーメッセージ */}
            {error && (
              <div className="rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                !hasChanges ||
                !isNicknameValid ||
                !isBioValid
              }
            >
              {isSubmitting ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

