import { Suspense } from "react";
import { EvaluateClient } from "./EvaluateClient";
import { EvaluateFormSkeleton } from "./EvaluateSkeleton";

export const metadata = {
  title: "Evaluate",
};

export default function EvaluatePage() {
  return (
    <Suspense fallback={<EvaluateFormSkeleton />}>
      <EvaluateClient />
    </Suspense>
  );
}
