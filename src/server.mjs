import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readWorkspace, importRecords } from "./store.mjs";
import { report, advise } from "./analysis.mjs";
import { recommendChannels, channelLibrary } from "./channels.mjs";
import { parseImport, observationsCsv } from "./import.mjs";
import { monitor } from "./collectors.mjs";
import { readDocument } from "./documents.mjs";
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
export async function startServer(file, { port = 4318 } = {}) {
  readWorkspace(file);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Invalid port");
  let address,
    collecting = false;
  const server = createServer(async (req, res) => {
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
        if (u.pathname === "/analysis.js") {
          res.writeHead(200, {
            "Content-Type": "text/javascript; charset=utf-8",
          });
          return res.end(
            readFileSync(new URL("./analysis.mjs", import.meta.url)),
          );
        }
        if (u.pathname === "/api/workspace") return send(readWorkspace(file));
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
          ...Object.fromEntries([
            "state.js", "shared.js", "chart.js", "documents.js", "markdown.js", "views/campaign.js",
            "views/reception.js", "views/research.js", "views/reports.js", "views/experiments.js", "views/results.js",
          ].map(name => ["/" + name, [name, "text/javascript"]])),
        };
        if (assets[u.pathname]) {
          const [name, type] = assets[u.pathname];
          res.writeHead(200, { "Content-Type": type + "; charset=utf-8" });
          return res.end(
            readFileSync(new URL("../ui/" + name, import.meta.url)),
          );
        }
      } else if (req.method === "POST") {
        if (req.headers["content-type"]?.split(";")[0] !== "application/json")
          return send({ error: "Use application/json" }, 415);
        const data = await body(req);
        if (!Number.isSafeInteger(data.revision))
          throw new Error("Current revision required; reload the workspace");
        if (u.pathname === "/api/record")
          return send(
            importRecords(
              file,
              { [data.collection]: [data.record] },
              data.revision,
            ),
          );
        if (u.pathname === "/api/import")
          return send(
            importRecords(
              file,
              parseImport(data.text, data.format),
              data.revision,
            ),
          );
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
        e.status || (/revision|locked/i.test(e.message) ? 409 : 400),
      );
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}
