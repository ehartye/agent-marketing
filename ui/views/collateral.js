import { $, esc, empty } from "../shared.js";
import { openAttr, draftAttr, draftValue, plural, statusChip, gotoButton, initiativeName, selectedIf } from "../hub-shared.js";
import { slug } from "./actions.js";

// Collateral: the places a finished asset goes (a store capsule, a trailer, a blurb), the candidates
// for each, and the one picked. The pick is a recorded decision, and what was not picked stays in
// view with the reason it was given. This module draws the tab; collateral-viewer.js draws the
// lightbox where candidates are compared and decided.

export const assetUrl = (id) => "/assets/" + encodeURIComponent(id);
export const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
export const fmtDay = (iso) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
export const dims = (a) => (a.width ? `${a.width}×${a.height}` : "");
const host = (url) => { try { return new URL(url).host; } catch { return ""; } };
const isHttps = (url) => /^https:\/\//i.test(String(url));

// What the add forms may take. The server owns the real list (GET /api/asset-limits); these are the
// same values until it answers, so the form never shows a blank.
const DEFAULT_LIMITS = {
  maxBytes: 50 * 1024 * 1024,
  maxText: 4000,
  extensions: { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".webm": "video/webm", ".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown", ".markdown": "text/markdown" },
  kinds: ["image", "video", "document", "text", "link"],
};
let limits = DEFAULT_LIMITS;
export const getLimits = () => limits;
export const setLimits = (value) => { limits = { ...DEFAULT_LIMITS, ...value }; };
export function limitsText(l = limits) {
  const names = (types) => [...new Set(Object.entries(l.extensions).filter(([, t]) => types.some((p) => t.startsWith(p))).map(([e]) => e.slice(1).toUpperCase()))];
  const MB = `${Math.round(l.maxBytes / 1048576)} MB`;
  return `Images (${names(["image/"]).join(", ")}), video (${names(["video/"]).join(", ")}), PDF and text (${names(["text/"]).join(", ")}) up to ${MB} each. SVG and HTML are not accepted. A file already in the slot is refused.`;
}

// ---- What is where -------------------------------------------------------------------------------

// The assets of a slot, the pick first, then the candidates in the order they arrived, then what was
// turned down, then what was retired.
export function slotState(slot, assets) {
  const own = assets.filter((a) => a.slotId === slot.id),
    by = (status) => own.filter((a) => a.status === status),
    selected = by("selected")[0] ?? null,
    candidates = by("candidate"),
    rejected = by("rejected"),
    retired = by("retired");
  return {
    selected,
    candidates,
    rejected,
    retired,
    all: [...(selected ? [selected] : []), ...candidates, ...rejected, ...retired],
    // An open slot with two or more live candidates is waiting for a choice; one candidate is nothing to choose.
    // A slot that waits on someone else (the artist, a render) is not asking the owner for anything yet.
    toPick: slot.status === "open" && candidates.length >= 2 && !slot.waitingOn,
  };
}

export function collateralCounts(workspace, initiativeIds = null, projectId = "") {
  const slots = (workspace.assetSlots ?? []).filter((s) => (!projectId || s.projectId === projectId) && (!initiativeIds || initiativeIds.has(s.initiativeId))),
    ids = new Set(slots.map((s) => s.id)),
    assets = (workspace.assets ?? []).filter((a) => ids.has(a.slotId));
  return {
    slots: slots.length,
    assets: assets.length,
    toPick: slots.filter((s) => slotState(s, assets).toPick).length,
    picked: slots.filter((s) => s.status === "picked").length,
    open: slots.filter((s) => s.status === "open").length,
  };
}

const descendants = (initiatives, id) => {
  const found = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const i of initiatives) if (i.parentId && found.has(i.parentId) && !found.has(i.id)) { found.add(i.id); grew = true; }
  }
  return found;
};

// ---- How a candidate looks -----------------------------------------------------------------------

const typeWord = (a) => (a.mediaType === "application/pdf" ? "PDF" : "text file");

