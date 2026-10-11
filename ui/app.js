import { $, esc, num, restoreFocus, keepsDisabled } from "./shared.js";
import { hasDrafts } from "./hub-shared.js";
import { api, uploadFile, createDeskClient, reviewDrafts, importMessage } from "./state.js";
import { renderActivity, drawChart } from "./chart.js";
import { renderCampaign } from "./views/campaign.js";
import { renderPlan, redrawLoad } from "./views/plan.js";
import { renderHub, bindHub, resetDeskState } from "./views/hub.js";
import { clearActed } from "./views/decisions.js";
import { renderCollateral } from "./views/collateral.js";
import { renderViewer, bindCollateral } from "./views/collateral-viewer.js";
import { renderReception } from "./views/reception.js";
import { renderResearch } from "./views/research.js";
import { renderReports } from "./views/reports.js";
import { renderExperiments } from "./views/experiments.js";
import { renderResults } from "./views/results.js";

const client = createDeskClient(), drafts = reviewDrafts();
let metricKey = "", loading = true, writing = false, failed = false, generation = 0, workspaceId = "", workspaceLabel = "", currentTab = "", again = null;
const filterIds = { projectId: "project", initiativeId: "initiative", from: "from", to: "to" };
const selection = () => Object.fromEntries(Object.entries(filterIds).map(([key, id]) => [key, $(id).value]));
const tabs = [...document.querySelectorAll("[role=tab]")];

