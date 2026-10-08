import {
  readFileSync,
  readdirSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  existsSync,
  copyFileSync,
  unlinkSync,
  realpathSync,
} from "node:fs";
import { resolve, join, relative, dirname, sep } from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
const directories = [
  "src",
  "ui",
  "scripts",
  "skills",
  "craft",
  "library",
  "examples",
  ".claude-plugin",
];
const files = [
  "package.json",
  "README.md",
  "LICENSE",
  "docs/CLI.md",
  "docs/VERIFICATION.md",
  "docs/images/campaign-desk-desktop.png",
  "docs/images/campaign-desk-mobile.png",
];
export function runtimeHome() {
  return resolve(
    process.env.AGENT_MARKETING_HOME || join(homedir(), ".agent-marketing"),
  );
}
function runtimeFiles(root) {
  const found = [];
  const scan = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true }).toSorted(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const file = join(path, entry.name);
      if (lstatSync(file).isSymbolicLink())
        throw new Error("Runtime content must not contain symlinks");
      if (entry.isDirectory()) scan(file);
      else found.push(relative(root, file).split(sep).join("/"));
    }
  };
  for (const dir of directories)
    if (existsSync(join(root, dir))) scan(join(root, dir));
  for (const file of files) if (existsSync(join(root, file))) found.push(file);
  return found.toSorted();
}
export function fingerprint(root) {
  const hash = createHash("sha256");
  for (const file of runtimeFiles(root)) {
    hash.update(file + "\0");
    hash.update(readFileSync(join(root, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}
export function inspectInstallation(source, home = runtimeHome()) {
  const result = {
    ok: false,
    version: JSON.parse(readFileSync(join(source, "package.json"))).version,
    home: resolve(home),
    errors: [],
  };
  try {
    if (Number(process.versions.node.split(".")[0]) < 24)
      throw new Error("Node 24 or newer required");
    const receipt = JSON.parse(
      readFileSync(join(home, "receipt.json"), "utf8"),
    );
    const releases = realpathSync(join(home, "releases")),
      runtimeRoot = realpathSync(receipt.runtimeRoot);
    const rel = relative(releases, runtimeRoot);
    if (!rel || rel.startsWith("..") || resolve(releases, rel) !== runtimeRoot)
      throw new Error(
        "Receipt must reference a release inside the managed home",
      );
    const hash = fingerprint(source);
    if (receipt.fingerprint !== hash || receipt.version !== result.version)
      throw new Error("Source updated: install the current plugin runtime");
    if (fingerprint(runtimeRoot) !== hash)
      throw new Error("Runtime content missing or modified: rerun setup");
    result.runtimeRoot = runtimeRoot;
    result.fingerprint = hash;
    result.ok = true;
  } catch (e) {
    result.errors.push(
      e.code === "ENOENT" ? "Runtime is not installed; run setup" : e.message,
    );
  }
  return result;
}
export function installRuntime(source, home = runtimeHome()) {
  home = resolve(home);
  mkdirSync(home, { recursive: true });
  const lock = join(home, "setup.lock");
  try {
    writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: "wx" });
  } catch (e) {
    if (e.code === "EEXIST")
      throw new Error(
        "Setup locked; inspect the recorded process before removing a stopped-process lock",
      );
    throw e;
  }
  try {
    const installed = inspectInstallation(source, home);
    if (installed.ok) return installed;
    if (Number(process.versions.node.split(".")[0]) < 24)
      throw new Error("Node 24 or newer required");
    const hash = fingerprint(source),
      version = JSON.parse(readFileSync(join(source, "package.json"))).version,
      releases = join(home, "releases");
    mkdirSync(releases, { recursive: true });
    const id = `${version}-${hash.slice(0, 16)}-${process.platform}-${process.arch}`,
      base = join(releases, id);
    // A damaged prior release is retained for inspection; setup never recursively deletes it.
    const destination = existsSync(base)
        ? join(releases, id + "-" + randomUUID().slice(0, 8))
        : base,
      stage = join(releases, ".install-" + randomUUID());
    mkdirSync(stage);
    writeFileSync(
      join(stage, ".owned-by-agent-marketing"),
      "Managed runtime staging/release\n",
    );
    for (const file of runtimeFiles(source)) {
      const target = join(stage, file);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(source, file), target);
    }
    if (fingerprint(stage) !== hash)
      throw new Error("Source changed during installation; rerun setup");
    renameSync(stage, destination);
    const receipt = {
      version,
      fingerprint: hash,
      runtimeRoot: destination,
      installedAt: new Date().toISOString(),
    };
    const receiptTemp = join(home, "receipt-" + randomUUID() + ".tmp");
    writeFileSync(receiptTemp, JSON.stringify(receipt, null, 2) + "\n", {
      flag: "wx",
    });
    renameSync(receiptTemp, join(home, "receipt.json"));
    return inspectInstallation(source, home);
  } finally {
    unlinkSync(lock);
  }
}
