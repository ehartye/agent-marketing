#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { parseArgs } from "node:util";
import {
  createWorkspace,
  readWorkspace,
  importRecords,
} from "../src/store.mjs";
import { collections, validateWorkspace, workspaceWarnings, failOnWarnings, assetStatuses } from "../src/schema.mjs";
import { report, advise, plan, analyzeExperiment, attention, localDate } from "../src/analysis.mjs";
import { decide, defer, addAction, setActionStatus, setGate, addUpdate } from "../src/progress.mjs";
import { addSlot, setSlot, addAsset, pickAsset, rejectAsset, restoreAsset, retireAsset, listAssets, listSlots } from "../src/assets.mjs";
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
  version: "0.10.0",
  workspace: "--workspace <file> (default .agent-marketing/workspace.json) or --studio for the studio workspace, the home for records with no project such as research reports",
  commands: [
    "init",
    "demo",
    "validate [--strict]",
    "import <json-or-csv> [--strict]",
    "put <collection> <record.json> [--strict]",
    "document save <strategy|campaign> <record-id> <brief.md> --revision n",
    "document save report <report-id> <report.md> --title t --revision n [--project id --kind k --vault-url u --initiative id --gate id --decision id]",
    "document show <strategy|campaign|report> <record-id>",
    "document export <strategy|campaign|report> <record-id> [--out file.md]",
    "report [--project id --initiative id --from date --to date]",
    "advise <project-id>",
    "plan <project-id>",
    "next [project-id] [--today YYYY-MM-DD]",
    "decide <decision-id> --option <option-id> [--rationale text] [--change] [--revision n]",
    "defer <decision-id> [--until YYYY-MM-DD] [--note text] [--revision n]",
    "action add --id id --title text [--owner owner|agent] [--status todo|doing|done|blocked|dropped] [--due YYYY-MM-DD] [--hours n] [--initiative id] [--gate id] [--decision id] [--note text] [--project id] [--revision n]",
    "action status <action-id> <todo|doing|done|blocked|dropped> [--note text] [--revision n]",
    "gate set <gate-id> --status <open|passed|failed|waived> [--note text] [--evidence id,id] [--due YYYY-MM-DD|none] [--hours n|none] [--revision n]",
    "update add --text text [--kind note|decision|gate|initiative|action|asset|document] [--initiative id] [--ref id] [--project id] [--revision n]",
    "asset slot add --id id --name text --kind image|video|document|text|link [--spec text] [--initiative id] [--project id] [--note text] [--waiting-on text] [--revision n]",
    "asset slot set <slot-id> [--waiting-on text|none] [--spec text] [--note text] [--revision n]",
    "asset add --slot id --label text (--file path | --url https-url | --text copy) [--source text] [--id id] [--supersedes asset-id] [--revision n]",
    "asset pick <asset-or-slot-id> [--rationale text] [--revision n]",
    "asset reject <asset-id> --rationale text [--revision n]",
    "asset restore <asset-id> [--revision n]",
    "asset retire <asset-id> [--rationale text] [--revision n]",
    "asset list [--project id] [--slot id] [--status candidate|selected|rejected|retired]",
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
      strict: { type: "boolean" },
      change: { type: "boolean" },
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
        "option",
        "rationale",
        "until",
        "note",
        "owner",
        "due",
        "hours",
        "gate",
        "decision",
        "id",
        "evidence",
        "text",
        "ref",
        "today",
        "status",
        "slot",
        "label",
        "name",
        "file",
        "url",
        "spec",
        "supersedes",
        "waiting-on",
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
  // A number given on the command line: absent is undefined, and anything that is not a finite
  // number, including an empty value, is refused here instead of becoming 0 or NaN downstream.
  const numeric = (x, name) => {
    if (x === undefined) return undefined;
    const n = x.trim() === "" ? NaN : Number(x);
    if (!Number.isFinite(n)) throw new Error(`${name} must be a number, not "${x}"`);
    return n;
  };
  // `none` clears a field that can be cleared: undefined keeps it, null clears it.
  const clearable = (x, name, parse = (y) => y) => (x === undefined ? undefined : x.trim().toLowerCase() === "none" ? null : parse(x, name));
  const revisionNumber = v.revision === undefined ? undefined : /^\d+$/.test(v.revision.trim()) ? Number(v.revision) : NaN;
  if (Number.isNaN(revisionNumber)) throw new Error(`--revision must be a whole number of 0 or more, not "${v.revision}"; it is the revision an earlier command printed`);
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
    const w = validateWorkspace(readWorkspace(file)),
      warnings = workspaceWarnings(w);
    if (v.strict) failOnWarnings(warnings);
    result = {
      ok: true,
      revision: w.revision,
      records: Object.fromEntries(collections.map((k) => [k, w[k].length])),
      warnings,
    };
  } else if (command === "import") {
    const input = required(p[0], "import file");
    result = importRecords(
      file,
      parseImport(
        readFileSync(input, "utf8"),
        extname(input).toLowerCase() === ".csv" ? "csv" : "json",
      ),
      revisionNumber,
      { strict: v.strict },
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
      revisionNumber,
      { strict: v.strict },
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
        initiativeId: v.initiative, gateId: v.gate, decisionId: v.decision,
      }, (revisionNumber ?? NaN)) };
    } else if (action === "save") {
      result = { workspace: file, ...saveDocument(file, kind, id,
        readFileSync(required(input, "brief.md"), "utf8"), (revisionNumber ?? NaN)) };
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
  else if (command === "plan")
    result = plan(readWorkspace(file), required(p[0] || v.project, "project ID"));
  else if (command === "next") {
    const w = readWorkspace(file);
    let id = p[0] || v.project;
    if (!id) {
      if (w.projects.length === 1) id = w.projects[0].id;
      else
        throw new Error(
          w.projects.length
            ? `The workspace has several projects (${w.projects.map((r) => r.id).join(", ")}); name one: marketing next <project-id>`
            : "The workspace has no projects yet; add one with marketing put projects, or use --workspace for the right file",
        );
    }
    result = attention(w, id, v.today ?? localDate());
  } else if (command === "asset" && p[0] === "list") {
    if (v.status !== undefined && !assetStatuses.includes(v.status))
      throw new Error(`--status must be one of ${assetStatuses.join(", ")}, not "${v.status}"`);
    const w = readWorkspace(file);
    result = {
      workspace: file,
      slots: listSlots(w, { projectId: v.project, slotId: v.slot }),
      assets: listAssets(w, { projectId: v.project, slotId: v.slot, status: v.status }),
    };
  } else if (["decide", "defer", "action", "gate", "update", "asset"].includes(command)) {
    // Progress commands print the changed record and the log entry they wrote with it.
    const revision = revisionNumber,
      note = v.note;
    let done;
    if (command === "decide")
      done = decide(file, required(p[0], "decision ID"), {
        optionId: v.option, rationale: v.rationale, change: v.change, revision,
      });
    else if (command === "defer")
      done = defer(file, required(p[0], "decision ID"), { until: v.until, note, revision });
    else if (command === "action" && p[0] === "add")
      done = addAction(file, {
        id: required(v.id, "--id"),
        title: required(v.title, "--title"),
        owner: v.owner,
        status: v.status,
        due: v.due,
        hours: numeric(v.hours, "--hours"),
        initiativeId: v.initiative,
        gateId: v.gate,
        decisionId: v.decision,
        notes: note,
        projectId: v.project,
        revision,
      });
    else if (command === "action" && p[0] === "status")
      done = setActionStatus(file, required(p[1], "action ID"), required(p[2], "status"), { notes: note, revision });
    else if (command === "gate" && p[0] === "set")
      done = setGate(file, required(p[1], "gate ID"), {
        status: required(v.status, "--status"),
        note,
        evidenceIds: v.evidence === undefined ? undefined : v.evidence.split(",").map((x) => x.trim()).filter(Boolean),
        due: clearable(v.due, "--due"),
        hours: clearable(v.hours, "--hours", numeric),
        revision,
      });
    else if (command === "update" && p[0] === "add")
      done = addUpdate(file, {
        text: required(v.text, "--text"), kind: v.kind, initiativeId: v.initiative, refId: v.ref, projectId: v.project, revision,
      });
    else if (command === "asset" && p[0] === "slot" && p[1] === "add")
      done = addSlot(file, {
        id: required(v.id, "--id"),
        name: required(v.name, "--name"),
        kind: required(v.kind, "--kind"),
        spec: v.spec,
        initiativeId: v.initiative,
        projectId: v.project,
        notes: note,
        waitingOn: v["waiting-on"],
        revision,
      });
    else if (command === "asset" && p[0] === "slot" && p[1] === "set")
      done = setSlot(file, required(p[2], "slot ID"), {
        waitingOn: clearable(v["waiting-on"], "--waiting-on"),
        spec: v.spec,
        notes: note,
        revision,
      });
    else if (command === "asset" && p[0] === "add")
      done = addAsset(file, {
        slotId: required(v.slot, "--slot"),
        label: required(v.label, "--label"),
        from: v.file === undefined ? undefined : resolve(v.file),
        url: v.url,
        text: v.text,
        source: v.source,
        supersedes: v.supersedes,
        id: v.id,
        revision,
      });
    else if (command === "asset" && p[0] === "pick")
      done = pickAsset(file, required(p[1], "asset ID"), { rationale: v.rationale, revision });
    else if (command === "asset" && p[0] === "reject")
      done = rejectAsset(file, required(p[1], "asset ID"), { rationale: required(v.rationale, "--rationale"), revision });
    else if (command === "asset" && p[0] === "restore")
      done = restoreAsset(file, required(p[1], "asset ID"), { revision });
    else if (command === "asset" && p[0] === "retire")
      done = retireAsset(file, required(p[1], "asset ID"), { rationale: v.rationale, revision });
    else throw new Error(`Unknown ${command} command: ${p[0] ?? "(none)"}. Run help.`);
    result = { workspace: file, ...done };
  }
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
