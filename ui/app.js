import { $, esc, num, restoreFocus } from "./shared.js";
import { api, createDeskClient, reviewDrafts } from "./state.js";
import { renderActivity, drawChart } from "./chart.js";
import { renderCampaign } from "./views/campaign.js";
import { renderReception } from "./views/reception.js";
import { renderResearch } from "./views/research.js";
import { renderReports } from "./views/reports.js";
import { renderExperiments } from "./views/experiments.js";
import { renderResults } from "./views/results.js";

const client = createDeskClient(), drafts = reviewDrafts();
let metricKey = "", loading = true, writing = false, failed = false, generation = 0, workspaceId = "", workspaceLabel = "";
const filterIds = { projectId: "project", initiativeId: "initiative", from: "from", to: "to" };
const selection = () => Object.fromEntries(Object.entries(filterIds).map(([key, id]) => [key, $(id).value]));
const tabs = [...document.querySelectorAll("[role=tab]")];

function message(text, error = false, retry = false) {
  $("status").textContent = text;
  $("notice").hidden = !text;
  $("notice").classList.toggle("error", error);
  $("retry").hidden = !retry;
}
function syncControls() {
  $("desk").setAttribute("aria-busy", String(loading || writing));
  $("refresh").disabled = writing || loading;
  $("import").disabled = writing || loading || failed;
  $("collect").title = client.snapshot?.workspace.sources.length ? "Collect every registered source in this workspace" : "Register a source with market-monitor to enable collection";
  $("filters").querySelectorAll("input, select, button").forEach(el => { el.disabled = writing; });
  $("views").querySelectorAll("button, input, select").forEach(el => { el.disabled = writing || loading || failed; });
  $("collect").disabled = writing || loading || failed || !client.snapshot?.workspace.sources.length;
}
function setView(id, focus = false) {
  const active = tabs.find(tab => tab.dataset.tab === id) || tabs[0];
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
  const vitals = [["rev", workspace.revision], ["projects", workspace.projects.length], ["initiatives", workspace.initiatives.length], ["evidence", workspace.evidence.length], ["reports", workspace.reports.length], ["sources", workspace.sources.length], ["sync", new Date().toLocaleTimeString([], { hour12: false })]];
  $("telemetry").innerHTML = `<span class="ws">ws<b>${esc(workspaceLabel || "workspace")}</b></span>` + vitals.map(([k, v]) => `<span>${k}<b>${esc(v)}</b></span>`).join("") + `<span class="cursor" aria-hidden="true">▮</span>`;
  $("telemetry").hidden = false;
  $("data-scope").textContent = `${workspace.sources.length} registered sources across the workspace. Collection and downloads include every project; filters only change this view.`;
  renderCampaign(snapshot);
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
async function load(initial = false) {
  const current = ++generation;
  loading = true;
  failed = false;
  $("load-note").textContent = "Loading the selected evidence…";
  $("load-note").hidden = false;
  $("views").hidden = true;
  syncControls();
  try {
    const snapshot = await client.load(selection(), initial);
    if (current !== generation || !snapshot) return;
    render(snapshot);
    $("views").hidden = false;
    $("load-note").hidden = true;
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
async function save(action, success, focusKey) {
  if (writing || loading || failed || !client.snapshot) return;
  writing = true;
  syncControls();
  let committed = false;
  message("Saving changes…");
  try {
    const result = await action();
    committed = true;
    await load();
    message(typeof success === "function" ? success(result) : success);
  } catch (error) {
    message((committed ? "Saved, but the display could not refresh. " : "") + error.message, true, committed || error.status === 409);
    if (!committed) document.querySelectorAll("[data-initiative]").forEach(el => {
      el.value = client.snapshot.workspace.initiatives.find(i => i.id === el.dataset.initiative).status;
    });
  } finally {
    writing = false;
    syncControls();
    if (!loading && !failed) restoreFocus(document.querySelector(focusKey) ? focusKey : "#sentiment-filter");
  }
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
});
$("workspace").onchange = async () => {
  const chosen = $("workspace").value;
  if (drafts.size && !confirm("Unsaved review edits in this tab will be discarded. Switch workspace?")) { $("workspace").value = workspaceId; return; }
  try {
    await api("/api/workspace/select", { id: chosen });
    drafts.clear();
    for (const id of Object.values(filterIds)) $(id).value = "";
    history.replaceState(null, "", location.pathname + "#" + (location.hash.slice(1) || "campaign"));
    await reload(true);
  } catch (error) {
    $("workspace").value = workspaceId;
    message(error.message, true);
  }
};
$("dismiss").onclick = () => { $("notice").hidden = true; };
$("refresh").onclick = $("retry").onclick = () => reload();
$("clear").onclick = () => { $("from").value = $("to").value = ""; reload(); };
$("filters").onsubmit = event => event.preventDefault();
for (const id of Object.values(filterIds)) $(id).onchange = () => reload();
$("metric").onchange = () => { metricKey = $("metric").value; drawChart(client.snapshot.data, metricKey); };
$("sentiment-filter").onchange = () => { if (client.snapshot) renderReception(client.snapshot, drafts); };
$("initiatives").onchange = event => {
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
  }), "Results imported. Records with matching IDs were updated.", "#import");
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
