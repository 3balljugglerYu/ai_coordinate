import type { Locale } from "@/i18n/config";

/**
 * /api/user-styles 系のエラー文言。
 *
 * ここにあるのは**不正なリクエストに対する 400 と 500 だけ**。通常の操作では
 * 到達しない（クライアントは常に正しい形で送る）。段階公開の 404 は本文を持たない
 * ── 公開前の機能の存在を、失敗の仕方から推測させないため。
 */
export const userStylesRouteCopy = {
  ja: {
    invalidLimit: "limit は 1 以上 40 以下で指定してください",
    invalidCursor: "cursor は postedAt と id を両方指定してください",
    invalidAuthor: "author の指定が正しくありません",
    invalidEvent: "イベント種別が正しくありません",
    internalError: "処理に失敗しました",
  },
  en: {
    invalidLimit: "limit must be between 1 and 40.",
    invalidCursor: "cursor requires both postedAt and id.",
    invalidAuthor: "The author parameter is invalid.",
    invalidEvent: "The event type is invalid.",
    internalError: "The request could not be processed.",
  },
  ko: {
    invalidLimit: "limit은 1 이상 40 이하로 지정해 주세요.",
    invalidCursor: "cursor는 postedAt과 id를 모두 지정해 주세요.",
    invalidAuthor: "author 지정이 올바르지 않습니다.",
    invalidEvent: "이벤트 종류가 올바르지 않습니다.",
    internalError: "처리에 실패했습니다.",
  },
  "zh-CN": {
    invalidLimit: "limit 请指定为 1 到 40 之间。",
    invalidCursor: "cursor 需要同时指定 postedAt 和 id。",
    invalidAuthor: "author 参数不正确。",
    invalidEvent: "事件类型不正确。",
    internalError: "处理失败。",
  },
  "zh-TW": {
    invalidLimit: "limit 請指定為 1 到 40 之間。",
    invalidCursor: "cursor 需要同時指定 postedAt 與 id。",
    invalidAuthor: "author 參數不正確。",
    invalidEvent: "事件類型不正確。",
    internalError: "處理失敗。",
  },
  es: {
    invalidLimit: "limit debe estar entre 1 y 40.",
    invalidCursor: "cursor requiere tanto postedAt como id.",
    invalidAuthor: "El parámetro author no es válido.",
    invalidEvent: "El tipo de evento no es válido.",
    internalError: "No se pudo procesar la solicitud.",
  },
  pt: {
    invalidLimit: "limit deve estar entre 1 e 40.",
    invalidCursor: "cursor exige postedAt e id.",
    invalidAuthor: "O parâmetro author é inválido.",
    invalidEvent: "O tipo de evento é inválido.",
    internalError: "Não foi possível processar a solicitação.",
  },
  fr: {
    invalidLimit: "limit doit être compris entre 1 et 40.",
    invalidCursor: "cursor nécessite à la fois postedAt et id.",
    invalidAuthor: "Le paramètre author est invalide.",
    invalidEvent: "Le type d'événement est invalide.",
    internalError: "La requête n'a pas pu être traitée.",
  },
  de: {
    invalidLimit: "limit muss zwischen 1 und 40 liegen.",
    invalidCursor: "cursor benötigt sowohl postedAt als auch id.",
    invalidAuthor: "Der Parameter author ist ungültig.",
    invalidEvent: "Der Ereignistyp ist ungültig.",
    internalError: "Die Anfrage konnte nicht verarbeitet werden.",
  },
  it: {
    invalidLimit: "limit deve essere compreso tra 1 e 40.",
    invalidCursor: "cursor richiede sia postedAt sia id.",
    invalidAuthor: "Il parametro author non è valido.",
    invalidEvent: "Il tipo di evento non è valido.",
    internalError: "Impossibile elaborare la richiesta.",
  },
  id: {
    invalidLimit: "limit harus antara 1 dan 40.",
    invalidCursor: "cursor memerlukan postedAt dan id.",
    invalidAuthor: "Parameter author tidak valid.",
    invalidEvent: "Jenis event tidak valid.",
    internalError: "Permintaan tidak dapat diproses.",
  },
  th: {
    invalidLimit: "limit ต้องอยู่ระหว่าง 1 ถึง 40",
    invalidCursor: "cursor ต้องระบุทั้ง postedAt และ id",
    invalidAuthor: "พารามิเตอร์ author ไม่ถูกต้อง",
    invalidEvent: "ประเภทอีเวนต์ไม่ถูกต้อง",
    internalError: "ไม่สามารถดำเนินการได้",
  },
  vi: {
    invalidLimit: "limit phải từ 1 đến 40.",
    invalidCursor: "cursor cần cả postedAt và id.",
    invalidAuthor: "Tham số author không hợp lệ.",
    invalidEvent: "Loại sự kiện không hợp lệ.",
    internalError: "Không thể xử lý yêu cầu.",
  },
  hi: {
    invalidLimit: "limit 1 से 40 के बीच होना चाहिए।",
    invalidCursor: "cursor के लिए postedAt और id दोनों आवश्यक हैं।",
    invalidAuthor: "author पैरामीटर अमान्य है।",
    invalidEvent: "इवेंट प्रकार अमान्य है।",
    internalError: "अनुरोध संसाधित नहीं किया जा सका।",
  },
  ar: {
    invalidLimit: "يجب أن تكون قيمة limit بين 1 و40.",
    invalidCursor: "يتطلب cursor كلاً من postedAt وid.",
    invalidAuthor: "معامل author غير صالح.",
    invalidEvent: "نوع الحدث غير صالح.",
    internalError: "تعذّرت معالجة الطلب.",
  },
} as const satisfies Record<
  Locale,
  {
    invalidLimit: string;
    invalidCursor: string;
    invalidAuthor: string;
    invalidEvent: string;
    internalError: string;
  }
>;
