import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readWorkspace, importRecords } from "./store.mjs";
import { report, advise, plan, attention, localDate } from "./analysis.mjs";
import { decide, defer, setActionStatus, addAction, setGate, addUpdate, setInitiativeNote } from "./progress.mjs";
import { recommendChannels, channelLibrary } from "./channels.mjs";
import { parseImport, observationsCsv } from "./import.mjs";
import { monitor } from "./collectors.mjs";
import { readDocument } from "./documents.mjs";
import { workspaceCatalog, describeWorkspaces } from "./catalog.mjs";
async function body(req) {
  let size = 0,
    chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 2 * 1024 * 1024)
      throw new Error("Import exceeds 2 MB; split into smaller files");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
// What the progress routes accept. Each reads a JSON body into the arguments of a function in
// progress.mjs, refusing a value of the wrong type here and leaving the rest (unknown IDs, bad
// dates, impossible states) to that module and the schema, so the messages are theirs.
const text = (data, name, required = false) => {
  const value = data[name];
  if (value === undefined) {
    if (required) throw new Error(`Required: ${name}`);
    return undefined;
  }
  if (typeof value !== "string") throw new Error(`${name} must be text`);
  if (required && !value.trim()) throw new Error(`Required: ${name}`);
  return value;
};
const flag = (data, name) => {
  if (data[name] === undefined) return undefined;
  if (typeof data[name] !== "boolean") throw new Error(`${name} must be true or false`);
  return data[name];
};
// A number or, where allowed, null to clear the field.
const amount = (data, name, clearable = false) => {
  const value = data[name];
  if (value === undefined || (clearable && value === null)) return value;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
};
const date = (data, name, clearable = false) => {
  if (clearable && data[name] === null) return null;
  return text(data, name);
};
const ids = (data, name) => {
  const value = data[name];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${name} must be a list of text`);
  if (value.some((x) => typeof x !== "string")) throw new Error(`${name} must be a list of text`);
  return value;
};
const progressRoutes = {
  "/api/decide": (file, d) =>
    decide(file, text(d, "decisionId", true), {
      optionId: text(d, "chosen"),
      rationale: text(d, "rationale"),
      change: flag(d, "change"),
      revision: d.revision,
    }),
  "/api/defer": (file, d) =>
    defer(file, text(d, "decisionId", true), { until: text(d, "until"), note: text(d, "reason"), revision: d.revision }),
  "/api/action": (file, d) =>
    setActionStatus(file, text(d, "id", true), text(d, "status", true), { notes: text(d, "notes"), revision: d.revision }),
  "/api/action/add": (file, d) =>
    addAction(file, {
      id: text(d, "id", true),
      title: text(d, "title", true),
      owner: text(d, "owner"),
      status: text(d, "status"),
      due: text(d, "due"),
      hours: amount(d, "hours"),
      notes: text(d, "notes"),
      initiativeId: text(d, "initiativeId"),
      gateId: text(d, "gateId"),
      decisionId: text(d, "decisionId"),
      projectId: text(d, "projectId"),
      revision: d.revision,
    }),
  "/api/gate": (file, d) =>
    setGate(file, text(d, "id", true), {
      status: text(d, "status", true),
      note: text(d, "notes"),
      evidenceIds: ids(d, "evidenceIds"),
      due: date(d, "due", true),
      hours: amount(d, "hours", true),
      revision: d.revision,
    }),
  "/api/update": (file, d) =>
    addUpdate(file, {
      text: text(d, "text", true),
      kind: text(d, "kind"),
      initiativeId: text(d, "initiativeId"),
      refId: text(d, "refId"),
      projectId: text(d, "projectId"),
      revision: d.revision,
    }),
  "/api/initiative/note": (file, d) => {
    if (d.note === undefined) throw new Error("Required: note");
    return setInitiativeNote(file, text(d, "id", true), text(d, "note"), { revision: d.revision });
  },
};
export async function startServer(
  launchFile,
  { port = 4318, idleMs = 30 * 60 * 1000, catalog } = {},
) {
  let file = launchFile;
  readWorkspace(file);
  const entries = () => workspaceCatalog(launchFile, catalog);
  const currentId = () => entries().find((e) => e.path === resolve(file))?.id;
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Invalid port");
  if (!Number.isFinite(idleMs) || idleMs < 0) throw new Error("Invalid idle period");
  let address,
    collecting = false,
    idleTimer;
  // A forgotten desk stops itself. Any request, including the open page's
  // heartbeat, restarts the clock; an idle period of 0 disables it.
  const touch = () => {
    if (!idleMs) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      server.close();
      server.closeAllConnections?.();
    }, idleMs);
  };
  const server = createServer(async (req, res) => {
    touch();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    const send = (value, status = 200) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(value));
    };
    const hosts = [`127.0.0.1:${address.port}`, `localhost:${address.port}`];
    if (
      !hosts.includes(req.headers.host) ||
      (req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}`) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      send({ error: "This desk accepts local same-origin requests only" }, 403);
      return;
    }
    try {
      const u = new URL(req.url, `http://${req.headers.host}`),
        filter = {
          projectId: u.searchParams.get("projectId") || undefined,
          initiativeId: u.searchParams.get("initiativeId") || undefined,
          from: u.searchParams.get("from") || undefined,
          to: u.searchParams.get("to") || undefined,
        };
      if (req.method === "GET") {
        if (u.pathname === "/favicon.ico") {
          res.writeHead(204);
          return res.end();
        }
        // The one src module the page imports. It has no imports of its own; analysis.mjs, which
        // pulls in the advice code, is not served.
        if (u.pathname === "/chart-key.js") {
          res.writeHead(200, {
            "Content-Type": "text/javascript; charset=utf-8",
          });
          return res.end(
            readFileSync(new URL("./chart-key.mjs", import.meta.url)),
          );
        }
        if (u.pathname === "/api/ping") return send({ ok: true });
        if (u.pathname === "/api/workspace") return send(readWorkspace(file));
        if (u.pathname === "/api/workspaces")
          return send(describeWorkspaces(entries(), currentId()));
        if (u.pathname === "/api/document") {
          const saved = readDocument(readWorkspace(file), u.searchParams.get("kind"), u.searchParams.get("id"));
          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${saved.kind}-${saved.id}.md"`,
          });
          return res.end(saved.document.markdown);
        }
        if (u.pathname === "/api/report")
          return send(report(readWorkspace(file), filter));
        if (u.pathname === "/api/advise")
          return send(
            filter.projectId
              ? advise(readWorkspace(file), filter.projectId, filter)
              : [],
          );
        if (u.pathname === "/api/plan")
          return send(filter.projectId ? plan(readWorkspace(file), filter.projectId) : null);
        if (u.pathname === "/api/attention") {
          const projectId = filter.projectId || u.searchParams.get("project");
          return send(projectId ? attention(readWorkspace(file), projectId, u.searchParams.get("today") || localDate()) : null);
        }
        if (u.pathname === "/api/channels") {
          const p = readWorkspace(file).projects.find(
            (p) => p.id === filter.projectId,
          );
          return send(p ? recommendChannels(p) : channelLibrary);
        }
        if (u.pathname === "/api/references")
          return send(
            JSON.parse(
              readFileSync(
                new URL("../craft/references.json", import.meta.url),
              ),
            ),
          );
        if (u.pathname === "/api/export") {
          const w = readWorkspace(file),
            format = u.searchParams.get("format") || "json";
          if (!["json", "csv"].includes(format))
            throw new Error("Unknown export format");
          res.writeHead(200, {
            "Content-Type":
              format === "csv" ? "text/csv; charset=utf-8" : "application/json",
            "Content-Disposition": `attachment; filename="marketing-workspace.${format}"`,
          });
          return res.end(
            format === "csv"
              ? observationsCsv(w.observations)
              : JSON.stringify(w, null, 2),
          );
        }
        const assets = {
          "/": ["index.html", "text/html"],
          "/app.js": ["app.js", "text/javascript"],
          "/style.css": ["style.css", "text/css"],
          "/theme.js": ["theme.js", "text/javascript"],
          ...Object.fromEntries([
            "state.js", "shared.js", "chart.js", "documents.js", "markdown.js", "views/campaign.js",
            "views/reception.js", "views/research.js", "views/reports.js", "views/experiments.js", "views/results.js", "views/plan.js",
            "views/needs.js", "views/decisions.js", "views/actions.js", "views/timeline.js", "views/hierarchy.js", "views/hub.js",
          ].map(name => ["/" + name, [name, "text/javascript"]])),
        };
        if (assets[u.pathname]) {
          const [name, type] = assets[u.pathname];
          const content = readFileSync(new URL("../ui/" + name, import.meta.url));
          res.writeHead(200, { "Content-Type": type + "; charset=utf-8" });
          return res.end(content);
        }
      } else if (req.method === "POST") {
        if (req.headers["content-type"]?.split(";")[0] !== "application/json")
          return send({ error: "Use application/json" }, 415);
        const data = await body(req);
        if (u.pathname === "/api/workspace/select") {
          const chosen = entries().find((e) => e.id === data.id);
          if (!chosen) return send({ error: "Unknown workspace" }, 404);
          readWorkspace(chosen.path);
          file = chosen.path;
          return send(describeWorkspaces(entries(), chosen.id));
        }
        // A page names the workspace it is showing, so a tab left open on one
        // workspace cannot write into another after a switch.
        if (data.workspaceId !== undefined && data.workspaceId !== currentId())
          return send({ error: "Revision conflict: the desk switched workspace; reload" }, 409);
        if (!Number.isSafeInteger(data.revision))
          throw new Error("Current revision required; reload the workspace");
        if (u.pathname === "/api/record")
          return send(
            importRecords(
              file,
              { [data.collection]: [data.record] },
              data.revision,
              { strict: data.strict === true },
            ),
          );
        if (u.pathname === "/api/import")
          return send(
            importRecords(
              file,
              parseImport(data.text, data.format),
              data.revision,
              { strict: data.strict === true },
            ),
          );
        if (progressRoutes[u.pathname]) return send(progressRoutes[u.pathname](file, data));
        if (u.pathname === "/api/monitor") {
          if (collecting)
            return send({ error: "Collection already running" }, 409);
          if (data.revision !== readWorkspace(file).revision)
            return send({ error: "Revision conflict; reload" }, 409);
          collecting = true;
          try {
            return send(await monitor(file));
          } finally {
            collecting = false;
          }
        }
      }
      send({ error: "Route not found" }, 404);
    } catch (e) {
      send(
        { error: e.message },
        e.status || (/revision|\blocked\b/i.test(e.message) ? 409 : 400),
      );
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  address = server.address();
  const closed = new Promise((done) =>
    server.on("close", () => {
      clearTimeout(idleTimer);
      done();
    }),
  );
  touch();
  return { server, url: `http://127.0.0.1:${address.port}`, closed };
}
