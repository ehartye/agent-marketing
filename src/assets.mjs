import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  assetExtensions,
  assetKinds,
  assetPathProblem,
  maxAssetBytes,
  maxAssetText,
} from "./schema.mjs";
import { clock, find, log, same, settleDecision, write } from "./progress.mjs";

export { maxAssetBytes, maxAssetText };

// Collateral: slots to fill (a Steam capsule, a trailer, a store blurb) and the candidate assets for
// each. Picking one is a recorded decision, and the ones not picked are kept. Like src/progress.mjs,
// every command makes ONE locked write that also appends an `updates` entry (kind "asset") and
// returns { record, update, warnings, changed, revision }, plus `slot` (and, for a pick, `decision`):
// the other records it touched. Asking for what is already true writes nothing (`changed: false`).
//
// Files live beside the workspace in a folder named after it, hullgrown.json -> hullgrown.assets/,
// as <slotId>/<assetId>.<ext>. Adding copies the source file; no command ever moves or deletes a
// file in the assets folder except to undo its own copy when the ledger write fails.

const words = (list) => list.join(", ");

// The assets folder of a workspace file: the file name without .json, plus .assets.
export function assetsDir(workspacePath) {
  return resolve(workspacePath).replace(/\.json$/i, "") + ".assets";
}

// ---- Reading a file: media type, hash, size ------------------------------------------------------

const canonicalExtension = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/markdown": ".md",
};
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const latin = (b, from, to) => b.toString("latin1", from, to);

// The media type the first bytes of a file say it is, or undefined. Plain text has no signature, so
// a file with no NUL byte that is valid UTF-8 is "text/plain".
export function sniffMediaType(b) {
  if (b.length >= 8 && b.subarray(0, 8).equals(PNG)) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(latin(b, 0, 6))) return "image/gif";
  if (latin(b, 0, 4) === "RIFF" && latin(b, 8, 12) === "WEBP") return "image/webp";
  if (b.length >= 12 && latin(b, 4, 8) === "ftyp") return "video/mp4";
  if (b.length >= 4 && b.readUInt32BE(0) === 0x1a45dfa3 && b.subarray(0, 64).includes("webm")) return "video/webm";
  if (latin(b, 0, 5) === "%PDF-") return "application/pdf";
  if (b.includes(0)) return undefined;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(b);
    return "text/plain";
  } catch {
    return undefined;
  }
}

// Width and height from the header of a PNG, JPEG, WebP or GIF; {} for anything else or a header
// that is cut short. Small and exact on purpose: it reads a few bytes and decodes nothing.
export function imageSize(b, mediaType = sniffMediaType(b)) {
  const found = (width, height) => (Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 ? { width, height } : {});
  try {
    if (mediaType === "image/png") return latin(b, 12, 16) === "IHDR" ? found(b.readUInt32BE(16), b.readUInt32BE(20)) : {};
    if (mediaType === "image/gif") return found(b.readUInt16LE(6), b.readUInt16LE(8));
    if (mediaType === "image/webp") {
      const chunk = latin(b, 12, 16);
      if (chunk === "VP8X") return found(1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3));
      if (chunk === "VP8L" && b[20] === 0x2f) {
        const bits = b.readUInt32LE(21);
        return found(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff));
      }
      if (chunk === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)
        return found(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
      return {};
    }
    if (mediaType === "image/jpeg") {
      for (let at = 2; at + 9 < b.length; ) {
        if (b[at] !== 0xff) return {};
        const marker = b[at + 1];
        if (marker === 0xff) {
          at++;
          continue;
        }
        // Start-of-frame markers carry the size; C4, C8 and CC share the range but are not frames.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
          return found(b.readUInt16BE(at + 7), b.readUInt16BE(at + 5));
        at += 2 + b.readUInt16BE(at + 2);
      }
    }
  } catch {}
  return {};
}

