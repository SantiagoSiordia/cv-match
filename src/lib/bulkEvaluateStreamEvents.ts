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
    }
  | {
      type: "complete";
      runs: Array<{ jobDescriptionId: string; runId: string }>;
      skipped: Array<{ jobDescriptionId: string; reason: string }>;
      k: number;
      embeddingFloorPercent: number;
    }
  | { type: "fatal"; code: string; message: string; status?: number };
