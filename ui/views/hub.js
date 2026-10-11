import { $ } from "../shared.js";
import { setOpen, setDraft, clearDrafts, localDay } from "../hub-shared.js";
import { renderNeeds } from "./needs.js";
import { renderDecisions, setDecisionFilter } from "./decisions.js";
import { renderActions, slug } from "./actions.js";
import { renderTimeline, resetTimeline, showMoreTimeline } from "./timeline.js";
import { renderHierarchy, treeOrder, subtreeIds } from "./hierarchy.js";
import { resetCollateralView } from "./collateral.js";

// The progress half of Decide & plan: what needs the owner, decisions, actions, the timeline and
// the initiative hierarchy. renderHub draws them from one snapshot; bindHub wires the controls to
// the progress routes. A write goes through the desk's own `save`, which refreshes the page,
// announces the result and puts focus back.

export function renderHub(snapshot) {
  const { workspace, selection, attention, plans, plan } = snapshot,
    today = attention?.today ?? localDay(new Date()),
    within = selection.initiativeId ? subtreeIds(workspace.initiatives, selection.initiativeId) : null,
    inScope = (r) => (!selection.projectId || r.projectId === selection.projectId) && (!within || within.has(r.initiativeId)),
    orderedInitiatives = treeOrder(workspace.initiatives.filter((i) => !selection.projectId || i.projectId === selection.projectId), selection.initiativeId),
    ctx = { workspace, selection, attention, plans, plan, inScope, orderedInitiatives, today };
  renderNeeds(ctx);
  renderDecisions(ctx);
  renderActions(ctx);
  renderTimeline(ctx);
  renderHierarchy(ctx);
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

export function bindHub({ root, write, snapshot, save, setView, say, rerender }) {
  const ws = () => snapshot().workspace,
    title = (collection, id, field = "title") => ws()[collection].find((r) => r.id === id)?.[field] ?? id,
    value = (form, name) => form.elements[name]?.value ?? "";

  // Take the reader to a record, opening whatever hides it, and mark where they landed.
  function goto(kind, id) {
    const tab = TAB[kind];
    if (!tab) return;
    setView(tab);
    let el = find(kind, id);
    if (!el && kind === "decision") { setDecisionFilter("all"); rerender(); el = find(kind, id); }
    if (!el && kind === "action") { setOpen("actions-closed", true); rerender(); el = find(kind, id); }
    if (!el && (kind === "slot" || kind === "asset")) { resetCollateralView(); rerender(); el = find(kind, id); }
    if (!el) return say("That record is not shown for the current selection. Choose its project, or clear the initiative filter.");
    if (kind === "decision" && !el.open) el.open = true;
    if (kind === "report") el.querySelector("details")?.setAttribute("open", "");
    const target = el.matches("details") ? el.querySelector("summary") : el;
    if (!target.hasAttribute("tabindex") && !target.matches("summary, button, a, input, select")) target.tabIndex = -1;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
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
    } else if ("timelineMore" in d) {
      showMoreTimeline();
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
      const change = d.change === "true", key = `rationale:${id}${change ? ":change" : ""}`;
      save(async () => {
        const result = await write("/api/decide", { decisionId: id, chosen, rationale: value(form, "rationale").trim(), change });
        clearDrafts(key);
        setOpen("decision:" + id, false);
        setOpen("change:" + id, false);
        return result;
      }, (r) => `${change ? "Changed" : "Decided"} "${title("decisions", id)}": ${r.record.options.find((o) => o.id === chosen)?.label ?? chosen}. It is on the timeline${change ? "" : " and now sits under Decided"}.`,
      [`[data-decision="${CSS.escape(id)}"] summary`, "#decision-filters [aria-pressed=true]"]);
    });
    else if (d.defer) handled(() => {
      const id = d.defer;
      save(async () => {
        const result = await write("/api/defer", { decisionId: id, until: value(form, "until") || undefined, reason: value(form, "reason").trim() || undefined });
        clearDrafts("defer-reason:" + id);
        setOpen("defer:" + id, false);
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
      const taken = new Set(ws().actions.map((a) => a.id)), text = value(form, "title").trim();
      if (!text) return;
      const data = { id: slug(text, taken), title: text, projectId: d.addAction, owner: value(form, "owner") };
      for (const key of ["due", "initiativeId"]) if (value(form, key)) data[key] = value(form, key);
      if (value(form, "hours") !== "") data.hours = Number(value(form, "hours"));
      save(async () => {
        const result = await write("/api/action/add", data);
        clearDrafts("add-action:title", "add-action:due", "add-action:hours");
        return result;
      }, `Added "${text}".`, ["[data-add-action] input[name=title]", "#actions-heading"]);
    });
    else if (d.log !== undefined) handled(() => {
      const text = value(form, "text").trim();
      if (!text) return;
      const data = { text, projectId: d.log };
      if (value(form, "initiativeId")) data.initiativeId = value(form, "initiativeId");
      save(async () => {
        const result = await write("/api/update", data);
        clearDrafts("log:text");
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

  // What was typed and not yet saved survives the redraw that follows any other save.
  root.addEventListener("input", (event) => {
    const key = event.target.dataset?.draft;
    if (key) setDraft(key, event.target.value);
  });
  // A <details> remembers whether it was open across the redraw.
  root.addEventListener("toggle", (event) => {
    const key = event.target.dataset?.key;
    if (key) setOpen(key, event.target.open);
  }, true);
}