// Reads a file to add: size limit, an allowed extension, content that agrees with the extension.
function readMedia(from) {
  const name = String(from);
  let stat;
  try {
    stat = statSync(name);
  } catch {
    throw new Error(`File "${name}" does not exist`);
  }
  if (!stat.isFile()) throw new Error(`"${name}" is not a file`);
  if (stat.size > maxAssetBytes)
    throw new Error(`"${name}" is ${stat.size} bytes; the limit is ${maxAssetBytes} bytes (${maxAssetBytes / 1024 / 1024} MB)`);
  const ext = extname(name).toLowerCase(),
    mediaType = assetExtensions[ext];
  if (!mediaType) throw new Error(`"${name}" has the extension "${ext}"; an asset must be one of ${words(Object.keys(assetExtensions))}`);
  const buffer = readFileSync(name);
  if (buffer.length > maxAssetBytes) throw new Error(`"${name}" is larger than ${maxAssetBytes} bytes`);
  if (!buffer.length) throw new Error(`"${name}" is empty`);
  const sniffed = sniffMediaType(buffer);
  if (!(sniffed === mediaType || (mediaType === "text/markdown" && sniffed === "text/plain")))
    throw new Error(`"${name}" says ${mediaType} by its extension, but its content looks like ${sniffed ?? "unrecognised data"}`);
  if (mediaType.startsWith("text/") && /^\s*<(\?xml|!doctype|html|svg|script|iframe)/i.test(buffer.toString("utf8", 0, 256)))
    throw new Error(`"${name}" is text that looks like markup (HTML or SVG); it is not accepted as an asset`);
  return {
    buffer,
    mediaType,
    extension: canonicalExtension[mediaType],
    kind: mediaType.startsWith("image/") ? "image" : mediaType.startsWith("video/") ? "video" : "document",
    sha256: createHash("sha256").update(buffer).digest("hex"),
    bytes: buffer.length,
    ...imageSize(buffer, mediaType),
  };
}

// ---- Serving a file safely -----------------------------------------------------------------------

