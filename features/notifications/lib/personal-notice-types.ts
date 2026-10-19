/** 個人あてのお知らせの詳細ページに渡す値(サーバーで作って画面に渡す) */
export interface PersonalNoticeDetailView {
  id: string;
  title: string;
  body: string;
  receivedAtLabel: string;
  post: { id: string; imageUrl: string } | null;
  /** 前に開いたことがあるか(あるなら開いた記録は送らない) */
  alreadyOpened: boolean;
}
