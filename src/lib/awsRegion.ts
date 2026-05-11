import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Maps profile name → region from ~/.aws/config (same lookup the CLI uses for
 * `aws ... --profile`, when region is not overridden by env).
 */
function regionsByProfileFromSharedConfig(): Map<string, string> {
  const configPath = process.env.AWS_CONFIG_FILE?.trim()
    ? path.resolve(process.env.AWS_CONFIG_FILE.trim())
    : path.join(homedir(), ".aws", "config");
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch {
    return new Map();
  }

  const map = new Map<string, string>();
  let currentProfile = "";

  for (const line of raw.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (header) {
      const section = header[1]!.trim();
      if (section === "default") {
        currentProfile = "default";
      } else if (section.toLowerCase().startsWith("profile ")) {
        currentProfile = section.slice("profile ".length).trim();
      } else {
        currentProfile = section;
      }
      continue;
    }
    const m = /^\s*region\s*=\s*(\S+)/i.exec(line);
    if (m && currentProfile) {
      map.set(currentProfile, m[1]!.trim());
    }
  }
  return map;
}

/**
 * Resolves the AWS region for SDK clients: env first, then the active profile’s
 * `region` in ~/.aws/config (when `AWS_PROFILE` / default profile applies).
 */
export function resolveAwsRegion(): string {
  const fromEnv =
    process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim();
  if (fromEnv) return fromEnv;

  const profile =
    process.env.AWS_PROFILE?.trim() ||
    process.env.AWS_DEFAULT_PROFILE?.trim() ||
    "default";

  return regionsByProfileFromSharedConfig().get(profile)?.trim() || "";
}
