import { $ } from "../shared.js";
import { setOpen, setDraft, clearDrafts, localDay, isShown, resetHubState } from "../hub-shared.js";
import { renderNeeds, toggleNeedGroup, resetNeeds } from "./needs.js";
import { renderDecisions, setDecisionFilter, showAllOpen, changeRefusal, markActed, resetDecisionView } from "./decisions.js";
import { renderActions, slug } from "./actions.js";
import { renderTimeline, resetTimeline, showMoreTimeline } from "./timeline.js";
import { renderHierarchy, treeOrder, subtreeIds } from "./hierarchy.js";
import { resetCollateralView, clearUploads } from "./collateral.js";

// The progress half of Decide & plan: what needs the owner, decisions, actions, the timeline and
// the initiative hierarchy. renderHub draws them from one snapshot; bindHub wires the controls to
// the progress routes. A write goes through the desk's own `save`, which refreshes the page,
// announces the result and puts focus back.

let scheduleJump = () => {};

export function renderHub(snapshot) {
  const { workspace, selection, attention, attentions, plans, plan } = snapshot,
    today = attention?.today ?? Object.values(attentions ?? {})[0]?.today ?? localDay(new Date()),
    within = selection.initiativeId ? subtreeIds(workspace.initiatives, selection.initiativeId) : null,
    inScope = (r) => (!selection.projectId || r.projectId === selection.projectId) && (!within || within.has(r.initiativeId)),
    orderedInitiatives = treeOrder(workspace.initiatives.filter((i) => !selection.projectId || i.projectId === selection.projectId), selection.initiativeId),
    ctx = { workspace, selection, attention, attentions, plans, plan, inScope, orderedInitiatives, today };
  renderNeeds(ctx);
  renderDecisions(ctx);
  renderActions(ctx);
  renderTimeline(ctx);
  renderHierarchy(ctx);
  // The jump bar says how much is in each section it points at.
  const counts = {
    needs: Object.values(attentions ?? {}).reduce((n, a) => n + (a?.summary?.total ?? 0), 0),
    decisions: workspace.decisions.filter((d) => inScope(d) && d.status === "open").length,
    actions: workspace.actions.filter((a) => inScope(a) && ["todo", "doing", "blocked"].includes(a.status)).length,
  };
  for (const [name, n] of Object.entries(counts)) {
    const badge = $("jump-" + name);
    if (badge) badge.textContent = n ? String(n) : "";
  }
  scheduleJump();
}

// A different workspace is a different set of records: nothing half typed, left open, expanded or
// being sent carries over from the last one. (Where a section is folded is the owner's own layout
// choice, kept in this browser, and is not part of that.)
export function resetDeskState() {
  resetHubState();
  resetNeeds();
  resetTimeline();
  resetDecisionView();
  resetCollateralView();
  clearUploads();
}

const TAB = { decision: "campaign", action: "campaign", gate: "campaign", initiative: "campaign", report: "market", slot: "collateral", asset: "collateral" };
const find = (kind, id) => {
  const q = CSS.escape(id);
  return document.querySelector({
    decision: `[data-decision="${q}"]`,
    action: `[data-action="${q}"]`,
    gate: `[data-gate="${q}"]`,
    initiative: `[data-initiative-card="${q}"]`,
    report: `[data-report="${q}"]`,
    slot: `[data-slot-card="${q}"]`,
    asset: `[data-asset-card="${q}"]`,
  }[kind]);
};
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// A record may sit inside a section the owner has folded; a jump opens what hides it.
function openFolds(el) {
  for (let fold = el.parentElement?.closest("details"); fold; fold = fold.parentElement?.closest("details"))
    if (!fold.open) {
      fold.open = true;
      if (fold.dataset.key) setOpen(fold.dataset.key, true);
    }
}

// The sections of the Decide & plan tab, in page order: what the jump bar points at.
export const SECTIONS = ["needs", "decisions", "actions", "timeline", "initiatives", "plan-details"];

// A sticky bar of links to the sections, with the section being read marked. It scrolls to a section
// itself (the address bar keeps the tab's own #campaign) and opens a section that was folded.
function bindJumpbar() {
  const bar = $("jumpbar");
  if (!bar) return;
  const links = [...bar.querySelectorAll("a[data-jump]")];
  let queued = false;
  function mark(current) {
    for (const link of links) {
      if (link.dataset.jump === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }
  function update() {
    queued = false;
    if (!isShown(bar)) return;
    const line = bar.getBoundingClientRect().bottom + 24,
      atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    let current = SECTIONS[0];
    for (const id of SECTIONS) if ($(id) && $(id).getBoundingClientRect().top <= line) current = id;
    mark(atEnd && window.scrollY > 0 ? SECTIONS.at(-1) : current);
  }
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  document.addEventListener("toggle", schedule, true);
  bar.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-jump]");
    if (!link) return;
    event.preventDefault();
    const id = link.dataset.jump, section = $(id);
    if (!section) return;
    const fold = section.querySelector(":scope > details");
    if (fold && !fold.open) { fold.open = true; if (fold.dataset.key) setOpen(fold.dataset.key, true); }
    section.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
    section.querySelector("h2")?.focus({ preventScroll: true });
    mark(id);
  });
  scheduleJump = schedule;
  schedule();
}

