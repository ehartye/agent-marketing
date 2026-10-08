#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { inspectInstallation, installRuntime } from "./runtime.mjs";
try {
  if (process.argv.slice(2).some((a) => !["--check", "--json"].includes(a)))
    throw new Error("Usage: setup.mjs [--check] [--json]");
  const source = fileURLToPath(new URL("../", import.meta.url)),
    result = process.argv.includes("--check")
      ? inspectInstallation(source)
      : installRuntime(source);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch (e) {
  console.error(
    JSON.stringify({ error: { code: "E_SETUP", message: e.message } }),
  );
  process.exitCode = 2;
}
