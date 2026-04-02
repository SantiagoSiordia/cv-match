import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/http";
import {
  backfillJobSkillsForJob,
  listJobDescriptions,
} from "@/lib/storage";
import { isAiProviderConfigError } from "@/lib/aiProvider";

const bodySchema = z.object({
  jobDescriptionId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    json = {};
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(400, "INVALID_BODY", "Invalid request body", {
      issues: parsed.error.flatten(),
    });
  }

  const targetId = parsed.data.jobDescriptionId;

  try {
    const jobs = await listJobDescriptions();
    const toProcess = targetId
      ? jobs.filter((j) => j.id === targetId)
      : jobs.filter(
          (j) =>
            (!j.geminiSkills || j.geminiSkills.length === 0) &&
            j.extractedCharCount > 0,
        );

    if (targetId && toProcess.length === 0) {
      return jsonError(404, "NOT_FOUND", "Job not found");
    }

    const results: Array<{
      jobDescriptionId: string;
      ok: boolean;
      skillsCount?: number;
      error?: string;
    }> = [];

    for (const j of toProcess) {
      const r = await backfillJobSkillsForJob(j.id);
      if (r.ok) {
        results.push({
          jobDescriptionId: j.id,
          ok: true,
          skillsCount: r.skills.length,
        });
      } else {
        results.push({
          jobDescriptionId: j.id,
          ok: false,
          error: r.error,
        });
      }
    }

    return jsonOk({
      processed: results.length,
      results,
    });
  } catch (e) {
    if (isAiProviderConfigError(e)) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonError(500, "AI_CONFIG", msg);
    }
    console.error(e);
    return jsonError(500, "BACKFILL_FAILED", "Skill backfill failed");
  }
}
