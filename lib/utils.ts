import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type Unit = { suffix: string; value: number };

/**
 * YouTube風（en-US）フォロワー/カウント表示
 * - 最大有効桁3
 * - 四捨五入
 * - .0省略
 * - 1000到達で上位単位へ繰り上げ
 * 
 * @param n フォーマットする数値
 * @returns フォーマットされた文字列（例: "1.53K", "20.7K", "133K", "1.8M"）
 */
export function formatCountEnUS(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n < 0) return `-${formatCountEnUS(-n)}`;

  // 999未満はそのまま（YouTube風）
  if (n < 1000) return Math.floor(n).toString();

  const units: Unit[] = [
    { suffix: "K", value: 1_000 },
    { suffix: "M", value: 1_000_000 },
    { suffix: "B", value: 1_000_000_000 },
  ];

  // 初期単位を決める
  let u = units.length - 1;
  while (u > 0 && n < units[u].value) u--;

  while (true) {
    const base = units[u].value;
    let v = n / base;

    // 有効桁3に合わせて小数桁を決める（丸め前の値で判定）
    let decimals = 0;
    if (v < 10) decimals = 2;
    else if (v < 100) decimals = 1;

    // 丸めによって桁上がりする場合を考慮して、小数桁を再調整する
    // 例: 9.95K -> 10K, 99.5K -> 100K
    if (decimals === 2 && Math.round((v + Number.EPSILON) * 10) / 10 >= 10) {
      decimals = 1;
    }
    if (decimals === 1 && Math.round(v + Number.EPSILON) >= 100) {
      decimals = 0;
    }

    const factor = 10 ** decimals;
    v = Math.round((v + Number.EPSILON) * factor) / factor;

    // 1000到達なら上位単位へ（可能なら）
    if (v >= 1000 && u < units.length - 1) {
      u += 1;
      continue; // 再計算（同一関数内で単位だけ進む）
    }

    // .0 省略
    let s = v.toFixed(decimals);
    if (s.includes('.')) {
      s = s.replace(/0+$/, "").replace(/\.$/, "");
    }

    return s + units[u].suffix;
  }
}

/**
 * プロフィールテキストのサニタイゼーション
 * Unicode正規化、不可視文字除去、trim処理を実行
 * 
 * @param value サニタイズする文字列
 * @returns サニタイズ後の値と変更フラグ
 */
export function sanitizeProfileText(value: string): {
  value: string;
  changed: boolean;
} {
  const original = value;
  
  // 1. Unicode正規化（NFKC）
  let sanitized = value.normalize("NFKC");
  
  // 2. 不可視文字除去
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF\u202E]/g, "");
  
  // 3. trim処理
  sanitized = sanitized.trim();
  
  return {
    value: sanitized,
    changed: original !== sanitized,
  };
}

/**
 * プロフィールテキストのバリデーション
 * 正規表現チェック（< >禁止）と文字数チェックを実行
 * 
 * @param value バリデーションする文字列
 * @param maxLength 最大文字数
 * @param fieldName フィールド名（エラーメッセージ用）
 * @param allowEmpty 空文字を許可するか（デフォルト: true）
 * @returns バリデーション結果
 */
export function validateProfileText(
  value: string,
  maxLength: number,
  fieldName: string,
  allowEmpty: boolean = true
): {
  valid: boolean;
  error?: string;
} {
  // 1. 空文字チェック（allowEmptyがfalseの場合）
  if (!allowEmpty && value.length === 0) {
    return {
      valid: false,
      error: `${fieldName}を入力してください`,
    };
  }
  
  // 2. 正規表現チェック（< >を検出）
  if (/[<>]/.test(value)) {
    return {
      valid: false,
      error: "< と > は使用できません",
    };
  }
  
  // 3. 文字数チェック
  if (value.length > maxLength) {
    return {
      valid: false,
      error: `${fieldName}は${maxLength}文字以内で入力してください`,
    };
  }
  
  return {
    valid: true,
  };
}

/**
 * URLからファイル名を抽出
 * 例: https://...supabase.co/storage/.../1766523926783-c2p76akbrgw.jpeg
 *     -> 1766523926783-c2p76akbrgw.jpeg
 */
export function extractFileNameFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const fileName = pathname.split('/').pop();
    return fileName && fileName.includes('.') ? fileName : null;
  } catch {
    return null;
  }
}

/**
 * ファイル名をサニタイズ（Path Traversal対策）
 * パス関連の文字（../, /, \, :, null文字など）を除去し、ベースファイル名のみを返す
 */
