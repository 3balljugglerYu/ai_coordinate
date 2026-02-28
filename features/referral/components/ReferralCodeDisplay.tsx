"use client";

import { useState, useEffect } from "react";
import { Copy, Check } from "lucide-react";
import { ReferralCodeSkeleton } from "./ReferralCodeSkeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { generateReferralCode } from "../lib/api";
import { getSiteUrlForClient } from "@/lib/env";
import { QRCodeSVG } from "qrcode.react";
/**
 * 紹介コード表示コンポーネント
 * 紹介コード、紹介リンク、QRコードを表示します
 */
export function ReferralCodeDisplay({
  referralBonusAmount,
}: {
  referralBonusAmount: number;
}) {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // 紹介コードを取得または生成
  useEffect(() => {
    const fetchReferralCode = async () => {
      try {
        setIsLoading(true);
        const data = await generateReferralCode();
        if (data.referral_code) {
          setReferralCode(data.referral_code);
        }
      } catch (error) {
        // エラーは静かに処理（ユーザー体験を損なわない）
        console.error("[ReferralCodeDisplay] Error:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReferralCode();
  }, []);

  // 紹介リンクを生成
  const referralLink = referralCode
    ? `${getSiteUrlForClient()}/signup?ref=${referralCode}`
    : null;

  // 紹介リンクをコピー
  const handleCopyLink = async () => {
    if (!referralLink) return;

    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast({
        title: "コピーしました",
        description: "紹介リンクをクリップボードにコピーしました",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "コピーに失敗しました",
        description: "手動でリンクをコピーしてください",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <ReferralCodeSkeleton />;
  }

  if (!referralCode) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          紹介コードの取得に失敗しました
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* 紹介リンク */}
        <div>
          <label htmlFor="referral-link" className="text-lg font-semibold mb-2 block">
            紹介リンク
          </label>
          <div className="flex items-center gap-2">
            <input
              id="referral-link"
              type="text"
              readOnly
              value={referralLink || ""}
              className="flex-1 px-4 py-2 bg-muted rounded-md text-sm"
            />
            <Button
              onClick={handleCopyLink}
              variant="outline"
              size="icon"
              disabled={!referralLink}
              aria-label="紹介リンクをコピー"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* QRコード */}
        {referralLink && (
          <div>
            <h3 className="text-lg font-semibold mb-2">QRコード</h3>
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-white rounded-lg">
                <QRCodeSVG
                  value={referralLink}
                  size={200}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                QRコードを読み取って新規登録
              </p>
            </div>
          </div>
        )}

        {/* 説明 */}
        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            紹介リンクまたはQRコードから新規登録すると、紹介者に{referralBonusAmount}ペルコインが付与されます。
          </p>
        </div>
      </div>
    </Card>
  );
}

