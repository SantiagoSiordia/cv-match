#!/usr/bin/env node
/**
 * Run the production server the way `output: "standalone"` expects:
 * `node server.js` with cwd = `.next/standalone`, after syncing `.next/static` and `public`.
 * See https://nextjs.org/docs/app/api-reference/config/next-config-js/output
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");
const serverJs = path.join(standalone, "server.js");

if (!fs.existsSync(serverJs)) {
  console.error("Missing .next/standalone/server.js — run `npm run build` first.");
  process.exit(1);
}

function copyTree(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

copyTree(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
copyTree(path.join(root, "public"), path.join(standalone, "public"));

const child = spawn(process.execPath, ["server.js"], {
  cwd: standalone,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
