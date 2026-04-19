const publicEnvSchema = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY:
    process.env.NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY,
  NEXT_PUBLIC_NANOBANANA_API_KEY:
    process.env.NEXT_PUBLIC_NANOBANANA_API_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID:
    process.env.NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_EVENT_USER_ID: process.env.NEXT_PUBLIC_EVENT_USER_ID,
  NEXT_PUBLIC_GA4_MEASUREMENT_ID:
    process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
} as const;

function getPublicEnv() {
  const required = {
    NEXT_PUBLIC_SUPABASE_URL: publicEnvSchema.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicEnvSchema.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY:
      publicEnvSchema.NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      publicEnvSchema.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  };

  if (process.env.NODE_ENV === "development") {
    const missing = Object.entries(required).filter(([, value]) => !value);
    if (missing.length > 0) {
      console.warn(
        "⚠️ Missing public environment variables:",
        missing.map(([key]) => key).join(", ")
      );
      console.warn(
        "⚠️ Some client-side features may not work without these environment variables."
      );
    }
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: publicEnvSchema.NEXT_PUBLIC_SUPABASE_URL || "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      publicEnvSchema.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY:
      publicEnvSchema.NEXT_PUBLIC_GOOGLE_AI_STUDIO_API_KEY || "",
    NEXT_PUBLIC_NANOBANANA_API_KEY:
      publicEnvSchema.NEXT_PUBLIC_NANOBANANA_API_KEY || "",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      publicEnvSchema.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
    NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID:
      publicEnvSchema.NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID || "",
    NEXT_PUBLIC_SITE_URL: publicEnvSchema.NEXT_PUBLIC_SITE_URL || "",
    NEXT_PUBLIC_EVENT_USER_ID: publicEnvSchema.NEXT_PUBLIC_EVENT_USER_ID || "",
    NEXT_PUBLIC_GA4_MEASUREMENT_ID:
      publicEnvSchema.NEXT_PUBLIC_GA4_MEASUREMENT_ID || "",
  };
}

export const publicEnv = getPublicEnv();

export function getSiteUrlForClient(): string {
  if (publicEnv.NEXT_PUBLIC_SITE_URL) {
    return publicEnv.NEXT_PUBLIC_SITE_URL;
  }

  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

export function isStripeTestMode(): boolean {
  const publishableKey = publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return publishableKey.startsWith("pk_test_");
}
