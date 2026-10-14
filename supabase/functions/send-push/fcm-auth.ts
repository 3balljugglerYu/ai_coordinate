// ===============================================
// send-push: FCM 用のアクセストークン
// ===============================================
// Firebase のサービスアカウント鍵(JSON)で RS256 の JWT を Web Crypto で署名し、
// Google の OAuth でアクセストークンに換える。トークンは 1 時間有効なので、
// 関数のインスタンスが生きている間は使い回す。
// Deno-only import は使わない(Jest から署名をテストする)。

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

/** FCM_SERVICE_ACCOUNT_JSON を読む。足りない項目があれば null */
export function parseServiceAccount(raw: string | undefined | null): ServiceAccount | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (
      typeof parsed.project_id !== "string" ||
      typeof parsed.client_email !== "string" ||
      typeof parsed.private_key !== "string"
    ) {
      return null;
    }
    return {
      project_id: parsed.project_id,
      client_email: parsed.client_email,
      private_key: parsed.private_key,
      token_uri: typeof parsed.token_uri === "string" ? parsed.token_uri : undefined,
    };
  } catch {
    return null;
  }
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlFromString(text: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(text));
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** OAuth に渡す署名済み JWT(有効 1 時間) */
export async function createSignedJwt(
  account: ServiceAccount,
  nowSeconds: number,
): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.client_email,
    scope: FCM_SCOPE,
    aud: account.token_uri ?? DEFAULT_TOKEN_URI,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  const unsigned = `${base64UrlFromString(JSON.stringify(header))}.${
    base64UrlFromString(JSON.stringify(claims))
  }`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64UrlFromBytes(new Uint8Array(signature))}`;
}

interface CachedToken {
  accessToken: string;
  /** 秒。期限の 5 分前に作り直す */
  expiresAt: number;
}

let cached: CachedToken | null = null;

/** テスト用: 使い回しを捨てる */
export function resetAccessTokenCache(): void {
  cached = null;
}

export async function getAccessToken(
  account: ServiceAccount,
  fetchImpl: typeof fetch = fetch,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  if (cached && cached.expiresAt - 300 > nowSeconds) {
    return cached.accessToken;
  }
  const assertion = await createSignedJwt(account, nowSeconds);
  const res = await fetchImpl(account.token_uri ?? DEFAULT_TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  const json = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; error?: string }
    | null;
  if (!res.ok || !json?.access_token) {
    throw new Error(`fcm_oauth_failed: ${res.status} ${json?.error ?? ""}`.trim());
  }
  cached = {
    accessToken: json.access_token,
    expiresAt: nowSeconds + (json.expires_in ?? 3600),
  };
  return json.access_token;
}
