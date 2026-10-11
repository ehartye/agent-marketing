import { $, esc } from "../shared.js";
import { setOpen, draftValue, clearDrafts, statusChip, gotoButton } from "../hub-shared.js";
import {
  assetMedia, assetThumb, fmtBytes, fmtDay, slotState, getLimits, loadLimits, newSlotId,
  resetCollateralView, setCollateralFilter, setInitiativeFocus, setUploadRows, uploadRows, patchUploadRow,
} from "./collateral.js";

// The lightbox where a slot's candidates are looked at, one at a time or two side by side at actual
// pixel size, and decided: pick, reject (with the reason), retire or restore. The dialog is a modal
// <dialog>, so the page behind it is inert and Escape closes it; the keys here add the arrows and a
// focus loop that stays inside it.

const view = { slotId: "", ids: [], mode: "single", zoom: 0, crisp: null, opener: "", note: "" };
const ZOOMS = [[0, "Fit"], [1, "1×"], [2, "2×"], [4, "4×"]];
const small = (a) => a.width && a.width <= 160 && a.height <= 160;
const dialog = () => $("lightbox");
export const viewerOpen = () => Boolean(dialog()?.open);

// Which candidates the viewer starts on. A slot with a pick shows the pick against its first rival;
// one without shows the first two candidates; a single asset shows just that.
export function startingIds(state, assetId, mode) {
  if (assetId && mode !== "compare") return [assetId];
  const pool = state.all.filter((a) => a.status === "selected" || a.status === "candidate");
  const first = assetId ?? pool[0]?.id;
  if (mode === "compare") {
    const second = pool.find((a) => a.id !== first);
    return [first, second?.id].filter(Boolean);
  }
  return first ? [first] : [];
}

// ---- The markup ----------------------------------------------------------------------------------

function facts(a) {
  const row = (name, value) => (value ? `<div><dt>${name}</dt><dd>${value}</dd></div>` : "");
  return `<dl class="lb-facts">
    ${row("Pixels", a.width ? `${a.width} × ${a.height}` : "")}
    ${row("File size", a.bytes ? esc(fmtBytes(a.bytes)) : a.kind === "text" ? `${a.text.length} characters` : "")}
    ${row("Type", esc(a.mediaType ?? (a.kind === "link" ? "link" : "text")))}
    ${row("Source", a.source ? esc(a.source) : "")}
    ${row("Added", a.createdAt ? esc(fmtDay(a.createdAt)) : "")}
    ${row(a.status === "selected" ? "Picked" : a.status === "rejected" ? "Rejected" : a.status === "retired" ? "Retired" : "", a.decidedAt && a.status !== "candidate" ? esc(fmtDay(a.decidedAt)) : "")}
    ${row("Reason", a.rationale ? esc(a.rationale) : "")}
  </dl>`;
}

export function decisionForm(a) {
  if (a.status === "rejected" || a.status === "retired")
    return `<div class="lb-actions"><p class="caption">${a.status === "rejected" ? "Rejected" : "Retired"}; it is kept for reference.</p><button type="button" data-asset-restore="${esc(a.id)}">Restore as a candidate</button></div>`;
  const key = "lb:" + a.id,
    picked = a.status === "selected";
  return `<form class="stack-form lb-decide" data-asset-decide="${esc(a.id)}">
    <label>${picked ? "Why this is the pick" : "Why"} <span class="optional">(saved with the decision; a reason is needed to reject)</span>
      <textarea name="rationale" rows="2" maxlength="1000" data-draft="${esc(key)}" placeholder="${picked ? "" : "What makes this one the right one, or the wrong one"}">${esc(draftValue(key) || (picked ? a.rationale ?? "" : ""))}</textarea></label>
    <div class="decide-buttons" role="group" aria-label="Decide on ${esc(a.label)}">
      ${picked ? '<button type="submit" value="pick">Save the reason</button>' : '<button type="submit" value="pick" class="primary">Pick this one</button>'}
      <button type="submit" value="reject">Reject</button>
      <button type="submit" value="retire">Retire</button>
    </div>
    <p class="caption lb-error" role="alert" data-lb-error="${esc(a.id)}"></p>
  </form>`;
}