// The asset itself. `zoom` shows an image at that many times its own pixels (0 fits it to the box);
// `crisp` keeps the pixels square instead of smoothing them.
export function assetMedia(a, { zoom = 0, crisp = false } = {}) {
  const url = assetUrl(a.id);
  if (a.kind === "image") {
    const size = a.width ? ` width="${a.width * (zoom || 1)}" height="${a.height * (zoom || 1)}"` : "",
      alt = `${a.label}${a.width ? `, ${a.width} by ${a.height} pixels` : ""}`;
    return `<img class="asset-img ${zoom ? "zoomed" : "fit"}${crisp ? " crisp" : ""}" src="${url}" alt="${esc(alt)}" loading="lazy" decoding="async"${size} />`;
  }
  if (a.kind === "video")
    return `<video class="asset-video" controls preload="metadata" playsinline src="${url}" aria-label="${esc(a.label)}">Your browser cannot play this video. <a href="${url}" target="_blank" rel="noopener noreferrer">Open the file in a new tab</a>.</video>`;
  if (a.kind === "text")
    return `<div class="copy-block"><pre class="copy-text" tabindex="0" aria-label="${esc(a.label)}">${esc(a.text)}</pre><button type="button" data-copy-asset="${esc(a.id)}">Copy text</button></div>`;
  if (a.kind === "link")
    return isHttps(a.url)
      ? `<p class="asset-link"><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.label)}<span class="sr-only"> (opens in a new tab)</span></a> <span class="meta">${esc(host(a.url))} <span aria-hidden="true">↗</span></span></p>`
      : `<p class="asset-link"><span>${esc(a.label)}</span> <span class="meta">${esc(a.url)}</span></p>`;
  return `<p class="asset-doc"><span class="doc-glyph" aria-hidden="true">▤</span> <a href="${url}" target="_blank" rel="noopener noreferrer">Open the ${typeWord(a)}<span class="sr-only"> ${esc(a.label)}</span> in a new tab</a> <span class="meta">${esc(fmtBytes(a.bytes ?? 0))}</span></p>`;
}

// The small picture of a candidate in a strip or the viewer's chooser.
export function assetThumb(a) {
  if (a.kind === "image") {
    const crisp = a.width && a.width <= 160 && a.height <= 160;
    return `<img class="thumb-img${crisp ? " crisp" : ""}" src="${assetUrl(a.id)}" alt="" loading="lazy" decoding="async" />`;
  }
  const glyph = { video: "▶", document: "▤", text: "“", link: "↗" }[a.kind] ?? "•",
    word = a.kind === "video" ? "video" : a.kind === "document" ? typeWord(a) : a.kind === "text" ? "copy" : host(a.url);
  const snippet = a.kind === "text" ? `<span class="thumb-snippet">${esc(a.text.slice(0, 90))}${a.text.length > 90 ? "…" : ""}</span>` : `<span class="thumb-word">${esc(word)}</span>`;
  return `<span class="thumb-box" aria-hidden="true"><span class="thumb-glyph">${glyph}</span>${snippet}</span>`;
}

const facts = (a) => [dims(a), a.bytes ? fmtBytes(a.bytes) : "", a.source ? `from ${a.source}` : ""].filter(Boolean).map(esc).join(" · ");

// ---- Module state: what the tab is showing -------------------------------------------------------

const FILTERS = [["all", "All"], ["pick", "To pick"], ["picked", "Picked"], ["open", "Open"]];
let filter = "all", initiativeFocus = "", limitsAsked = false;
const uploads = new Map();
export const collateralFilter = () => filter;
export const setCollateralFilter = (value) => { filter = value; };
export const setInitiativeFocus = (id) => { initiativeFocus = id; };
export function resetCollateralView() { filter = "all"; initiativeFocus = ""; }

// One row per file being sent into a slot: waiting, a fraction sent, added or refused.
export const uploadRows = (slotId) => uploads.get(slotId) ?? [];
export const setUploadRows = (slotId, rows) => { if (rows.length) uploads.set(slotId, rows); else uploads.delete(slotId); };