function sanitizeFileName(fileName: string): string {
  // パストラバーサル文字を除去
  let sanitized = fileName
    .replace(/\.\./g, '') // .. を除去
    .replace(/[/\\]/g, '') // / と \ を除去
    .replace(/:/g, '') // : を除去（Windowsパス対策）
    .replace(/\0/g, ''); // null文字を除去
  
  // ベースファイル名のみを取得（最後のスラッシュ以降）
  const parts = sanitized.split(/[/\\]/);
  sanitized = parts[parts.length - 1] || sanitized;
  
  // 空文字の場合はnullを返す
  if (!sanitized.trim()) {
    return '';
  }
  
  return sanitized;
}

/**
 * Content-Dispositionヘッダーからファイル名を抽出
 * 例: attachment; filename="image.jpeg"
 * Path Traversal対策として、ファイル名をサニタイズする
 */
export function extractFileNameFromContentDisposition(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  
  const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  if (filenameMatch && filenameMatch[1]) {
    // クォートを除去
    let fileName = filenameMatch[1].replace(/['"]/g, '');
    
    // Path Traversal対策: ファイル名をサニタイズ
    fileName = sanitizeFileName(fileName);
    
    // サニタイズ後のファイル名が空の場合はnullを返す
    if (!fileName) return null;
    
    return fileName;
  }
  return null;
}

/**
 * MIMEタイプから拡張子を取得
 * image/jpg は非標準だが、image/jpeg として扱う
 */
export function getExtensionFromMimeType(mimeType: string): string {
  // image/jpg を image/jpeg に正規化
  const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
  
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  return mimeToExt[normalizedMime] || 'png';
}

/**
 * ファイル名を決定する共通ロジック
 * 優先順位: Content-Disposition > URL抽出 > MIMEタイプから推測
 */
export function determineFileName(
  response: Response,
  imageUrl: string,
  imageId: string,
  mimeType: string
): string {
  const fileNameFromDisposition = extractFileNameFromContentDisposition(
    response.headers.get('content-disposition')
  );
  const fileNameFromUrl = extractFileNameFromUrl(imageUrl);
  
  if (fileNameFromDisposition) {
    // Content-Dispositionヘッダーが最優先
    return fileNameFromDisposition;
  } else if (fileNameFromUrl) {
    // URLから抽出したファイル名
    return fileNameFromUrl;
  } else {
    // MIMEタイプから拡張子を推測
    const extension = getExtensionFromMimeType(mimeType);
    return `generated-${imageId}.${extension}`;
  }
}

/**
 * クローラーかどうかを判定
 * User-Agentを小文字に正規化し、部分一致で判定
 * 
 * @param userAgent User-Agent文字列
 * @returns クローラーの場合true
 */
export function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  
  const ua = userAgent.toLowerCase();
  
  const crawlerPatterns = [
    'bot',
    'crawler',
    'spider',
    'facebookexternalhit',
    'twitterbot',
    'googlebot',
    'bingbot',
    'slackbot',
    'linkedinbot',
    'whatsapp',
    'telegrambot',
    'linebot',
    'applebot',
    'baiduspider',
    'yandexbot',
    'duckduckbot',
  ];
  
  return crawlerPatterns.some(pattern => ua.includes(pattern));
}

/**
 * Next.jsのプリフェッチリクエストかどうかを判定
 * 複数シグナルで判定し、安全側（誤判定してもskip）に倒す
 * 
 * @param headers リクエストヘッダー
 * @returns プリフェッチリクエストの場合true
 */
export function isPrefetchRequest(headers: Headers): boolean {
  // 主要なシグナル（確実性が高い順）
  const nextRouterPrefetch = headers.get('next-router-prefetch');
  const purpose = headers.get('purpose')?.toLowerCase();
  const secPurpose = headers.get('sec-purpose')?.toLowerCase();
  const xMiddlewarePrefetch = headers.get('x-middleware-prefetch');
  
  // 主要シグナルのいずれかが該当すれば true
  if (
    nextRouterPrefetch === '1' ||
    purpose === 'prefetch' ||
    secPurpose === 'prefetch' ||
    xMiddlewarePrefetch === '1'
  ) {
    return true;
  }
  
  // 補助的シグナル（誤判定リスクがあるため慎重に）
  const nextUrl = headers.get('next-url');
  const secFetchDest = headers.get('sec-fetch-dest');
  const secFetchMode = headers.get('sec-fetch-mode');
  
  if (nextUrl && secFetchDest && secFetchDest !== 'document' && secFetchMode !== 'navigate') {
    return true;
  }
  
  return false;
}

