import { Suspense } from "react";
import { AnalyticsClient } from "./AnalyticsClient";

export const metadata = {
  title: "Analytics",
};

function AnalyticsFallback() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <p className="text-sm text-zinc-500">Loading…</p>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<AnalyticsFallback />}>
      <AnalyticsClient />
    </Suspense>
  );
}
