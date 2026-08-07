-- book(めくれる日記帳/雑誌)表示の表紙・裏表紙の見せ方をカテゴリごとに切り替える。
--
-- 背景: 完走ビューの表紙は「Persta.AI Catalog + タイトル」を画像に重ねる前提だったが、
-- タイトルを焼き込んだ表紙画像(ファッション雑誌企画)ではこの重ね書きが邪魔になる。
-- また末尾は常に固定の革表紙(End of Volume)が入るため、最終ページを裏表紙として
-- デザインした企画では余計な1枚が挟まってしまう。
--
-- 既定値は現行挙動と等価(overlay あり / 固定の革表紙)。既存カテゴリ(travel_to_italy)は
-- 何も変わらない。
ALTER TABLE public.preset_categories
  ADD COLUMN book_cover_overlay BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN book_back_cover_mode TEXT NOT NULL DEFAULT 'default';

ALTER TABLE public.preset_categories
  ADD CONSTRAINT preset_categories_book_back_cover_mode_check
  CHECK (book_back_cover_mode IN ('default', 'last_page'));

COMMENT ON COLUMN public.preset_categories.book_cover_overlay IS
  'book 表示の表紙に「Persta.AI Catalog + タイトル」のオーバーレイ(下部グラデーション/金枠を含む)を重ねるか。false=表紙画像だけを見せる(タイトル焼き込み済みの表紙向け)';

COMMENT ON COLUMN public.preset_categories.book_back_cover_mode IS
  'book 表示の裏表紙: default=固定の革表紙(End of Volume) / last_page=最後の生成画像を裏表紙にする(固定の革表紙は出さない)';
