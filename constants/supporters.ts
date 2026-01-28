export type SupporterTier = 'platinum' | 'gold' | 'silver' | 'core-supporter' | 'supporter' | 'friend-supporter';

export interface Supporter {
  id: string;
  name: string;
  tier: SupporterTier;
  amount: number; // 金額（ソート用）
  message?: string; // Platinum用コメント
  perstaProfile?: {
    username: string; // @username
    avatarUrl?: string; // アイコン
  };
  date: string; // 支援日（ソート用）
  isFounding?: boolean; // Foundingメンバーかどうか
}

// モックデータ
// 本番運用時はここに追加・更新していく、もしくはDBから取得する形になる
export const SUPPORTERS: Supporter[] = [
  // Platinum (500,000円)
  {
    id: 'p-1',
    name: 'Taro Yamada',
    tier: 'platinum',
    amount: 500000,
    message: 'Persta.AIの未来を信じています！素晴らしいプロダクトを期待しています。',
    perstaProfile: {
      username: 'taro_y',
      avatarUrl: '/icons/user-01.png', // 仮のパス
    },
    date: '2025-01-01',
    isFounding: true,
  },
  // Gold (100,000円)
  {
    id: 'g-1',
    name: 'Hanako Suzuki',
    tier: 'gold',
    amount: 100000,
    message: 'Persta.AIの発展を心から応援しています。',
    perstaProfile: {
      username: 'hanako_s',
    },
    date: '2025-01-02',
    isFounding: true,
  },
  {
    id: 'g-2',
    name: 'Ichiro Tanaka',
    tier: 'gold',
    amount: 100000,
    message: 'クリエイティブな世界が広がることを楽しみにしています！',
    date: '2025-01-03',
    isFounding: true,
  },
  {
    id: 'g-3',
    name: 'Jiro Sato',
    tier: 'gold',
    amount: 100000,
    message: 'Persta.AIの挑戦を心から応援しています！',
    perstaProfile: {
      username: 'jiro_persta',
    },
    date: '2025-01-04',
    isFounding: true,
  },
  {
    id: 'g-4',
    name: 'Saburo Takahashi',
    tier: 'gold',
    amount: 100000,
    message: 'これからの進化と成長を楽しみにしています！',
    date: '2025-01-05',
    isFounding: true,
  },
  {
    id: 'g-5',
    name: 'Shiro Ito',
    tier: 'gold',
    amount: 100000,
    message: '素晴らしいサービスの未来を応援します！',
    date: '2025-01-06',
    isFounding: true,
  },
  // Silver (50,000円)
  {
    id: 's-1',
    name: 'Kenji Watanabe',
    tier: 'silver',
    amount: 50000,
    perstaProfile: {
      username: 'kenji_w',
    },
    date: '2025-01-07',
  },
  {
    id: 's-2',
    name: 'Yumi Kobayashi',
    tier: 'silver',
    amount: 50000,
    date: '2025-01-08',
  },
  {
    id: 's-3',
    name: 'Ryo Kato',
    tier: 'silver',
    amount: 50000,
    date: '2025-01-09',
  },
  { id: 's-4', name: 'Silver User 4', tier: 'silver', amount: 50000, date: '2025-01-09' },
  { id: 's-5', name: 'Silver User 5', tier: 'silver', amount: 50000, date: '2025-01-09' },
  { id: 's-6', name: 'Silver User 6', tier: 'silver', amount: 50000, date: '2025-01-09' },
  { id: 's-7', name: 'Silver User 7', tier: 'silver', amount: 50000, date: '2025-01-09' },
  { id: 's-8', name: 'Silver User 8', tier: 'silver', amount: 50000, date: '2025-01-09' },
  { id: 's-9', name: 'Silver User 9', tier: 'silver', amount: 50000, date: '2025-01-09' },
  { id: 's-10', name: 'Silver User 10', tier: 'silver', amount: 50000, date: '2025-01-09' },

  // Core Supporter (10,000円)
  { id: 'cs-1', name: 'Core Supporter 1', tier: 'core-supporter', amount: 10000, date: '2025-01-10' },
  { id: 'cs-2', name: 'Core Supporter 2', tier: 'core-supporter', amount: 10000, date: '2025-01-14' },
  { id: 'cs-3', name: 'Core Supporter 3', tier: 'core-supporter', amount: 10000, date: '2025-01-14' },
  { id: 'cs-4', name: 'Core Supporter 4', tier: 'core-supporter', amount: 10000, date: '2025-01-14' },
  { id: 'cs-5', name: 'Core Supporter 5', tier: 'core-supporter', amount: 10000, date: '2025-01-14' },
  { id: 'cs-6', name: 'Core Supporter 6', tier: 'core-supporter', amount: 10000, date: '2025-01-14' },
  { id: 'cs-7', name: 'Core Supporter 7', tier: 'core-supporter', amount: 10000, date: '2025-01-14' },
  { id: 'cs-8', name: 'Core Supporter 8', tier: 'core-supporter', amount: 10000, date: '2025-01-14' },
  { id: 'cs-9', name: 'Core Supporter 9', tier: 'core-supporter', amount: 10000, date: '2025-01-14' },
  { id: 'cs-10', name: 'Core Supporter 10', tier: 'core-supporter', amount: 10000, date: '2025-01-14' },
  { id: 'cs-11', name: 'Core Supporter 11', tier: 'core-supporter', amount: 10000, date: '2025-01-14' },
  { id: 'cs-12', name: 'Core Supporter 12', tier: 'core-supporter', amount: 10000, date: '2025-01-14' },
  { id: 'cs-13', name: 'Core Supporter 13', tier: 'core-supporter', amount: 10000, date: '2025-01-14' },
  { id: 'cs-14', name: 'Core Supporter 14', tier: 'core-supporter', amount: 10000, date: '2025-01-14' },
  { id: 'cs-15', name: 'Core Supporter 15', tier: 'core-supporter', amount: 10000, date: '2025-01-14' },

  // Supporter (5,000円)
  { id: 'sup-1', name: 'Supporter 1', tier: 'supporter', amount: 5000, date: '2025-01-11' },
  { id: 'sup-2', name: 'Supporter 2', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-3', name: 'Supporter 3', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-4', name: 'Supporter 4', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-5', name: 'Supporter 5', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-6', name: 'Supporter 6', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-7', name: 'Supporter 7', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-8', name: 'Supporter 8', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-9', name: 'Supporter 9', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-10', name: 'Supporter 10', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-11', name: 'Supporter 11', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-12', name: 'Supporter 12', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-13', name: 'Supporter 13', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-14', name: 'Supporter 14', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-15', name: 'Supporter 15', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-16', name: 'Supporter 16', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-17', name: 'Supporter 17', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-18', name: 'Supporter 18', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-19', name: 'Supporter 19', tier: 'supporter', amount: 5000, date: '2025-01-15' },
  { id: 'sup-20', name: 'Supporter 20', tier: 'supporter', amount: 5000, date: '2025-01-15' },

  // Friend Supporter (1,000円)
  { id: 'fs-1', name: 'User C', tier: 'friend-supporter', amount: 1000, date: '2025-01-12' },
  { id: 'fs-2', name: 'User D', tier: 'friend-supporter', amount: 1000, date: '2025-01-13' },
  { id: 'fs-3', name: 'User G', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-4', name: 'Friend 4', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-5', name: 'Friend 5', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-6', name: 'Friend 6', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-7', name: 'Friend 7', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-8', name: 'Friend 8', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-9', name: 'Friend 9', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-10', name: 'Friend 10', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-11', name: 'Friend 11', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-12', name: 'Friend 12', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-13', name: 'Friend 13', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-14', name: 'Friend 14', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-15', name: 'Friend 15', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-16', name: 'Friend 16', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-17', name: 'Friend 17', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-18', name: 'Friend 18', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-19', name: 'Friend 19', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-20', name: 'Friend 20', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-21', name: 'Friend 21', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-22', name: 'Friend 22', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-23', name: 'Friend 23', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-24', name: 'Friend 24', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-25', name: 'Friend 25', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-26', name: 'Friend 26', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-27', name: 'Friend 27', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-28', name: 'Friend 28', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-29', name: 'Friend 29', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
  { id: 'fs-30', name: 'Friend 30', tier: 'friend-supporter', amount: 1000, date: '2025-01-16' },
];