// The list is plain markup, not a live region: it changes on every progress tick and a screen reader would
// read each one. The few words that matter (added, refused) go to the page's one polite region instead.
function uploadList(slotId) {
  const rows = uploadRows(slotId);
  return `<ul class="upload-list" data-upload-list="${esc(slotId)}">${rows.map((r, n) => uploadRow(slotId, r, n)).join("")}</ul>`;
}
const uploadState = (r) => ({ waiting: "Waiting", sending: `Sending ${Math.round((r.fraction ?? 0) * 100)}%`, added: "Added", refused: "Refused" })[r.state] ?? r.state;
function uploadRowInner(slotId, r, n) {
  return `<span class="upload-name">${esc(r.name)}</span>
    <span class="meta">${esc(fmtBytes(r.size))}</span>
    ${r.state === "sending" ? `<progress max="1" value="${Number(r.fraction) || 0}" aria-label="Sending ${esc(r.name)}"></progress>` : ""}
    <span class="upload-state${r.state === "refused" ? " error" : ""}">${esc(uploadState(r))}</span>
    ${r.message ? `<span class="upload-why">${esc(r.message)}</span>` : ""}
    ${r.state === "refused" ? `<button type="button" class="link-button" data-upload-dismiss="${esc(slotId)}:${n}">Dismiss</button>` : ""}`;
}
export function uploadRow(slotId, r, n) {
  return `<li class="upload-row ${esc(r.state)}" data-upload-row="${n}" data-state="${esc(r.state)}">${uploadRowInner(slotId, r, n)}</li>`;
}
// Brings a row already on the page up to date. Between two ticks only the bar and its words change, so
// nothing is replaced and focus stays where it was; a change of state (sending, added, refused) redraws
// that one row.
export function patchUploadRow(li, r, slotId, n) {
  if (li.dataset.state !== r.state) {
    li.className = `upload-row ${r.state}`;
    li.dataset.state = r.state;
    li.innerHTML = uploadRowInner(slotId, r, n);
    return;
  }
  const bar = li.querySelector("progress"), words = li.querySelector(".upload-state");
  if (bar) bar.value = Number(r.fraction) || 0;
  if (words) words.textContent = uploadState(r);
}

// ---- A slot --------------------------------------------------------------------------------------

function alternate(a) {
  const why = a.rationale ? `<p class="alt-why">${esc(a.rationale)}</p>` : a.status === "candidate" ? "" : '<p class="alt-why none">No reason was recorded.</p>';
  return `<li class="alt ${esc(a.status)}" data-asset-card="${esc(a.id)}" tabindex="-1">
    <button type="button" class="alt-open" data-view-slot="${esc(a.slotId)}" data-view-asset="${esc(a.id)}" aria-label="View ${esc(a.label)} (${esc(a.status)})">${assetThumb(a)}</button>
    <div class="alt-text">
      <strong>${esc(a.label)}</strong>
      <span class="chips">${statusChip(a.status)}<span class="meta">${facts(a)}</span></span>
      ${why}
      ${a.status === "rejected" || a.status === "retired" ? `<button type="button" class="restore" data-asset-restore="${esc(a.id)}" aria-label="Restore ${esc(a.label)} as a candidate">Restore</button>` : ""}
    </div>
  </li>`;
}

function pickedBlock(slot, state, workspace) {
  const a = state.selected,
    d = slot.decisionId && (workspace.decisions ?? []).find((x) => x.id === slot.decisionId),
    label = (id) => (d?.options ?? []).find((o) => o.id === id)?.label ?? id,
    history = d?.history?.length
      ? `<details class="earlier" ${openAttr("earlier:" + slot.id)}><summary>Earlier picks (${d.history.length})</summary><ol>${d.history.toReversed().map((h) => `<li>${esc(label(h.chosen))} <span class="meta">${esc(fmtDay(h.decidedAt))}</span>${h.rationale ? ` — ${esc(h.rationale)}` : ""}</li>`).join("")}</ol></details>`
      : "";
  return `<div class="pick-block" data-asset-card="${esc(a.id)}" tabindex="-1">
    <div class="picked-media">${assetMedia(a, { crisp: a.width && a.width <= 160 && a.height <= 160 })}</div>
    <div class="picked-text">
      <p class="picked-name"><strong>${esc(a.label)}</strong> ${statusChip("selected")}</p>
      <p class="caption">${facts(a)}</p>
      <p class="verdict-line">Picked ${esc(fmtDay(a.decidedAt))} — ${a.rationale ? esc(a.rationale) : '<span class="muted">no reason recorded</span>'}</p>
      ${history}
      <p class="picked-actions"><button type="button" data-view-slot="${esc(slot.id)}" data-view-asset="${esc(a.id)}"${state.candidates.length ? ' data-view-mode="compare"' : ""}>${state.candidates.length ? "Compare or change the pick" : "View at full size"}</button>
        ${d ? gotoButton("decision", d.id, "Decision history") : ""}</p>
    </div>
  </div>`;
}