function column(a, crisp) {
  return `<section class="lb-col ${esc(a.status)}" aria-label="${esc(a.label)}" data-lb-col="${esc(a.id)}">
    <h3>${esc(a.label)} ${statusChip(a.status)}</h3>
    <div class="lb-figure" tabindex="0" aria-label="${esc(a.label)}, scrollable">${assetMedia(a, { zoom: a.kind === "image" ? view.zoom : 0, crisp })}</div>
    ${facts(a)}
    ${decisionForm(a)}
  </section>`;
}

export function viewerHtml(workspace) {
  const slot = (workspace.assetSlots ?? []).find((s) => s.id === view.slotId);
  if (!slot) return "";
  const state = slotState(slot, workspace.assets ?? []),
    shown = view.ids.map((id) => state.all.find((a) => a.id === id)).filter(Boolean),
    anyImage = shown.some((a) => a.kind === "image"),
    d = slot.decisionId && (workspace.decisions ?? []).find((x) => x.id === slot.decisionId),
    crisp = view.crisp ?? shown.some(small),
    seg = (attr, pairs, on) => pairs.map(([value, label]) => `<button type="button" ${attr}="${value}" aria-pressed="${String(value) === String(on)}">${label}</button>`).join("");
  return `<div class="lb-head">
      <div><h2 id="lightbox-title">${esc(slot.name)}</h2>
        <p class="caption">${slot.spec ? `Spec: ${esc(slot.spec)} · ` : ""}${state.selected ? `Picked: ${esc(state.selected.label)}` : `${state.candidates.length} candidates, none picked`}${d ? ` · ${gotoButton("decision", d.id, "Decision history")}` : ""}</p></div>
      <button type="button" data-viewer-close>Close</button>
    </div>
    <div class="lb-tools">
      <div class="segmented" role="group" aria-label="Layout">${seg("data-lb-mode", [["single", "One at a time"], ["compare", "Side by side"]], view.mode)}</div>
      ${anyImage ? `<div class="segmented" role="group" aria-label="Image size">${seg("data-lb-zoom", ZOOMS, view.zoom)}</div>
      <label class="check"><input type="checkbox" data-lb-crisp ${crisp ? "checked" : ""} /> Keep pixels sharp <span class="optional">(pixel art)</span></label>` : ""}
    </div>
    <ul class="lb-strip" aria-label="Candidates in ${esc(slot.name)}">${state.all.map((a) => `<li><button type="button" class="lb-chip ${esc(a.status)}" data-lb-pick="${esc(a.id)}" aria-pressed="${view.ids.includes(a.id)}">${assetThumb(a)}<span class="lb-chip-text">${esc(a.label)}<span class="meta">${esc(a.status)}</span></span></button></li>`).join("")}</ul>
    <div class="lb-stage ${view.mode}">${shown.map((a) => column(a, crisp)).join("") || '<p class="empty">Nothing to show.</p>'}</div>
    <p id="lb-note" class="lb-note" role="status">${esc(view.note)}</p>
    <p class="caption lb-keys">Left and right arrows change the candidate${view.mode === "compare" ? " on the right" : ""}. Escape closes.</p>`;
}

export function renderViewer(snapshot) {
  if (!viewerOpen()) return;
  const slot = (snapshot.workspace.assetSlots ?? []).find((s) => s.id === view.slotId);
  if (!slot) return closeViewer();
  const state = slotState(slot, snapshot.workspace.assets ?? []);
  view.ids = view.ids.filter((id) => state.all.some((a) => a.id === id));
  if (!view.ids.length) view.ids = startingIds(state, undefined, view.mode);
  $("lightbox-inner").innerHTML = viewerHtml(snapshot.workspace);
}

export function closeViewer() {
  if (dialog()?.open) dialog().close();
}

// ---- Wiring --------------------------------------------------------------------------------------

