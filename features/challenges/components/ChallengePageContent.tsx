"use client";

import Masonry from "react-masonry-css";
import { 
  Users, 
  Flame, 
  CalendarCheck2 
} from "lucide-react";
import { ChallengeCard } from "./ChallengeCard";
import { ReferralCodeDisplay } from "@/features/referral/components/ReferralCodeDisplay";
import { 
  REFERRAL_BONUS_AMOUNT, 
  DAILY_POST_BONUS_AMOUNT, 
  STREAK_BONUS_SCHEDULE 
} from "@/constants";

const breakpointColumnsObj = {
  default: 3,
  1024: 2,
  640: 1
};

export function ChallengePageContent() {
  const maxStreakBonus = Math.max(...STREAK_BONUS_SCHEDULE);
  const totalStreakBonus = STREAK_BONUS_SCHEDULE.reduce((a, b) => a + b, 0);

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-8 text-center md:text-left">
        <h1 className="text-3xl font-bold mb-2">チャレンジ</h1>
        <p className="text-muted-foreground">
          ミッションを達成してペルコインを獲得しよう
        </p>
      </div>

      <Masonry
        breakpointCols={breakpointColumnsObj}
        className="flex w-auto -ml-6"
        columnClassName="pl-6 bg-clip-padding"
      >
        {/* 1. リファラル特典 */}
        <div className="mb-6">
          <ChallengeCard
            title="友達紹介特典"
            description="友達を招待してペルコインをゲット！紹介リンクまたはQRコードから友達が新規登録すると特典が付与されます。"
            percoinAmount={REFERRAL_BONUS_AMOUNT}
            icon={Users}
            color="orange"
            className="h-full"
          >
            <ReferralCodeDisplay />
          </ChallengeCard>
        </div>

        {/* 2. ストリーク特典 */}
        <div className="mb-6">
          <ChallengeCard
            title="連続ログインボーナス"
            description={`毎日ログインしてボーナスをゲット！2週間継続すると合計${totalStreakBonus}ペルコインが獲得できます。`}
            percoinText={`最大 +${maxStreakBonus}`}
            icon={Flame}
            color="purple"
            className="h-full"
          >
            <div className="mt-2 space-y-2 text-sm text-muted-foreground bg-white/50 p-4 rounded-lg">
              <div className="flex justify-between items-center py-1 border-b border-gray-100">
                <span>1〜2日目</span>
                <span className="font-bold text-purple-600">10 coin</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-100">
                <span>3日目</span>
                <span className="font-bold text-purple-600">20 coin</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-100">
                <span>4〜6日目</span>
                <span className="font-bold text-purple-600">10 coin</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-100">
                <span>7日目</span>
                <span className="font-bold text-purple-600">50 coin</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-100">
                <span>8〜13日目</span>
                <span className="font-bold text-purple-600">10 coin</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span>14日目</span>
                <span className="font-bold text-purple-600">100 coin</span>
              </div>
            </div>
          </ChallengeCard>
        </div>

        {/* 3. デイリー投稿特典 */}
        <div className="mb-6">
          <ChallengeCard
            title="デイリー投稿ボーナス"
            description="1日1回、生成した画像を投稿してペルコインをゲット！毎日の習慣にしてコインを貯めよう。"
            percoinAmount={DAILY_POST_BONUS_AMOUNT}
            icon={CalendarCheck2}
            color="blue"
            className="h-full"
          >
            <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 p-3 rounded-lg">
              <span className="font-bold">Tips:</span>
              <span>日本時間（JST）で毎日0時にリセットされます</span>
            </div>
          </ChallengeCard>
        </div>
      </Masonry>
    </div>
  );
}
