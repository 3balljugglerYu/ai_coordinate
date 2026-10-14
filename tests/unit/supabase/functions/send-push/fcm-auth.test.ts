/** @jest-environment node */

import { generateKeyPairSync, createVerify } from "node:crypto";
import {
  createSignedJwt,
  getAccessToken,
  parseServiceAccount,
  resetAccessTokenCache,
  type ServiceAccount,
} from "@/supabase/functions/send-push/fcm-auth";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const account: ServiceAccount = {
  project_id: "persta-test",
  client_email: "push@persta-test.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

function decodePart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

describe("parseServiceAccount", () => {
  test("必要な項目がそろっていれば読む", () => {
    expect(parseServiceAccount(JSON.stringify({ ...account, type: "service_account" }))).toEqual({
      ...account,
      token_uri: undefined,
    });
  });

  test("空・壊れた JSON・項目不足は null", () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount("{")).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ project_id: "p" }))).toBeNull();
  });
});

describe("createSignedJwt", () => {
  test("FCM の scope で RS256 署名し、公開鍵で検証できる", async () => {
    const jwt = await createSignedJwt(account, 1_000_000);
    const [header, claims, signature] = jwt.split(".");

    expect(decodePart(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decodePart(claims)).toEqual({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_000_000,
      exp: 1_003_600,
    });

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });
});

describe("getAccessToken", () => {
  beforeEach(() => resetAccessTokenCache());

  function tokenResponse(body: unknown, ok = true, status = 200) {
    return { ok, status, json: async () => body } as unknown as Response;
  }

  test("期限の 5 分前までは使い回す", async () => {
    const fetchImpl = jest.fn(async () =>
      tokenResponse({ access_token: "a1", expires_in: 3600 })
    ) as unknown as typeof fetch;

    expect(await getAccessToken(account, fetchImpl, 1000)).toBe("a1");
    expect(await getAccessToken(account, fetchImpl, 1000 + 3000)).toBe("a1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // 残り 5 分を切ったら作り直す
    await getAccessToken(account, fetchImpl, 1000 + 3301);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("OAuth に失敗したら例外", async () => {
    const fetchImpl = jest.fn(async () =>
      tokenResponse({ error: "invalid_grant" }, false, 400)
    ) as unknown as typeof fetch;
    await expect(getAccessToken(account, fetchImpl, 1000)).rejects.toThrow(
      "fcm_oauth_failed: 400 invalid_grant",
    );
  });
});
