"use client";

import { useState, useEffect, useMemo } from "react";
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
import { sanitizeProfileText, validateProfileText } from "@/lib/utils";
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
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [bioError, setBioError] = useState<string | null>(null);

  // プロフィールが変更されたらフォームを更新
  useEffect(() => {
    setNickname(profile.nickname || "");
    setBio(profile.bio || "");
    setError(null);
    setNicknameError(null);
    setBioError(null);
  }, [profile, open]);

  // サニタイズ後の値とバリデーション結果を計算
  const nicknameSanitized = useMemo(() => {
    return sanitizeProfileText(nickname);
  }, [nickname]);

  const bioSanitized = useMemo(() => {
    return sanitizeProfileText(bio);
  }, [bio]);

  const nicknameValidation = useMemo(() => {
    return validateProfileText(
      nicknameSanitized.value,
      MAX_NICKNAME_LENGTH,
      "ニックネーム"
    );
  }, [nicknameSanitized.value]);

  const bioValidation = useMemo(() => {
    return validateProfileText(
      bioSanitized.value,
      MAX_BIO_LENGTH,
      "自己紹介"
    );
  }, [bioSanitized.value]);

  // エラーメッセージを更新
  useEffect(() => {
    setNicknameError(nicknameValidation.valid ? null : nicknameValidation.error || null);
  }, [nicknameValidation]);

  useEffect(() => {
    setBioError(bioValidation.valid ? null : bioValidation.error || null);
  }, [bioValidation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // バリデーション確認
      if (!nicknameValidation.valid || !bioValidation.valid) {
        setError(nicknameValidation.error || bioValidation.error || "入力内容を確認してください");
        setIsSubmitting(false);
        return;
      }

      // サニタイズ後の値をAPIに送信
      const response = await fetch(`/api/users/${profile.id}/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nickname: nicknameSanitized.value || null,
          bio: bioSanitized.value || null,
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

  // サニタイズ後の値で文字数とバリデーション状態を計算
  const nicknameLength = nicknameSanitized.value.length;
  const bioLength = bioSanitized.value.length;
  const isNicknameValid = nicknameValidation.valid;
  const isBioValid = bioValidation.valid;
  const hasChanges =
    nicknameSanitized.value !== (profile.nickname || "") ||
    bioSanitized.value !== (profile.bio || "");

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
              {nicknameError && (
                <p className="text-sm text-red-600">
                  {nicknameError}
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
              {bioError && (
                <p className="text-sm text-red-600">
                  {bioError}
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

