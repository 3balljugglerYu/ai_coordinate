import "server-only";

import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { env } from "@/lib/env";

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

let client: BetaAnalyticsDataClient | null = null;

function getServiceAccountCredentials(): ServiceAccountCredentials {
  const encoded = env.GA4_SERVICE_ACCOUNT_JSON_BASE64;

  if (!encoded) {
    throw new Error("GA4 service account is not configured.");
  }

  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const parsed = JSON.parse(decoded) as {
    client_email?: string;
    private_key?: string;
  };

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GA4 service account credentials are incomplete.");
  }

  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
  };
}

export function getGa4Client() {
  if (client) {
    return client;
  }

  const credentials = getServiceAccountCredentials();
  client = new BetaAnalyticsDataClient(
    {
      credentials,
      fallback: true,
    }
  );
  return client;
}
