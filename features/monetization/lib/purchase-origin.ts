import { z } from "zod";

/**
 * 課金の表示元(どの画面・導線から買いに来たか。例: purchase_page, balance_empty_modal, my_page)。
 * 購入の支払い開始(app/api/credits/checkout)と、課金の手前の記録(購入画面を見た)の両方がこれで確かめる。
 * 2つで決まりが違うと、「見た」と「始めた」を表示元で結べなくなるため。
 */
export const purchaseOriginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_-]{1,40}$/);