// Each section is a <details>; whether it is open comes back from this browser's storage.
function bindSections(root) {
  for (const fold of root.querySelectorAll("details[data-key^='section:']")) {
    const key = fold.dataset.key,
      stored = (() => { try { return globalThis.localStorage?.getItem("desk.section." + key.slice(8)); } catch { return null; } })();
    if (stored === "1") fold.open = true;
    else if (stored === "0") fold.open = false;
  }
}

export function bindHub({ root, write, snapshot, save, setView, say, rerender, redraw = () => {} }) {
  const ws = () => snapshot().workspace,
    title = (collection, id, field = "title") => ws()[collection].find((r) => r.id === id)?.[field] ?? id,
    value = (form, name) => form.elements[name]?.value ?? "";
  bindSections(root);
  bindJumpbar();

  // Take the reader to a record, opening whatever hides it, and mark where they landed.
  function goto(kind, id) {
    const tab = TAB[kind];
    if (!tab) return;
    setView(tab);
    let el = find(kind, id);
    // A decision past the rows the Open view lists is listed by showing them all; one not open at all, by the All view.
    if (!el && kind === "decision") { showAllOpen(true); rerender(); el = find(kind, id); }
    if (!el && kind === "decision") { setDecisionFilter("all"); rerender(); el = find(kind, id); }
    if (!el && (kind === "slot" || kind === "asset")) { resetCollateralView(); rerender(); el = find(kind, id); }
    if (el) openFolds(el);
    // Found in the page but not visible (a view that is hidden, a card nobody can see) is as good as not found.
    if (!isShown(el)) return say("That record is not shown for the current selection. Choose its project, or clear the initiative filter.");
    if ((kind === "decision" || kind === "initiative") && el.matches("details") && !el.open) { el.open = true; if (el.dataset.key) setOpen(el.dataset.key, true); }
    if (kind === "report") el.querySelector("details")?.setAttribute("open", "");
    const target = el.matches("details") ? el.querySelector("summary") : el;
    if (!target.hasAttribute("tabindex") && !target.matches("summary, button, a, input, select")) target.tabIndex = -1;
    el.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
    target.focus({ preventScroll: true });
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
    el.addEventListener("animationend", () => el.classList.remove("flash"), { once: true });
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const d = button.dataset;
    if (d.goto) {
      const at = d.goto.indexOf(":");
      goto(d.goto.slice(0, at), d.goto.slice(at + 1));
    } else if (d.actionStatus) {
      const id = d.actionId, status = d.actionStatus;
      save(
        () => write("/api/action", { id, status }),
        (r) => (r.changed ? `"${title("actions", id)}" is now ${status}.` : `"${title("actions", id)}" was already ${status}.`),
        [`[data-action="${CSS.escape(id)}"] [data-action-id]`, `[data-need="action:${CSS.escape(id)}"] button`, "#needs-heading"],
      );
    } else if (d.decisionFilter) {
      setDecisionFilter(d.decisionFilter);
      rerender();
      document.querySelector(`[data-decision-filter="${d.decisionFilter}"]`)?.focus({ preventScroll: true });
    } else if ("decisionMore" in d) {
      showAllOpen(button.getAttribute("aria-expanded") !== "true");
      rerender();
      document.querySelector("[data-decision-more]")?.focus({ preventScroll: true });
    } else if (d.needMore) {
      toggleNeedGroup(d.needMore);
      rerender();
      document.querySelector(`[data-need-more="${CSS.escape(d.needMore)}"]`)?.focus({ preventScroll: true });
    } else if ("timelineMore" in d) {
      showMoreTimeline();
      rerender();
      document.querySelector("[data-timeline-more], [data-timeline-less]")?.focus({ preventScroll: true });
    } else if ("timelineLess" in d) {
      resetTimeline();
      rerender();
      document.querySelector("[data-timeline-more]")?.focus({ preventScroll: true });
    }
  });

  root.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const d = form.dataset;
    const handled = (run) => { event.preventDefault(); run(); };
    if (d.decide) handled(() => {
      const id = d.decide, chosen = event.submitter?.value;
      if (!chosen) return;
      const change = d.change === "true", key = `rationale:${id}${change ? ":change" : ""}`,
        refusal = changeRefusal(ws().decisions.find((x) => x.id === id) ?? {}, chosen, change);
      if (refusal) return say(refusal);
      save(async () => {
        const result = await write("/api/decide", { decisionId: id, chosen, rationale: value(form, "rationale").trim(), change });
        clearDrafts(key);
        setOpen("decision:" + id, false);
        setOpen("change:" + id, false);
        // The card stays in the Open view with a banner, so the owner sees where the answer went.
        markActed(id, `${change ? "Changed to" : "Decided"} — ${result.record.options.find((o) => o.id === chosen)?.label ?? chosen}`);
        return result;
      }, (r) => `${change ? "Changed" : "Decided"} "${title("decisions", id)}": ${r.record.options.find((o) => o.id === chosen)?.label ?? chosen}. It is on the timeline${change ? "" : " and now sits under Decided"}.`,
      [`[data-decision="${CSS.escape(id)}"] summary`, "#decision-filters [aria-pressed=true]"]);
    });
    else if (d.defer) handled(() => {
      const id = d.defer;
      save(async () => {
        const result = await write("/api/defer", { decisionId: id, until: value(form, "until") || undefined, reason: value(form, "reason").trim() || undefined });
        clearDrafts("defer-reason:" + id, "defer-until:" + id);
        setOpen("defer:" + id, false);
        markActed(id, result.record.needBy ? `Deferred — until ${result.record.needBy}` : "Deferred");
        return result;
      }, (r) => (r.changed ? `Deferred "${title("decisions", id)}"${r.record.needBy ? ` until ${r.record.needBy}` : ""}.` : "Nothing changed; it was already deferred to that date."),
      [`[data-decision="${CSS.escape(id)}"] summary`, "#decision-filters [aria-pressed=true]"]);
    });
    else if (d.blockForm) handled(() => {
      const id = d.blockForm;
      save(async () => {
        const result = await write("/api/action", { id, status: "blocked", notes: value(form, "notes").trim() });
        clearDrafts("block:" + id);
        setOpen("block:" + id, false);
        return result;
      }, `"${title("actions", id)}" is blocked.`, [`[data-action="${CSS.escape(id)}"] [data-action-id]`, "#needs-heading"]);
    });
    else if (d.addAction !== undefined) handled(() => {
      const taken = new Set(ws().actions.map((a) => a.id)), text = value(form, "title").trim(), project = d.addAction;
      if (!text) return;
      const data = { id: slug(text, taken), title: text, projectId: project, owner: value(form, "owner") };
      for (const key of ["due", "initiativeId"]) if (value(form, key)) data[key] = value(form, key);
      if (value(form, "hours") !== "") data.hours = Number(value(form, "hours"));
      save(async () => {
        const result = await write("/api/action/add", data);
        clearDrafts(...["title", "due", "hours", "owner", "initiativeId"].map((n) => `add-action:${project}:${n}`));
        return result;
      }, `Added "${text}".`, ["[data-add-action] input[name=title]", "#actions-heading"]);
    });
    else if (d.log !== undefined) handled(() => {
      const text = value(form, "text").trim(), project = d.log;
      if (!text) return;
      const data = { text, projectId: project };
      if (value(form, "initiativeId")) data.initiativeId = value(form, "initiativeId");
      save(async () => {
        const result = await write("/api/update", data);
        clearDrafts(`log:${project}:text`, `log:${project}:initiativeId`);
        resetTimeline();
        return result;
      }, "Note logged.", ["[data-log] textarea", "#timeline-heading"]);
    });
    else if (d.noteForm) handled(() => {
      const id = d.noteForm;
      save(async () => {
        const result = await write("/api/initiative/note", { id, note: value(form, "note").trim() });
        clearDrafts("note:" + id);
        return result;
      }, (r) => (r.changed ? "Status note saved." : "The note was already that."), [`[data-note-form="${CSS.escape(id)}"] input`]);
    });
    else if (d.gateForm) handled(() => {
      const id = d.gateForm, data = { id, status: value(form, "status"), notes: value(form, "notes").trim() };
      data.due = value(form, "due") || null;
      data.hours = value(form, "hours") === "" ? null : Number(value(form, "hours"));
      data.evidenceIds = [...form.querySelectorAll("input[name=evidenceIds]:checked")].map((x) => x.value);
      save(async () => {
        const result = await write("/api/gate", data);
        setOpen("gate:" + id, false);
        return result;
      }, (r) => `${r.changed ? "Gate check recorded." : "Nothing changed; the gate already said that today."}${r.warnings?.length ? " " + r.warnings.join(" ") : ""}`,
      [`[data-gate="${CSS.escape(id)}"] summary`, "#gates"]);
    });
  });

  // What was typed or chosen and not yet saved survives the redraw that follows any other save. A select
  // reports through `change`; a text field through `input`.
  const remember = (event) => {
    const key = event.target.dataset?.draft;
    if (key) setDraft(key, event.target.value);
  };
  root.addEventListener("input", remember);
  root.addEventListener("change", remember);
  // A <details> remembers whether it was open across the redraw, and a section whether it was folded.
  root.addEventListener("toggle", (event) => {
    const key = event.target.dataset?.key;
    if (key) setOpen(key, event.target.open);
    // The weekly strip is drawn to the width of its box, which a folded section has not got.
    if (key === "section:plan-details" && event.target.open) redraw();
  }, true);
}
