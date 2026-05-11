import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Pin Turbopack root when a parent directory has another lockfile (avoids wrong standalone paths). */
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  /** LAN dev: allow HMR / dev bundles when opening http://<this-host>:3000 from another device. */
  allowedDevOrigins: ["192.168.1.30"],
  turbopack: {
    root: turbopackRoot,
  },
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
