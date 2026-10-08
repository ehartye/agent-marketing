import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validateWorkspace } from "../src/schema.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const json = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const pkg = json("package.json"),
  manifest = json(".claude-plugin/plugin.json");
assert.equal(manifest.name, pkg.name);
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.license, pkg.license);
const localEntry = json(".claude-plugin/marketplace.json").plugins.find(
  (entry) => entry.name === pkg.name,
);
assert.ok(localEntry, "Missing local marketplace entry");
assert.equal(localEntry.version, pkg.version);
assert.equal(localEntry.license, pkg.license);
const refs = json("craft/references.json"),
  rules = json("craft/rules.json"),
  channels = json("library/channels.json");
for (const entries of [refs, rules, channels])
  assert.equal(
    new Set(entries.map((r) => r.id)).size,
    entries.length,
    "Duplicate library IDs",
  );
const ids = new Set(refs.map((r) => r.id));
for (const ref of refs) {
  assert.match(ref.url, /^https:\/\//);
  for (const key of ["title", "quality", "checkedAt", "supports", "limit"])
    assert.ok(ref[key], `Missing reference ${key}: ${ref.id}`);
}
for (const entry of [...rules, ...channels]) {
  assert.ok(entry.referenceIds.length, `Missing provenance: ${entry.id}`);
  for (const id of entry.referenceIds)
    assert.ok(ids.has(id), `Unknown reference: ${id}`);
}
validateWorkspace(json("examples/studio.json"));
const skills = readdirSync(join(root, "skills"), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
assert.equal(skills.length, 9);
for (const name of skills) {
  const file = join(root, "skills", name, "SKILL.md"),
    content = readFileSync(file, "utf8");
  const header = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1];
  assert.ok(header, `Missing frontmatter: ${name}`);
  assert.equal(/^name: (.+)$/m.exec(header)?.[1].trim(), name);
  const description = /^description: (.+)$/m.exec(header)?.[1].trim();
  assert.ok(
    description?.length >= 60 && description.length <= 1024,
    `Poorly scoped description: ${name}`,
  );
}
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
const documents = [
  ...walk(join(root, "skills")),
  ...walk(join(root, "craft")),
  ...walk(join(root, "library")),
  ...walk(join(root, "docs")),
  join(root, "README.md"),
].filter((f) => f.endsWith(".md"));
for (const file of documents)
  for (const [, target] of readFileSync(file, "utf8").matchAll(
    /\[[^\]]*\]\(([^)]+)\)/g,
  )) {
    if (/^(https?:|#|<)/.test(target)) continue;
    const path = resolve(
      dirname(file),
      decodeURIComponent(target.split("#")[0]),
    );
    assert.ok(
      existsSync(path),
      `Broken resource in ${relative(root, file)}: ${target}`,
    );
  }
const run = (args) => {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout || `Failed ${args.join(" ")}`,
  );
};
for (const file of ["src", "scripts", "ui", "tests"]
  .flatMap((dir) => walk(join(root, dir)))
  .filter((f) => /\.(mjs|js)$/.test(f)))
  run(["--check", file]);
run(["scripts/build-references.mjs", "--check"]);
console.log(
  JSON.stringify(
    {
      ok: true,
      version: pkg.version,
      skills: skills.length,
      references: refs.length,
      rules: rules.length,
      channels: channels.length,
      resourceDocuments: documents.length,
    },
    null,
    2,
  ),
);