function callToAction(slot, state) {
  if (state.selected) return "";
  const n = state.candidates.length;
  // Waiting on someone: say on whom, and still let the owner look at what is there and pick early.
  if (slot.waitingOn) {
    const look = n >= 2
      ? `<button type="button" data-view-slot="${esc(slot.id)}" data-view-mode="compare">Compare ${n} anyway</button>`
      : n === 1 ? `<button type="button" data-view-slot="${esc(slot.id)}" data-view-asset="${esc(state.candidates[0].id)}">Review it</button>` : "";
    return `<div class="pick-cta quiet waiting-cta"><p><strong>Waiting on:</strong> ${esc(slot.waitingOn)}${n ? ` · ${plural(n, "candidate")} so far` : ""}</p>${look}</div>`;
  }
  if (n >= 2)
    return `<div class="pick-cta"><p><strong>Pick one.</strong> ${plural(n, "candidate")} waiting for a choice.</p><button type="button" class="primary" data-view-slot="${esc(slot.id)}" data-view-mode="compare">Compare ${n} and pick</button></div>`;
  if (n === 1)
    return `<div class="pick-cta quiet"><p>One candidate so far. Add another to compare, or pick this one.</p><button type="button" data-view-slot="${esc(slot.id)}" data-view-asset="${esc(state.candidates[0].id)}">Review and pick it</button></div>`;
  return '<div class="pick-cta quiet"><p>No candidates yet. Add a file, a link or some copy below.</p></div>';
}

function addForms(slot) {
  const id = slot.id,
    key = (name) => `${name}:${id}`,
    field = (label, name, draft, extra = "") => `<label>${label}<input name="${name}" ${extra} ${draftAttr(key(draft))} value="${esc(draftValue(key(draft)))}" /></label>`;
  return `<details class="add-asset" ${openAttr("add:" + id)}><summary>Add a candidate</summary>
    <div class="add-grid">
      <div class="dropzone" data-dropzone="${esc(id)}">
        <p><strong>Files.</strong> Drop them here or choose them. They are copied into this workspace's assets folder.</p>
        <label>Choose files<input type="file" multiple data-file-input="${esc(id)}" accept="${esc(Object.keys(limits.extensions).join(","))}" /></label>
        <div class="form-row">
          ${field("Label <span class=\"optional\">(one file; otherwise each file's name)</span>", "label", "up-label", 'maxlength="120"')}
          ${field('Source <span class="optional">(optional)</span>', "source", "up-source", 'maxlength="200"')}
        </div>
        <p class="caption" data-asset-limits>${esc(limitsText())}</p>
        ${uploadList(id)}
      </div>
      <form class="stack-form" data-add-link="${esc(id)}">
        <p><strong>A link.</strong> An artifact, a Figma file, a store page: any https address.</p>
        <label>Label<input name="label" required maxlength="120" ${draftAttr(key("link-label"))} value="${esc(draftValue(key("link-label")))}" /></label>
        <label>Address<input name="url" type="url" required placeholder="https://" ${draftAttr(key("link-url"))} value="${esc(draftValue(key("link-url")))}" /></label>
        <button type="submit">Add link</button>
      </form>
      <form class="stack-form" data-add-text="${esc(id)}">
        <p><strong>Copy.</strong> A blurb, a tagline or a title variant.</p>
        <label>Label<input name="label" required maxlength="120" ${draftAttr(key("text-label"))} value="${esc(draftValue(key("text-label")))}" /></label>
        <label>Text <span class="optional">(up to ${Number(limits.maxText) || 4000} characters)</span><textarea name="text" rows="3" required maxlength="${Number(limits.maxText) || 4000}" ${draftAttr(key("text-body"))}>${esc(draftValue(key("text-body")))}</textarea></label>
        <button type="submit">Add copy variant</button>
      </form>
    </div>
  </details>`;
}

