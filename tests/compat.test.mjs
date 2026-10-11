import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runtimeHome } from "../scripts/runtime.mjs";
import { readWorkspace } from "../src/store.mjs";
import { plan, advise } from "../src/analysis.mjs";

const added = ["decisions", "actions", "updates", "assetSlots", "assets"];
const cli = (file, ...args) => {
  const r = spawnSync(process.execPath, [resolve("scripts/marketing.mjs"), ...args, "--workspace", file], { encoding: "utf8" });
  return { status: r.status, out: r.stdout ? JSON.parse(r.stdout) : null, err: r.stderr };
};

// An older workspace file is read unchanged and gains the empty collections only when something
// writes it, so merely opening it (validate, plan, advise, next) never touches the file. A file
// that this runtime has already written has them, and is then only validated.
function checkOldFile(source) {
  const dir = mkdtempSync(join(tmpdir(), "marketing-compat-")),
    file = join(dir, "copy.json");
  try {
    copyFileSync(source, file);
    const bytes = readFileSync(file, "utf8"),
      raw = JSON.parse(bytes);
    const old = added.every((k) => !(k in raw));
    const v = cli(file, "validate", "--strict");
    assert.equal(v.status, 0, v.err);
    assert.deepEqual(v.out.warnings, []);
    if (!old) return;
    for (const k of added) assert.equal(v.out.records[k], 0);
    const w = readWorkspace(file);
    for (const p of w.projects) {
      plan(w, p.id);
      advise(w, p.id);
      assert.equal(cli(file, "next", p.id, "--today", "2026-10-11").status, 0);
      const listed = cli(file, "asset", "list", "--project", p.id);
      assert.equal(listed.status, 0);
      assert.deepEqual([listed.out.slots, listed.out.assets], [[], []]);
    }
    assert.equal(readFileSync(file, "utf8"), bytes, "reading never rewrites the file");
    // The first write by this runtime adds the empty collections and changes nothing else.
    const project = w.projects[0].id,
      note = join(dir, "note.json");
    writeFileSync(note, JSON.stringify({ id: "u-compat-1", projectId: project, at: "2026-10-11T09:00:00.000Z", kind: "note", text: "compat check" }));
    const put = cli(file, "put", "updates", note, "--strict");
    assert.equal(put.status, 0, put.err);
    const after = JSON.parse(readFileSync(file, "utf8"));
    for (const k of added) assert.ok(Array.isArray(after[k]), k);
    assert.equal(after.updates.length, 1);
    assert.equal(after.revision, raw.revision + 1);
    for (const k of Object.keys(raw).filter((k) => !["revision", ...added].includes(k)))
      assert.deepEqual(after[k], raw[k], `${k} is unchanged`);
    assert.equal(cli(file, "validate", "--strict").status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the example studio still validates strictly and gains the new collections only on a write", () =>
  checkOldFile(resolve("examples/studio.json")));

// The owner's own workspace is used when this machine has it; a copy is read, never the file.
const real = join(runtimeHome(), "workspaces", "apcademy.json");
test("a copy of the real apcademy workspace still validates strictly with no warnings", { skip: !existsSync(real) && "no apcademy workspace on this machine" }, () =>
  checkOldFile(real));
