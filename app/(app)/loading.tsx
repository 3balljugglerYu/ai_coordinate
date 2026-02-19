import { AppPageSkeleton } from "@/components/AppPageSkeleton";

/**
 * (app) ルート群用ローディング
 * マイページ、コーディネート、ミッション、お知らせ、ユーザープロフィール等
 * 各画面のレイアウトに合わせた汎用スケルトンを表示
 */
export default function AppLoading() {
  return <AppPageSkeleton />;
}