export function slotCard(slot, { workspace, showProject }) {
  const state = slotState(slot, workspace.assets ?? []),
    initiative = slot.initiativeId && workspace.initiatives.find((i) => i.id === slot.initiativeId),
    others = state.all.filter((a) => a !== state.selected);
  return `<article class="slot-card ${state.toPick ? "to-pick" : esc(slot.status)}" data-slot-card="${esc(slot.id)}" aria-labelledby="slot-h-${esc(slot.id)}">
    <div class="slot-head">
      <div>
        <h3 id="slot-h-${esc(slot.id)}" tabindex="-1">${esc(slot.name)}</h3>
        <p class="chips"><span class="pill">${esc(slot.kind)}</span>${state.toPick ? '<span class="pill due soon"><span aria-hidden="true">!</span> to pick</span>' : statusChip(slot.status)}${slot.waitingOn && !state.selected ? '<span class="pill due none">waiting</span>' : ""}${showProject ? `<span class="meta">${esc(workspace.projects.find((p) => p.id === slot.projectId)?.name ?? slot.projectId)}</span>` : ""}${initiative ? `<span class="meta">for ${gotoButton("initiative", initiative.id, initiative.name)}</span>` : ""}</p>
      </div>
      ${slot.spec ? `<p class="spec"><span class="label">Spec</span>${esc(slot.spec)}</p>` : ""}
    </div>
    ${state.selected ? pickedBlock(slot, state, workspace) : callToAction(slot, state)}
    ${others.length ? `<div class="alternates"><h4>${state.selected ? "Alternates and rejects" : "Candidates"} <span class="count">${others.length}</span></h4><ul class="alt-list">${others.map(alternate).join("")}</ul></div>` : ""}
    ${slot.notes ? `<p class="caption">${esc(slot.notes)}</p>` : ""}
    ${addForms(slot)}
  </article>`;
}

// ---- The new slot form ---------------------------------------------------------------------------

export function newSlotForm({ workspace, selection }) {
  const project = selection.projectId || (workspace.projects.length === 1 ? workspace.projects[0].id : ""),
    initiatives = workspace.initiatives.filter((i) => !project || i.projectId === project),
    // Drafts belong to the view the form is in, so a name typed for one project is not offered to another.
    key = (n) => `new-slot:${selection.projectId || "all"}:${n}`,
    chosen = (name, allowed, fallback = "") => (allowed.includes(draftValue(key(name))) ? draftValue(key(name)) : fallback),
    kind = chosen("kind", limits.kinds, limits.kinds[0]),
    projectChoice = chosen("projectId", workspace.projects.map((p) => p.id)),
    initiative = chosen("initiativeId", initiatives.map((i) => i.id));
  return `<details class="new-slot" ${openAttr("new-slot", !(workspace.assetSlots ?? []).length)}><summary>New slot</summary>
    <form class="stack-form" data-new-slot>
      <p class="caption">A slot is a place a finished asset goes. Add candidates to it, then pick one.</p>
      <div class="form-row">
        <label>Name<input name="name" required maxlength="120" placeholder="Steam main capsule" ${draftAttr(key("name"))} value="${esc(draftValue(key("name")))}" /></label>
        <label>Kind<select name="kind" ${draftAttr(key("kind"))}>${limits.kinds.map((k) => `<option value="${esc(k)}"${selectedIf(k, kind)}>${esc(k)}</option>`).join("")}</select></label>
      </div>
      <label>Spec <span class="optional">(size, format, length)</span><input name="spec" maxlength="300" placeholder="1232×706 PNG" ${draftAttr(key("spec"))} value="${esc(draftValue(key("spec")))}" /></label>
      <div class="form-row">
        ${project ? "" : `<label>Project<select name="projectId" required ${draftAttr(key("projectId"))}><option value="">Choose…</option>${workspace.projects.map((p) => `<option value="${esc(p.id)}"${selectedIf(p.id, projectChoice)}>${esc(p.name)}</option>`).join("")}</select></label>`}
        <label>Initiative <span class="optional">(optional)</span><select name="initiativeId" ${draftAttr(key("initiativeId"))}><option value=""${selectedIf("", initiative)}>None</option>${initiatives.map((i) => `<option value="${esc(i.id)}"${selectedIf(i.id, initiative)}>${esc(i.name)}</option>`).join("")}</select></label>
      </div>
      <button type="submit" class="primary">Add the slot</button>
    </form>
  </details>`;
}

