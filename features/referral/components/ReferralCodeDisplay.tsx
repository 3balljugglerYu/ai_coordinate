"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check } from "lucide-react";
import { ReferralCodeSkeleton } from "./ReferralCodeSkeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { generateReferralCode } from "../lib/api";
import { getSiteUrlForClient } from "@/lib/public-env";
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
  const t = useTranslations("referral");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // 紹介コードを取得または生成
  useEffect(() => {
    const fetchReferralCode = async () => {
      try {
        setIsLoading(true);
        const data = await generateReferralCode({
          generateCodeFailed: t("loadFailed"),
        });
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

    void fetchReferralCode();
  }, [t]);

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
        title: t("copySuccessTitle"),
        description: t("copySuccessDescription"),
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: t("copyFailedTitle"),
        description: t("copyFailedDescription"),
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
          {t("loadFailed")}
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
            {t("linkLabel")}
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
              aria-label={t("copyLinkAria")}
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
            <h3 className="text-lg font-semibold mb-2">{t("qrTitle")}</h3>
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
                {t("qrDescription")}
              </p>
            </div>
          </div>
        )}

        {/* 説明 */}
        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            {t("rewardDescription", { amount: referralBonusAmount })}
          </p>
        </div>
      </div>
    </Card>
  );
}
