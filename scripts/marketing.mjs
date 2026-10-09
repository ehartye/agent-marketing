#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { parseArgs } from "node:util";
import {
  createWorkspace,
  readWorkspace,
  importRecords,
} from "../src/store.mjs";
import { collections, validateWorkspace } from "../src/schema.mjs";
import { report, advise, analyzeExperiment } from "../src/analysis.mjs";
import { parseImport, taggedUrl, observationsCsv } from "../src/import.mjs";
import { monitor } from "../src/collectors.mjs";
import { recommendChannels, channelLibrary } from "../src/channels.mjs";
import { readDocument, saveDocument, saveReport } from "../src/documents.mjs";
import { studioWorkspace, runtimeHome } from "./runtime.mjs";
function writeExport(workspace, output, text) {
  if (existsSync(output)) {
    const source = statSync(workspace, { bigint: true }), destination = statSync(output, { bigint: true });
    if (source.dev === destination.dev && source.ino === destination.ino)
      throw new Error("Choose an output file separate from the workspace");
  }
  const out = resolve(output);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  return out;
}
const help = {
  name: "marketing",
  version: "0.8.0",
  workspace: "--workspace <file> (default .agent-marketing/workspace.json) or --studio for the studio workspace, the home for records with no project such as research reports",
  commands: [
    "init",
    "demo",
    "validate",
    "import <json-or-csv>",
    "put <collection> <record.json>",
    "document save <strategy|campaign> <record-id> <brief.md> --revision n",
    "document save report <report-id> <report.md> --title t --revision n [--project id --kind k --vault-url u]",
    "document show <strategy|campaign|report> <record-id>",
    "document export <strategy|campaign|report> <record-id> [--out file.md]",
    "report [--project id --initiative id --from date --to date]",
    "advise <project-id>",
    "channels [project-id]",
    "experiment <experiment-id>",
    "utm <url> --source x --medium y --campaign z [--content c]",
    "monitor [--source id]",
    "serve [--port 4318] [--idle-minutes 30]",
    "export [--format json|csv] [--out file]",
    "rules [topic]",
    "help",
  ],
};
let command;
try {
  const { values: v, positionals: p } = parseArgs({
    allowPositionals: true,
    options: {
      studio: { type: "boolean" },
      ...Object.fromEntries(
      [
        "workspace",
        "project",
        "initiative",
        "from",
        "to",
        "source",
        "medium",
        "campaign",
        "content",
        "term",
        "port",
        "format",
        "out",
        "revision",
        "title",
        "kind",
        "vault-url",
        "idle-minutes",
      ].map((k) => [k, { type: "string" }]),
      ),
    },
  });
  command = p.shift() || "help";
  if (v.studio && v.workspace) throw new Error("Use either --studio or --workspace, not both");
  const file = v.studio ? studioWorkspace() : resolve(v.workspace || ".agent-marketing/workspace.json");
  const required = (x, name) => {
    if (!x) throw new Error(`Required: ${name}`);
    return x;
  };
  const filter = {
    projectId: v.project,
    initiativeId: v.initiative,
    from: v.from,
    to: v.to,
  };
  let result;
  if (command === "help") result = help;
  else if (command === "init") {
    // The studio is shared, so creating it twice is not an error.
    result = v.studio && existsSync(file)
      ? { workspace: file, exists: true, revision: readWorkspace(file).revision }
      : createWorkspace(file);
  }
  else if (command === "demo")
    result = createWorkspace(
      file,
      JSON.parse(
        readFileSync(new URL("../examples/studio.json", import.meta.url)),
      ),
    );
  else if (command === "validate") {
    const w = validateWorkspace(readWorkspace(file));
    result = {
      ok: true,
      revision: w.revision,
      records: Object.fromEntries(collections.map((k) => [k, w[k].length])),
    };
  } else if (command === "import") {
    const input = required(p[0], "import file");
    result = importRecords(
      file,
      parseImport(
        readFileSync(input, "utf8"),
        extname(input).toLowerCase() === ".csv" ? "csv" : "json",
      ),
      v.revision === undefined ? undefined : Number(v.revision),
    );
  } else if (command === "put") {
    const collection = required(p[0], "collection");
    if (!collections.includes(collection))
      throw new Error("Unknown collection");
    result = importRecords(
      file,
      {
        [collection]: [
          JSON.parse(readFileSync(required(p[1], "record.json"), "utf8")),
        ],
      },
      v.revision === undefined ? undefined : Number(v.revision),
    );
  } else if (command === "document") {
    const [action, kind, id, input] = p;
    if (!["save", "show", "export"].includes(action))
      throw new Error("Document action must be save, show or export");
    required(kind, "document kind");
    required(id, "record ID");
    if (action === "save" && kind === "report") {
      result = { workspace: file, ...saveReport(file, {
        id, title: v.title, markdown: readFileSync(required(input, "report.md"), "utf8"),
        projectId: v.project, kind: v.kind, vaultUrl: v["vault-url"],
      }, Number(v.revision)) };
    } else if (action === "save") {
      result = { workspace: file, ...saveDocument(file, kind, id,
        readFileSync(required(input, "brief.md"), "utf8"), Number(v.revision)) };
    } else {
      result = { workspace: file, ...readDocument(readWorkspace(file), kind, id) };
      if (action === "export") {
        if (v.out) {
          result = { out: writeExport(file, v.out, result.document.markdown), format: "markdown" };
        } else {
          process.stdout.write(result.document.markdown);
          process.exit(0);
        }
      }
    }
  } else if (command === "report") result = report(readWorkspace(file), filter);
  else if (command === "advise")
    result = advise(
      readWorkspace(file),
      required(p[0] || v.project, "project ID"),
      filter,
    );
  else if (command === "channels") {
    const id = p[0] || v.project;
    const project = id
      ? readWorkspace(file).projects.find((r) => r.id === id)
      : null;
    if (id && !project) throw new Error("Project does not exist");
    result = project ? recommendChannels(project) : channelLibrary;
  } else if (command === "experiment") {
    const x = readWorkspace(file).experiments.find(
      (x) => x.id === required(p[0], "experiment ID"),
    );
    if (!x) throw new Error("Experiment does not exist");
    result = analyzeExperiment(x);
  } else if (command === "utm")
    result = {
      url: taggedUrl(
        required(p[0], "destination URL"),
        Object.fromEntries(
          ["source", "medium", "campaign", "content", "term"]
            .filter((k) => v[k])
            .map((k) => [k, v[k]]),
        ),
      ),
    };
  else if (command === "monitor") {
    result = await monitor(file, { sourceId: v.source });
    if (result.sources.some((s) => s.errors.length)) process.exitCode = 1;
  } else if (command === "serve") {
    const { startServer } = await import("../src/server.mjs");
    const minutes = v["idle-minutes"] === undefined ? 30 : Number(v["idle-minutes"]);
    if (!Number.isFinite(minutes) || minutes < 0)
      throw new Error("--idle-minutes must be 0 (never) or a positive number");
    const running = await startServer(file, {
      port: v.port === undefined ? 4318 : Number(v.port),
      idleMs: minutes * 60 * 1000,
      catalog: { studio: studioWorkspace(), folder: resolve(runtimeHome(), "workspaces") },
    });
    running.closed.then(() =>
      console.error(`Desk stopped after ${minutes} idle minutes (no requests and no open page). Run serve again to reopen it.`));
    result = { url: running.url, workspace: file, idleMinutes: minutes };
  } else if (command === "export") {
    const w = readWorkspace(file);
    const format = v.format || "json";
    if (!["json", "csv"].includes(format))
      throw new Error("Export format must be json or csv");
    const body =
      format === "csv"
        ? observationsCsv(w.observations)
        : JSON.stringify(w, null, 2) + "\n";
    if (v.out) {
      result = { out: writeExport(file, v.out, body), format };
    } else {
      process.stdout.write(body);
      process.exit(0);
    }
  } else if (command === "rules") {
    const rules = JSON.parse(
      readFileSync(new URL("../craft/rules.json", import.meta.url)),
    );
    result = p[0] ? rules.filter((r) => r.topic === p[0]) : rules;
  } else throw new Error(`Unknown command ${command}. Run help.`);
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(
    JSON.stringify({
      error: {
        code: command === "help" || !command ? "E_USAGE" : "E_COMMAND",
        message: e.message,
      },
    }),
  );
  process.exitCode = 2;
}