// `retry` shows the button beside the message. It refreshes the page, or, when `retryNow` is given,
// makes the change that was refused again.
function message(text, error = false, retry = false, retryNow = null) {
  $("status").textContent = text;
  $("notice").hidden = !text;
  $("notice").classList.toggle("error", error);
  again = retryNow;
  $("retry").textContent = retryNow ? "Save again" : "Refresh evidence";
  $("retry").hidden = !retry;
}
function syncControls() {
  $("desk").setAttribute("aria-busy", String(loading || writing));
  $("refresh").disabled = writing || loading;
  $("import").disabled = writing || loading || failed;
  $("collect").title = client.snapshot?.workspace.sources.length ? "Collect every registered source in this workspace" : "Register a source with market-monitor to enable collection";
  $("filters").querySelectorAll("input, select, button").forEach(el => { el.disabled = writing; });
  // A control the page disabled on purpose (the standing choice in "Change to") stays disabled.
  $("views").querySelectorAll("button, input, select, textarea").forEach(el => { el.disabled = keepsDisabled(el) || writing || loading || failed; });
  $("collect").disabled = writing || loading || failed || !client.snapshot?.workspace.sources.length;
}
function setView(id, focus = false) {
  const active = tabs.find(tab => tab.dataset.tab === id) || tabs[0];
  // Leaving the tab lets go of the decision that was held in view after it was answered.
  if (currentTab && active.dataset.tab !== currentTab) clearActed();
  currentTab = active.dataset.tab;
  for (const tab of tabs) {
    const selected = tab === active;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(tab.dataset.tab).hidden = !selected;
  }
  history.replaceState(null, "", location.pathname + location.search + "#" + active.dataset.tab);
  if (focus) active.focus();
}
function render(snapshot) {
  const { workspace, selection: scope, data } = snapshot;
  for (const [id, rows, chosen, all] of [
    ["project", workspace.projects, scope.projectId, "All projects"],
    ["initiative", workspace.initiatives.filter(i => !scope.projectId || i.projectId === scope.projectId), scope.initiativeId, "All initiatives"],
  ]) {
    $(id).innerHTML = `<option value="">${all}</option>` + rows.map(row => `<option value="${esc(row.id)}">${esc(row.name)}</option>`).join("");
    $(id).value = chosen;
  }
  const project = workspace.projects.find(p => p.id === scope.projectId);
  $("project-summary").textContent = project ? project.promise : "Choose a project, inspect its evidence, and plan the next small test.";
  $("project-objective").textContent = project?.objective || "Select a project for a recommendation tied to its goal.";
  $("project-resources").textContent = project ? `${project.weeklyHours} hours/week · ${num(project.budget)} ${project.currency} test budget` : `${workspace.projects.length} projects in this workspace`;
  $("revision").textContent = `${workspaceLabel ? workspaceLabel + " · " : ""}Saved revision ${workspace.revision}`;
  $("scope-summary").textContent = `${project?.name || "All projects"} · ${scope.initiativeId ? workspace.initiatives.find(i => i.id === scope.initiativeId)?.name : "All initiatives"} · ${scope.from || "Beginning"} → ${scope.to || "Latest"}. Dates limit readings and feedback; plans and research stay visible.`;
  $("welcome").hidden = workspace.projects.length > 0;
  const vitals = [["rev", workspace.revision], ["projects", workspace.projects.length], ["initiatives", workspace.initiatives.length], ["gates", workspace.gates.length], ["evidence", workspace.evidence.length], ["reports", workspace.reports.length], ["sources", workspace.sources.length], ["sync", new Date().toLocaleTimeString([], { hour12: false })]];
  $("telemetry").innerHTML = `<span class="ws">ws<b>${esc(workspaceLabel || "workspace")}</b></span>` + vitals.map(([k, v]) => `<span>${k}<b>${esc(v)}</b></span>`).join("") + `<span class="cursor" aria-hidden="true">▮</span>`;
  $("telemetry").hidden = false;
  $("data-scope").textContent = `${workspace.sources.length} registered sources across the workspace. Collection and downloads include every project; filters only change this view.`;
  renderCampaign(snapshot);
  renderHub(snapshot);
  renderCollateral(snapshot);
  renderViewer(snapshot);
  metricKey = renderActivity(workspace, data, metricKey);
  renderReception(snapshot, drafts);
  renderResearch(snapshot);
  renderReports(snapshot);
  renderExperiments(snapshot);
  renderResults(snapshot);
  $("warnings").innerHTML = data.warnings.map(w => `<li>${esc(w)}</li>`).join("");
  $("updated").textContent = "Refreshed " + new Date().toLocaleTimeString();
  const params = new URLSearchParams(Object.entries(scope));
  history.replaceState(null, "", "?" + params + location.hash);
}
// `quiet` is a refresh after the owner's own save: the views stay on screen, so the page does not
// collapse and lose its scroll position under the control that was just used.
async function load(initial = false, quiet = false) {
  const current = ++generation;
  loading = true;
  failed = false;
  if (!quiet) {
    $("load-note").textContent = "Loading the selected evidence…";
    $("load-note").hidden = false;
    $("views").hidden = true;
  }
  syncControls();
  try {
    const snapshot = await client.load(selection(), initial);
    if (current !== generation || !snapshot) return;
    render(snapshot);
    $("views").hidden = false;
    $("load-note").hidden = true;
    // The weekly strip sizes its columns to the box it sits in, which has no width while the views are hidden.
    renderPlan(snapshot);
  } catch (error) {
    if (current !== generation) return;
    failed = true;
    $("load-note").textContent = "This selection could not be loaded. Correct the dates or refresh to try again.";
    throw error;
  } finally {
    if (current === generation) { loading = false; syncControls(); }
  }
}
// The workspaces this desk can show. The selector appears only when there is a choice.
async function loadWorkspaces() {
  const list = await api("/api/workspaces");
  workspaceId = list.current;
  workspaceLabel = list.workspaces.find(w => w.id === list.current)?.label || "";
  $("workspace").innerHTML = list.workspaces.map(w => `<option value="${esc(w.id)}"${w.available ? "" : " disabled"}>${esc(w.label)}${w.available ? ` (${w.projects} projects, ${w.records} records)` : " (unavailable)"}</option>`).join("");
  $("workspace").value = list.current;
  $("workspace-switch").hidden = list.workspaces.length < 2;
}
async function reload(initial = false) {
  try { await loadWorkspaces(); await load(initial); if (!loading) message(initial ? "" : "Selection updated."); }
  catch (error) { message(error.message, true, true); }
}
// `focusKey` is a selector, or a list of them: focus returns to the first that is still on screen after the
// redraw, because the control that was used may have moved or gone (a decided question leaves "Open").
// Returns false when the desk would not take the save at all (busy, still loading, or no data), so a caller
// that promised something to the owner can take it back; true once it has been tried.
// A conflict (409) means the file changed under the page: the page is reloaded at once, what was typed is
// kept, and the owner is told plainly that the change was NOT saved. `retry: false` is for a save that cannot
// be run twice from the same closure (a batch of files).
async function save(action, success, focusKey, { retry = true } = {}) {
  if (writing || loading || failed || !client.snapshot) return false;
  writing = true;
  syncControls();
  let committed = false;
  message("Saving changes…");
  try {
    const result = await action();
    committed = true;
    await load(false, true);
    message(typeof success === "function" ? success(result) : success);
  } catch (error) {
    if (!committed && error.status === 409) {
      const again = retry ? () => save(action, success, focusKey, { retry }) : null,
        told = "Your change was NOT saved: the workspace changed while you were working. ";
      try {
        await load(false, true);
        message(told + "The page now shows the latest records and keeps what you typed. Check them, then " + (again ? "use Save again." : "make the change again."), true, Boolean(again), again);
      } catch (loadError) {
        message(told + "The page could not refresh either: " + loadError.message, true, true);
      }
    } else {
      message((committed ? "Saved, but the display could not refresh. " : "") + error.message, true, committed);
      if (!committed) document.querySelectorAll("[data-initiative]").forEach(el => {
        el.value = client.snapshot.workspace.initiatives.find(i => i.id === el.dataset.initiative)?.status ?? el.value;
      });
    }
  } finally {
    writing = false;
    syncControls();
    if (!loading && !failed) restoreFocus([].concat(focusKey).find(key => key && document.querySelector(key)?.checkVisibility?.() !== false && document.querySelector(key)) ?? "#sentiment-filter");
  }
  return true;
}

