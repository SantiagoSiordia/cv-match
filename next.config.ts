import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Pin Turbopack root when a parent directory has another lockfile (avoids wrong standalone paths). */
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: turbopackRoot,
  },
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
