#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { inspectInstallation } from "./runtime.mjs";
const source = fileURLToPath(new URL("../", import.meta.url)),
  report = inspectInstallation(source);
if (!report.ok) {
  console.error(
    JSON.stringify({
      error: {
        code: "E_RUNTIME",
        message: report.errors.join("; "),
        hint: "Run market-setup using this plugin root",
      },
    }),
  );
  process.exitCode = 1;
} else {
  const child = spawn(
    process.execPath,
    [
      join(report.runtimeRoot, "scripts/marketing.mjs"),
      ...process.argv.slice(2),
    ],
    { stdio: "inherit" },
  );
  child.on("error", (e) => {
    console.error(
      JSON.stringify({ error: { code: "E_LAUNCH", message: e.message } }),
    );
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