tabs.forEach((tab, index) => {
  tab.onclick = () => setView(tab.dataset.tab);
  tab.onkeydown = event => {
    const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (next !== undefined) { event.preventDefault(); setView(tabs[next].dataset.tab, true); }
  };
});
document.addEventListener("click", event => {
  const open = event.target.closest("[data-open-view]");
  if (open) setView(open.dataset.openView, true);
  if (event.target.closest("[data-show-reactions]")) {
    $("sentiment-filter").value = "";
    renderReception(client.snapshot, drafts);
    $("sentiment-filter").focus();
  }
  // "Open <project>" in the all-projects Needs panel: choose that project and look at its list.
  const pick = event.target.closest("[data-select-project]");
  if (pick) {
    $("project").value = pick.dataset.selectProject;
    $("initiative").value = "";
    reload().then(() => $("needs-heading").focus({ preventScroll: true }));
  }
});
$("workspace").onchange = async () => {
  const chosen = $("workspace").value;
  if ((drafts.size || hasDrafts()) && !confirm("Unsaved edits in this tab will be discarded. Switch workspace?")) { $("workspace").value = workspaceId; return; }
  try {
    await api("/api/workspace/select", { id: chosen });
    drafts.clear();
    resetDeskState();
    for (const id of Object.values(filterIds)) $(id).value = "";
    history.replaceState(null, "", location.pathname + "#" + (location.hash.slice(1) || "campaign"));
    await reload(true);
  } catch (error) {
    $("workspace").value = workspaceId;
    message(error.message, true);
  }
};
// Settings menu: a gear in the header. Escape or a click elsewhere closes it and returns focus to the gear.
const menu = $("settings-menu"), gear = $("settings");
function setMenu(open, focus = false) {
  menu.hidden = !open;
  gear.setAttribute("aria-expanded", String(open));
  if (open) {
    const current = menu.querySelector(`input[value="${window.deskTheme?.get() || "auto"}"]`);
    if (current) { current.checked = true; current.focus(); }
  }
  else if (focus) gear.focus();
}
gear.onclick = () => setMenu(menu.hidden);
menu.onchange = event => { if (event.target.name === "theme") window.deskTheme?.set(event.target.value); };
document.addEventListener("keydown", event => { if (event.key === "Escape" && !menu.hidden) setMenu(false, true); });
document.addEventListener("click", event => { if (!menu.hidden && !event.target.closest(".settings")) setMenu(false); });
bindHub({
  root: $("views"),
  write: (path, data) => api(path, { workspaceId, revision: client.snapshot.workspace.revision, ...data }),
  snapshot: () => client.snapshot,
  save, setView, say: (text, error = false) => message(text, error),
  rerender: () => { renderHub(client.snapshot); renderCollateral(client.snapshot); },
  redraw: () => { if (client.snapshot) redrawLoad(client.snapshot); },
});
bindCollateral({
  root: $("views"),
  write: (path, data) => api(path, { workspaceId, revision: client.snapshot.workspace.revision, ...data }),
  upload: (query, file, onProgress) => uploadFile({ workspaceId, ...query }, file, onProgress),
  snapshot: () => client.snapshot,
  save, setView, say: (text, error = false) => message(text, error),
  rerender: () => { renderHub(client.snapshot); renderCollateral(client.snapshot); },
  fetchJson: path => api(path),
  busy: () => writing || loading || failed || !client.snapshot,
});
$("dismiss").onclick = () => { $("notice").hidden = true; };
$("refresh").onclick = () => reload();
$("retry").onclick = () => (again ? again() : reload());
$("clear").onclick = () => { $("from").value = $("to").value = ""; reload(); };
$("filters").onsubmit = event => event.preventDefault();
for (const id of Object.values(filterIds)) $(id).onchange = () => reload();
$("metric").onchange = () => { metricKey = $("metric").value; drawChart(client.snapshot.data, metricKey); };
$("sentiment-filter").onchange = () => { if (client.snapshot) renderReception(client.snapshot, drafts); };
$("initiatives-list").onchange = event => {
  const id = event.target.dataset.initiative;
  if (!id) return;
  const record = { ...client.snapshot.workspace.initiatives.find(i => i.id === id), status: event.target.value };
  save(() => api("/api/record", { workspaceId, collection: "initiatives", record, revision: client.snapshot.workspace.revision }), "Initiative status saved.", `[data-initiative="${CSS.escape(id)}"]`);
};
$("reactions").oninput = event => {
  const form = event.target.closest("form[data-reaction]");
  if (!form) return;
  const record = client.snapshot.workspace.reactions.find(r => r.id === form.dataset.reaction);
  const fields = Object.fromEntries(new FormData(form));
  if (fields.theme === record.theme && fields.sentiment === record.sentiment) drafts.delete(record.id);
  else drafts.set(record, fields);
  form.querySelector(".draft-note").textContent = drafts.get(record) ? "Unsaved changes in this tab" : "";
};
$("reactions").onsubmit = event => {
  event.preventDefault();
  const id = event.target.dataset.reaction;
  if (!id) return;
  const record = { ...client.snapshot.workspace.reactions.find(r => r.id === id), ...Object.fromEntries(new FormData(event.target)), reviewed: true };
  save(async () => {
    await api("/api/record", { workspaceId, collection: "reactions", record, revision: client.snapshot.workspace.revision });
    drafts.delete(id);
  }, "Reaction review saved.", `[data-reaction="${CSS.escape(id)}"] button`);
};
$("import").onclick = () => $("upload").click();
$("upload").onchange = event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) return message("Import exceeds 2 MB. Split it into smaller files and choose the file again.", true);
  save(async () => api("/api/import", { workspaceId,
    text: await file.text(), format: file.name.toLowerCase().endsWith(".csv") ? "csv" : "json", revision: client.snapshot.workspace.revision,
  }), importMessage, "#import");
};
$("collect").onclick = () => save(() => api("/api/monitor", { workspaceId, revision: client.snapshot.workspace.revision }), result => {
  const errors = result.sources.flatMap(s => s.errors);
  return errors.length ? "Collection finished with unavailable readings: " + errors.join("; ") : "All registered sources collected.";
}, "#collect");
window.addEventListener("beforeunload", event => { if (drafts.size) { event.preventDefault(); event.returnValue = ""; } });
const params = new URLSearchParams(location.search);
for (const [key, id] of Object.entries(filterIds)) {
  if (!params.get(key)) continue;
  if ($(id).tagName === "SELECT") $(id).add(new Option(params.get(key), params.get(key)));
  $(id).value = params.get(key);
}
// The desk stops itself after a period with no requests. While this page is visible it
// pings so a desk you are reading stays up, and it says so if the desk has already stopped.
async function heartbeat() {
  if (document.visibilityState !== "visible") return;
  try { await fetch("/api/ping"); }
  catch { message("The desk has stopped; it closes itself after a period of inactivity. Run serve again, then refresh this page.", true); }
}
setInterval(heartbeat, 60000);
document.addEventListener("visibilitychange", heartbeat);
setView(location.hash.slice(1));
reload(!params.has("projectId"));