// ---- The tab -------------------------------------------------------------------------------------

export function visibleSlots(workspace, selection, focusId = initiativeFocus) {
  const initiatives = workspace.initiatives,
    within = selection.initiativeId ? descendants(initiatives, selection.initiativeId) : null,
    focused = focusId ? descendants(initiatives, focusId) : null;
  return (workspace.assetSlots ?? [])
    .filter((s) => (!selection.projectId || s.projectId === selection.projectId) && (!within || within.has(s.initiativeId)) && (!focused || focused.has(s.initiativeId)));
}

export function slotOrder(slots, assets) {
  const rank = (s) => (slotState(s, assets).toPick ? 0 : s.status === "open" ? 1 : 2);
  return slots.toSorted((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export const slotMatches = (slot, assets, by) => {
  const toPick = slotState(slot, assets).toPick;
  return by === "all" || (by === "pick" && toPick) || (by === "picked" && slot.status === "picked") || (by === "open" && slot.status === "open" && !toPick);
};

// Every asset in the slots counts, whether it is a candidate, the pick, a reject or retired, so the line
// says "assets" and not "candidates".
export const collateralSummary = (c) => `${plural(c.slots, "slot")} · ${c.toPick} to pick · ${c.picked} picked · ${plural(c.assets, "asset")} in all`;

export function renderCollateral({ workspace, selection }) {
  const assets = workspace.assets ?? [],
    slots = visibleSlots(workspace, selection),
    counts = collateralCounts({ assetSlots: slots, assets }),
    filterCounts = Object.fromEntries(FILTERS.map(([key]) => [key, slots.filter((s) => slotMatches(s, assets, key)).length]));
  if (filter !== "all" && !filterCounts[filter]) filter = "all";
  $("collateral-summary").textContent = slots.length
    ? collateralSummary(counts)
    : "";
  $("collateral-filters").innerHTML = FILTERS.map(([key, label]) => `<button type="button" data-collateral-filter="${key}" aria-pressed="${key === filter}">${label} <span class="count">${filterCounts[key]}</span></button>`).join("");
  $("collateral-focus").innerHTML = initiativeFocus
    ? `<p class="focus-chip">Showing the collateral for <strong>${esc(initiativeName(workspace, initiativeFocus))}</strong> and its parts. <button type="button" class="link-button" data-collateral-clear-focus>Show all</button></p>`
    : "";
  $("collateral-new").innerHTML = newSlotForm({ workspace, selection });
  const shown = slotOrder(slots.filter((s) => slotMatches(s, assets, filter)), assets);
  $("collateral-body").innerHTML = shown.length
    ? shown.map((s) => slotCard(s, { workspace, showProject: !selection.projectId })).join("")
    : empty(slots.length ? `No slots are ${filter === "pick" ? "waiting for a pick" : filter}.` : "No collateral slots here yet. A slot is a place a finished asset goes, such as a store capsule, a trailer or a blurb. Add one below, or ask the agent to set them up from the game's launch plan.");
}

// Asks the desk for the limits once; the form's hint is rewritten when they arrive, so it never
// says a number the server does not hold.
export async function loadLimits(fetchJson) {
  if (limitsAsked) return;
  limitsAsked = true;
  try {
    setLimits(await fetchJson("/api/asset-limits"));
    for (const el of document.querySelectorAll("[data-asset-limits]")) el.textContent = limitsText();
    for (const el of document.querySelectorAll("[data-file-input]")) el.accept = Object.keys(limits.extensions).join(",");
  } catch {
    limitsAsked = false;
  }
}

export const newSlotId = (name, workspace) => slug(name, new Set((workspace.assetSlots ?? []).map((s) => s.id))).replace(/^action$/, "slot");

// A new workspace has none of the files that were being sent to the last one.
export const clearUploads = () => { uploads.clear(); };
