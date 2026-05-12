import { AnalyticsClient } from "./AnalyticsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analytics",
};

export default function AnalyticsPage() {
  return <AnalyticsClient />;
}