const CAN_TYPE = "input, textarea, select";

export function bindCollateral({ root, write, upload, snapshot, save, setView, say, rerender, fetchJson, busy = () => false }) {
  const ws = () => snapshot().workspace,
    asset = (id) => (ws().assets ?? []).find((a) => a.id === id),
    slotName = (id) => (ws().assetSlots ?? []).find((s) => s.id === id)?.name ?? id,
    value = (form, name) => form.elements[name]?.value ?? "";
  const dlg = dialog();
  // What an action inside the lightbox did, said inside it: the page behind a modal dialog is inert.
  const note = (text) => {
    if (dlg.open) {
      view.note = text;
      const el = $("lb-note");
      if (el) el.textContent = text;
    }
    return text;
  };

  function open(slotId, assetId, mode, opener) {
    const slot = ws().assetSlots.find((s) => s.id === slotId);
    if (!slot) return;
    const state = slotState(slot, ws().assets ?? []);
    Object.assign(view, { note: "", slotId, mode: mode === "compare" && state.all.length > 1 ? "compare" : "single", ids: startingIds(state, assetId, mode === "compare" ? "compare" : "single"), opener: opener ?? "" });
    $("lightbox-inner").innerHTML = viewerHtml(ws());
    if (!dlg.open) dlg.showModal();
    dlg.querySelector("[data-viewer-close]")?.focus({ preventScroll: true });
  }
  function relayout(focus) {
    $("lightbox-inner").innerHTML = viewerHtml(ws());
    if (focus) dlg.querySelector(focus)?.focus({ preventScroll: true });
  }
  function showSlot(slotId) {
    resetCollateralView();
    setView("collateral");
    rerender();
    const card = document.querySelector(`[data-slot-card="${CSS.escape(slotId)}"]`);
    if (!card) return say("That slot is not shown for the current selection. Choose its project, or clear the initiative filter.");
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
    card.querySelector("h3")?.focus({ preventScroll: true });
    card.classList.remove("flash");
    void card.offsetWidth;
    card.classList.add("flash");
    card.addEventListener("animationend", () => card.classList.remove("flash"), { once: true });
  }

  // Step the candidate on show (the right-hand one when two are shown) through the slot's assets.
  function step(delta) {
    const slot = ws().assetSlots.find((s) => s.id === view.slotId);
    if (!slot) return;
    const all = slotState(slot, ws().assets ?? []).all,
      at = view.mode === "compare" && view.ids.length > 1 ? 1 : 0,
      others = new Set(view.ids.filter((_, n) => n !== at)),
      pool = all.filter((a) => !others.has(a.id));
    if (!pool.length) return;
    const now = pool.findIndex((a) => a.id === view.ids[at]);
    view.ids[at] = pool[(now + delta + pool.length) % pool.length].id;
    relayout(`[data-lb-pick="${CSS.escape(view.ids[at])}"]`);
  }

  // Only the final word on a file (added or refused) is announced, and in a region of its own: the list
  // it belongs to is redrawn on every progress tick and after the save, which would drop or repeat it.
  const announce = (text) => { const live = $("upload-live"); if (live) live.textContent = text; };
  async function sendFiles(slotId, files, form) {
    const list = [...files];
    if (!list.length) return;
    // A drop while another save runs would be lost without a word, and its rows with it.
    if (busy()) return say("The desk is busy saving or loading, so those files were not added. Drop or choose them again in a moment.", true);
    const limits = getLimits(),
      label = list.length === 1 ? (form.querySelector('[name="label"]')?.value ?? "").trim() : "",
      source = (form.querySelector('[name="source"]')?.value ?? "").trim(),
      rows = list.map((f) => ({ name: f.name, size: f.size, state: "waiting", fraction: 0 }));
    setUploadRows(slotId, rows);
    rerender();
    const drawRow = (n) => {
      const li = document.querySelector(`[data-upload-list="${CSS.escape(slotId)}"] [data-upload-row="${n}"]`);
      if (li) patchUploadRow(li, rows[n], slotId, n);
    };
    const settle = (n) => {
      const row = rows[n];
      announce(row.state === "added" ? `${row.name}: added.` : `${row.name}: refused. ${row.message ?? ""}`);
      drawRow(n);
    };
    const ran = await save(async () => {
      let revision = ws().revision, added = 0, stopped = false;
      for (const [n, file] of list.entries()) {
        const row = rows[n];
        if (stopped) { Object.assign(row, { state: "refused", message: "Not sent: the workspace changed." }); settle(n); continue; }
        if (!file.size) { Object.assign(row, { state: "refused", message: "The file is empty." }); settle(n); continue; }
        if (file.size > limits.maxBytes) { Object.assign(row, { state: "refused", message: `It is ${fmtBytes(file.size)}; the limit is ${fmtBytes(limits.maxBytes)}.` }); settle(n); continue; }
        Object.assign(row, { state: "sending", fraction: 0, message: "" });
        drawRow(n);
        try {
          const result = await upload({ slotId, revision, filename: file.name, label, source }, file, (fraction) => { row.fraction = fraction; drawRow(n); });
          revision = result.revision;
          added++;
          row.state = "added";
          for (const w of result.warnings ?? []) row.message = w;
        } catch (error) {
          Object.assign(row, { state: "refused", message: error.message });
          if (error.status === 409) stopped = true;
        }
        settle(n);
      }
      setUploadRows(slotId, rows.filter((r) => r.state !== "added"));
      clearDrafts(`up-label:${slotId}`);
      if (!added) throw new Error(`Nothing was added. ${rows.map((r) => `${r.name}: ${r.message}`).join(" ")}`);
      return { added, refused: rows.filter((r) => r.state === "refused") };
    }, ({ added, refused }) => `Added ${added} ${added === 1 ? "file" : "files"} to "${slotName(slotId)}".${refused.length ? ` Refused: ${refused.map((r) => `${r.name} (${r.message})`).join("; ")}` : ""}`,
    [`[data-slot-card="${CSS.escape(slotId)}"] [data-file-input]`, `[data-slot-card="${CSS.escape(slotId)}"] h3`], { retry: false });
    // The desk would not take the save at all: drop the rows that promised it, so none are left waiting.
    if (ran === false) { setUploadRows(slotId, []); rerender(); say("The files were not added: the desk could not take a save just now. Choose them again.", true); }
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const d = button.dataset;
    if (d.viewSlot) {
      const opener = d.viewAsset ? `[data-asset-card="${CSS.escape(d.viewAsset)}"] button` : `[data-slot-card="${CSS.escape(d.viewSlot)}"] [data-view-slot]`;
      open(d.viewSlot, d.viewAsset, d.viewMode, opener);
    } else if (d.collateralPick) showSlot(d.collateralPick);
    else if (d.collateralFor) {
      resetCollateralView();
      setInitiativeFocus(d.collateralFor);
      setView("collateral");
      rerender();
      $("collateral-heading").focus({ preventScroll: true });
      $("collateral").scrollIntoView({ block: "start" });
    } else if ("collateralClearFocus" in d) {
      setInitiativeFocus("");
      rerender();
      $("collateral-heading").focus({ preventScroll: true });
    } else if (d.collateralFilter) {
      setCollateralFilter(d.collateralFilter);
      rerender();
      document.querySelector(`[data-collateral-filter="${d.collateralFilter}"]`)?.focus({ preventScroll: true });
    } else if ("viewerClose" in d) closeViewer();
    else if (d.lbMode) {
      view.mode = d.lbMode;
      if (view.mode === "compare" && view.ids.length < 2) {
        const slot = ws().assetSlots.find((s) => s.id === view.slotId),
          state = slotState(slot, ws().assets ?? []);
        view.ids = startingIds(state, view.ids[0], "compare");
      } else if (view.mode === "single") view.ids = view.ids.slice(0, 1);
      relayout(`[data-lb-mode="${d.lbMode}"]`);
    } else if (d.lbZoom !== undefined) {
      view.zoom = Number(d.lbZoom);
      relayout(`[data-lb-zoom="${d.lbZoom}"]`);
    } else if (d.lbPick) {
      const id = d.lbPick;
      if (view.mode === "compare") {
        if (view.ids.includes(id)) { if (view.ids.length > 1) view.ids = view.ids.filter((x) => x !== id); }
        else view.ids = [...view.ids, id].slice(-2);
      } else view.ids = [id];
      relayout(`[data-lb-pick="${CSS.escape(id)}"]`);
    } else if (d.assetRestore) {
      const id = d.assetRestore, a = asset(id), inside = dlg.contains(button);
      save(() => write("/api/asset/restore", { assetId: id }),
        (r) => note(r.changed ? `Restored "${a?.label ?? id}" as a candidate in "${slotName(a?.slotId)}".` : "It was already a candidate."),
        [inside ? `#lightbox [data-lb-col="${CSS.escape(id)}"] textarea` : `[data-asset-card="${CSS.escape(id)}"] button`, "#collateral-heading"]);
    } else if (d.copyAsset) {
      const text = asset(d.copyAsset)?.text ?? "";
      const pre = button.closest(".copy-block")?.querySelector("pre");
      const fallback = () => {
        if (pre) { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
        say("The browser would not copy for you. The text is selected; press Ctrl+C.");
      };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => say("Copied the text."), fallback);
      else fallback();
    } else if (d.uploadDismiss) {
      const [slotId, n] = [d.uploadDismiss.slice(0, d.uploadDismiss.lastIndexOf(":")), Number(d.uploadDismiss.slice(d.uploadDismiss.lastIndexOf(":") + 1))];
      setUploadRows(slotId, uploadRows(slotId).filter((_, i) => i !== n));
      rerender();
    }
  });

  // A message about the field is stale the moment the field changes.
  root.addEventListener("input", (event) => {
    const error = event.target.closest?.("[data-asset-decide]")?.querySelector("[data-lb-error]");
    if (error?.textContent) error.textContent = "";
  });

  root.addEventListener("change", (event) => {
    const t = event.target;
    if (t.matches?.("[data-lb-crisp]")) { view.crisp = t.checked; relayout("[data-lb-crisp]"); }
    else if (t.matches?.("[data-file-input]")) {
      const files = [...t.files], slotId = t.dataset.fileInput, form = t.closest("[data-dropzone]");
      t.value = "";
      sendFiles(slotId, files, form);
    }
  });

  // A file dropped anywhere else would make the browser leave the desk for the file.
  const isFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes("Files");
  document.addEventListener("dragover", (event) => {
    if (!isFiles(event)) return;
    event.preventDefault();
    document.querySelectorAll(".dropzone.drag").forEach((el) => el.classList.remove("drag"));
    event.target.closest?.("[data-dropzone]")?.classList.add("drag");
  });
  document.addEventListener("dragleave", (event) => { event.target.closest?.("[data-dropzone]")?.classList.remove("drag"); });
  document.addEventListener("drop", (event) => {
    if (!isFiles(event)) return;
    event.preventDefault();
    const zone = event.target.closest?.("[data-dropzone]");
    document.querySelectorAll(".dropzone.drag").forEach((el) => el.classList.remove("drag"));
    if (zone) sendFiles(zone.dataset.dropzone, event.dataTransfer.files, zone);
  });

  root.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const d = form.dataset, handled = (run) => { event.preventDefault(); run(); };
    if (d.assetDecide) handled(() => {
      const id = d.assetDecide, verb = event.submitter?.value, a = asset(id), rationale = value(form, "rationale").trim();
      if (!verb || !a) return;
      const name = slotName(a.slotId), keep = `#lightbox [data-lb-col="${CSS.escape(id)}"] textarea`;
      if (verb === "reject" && !rationale) {
        const field = form.elements.rationale;
        form.querySelector("[data-lb-error]").textContent = "Say why it is rejected. The reason is kept with the asset.";
        field.focus();
        return;
      }
      const run = {
        pick: () => write("/api/asset/pick", { assetId: id, rationale: rationale || undefined }),
        reject: () => write("/api/asset/reject", { assetId: id, rationale }),
        retire: () => write("/api/asset/retire", { assetId: id, rationale: rationale || undefined }),
      }[verb];
      save(async () => {
        const result = await run();
        clearDrafts("lb:" + id);
        if (verb === "pick" && a.status !== "selected") closeViewer();
        return result;
      }, (r) => note((() => {
        if (!r.changed) return "Nothing changed; it was already so.";
        if (verb === "pick") return a.status === "selected" ? "Reason saved." : `Picked "${a.label}" for "${name}"${rationale ? "" : " (no reason recorded)"}. The decision is on the timeline.`;
        return verb === "reject" ? `Rejected "${a.label}". It is kept with your reason.` : `Retired "${a.label}". It is kept for reference.`;
      })()), verb === "pick" && a.status !== "selected" ? [`[data-slot-card="${CSS.escape(a.slotId)}"] h3`, "#collateral-heading"] : [keep, "#lightbox [data-viewer-close]"]);
    });
    else if (d.addLink !== undefined) handled(() => {
      const slotId = d.addLink;
      save(async () => {
        const result = await write("/api/asset/link", { slotId, label: value(form, "label").trim(), url: value(form, "url").trim() });
        clearDrafts(`link-label:${slotId}`, `link-url:${slotId}`);
        return result;
      }, (r) => `Added the link "${r.record.label}" to "${slotName(slotId)}".`, [`[data-slot-card="${CSS.escape(slotId)}"] [data-add-link] input`, "#collateral-heading"]);
    });
    else if (d.addText !== undefined) handled(() => {
      const slotId = d.addText;
      save(async () => {
        const result = await write("/api/asset/text", { slotId, label: value(form, "label").trim(), text: value(form, "text") });
        clearDrafts(`text-label:${slotId}`, `text-body:${slotId}`);
        return result;
      }, (r) => `Added the copy "${r.record.label}" to "${slotName(slotId)}".`, [`[data-slot-card="${CSS.escape(slotId)}"] [data-add-text] input`, "#collateral-heading"]);
    });
    else if (d.newSlot !== undefined) handled(() => {
      const name = value(form, "name").trim();
      if (!name) return;
      const data = { id: newSlotId(name, ws()), name, kind: value(form, "kind") };
      for (const key of ["spec", "initiativeId", "projectId"]) if (value(form, key).trim()) data[key] = value(form, key).trim();
      if (!data.projectId && snapshot().selection.projectId) data.projectId = snapshot().selection.projectId;
      save(async () => {
        const result = await write("/api/asset/slot", data);
        const scope = snapshot().selection.projectId || "all";
        clearDrafts(...["name", "spec", "kind", "projectId", "initiativeId"].map((n) => `new-slot:${scope}:${n}`));
        setOpen("new-slot", false);
        return result;
      }, `Added the slot "${name}". Add candidates to it, then pick one.`, [`[data-slot-card="${CSS.escape(data.id)}"] h3`, "#collateral-heading"]);
    });
  });

  // Keyboard inside the lightbox: arrows change the candidate (never while typing), Tab stays inside.
  dlg.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      const items = [...dlg.querySelectorAll("button, a[href], input, textarea, select, [tabindex='0']")].filter((el) => !el.disabled && el.checkVisibility?.() !== false);
      if (!items.length) return;
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dlg.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !event.target.closest?.(CAN_TYPE) && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      step(event.key === "ArrowRight" ? 1 : -1);
    }
  });
  dlg.addEventListener("click", (event) => { if (event.target === dlg) closeViewer(); });
  dlg.addEventListener("close", () => {
    const opener = view.opener;
    view.slotId = "";
    view.ids = [];
    if (opener) document.querySelector(opener)?.focus({ preventScroll: true });
  });
  loadLimits(fetchJson);
}
