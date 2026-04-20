"use client";

import { Users } from "lucide-react";
import { ChallengeCard } from "./ChallengeCard";
import { ReferralCodeDisplay } from "@/features/referral/components/ReferralCodeDisplay";

interface ChallengeReferralCardProps {
  title: string;
  description: string;
  referralBonusAmount: number;
}

export function ChallengeReferralCard({
  title,
  description,
  referralBonusAmount,
}: ChallengeReferralCardProps) {
  return (
    <ChallengeCard
      title={title}
      description={description}
      percoinAmount={referralBonusAmount}
      icon={Users}
      color="orange"
      className="h-full"
    >
      <ReferralCodeDisplay referralBonusAmount={referralBonusAmount} />
    </ChallengeCard>
  );
}