// The absolute path of an asset's file, or null. It is returned only when the file exists, is a
// regular file and, once every symbolic link is resolved, is still inside the assets folder; a
// record whose path climbs out of it, or a link that leads out, is refused. A link or text asset
// has no file and gives null.
export function resolveAssetFile(workspacePath, asset) {
  if (!asset || typeof asset.file !== "string" || assetPathProblem(asset.file)) return null;
  try {
    const root = realpathSync.native(assetsDir(workspacePath)),
      real = realpathSync.native(resolve(root, ...asset.file.split("/"))),
      inside = relative(root, real);
    if (!inside || inside === ".." || inside.startsWith(".." + sep) || isAbsolute(inside)) return null;
    return statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

// ---- Reading the ledger --------------------------------------------------------------------------

// Assets in record order, optionally of one project, one slot or one status. Pure.
export function listAssets(w, { projectId, slotId, status } = {}) {
  return (w.assets ?? [])
    .filter((a) => (projectId === undefined || a.projectId === projectId) && (slotId === undefined || a.slotId === slotId) && (status === undefined || a.status === status))
    .map((a) => structuredClone(a));
}
export function listSlots(w, { projectId, slotId } = {}) {
  return (w.assetSlots ?? [])
    .filter((s) => (projectId === undefined || s.projectId === projectId) && (slotId === undefined || s.id === slotId))
    .map((s) => structuredClone(s));
}

// ---- Writing -------------------------------------------------------------------------------------

const quote = (s) => `"${s}"`;
function onlyProject(w, projectId, named) {
  projectId = projectId ?? named?.projectId;
  if (projectId) return projectId;
  if (w.projects.length !== 1)
    throw new Error(`The workspace has several projects (${words(w.projects.map((p) => p.id))}); name one with a project`);
  return w.projects[0].id;
}
const reason = (text) => (text ? ` (${text})` : "");

// A new slot to fill. Its project is the one named, or the project of the initiative, or the
// workspace's only project. An ID already in use is refused.
export function addSlot(file, { id, projectId, initiativeId, name, kind, spec, notes, revision, ...time } = {}) {
  const { at } = clock(time);
  if (!id) throw new Error("Required: id");
  if (!name) throw new Error("Required: name");
  if (!assetKinds.includes(kind)) throw new Error(`Slot kind must be one of ${words(assetKinds)}`);
  const problem = assetPathProblem(id);
  if (problem) throw new Error(`Slot ID "${id}" becomes a folder name and ${problem}`);
  return write(file, revision, (w) => {
    if (w.assetSlots.some((s) => s.id === id)) throw new Error(`Asset slot "${id}" already exists`);
    // Slots and assets are looked up by the same ID (asset pick takes either), and an ID is a file name.
    if (w.assets.some((a) => sameId(a.id, id))) throw new Error(`Slot ID "${id}" is already the ID of an asset (${w.assets.find((a) => sameId(a.id, id)).id}); choose another`);
    if (w.assetSlots.some((s) => sameId(s.id, id))) throw new Error(`Asset slot "${id}" differs from an existing slot only by letter case, which is the same folder on Windows; choose another`);
    const named = initiativeId && find(w, "initiatives", "Initiative", initiativeId);
    const record = { id, projectId: onlyProject(w, projectId, named), ...(initiativeId ? { initiativeId } : {}), name, kind };
    if (spec !== undefined) record.spec = spec;
    record.status = "open";
    if (notes !== undefined) record.notes = notes;
    w.assetSlots.push(record);
    const update = log(w, {
      projectId: record.projectId,
      initiativeId,
      kind: "asset",
      refId: id,
      text: `Added asset slot ${quote(name)} (${kind})`,
      at,
    });
    return { record: structuredClone(record), update };
  });
}

// IDs are file names, and on Windows a file name ignores case, so two IDs are the same when they
// differ only by case.
const sameId = (a, b) => a.toLowerCase() === b.toLowerCase();

// The first free ID for a new asset of a slot: <slot>-1, <slot>-2 ... It skips the ID of any asset or
// slot (they share one lookup), in any case, and any in `skip`, the IDs whose file turned out to exist.
function nextAssetId(w, slotId, skip = new Set()) {
  const taken = new Set([...w.assets.map((a) => a.id), ...w.assetSlots.map((s) => s.id), ...skip].map((id) => id.toLowerCase()));
  let n = w.assets.filter((a) => a.slotId === slotId).length + 1;
  while (taken.has(`${slotId}-${n}`.toLowerCase())) n++;
  return `${slotId}-${n}`;
}

// Takes a candidate into a slot: exactly one of `from` (a file to copy in), `url` (an https link,
// such as an artifact) or `text` (short copy). The file is copied before the ledger is written,
// and the copy is removed again if the ledger write fails; the original is never touched. The same
// content (sha256) twice in one slot is refused, naming the asset that already has it.
export function addAsset(file, { slotId, label, from, url, text, source, supersedes, id, revision, ...time } = {}) {
  const { at } = clock(time);
  if (!slotId) throw new Error("Required: slot");
  if (!label || !String(label).trim()) throw new Error("Required: label");
  if ([from, url, text].filter((x) => x !== undefined).length !== 1) throw new Error("Give exactly one of a file, a url or text");
  if (url !== undefined) {
    let ok = false;
    try {
      const u = new URL(url);
      ok = u.protocol === "https:" && !u.username && !u.password;
    } catch {}
    if (!ok) throw new Error(`A link asset needs an https URL without credentials, not "${url}"`);
  }
  if (text !== undefined && (!String(text).trim() || text.length > maxAssetText))
    throw new Error(`Text must be nonempty and at most ${maxAssetText} characters (it is ${text.length})`);
  if (id !== undefined && assetPathProblem(id)) throw new Error(`Asset ID "${id}" becomes a file name and ${assetPathProblem(id)}`);
  const media = from === undefined ? undefined : readMedia(from),
    dir = assetsDir(file);
  let copy;
  try {
    return write(file, revision, (w) => {
      const slot = find(w, "assetSlots", "Asset slot", slotId);
      if (id !== undefined && w.assets.some((a) => a.id === id)) throw new Error(`Asset "${id}" already exists`);
      if (id !== undefined && w.assets.some((a) => sameId(a.id, id)))
        throw new Error(`Asset "${id}" differs from the existing asset "${w.assets.find((a) => sameId(a.id, id)).id}" only by letter case, which is the same file name on Windows; choose another`);
      if (id !== undefined && w.assetSlots.some((s) => sameId(s.id, id)))
        throw new Error(`"${id}" is the ID of an asset slot; slots and assets share their IDs, so choose another`);
      if (supersedes !== undefined && w.assets.find((a) => a.id === supersedes)?.slotId !== slotId)
        throw new Error(`"${supersedes}" is not an asset in slot "${slotId}"`);
      if (media) {
        const twin = w.assets.find((a) => a.slotId === slotId && a.sha256 === media.sha256);
        if (twin) throw new Error(`Slot "${slotId}" already has this file as asset "${twin.id}" (${quote(twin.label)}, ${twin.status}); it was not added again`);
      }
      let assetId = id ?? nextAssetId(w, slotId);
      const record = { id: assetId, projectId: slot.projectId, slotId, label, kind: media?.kind ?? (url !== undefined ? "link" : "text") };
      if (media) {
        // A file already at the place this one would go is not the ledger's (the ledger would have an
        // asset there): a generated ID moves on to the next free one, a chosen ID is refused. Nothing is
        // ever overwritten.
        const tried = new Set();
        for (;;) {
          record.id = assetId;
          record.file = `${slotId}/${assetId}${media.extension}`;
          const problem = assetPathProblem(record.file);
          if (problem) throw new Error(`Slot "${slotId}" and asset "${assetId}" cannot make a file path: ${problem}`);
          try {
            copy = copyIn(dir, record.file, media.buffer);
            break;
          } catch (e) {
            if (e.code !== "EEXIST") throw e;
            if (id !== undefined)
              throw new Error(`A file named ${record.file} already exists in the assets folder although no asset uses it; move it away or choose another asset ID`);
            tried.add(assetId);
            assetId = nextAssetId(w, slotId, tried);
          }
        }
        Object.assign(record, { mediaType: media.mediaType, bytes: media.bytes, sha256: media.sha256 });
        if (media.width) Object.assign(record, { width: media.width, height: media.height });
      } else if (url !== undefined) record.url = url;
      else record.text = text;
      record.status = "candidate";
      if (source !== undefined) record.source = source;
      record.createdAt = at;
      if (supersedes !== undefined) record.supersedes = supersedes;
      w.assets.push(record);
      const warnings = [];
      if (record.kind !== "link" && record.kind !== slot.kind)
        warnings.push(`Asset "${assetId}" is ${record.kind} but slot ${quote(slot.name)} expects ${slot.kind}`);
      const update = log(w, {
        projectId: slot.projectId,
        initiativeId: slot.initiativeId,
        kind: "asset",
        refId: assetId,
        text: `Added candidate ${quote(label)} to ${quote(slot.name)}${source ? ` (${source})` : ""}`,
        at,
      });
      return { record: structuredClone(record), update, warnings, extra: { slot: structuredClone(slot) } };
    });
  } catch (e) {
    if (copy) undoCopy(dir, copy);
    throw e;
  }
}

// Writes the bytes to <dir>/<relative path>, refusing to replace a file that is already there.
// Returns what undoCopy needs to take it back out, including any folder this made.
function copyIn(dir, rel, buffer) {
  const target = join(dir, ...rel.split("/")),
    made = [];
  for (const folder of [dir, resolve(target, "..")]) {
    if (!existsSync(folder)) made.push(folder);
  }
  mkdirSync(resolve(target, ".."), { recursive: true });
  const fd = openSync(target, "wx");
  try {
    writeSync(fd, buffer);
  } finally {
    closeSync(fd);
  }
  return { target, made };
}
function undoCopy(dir, { target, made }) {
  try {
    unlinkSync(target);
  } catch {}
  // Folders this call created, innermost first, and only if nothing else has landed in them.
  for (const folder of made.toReversed())
    try {
      rmdirSync(folder);
    } catch {}
}

// When the selected asset of a slot stops being selected, the slot is open again.
function reopen(slot, asset) {
  if (slot.selectedAssetId !== asset.id) return false;
  slot.status = "open";
  delete slot.selectedAssetId;
  return true;
}

// Picks an asset for its slot: it becomes `selected`, the one it replaces goes back to `candidate`
// with a note, and the slot is `picked`. The pick is also a `decisions` record, "Pick <slot name>",
// with one option per asset of the slot; picking again changes that decision and keeps the earlier
// choice in its history, exactly as `decide --change` does. `target` is an asset ID, or the ID of
// a slot that has exactly one candidate. The rationale is optional.
export function pickAsset(file, target, { rationale, revision, ...time } = {}) {
  const { at } = clock(time);
  return write(file, revision, (w) => {
    let asset = w.assets.find((a) => a.id === target);
    if (!asset) {
      const named = w.assetSlots.find((s) => s.id === target);
      if (!named) throw Object.assign(new Error(`Asset "${target}" does not exist`), { status: 404 });
      if (named.status !== "open") {
        const held = w.assets.find((a) => a.id === named.selectedAssetId);
        throw new Error(`Slot "${named.id}" already has a pick (${quote(held?.label ?? named.selectedAssetId)}); name the asset to change it`);
      }
      const candidates = w.assets.filter((a) => a.slotId === named.id && a.status === "candidate");
      if (candidates.length !== 1)
        throw new Error(`Slot "${named.id}" has ${candidates.length} candidates${candidates.length ? ` (${words(candidates.map((a) => a.id))})` : ""}; name the asset to pick`);
      asset = candidates[0];
    }
    const slot = find(w, "assetSlots", "Asset slot", asset.slotId);
    if (asset.status === "retired") throw new Error(`Asset "${asset.id}" is retired; restore it before picking it`);
    const decision = slot.decisionId ? w.decisions.find((d) => d.id === slot.decisionId) : undefined;
    if (asset.status === "selected") {
      if (rationale === undefined || rationale === asset.rationale) return same(asset);
      asset.rationale = rationale;
      if (decision) decision.rationale = rationale;
      const update = log(w, {
        projectId: slot.projectId,
        initiativeId: slot.initiativeId,
        kind: "asset",
        refId: asset.id,
        text: `Updated why ${quote(asset.label)} is the pick for ${quote(slot.name)}: ${rationale}`,
        at,
      });
      return { record: structuredClone(asset), update, extra: { slot: structuredClone(slot), decision: decision && structuredClone(decision) } };
    }
    const own = w.assets.filter((a) => a.slotId === slot.id),
      previous = own.find((a) => a.status === "selected"),
      d = decision ?? newPickDecision(w, slot),
      before = d.status === "decided" ? own.find((a) => a.id === d.chosen)?.label ?? d.chosen : undefined,
      from = previous?.label ?? before;
    if (previous) {
      previous.status = "candidate";
      previous.rationale = `Replaced by ${quote(asset.label)}${previous.rationale ? ` (was picked: ${previous.rationale})` : ""}`;
      previous.decidedAt = at;
    }
    // A rejected asset that is picked after all keeps the reason it was turned down in the update.
    const wasRejected = asset.status === "rejected" && asset.rationale ? `; ${quote(asset.label)} was rejected: ${asset.rationale}` : "";
    asset.status = "selected";
    if (rationale) asset.rationale = rationale;
    else delete asset.rationale;
    asset.decidedAt = at;
    slot.status = "picked";
    slot.selectedAssetId = asset.id;
    slot.decisionId = d.id;
    // Every asset of the slot was in the running, so the decision lists them all.
    d.options = own.map((a) => ({ id: a.id, label: a.label, ...(a.source ? { summary: a.source } : {}) }));
    settleDecision(d, { optionId: asset.id, rationale, change: d.status === "decided", at });
    const update = log(w, {
      projectId: slot.projectId,
      initiativeId: slot.initiativeId,
      kind: "asset",
      refId: asset.id,
      text: `${from ? `Changed the pick for ${quote(slot.name)} from ${quote(from)} to ${quote(asset.label)}` : `Picked ${quote(asset.label)} for ${quote(slot.name)}`}${reason(rationale)}${wasRejected}`,
      at,
    });
    return { record: structuredClone(asset), update, extra: { slot: structuredClone(slot), decision: structuredClone(d) } };
  });
}

// The decision a slot's first pick settles. It is added to the workspace and the slot is not yet
// pointing at it; pickAsset does that.
function newPickDecision(w, slot) {
  const taken = new Set(w.decisions.map((d) => d.id));
  let id = `pick-${slot.id}`,
    n = 1;
  while (taken.has(id)) id = `pick-${slot.id}-${++n}`;
  const d = {
    id,
    projectId: slot.projectId,
    ...(slot.initiativeId ? { initiativeId: slot.initiativeId } : {}),
    title: `Pick ${slot.name}`,
    question: `Which candidate is the ${slot.name}?${slot.spec ? ` Spec: ${slot.spec}` : ""}`,
    status: "open",
    options: [],
  };
  w.decisions.push(d);
  return d;
}

// Turns an asset down, with the reason: it is kept, not deleted. Rejecting the selected asset
// opens its slot again; the slot's decision still records what had been chosen.
export function rejectAsset(file, assetId, { rationale, revision, ...time } = {}) {
  const { at } = clock(time);
  if (!rationale || !String(rationale).trim()) throw new Error("Required: rationale (why the asset is rejected)");
  return write(file, revision, (w) => {
    const a = find(w, "assets", "Asset", assetId),
      slot = find(w, "assetSlots", "Asset slot", a.slotId);
    if (a.status === "retired") throw new Error(`Asset "${a.id}" is retired; restore it first`);
    const again = a.status === "rejected";
    if (again && a.rationale === rationale) return same(a);
    const reopened = reopen(slot, a);
    a.status = "rejected";
    a.rationale = rationale;
    a.decidedAt = at;
    const update = log(w, {
      projectId: a.projectId,
      initiativeId: slot.initiativeId,
      kind: "asset",
      refId: a.id,
      text: `${again ? "Updated why" : "Rejected"} ${quote(a.label)}${again ? " was rejected" : ""} in ${quote(slot.name)}: ${rationale}${reopened ? `; ${quote(slot.name)} is open again` : ""}`,
      at,
    });
    return { record: structuredClone(a), update, extra: { slot: structuredClone(slot) } };
  });
}

// A rejected or retired asset becomes a candidate again; its old reason stays in the log.
export function restoreAsset(file, assetId, { revision, ...time } = {}) {
  const { at } = clock(time);
  return write(file, revision, (w) => {
    const a = find(w, "assets", "Asset", assetId),
      slot = find(w, "assetSlots", "Asset slot", a.slotId);
    if (a.status === "candidate" || a.status === "selected") return same(a);
    const was = `${a.status}${a.rationale ? `: ${a.rationale}` : ""}`;
    a.status = "candidate";
    delete a.rationale;
    delete a.decidedAt;
    const update = log(w, {
      projectId: a.projectId,
      initiativeId: slot.initiativeId,
      kind: "asset",
      refId: a.id,
      text: `Restored ${quote(a.label)} in ${quote(slot.name)} as a candidate (was ${was})`,
      at,
    });
    return { record: structuredClone(a), update, extra: { slot: structuredClone(slot) } };
  });
}

// Takes an asset out of the running without a verdict on it, for example once a newer version
// replaces it. Kept like the rest. Retiring the selected asset opens its slot again.
export function retireAsset(file, assetId, { rationale, revision, ...time } = {}) {
  const { at } = clock(time);
  return write(file, revision, (w) => {
    const a = find(w, "assets", "Asset", assetId),
      slot = find(w, "assetSlots", "Asset slot", a.slotId);
    const again = a.status === "retired";
    if (again && (!rationale || a.rationale === rationale)) return same(a);
    const reopened = reopen(slot, a);
    a.status = "retired";
    if (rationale) a.rationale = rationale;
    a.decidedAt = at;
    const update = log(w, {
      projectId: a.projectId,
      initiativeId: slot.initiativeId,
      kind: "asset",
      refId: a.id,
      text: again
        ? `Updated why ${quote(a.label)} was retired in ${quote(slot.name)}: ${rationale}`
        : `Retired ${quote(a.label)} in ${quote(slot.name)}${reason(rationale)}${reopened ? `; ${quote(slot.name)} is open again` : ""}`,
      at,
    });
    return { record: structuredClone(a), update, extra: { slot: structuredClone(slot) } };
  });
}
