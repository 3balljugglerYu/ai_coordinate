-- 失効日を月末に統一
-- 背景: promo_balance 移行分は now()+6ヶ月 で付与日ベースの日付（例: 8/25）となり、
--       新規付与は付与月の月末+6ヶ月（例: 8/31）となるため混在していた。
-- 対応: 残高あり・未失効のバッチについて、失効日をその月の月末 23:59:59 JST に統一する。

UPDATE public.free_percoin_batches
SET
  expire_at = (
    date_trunc('month', expire_at AT TIME ZONE 'Asia/Tokyo')
    + interval '1 month'
    - interval '1 second'
  ) AT TIME ZONE 'Asia/Tokyo',
  updated_at = now()
WHERE remaining_amount > 0
  AND expire_at > now();
