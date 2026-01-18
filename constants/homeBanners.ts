/**
 * ホーム画面バナーの定義
 * イベントやキャンペーンのバナーカードを管理
 */

export interface HomeBanner {
  id: string;
  imageUrl: string; // public/ からの相対パス（例: "/banners/event-01.png"）
  linkUrl: string; // 遷移先URL（例: "/event/detail/01"）
  alt: string; // 画像のaltテキスト
}

/**
 * ホーム画面に表示するバナー一覧
 * 配列の順序が表示順序になります
 */
export const homeBanners: HomeBanner[] = [
  {
    id: "event-01",
    imageUrl: "/banners/event-01.png",
    linkUrl: "/event/detail/01",
    alt: "着せ替えお試し用素材 イベントバナー",
  },
];
