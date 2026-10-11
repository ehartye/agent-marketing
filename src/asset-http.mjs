import { createReadStream, createWriteStream, mkdtempSync, rmSync, statSync } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { maxAssetBytes, resolveAssetFile } from "./assets.mjs";

// The HTTP side of collateral: handing a stored file to the page, and taking a file from it. Neither
// builds a path from the request. A file is found by looking the asset's ID up in the selected
// workspace and asking resolveAssetFile for it; an upload goes to a temporary file this module names
// itself and is handed to addAsset like any other file.

const cacheControl = "private, max-age=0, must-revalidate";
const fail = (status, message) => Object.assign(new Error(message), { status });

// Plain text and markdown are shown as text, never as a page. Everything else keeps its stored type.
const servedType = (mediaType) => (mediaType.startsWith("text/") ? "text/plain; charset=utf-8" : mediaType);

// A single `bytes=` range of a file of `size` bytes: { start, end } (inclusive), "unsatisfiable"
// for a range outside the file, or null when the header is absent, in another unit, asks for
// several ranges or is not valid (its end before its start), all of which are answered with the
// whole file (RFC 9110).
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start, end;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    if (m[2] !== "" && Number(m[2]) < start) return null;
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start >= size ? "unsatisfiable" : { start, end };
}

// The content hash when the record has one, else the size and modification time of the file.
const entityTag = (asset, stat) => `"${asset.sha256 ?? `${stat.size}-${stat.mtimeMs}`}"`;
const matches = (header, tag) =>
  String(header ?? "").split(",").map((t) => t.trim().replace(/^W\//, "")).some((t) => t === "*" || t === tag);

// Sends a file asset, or returns false when there is nothing to send (a link or text asset, a
// missing file, a record that points outside the assets folder). Supports If-None-Match and one
// byte range.
export async function serveAsset(req, res, workspaceFile, asset) {
  const path = resolveAssetFile(workspaceFile, asset);
  if (!path || !asset.mediaType) return false;
  const stat = statSync(path),
    size = stat.size,
    tag = entityTag(asset, stat),
    name = basename(asset.file).replace(/[^\w.-]/g, "_"),
    headers = {
      "Content-Type": servedType(asset.mediaType),
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": cacheControl,
      ETag: tag,
      "Accept-Ranges": "bytes",
      "Cross-Origin-Resource-Policy": "same-origin",
    };
  if (matches(req.headers["if-none-match"], tag)) {
    res.writeHead(304, { ETag: tag, "Cache-Control": cacheControl });
    res.end();
    return true;
  }
  const range = parseRange(req.headers.range, size);
  if (range === "unsatisfiable") {
    res.writeHead(416, { ...headers, "Content-Range": `bytes */${size}`, "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "That range is outside the file" }));
    return true;
  }
  const start = range?.start ?? 0,
    end = range?.end ?? size - 1;
  if (!size) {
    // Nothing to read: a stream over bytes 0 to -1 would never end.
    res.writeHead(200, { ...headers, "Content-Length": "0" });
    res.end();
    return true;
  }
  res.writeHead(range ? 206 : 200, {
    ...headers,
    "Content-Length": String(end - start + 1),
    ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
  });
  try {
    await pipeline(createReadStream(path, { start, end }), res);
  } catch {
    // The reader went away mid-stream, which is its right.
  }
  return true;
}

// Reads the request body into a temporary file, keeping nothing past the size limit. `filename`
// supplies only the extension, which the module checks against its list and against the file's
// content. A body that is over the limit is read to its end and thrown away, never stored, so the
// client gets the 413 instead of a broken connection; one that declares more than four times the
// limit is refused unread, and a body that runs past four times the limit is cut off.
// Returns { path, cleanup }.
export async function receiveUpload(req, res, filename, limit = maxAssetBytes) {
  const declared = Number(req.headers["content-length"]),
    message = `The upload is larger than the ${limit} byte limit${limit === maxAssetBytes ? ` (${limit / 1024 / 1024} MB)` : ""}`;
  if (Number.isFinite(declared) && declared > 4 * limit) {
    res.setHeader("Connection", "close");
    throw fail(413, message);
  }
  const extension = extname(basename(String(filename).replaceAll("\\", "/"))).toLowerCase(),
    directory = mkdtempSync(join(tmpdir(), "marketing-upload-")),
    path = join(directory, "upload" + (/^\.[a-z0-9]{1,12}$/.test(extension) ? extension : ""));
  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  let size = 0;
  const cap = new Transform({
    transform(chunk, _encoding, done) {
      size += chunk.length;
      if (size > 4 * limit) return done(fail(413, message));
      done(null, size > limit ? undefined : chunk);
    },
  });
  try {
    await pipeline(req, cap, createWriteStream(path, { flags: "wx" }));
    if (size > limit) throw fail(413, message);
  } catch (e) {
    cleanup();
    throw e;
  }
  return { path, cleanup };
}

// The name a person gave a file, less its folder and extension: the label a candidate gets when none is typed.
export const fileLabel = (filename) => {
  const name = basename(String(filename).replaceAll("\\", "/"));
  return name.slice(0, name.length - extname(name).length).trim() || "Upload";
};
