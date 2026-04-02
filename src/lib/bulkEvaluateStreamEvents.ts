export type BulkEvaluateStreamEvent =
  | { type: "matrix" }
  | {
      type: "ready";
      total: number;
      jobs: Array<{ jobDescriptionId: string; jobTitle: string }>;
    }
  | {
      type: "job";
      index: number;
      total: number;
      jobDescriptionId: string;
      jobTitle: string;
      status: "skipped" | "running" | "done" | "error";
      reason?: string;
      cvCount?: number;
      runId?: string;
      /** When status is skipped and reason is unchanged_since_last_run */
      existingRunId?: string;
    }
  | {
      type: "complete";
      runs: Array<{ jobDescriptionId: string; runId: string }>;
      skipped: Array<{ jobDescriptionId: string; reason: string }>;
      k: number;
      embeddingFloorPercent: number;
      skipIfUnchanged: boolean;
      useBatchedCompatibility: boolean;
    }
  | { type: "fatal"; code: string; message: string; status?: number };
