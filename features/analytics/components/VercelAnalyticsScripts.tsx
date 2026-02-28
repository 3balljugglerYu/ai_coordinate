"use client";

import dynamic from "next/dynamic";

const DeferredAnalytics = dynamic(
  () => import("@vercel/analytics/next").then((module) => module.Analytics),
  { ssr: false }
);

const DeferredSpeedInsights = dynamic(
  () =>
    import("@vercel/speed-insights/next").then(
      (module) => module.SpeedInsights
    ),
  { ssr: false }
);

export function VercelAnalyticsScripts() {
  return (
    <>
      <DeferredAnalytics />
      <DeferredSpeedInsights />
    </>
  );
}
