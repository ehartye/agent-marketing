import { chartKey, chartLabel } from "/analysis.js";
const $ = (id) => document.getElementById(id),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let workspace,
  data,
  actions,
  channels,
  refs = [],
  metricKey = "",
  generation = 0;
const num = (v) =>
  v === null || v === undefined
    ? "—"
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct = (v) =>
  v === null || v === undefined ? "—" : (v * 100).toFixed(1) + "%";
const empty = (text) => `<div class="empty">${esc(text)}</div>`;
const link = (url, label) =>
  `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
const refLinks = (ids) =>
  (ids || [])
    .map((id) => refs.find((r) => r.id === id))
    .filter(Boolean)
    .map((r) => link(r.url, r.title))
    .join(" · ");
function message(text, isError = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", isError);
}
async function api(path, body) {
  const response = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Request failed");
  return value;
}
function query() {
  const q = new URLSearchParams();
  for (const [key, id] of [
    ["projectId", "project"],
    ["initiativeId", "initiative"],
    ["from", "from"],
    ["to", "to"],
  ])
    if ($(id).value) q.set(key, $(id).value);
  return "?" + q;
}
function project() {
  return workspace.projects.find((p) => p.id === $("project").value);
}
function initiatives() {
  return workspace.initiatives.filter(
    (i) =>
      (!$("project").value || i.projectId === $("project").value) &&
      (!$("initiative").value || i.id === $("initiative").value),
  );
}
async function load(initial = false) {
  const current = ++generation;
  const next = await api("/api/workspace");
  if (current !== generation) return;
  workspace = next;
  if (initial) refs = await api("/api/references");
  const selected = $("project").value;
  $("project").innerHTML =
    '<option value="">All projects</option>' +
    workspace.projects
      .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
      .join("");
  $("project").value =
    selected ||
    (initial && workspace.projects.length ? workspace.projects[0].id : "");
  const selectedInitiative = $("initiative").value;
  $("initiative").innerHTML =
    '<option value="">All initiatives</option>' +
    workspace.initiatives
      .filter((i) => !$("project").value || i.projectId === $("project").value)
      .map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`)
      .join("");
  $("initiative").value = selectedInitiative;
  if (!$("initiative").value) $("initiative").value = "";
  const selection = query();
  const results = await Promise.all([
    api("/api/report" + selection),
    api("/api/advise" + selection),
    api("/api/channels" + selection),
  ]);
  if (current !== generation) return;
  [data, actions, channels] = results;
  render();
  $("updated").textContent = "Refreshed " + new Date().toLocaleTimeString();
}
function render() {
  const p = project();
  $("project-summary").textContent = p
    ? `${p.promise} · ${p.audience.join(", ")} · ${p.weeklyHours} hours/week · ${num(p.budget)} ${p.currency} test budget`
    : "Your portfolio, with a trail from each result to its source.";
  $("revision").textContent = `Ledger revision ${workspace.revision}`;
  const a = actions[0];
  $("decision").innerHTML = a
    ? `<div class="decision"><div><span class="label">EVIDENCE</span><h2>${esc(a.title)}</h2><p>${esc(a.reason)}</p>${a.evidence
        .map((id) => {
          const o =
            workspace.observations.find((x) => x.id === id) ||
            workspace.reactions.find((x) => x.id === id) ||
            workspace.evidence.find((x) => x.id === id);
          return o ? link(o.url, id) : esc(id);
        })
        .join(
          " · ",
        )}</div><div><span class="label">NEXT TEST</span><p>${esc(a.next)}</p><p>${refLinks(a.referenceIds)}</p></div><div class="next"><span class="label">STOP &amp; DECIDE</span><p>${esc(a.stop)}</p><strong>Keep the test small enough to learn.</strong></div></div>`
    : empty(
        p
          ? "Record some results or evidence to guide the next decision."
          : "Choose a project to see its next decision.",
      );
  $("initiatives").innerHTML = initiatives().length
    ? initiatives()
        .map(
          (i) =>
            `<article class="initiative"><div class="row"><div><span class="pill">${esc(i.channel)}</span><h3>${esc(i.name)}</h3></div><label>Status<select data-initiative="${esc(i.id)}">${["planned", "running", "paused", "complete"].map((s) => `<option ${i.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label></div><p>${esc(i.hypothesis)}</p><p class="caption">${esc(i.cta)} · ${esc(i.start)} → ${esc(i.end)} · ${esc(i.owner)}</p></article>`,
        )
        .join("")
    : empty(
        "No initiatives yet. Import a campaign plan or use the market-campaign skill to create one.",
      );
  $("funnels").innerHTML = data.funnels.length
    ? data.funnels
        .map(
          (f) =>
            `<article class="funnel"><span class="pill">${esc(f.channel)}</span><div class="funnel-step"><span>Visitors</span><strong>${num(f.visitors)}</strong></div><div class="bar"><svg aria-hidden="true"><rect width="100%" height="12"/></svg></div><div class="funnel-step"><span>First use</span><strong>${num(f.starts)}</strong></div><div class="bar"><svg aria-hidden="true"><rect class="starts" width="${f.rate === null ? 0 : Math.max(1, f.rate * 100)}%" height="12"/></svg></div><p><strong>${pct(f.rate)}</strong> <small>${esc(f.interpretation)}</small></p></article>`,
        )
        .join("")
    : empty(
        "Import attributed visitors and starts with matching windows and definitions to see the first-use path.",
      );
  const projectNames = new Map(workspace.projects.map((p) => [p.id, p.name]));
  const initiativeNames = new Map(
    workspace.initiatives.map((i) => [i.id, i.name]),
  );
  const grouped = new Map();
  for (const o of data.observations) {
    const key = chartKey(o);
    if (!grouped.has(key)) {
      const context = [
        projectNames.get(o.projectId) || o.projectId,
        initiativeNames.get(o.initiativeId),
      ]
        .filter(Boolean)
        .join(" · ");
      grouped.set(key, {
        key,
        name: context + " · " + chartLabel(o),
        count: 0,
      });
    }
    grouped.get(key).count++;
  }
  const groups = [...grouped.values()];
  if (!grouped.has(metricKey))
    metricKey =
      groups.reduce(
        (best, group) => (!best || group.count > best.count ? group : best),
        null,
      )?.key || "";
  $("metric").innerHTML = groups
    .map((g) => `<option value="${esc(g.key)}">${esc(g.name)}</option>`)
    .join("");
  $("metric").value = metricKey;
  drawChart();
  $("channels").innerHTML = channels
    .slice(0, 4)
    .map(
      (c, i) =>
        `<details class="channel"><summary>${esc(c.name)}<span class="meta">${esc(c.hours)} h / test</span></summary><p>${esc(c.approach)}</p><p>${esc((c.rationale || []).join(" · "))}</p><dl><dt>Measure</dt><dd>${esc(c.measure)}</dd><dt>Time &amp; cost</dt><dd>${esc(c.hours)} hours for a test; ${esc(c.cost)}. Launch response may arrive quickly; durable demand takes follow-up.</dd><dt>Risk</dt><dd>${esc(c.risk)}</dd><dt>Complexity</dt><dd>${esc(c.complexity)}</dd><dt>Maintenance</dt><dd>${esc(c.maintainability)}</dd></dl><p>${refLinks(c.referenceIds)}</p></details>`,
    )
    .join("");
  $("readings").innerHTML = data.totals.length
    ? `<div class="table-scroll"><table><thead><tr><th>Channel</th><th>Definition</th><th>Total / latest snapshot</th><th>Source records</th></tr></thead><tbody>${data.totals
        .map(
          (t) =>
            `<tr><td>${esc(t.channel)}</td><td>${esc(t.definition)}</td><td>${t.ambiguous ? "Needs reconciliation" : num(t.value)} ${esc(t.currency || "")}</td><td>${t.evidence
              .map((id) => {
                const o = workspace.observations.find((x) => x.id === id);
                return o ? link(o.url, id) : esc(id);
              })
              .join(", ")}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : empty(
        "No readings in this selection. Import normalized JSON/CSV results or register a monitoring source.",
      );
  $("sources").innerHTML = data.sources.length
    ? data.sources
        .map(
          (s) =>
            `<article class="source"><div class="row"><h3>${esc(s.name)}</h3><span class="pill">${esc(s.adapter)}</span></div><p>${esc(s.target)} · ${s.lastCheckedAt ? "Checked " + esc(s.lastCheckedAt) : "Not collected yet"}</p><p class="${s.lastError ? "error" : "muted"}">${esc(s.lastError || "Ready for collection")}</p></article>`,
        )
        .join("")
    : empty(
        "Register your own repository or HN thread with the market-monitor skill. Analytics from other channels can be imported.",
      );
  $("sentiment").innerHTML =
    '<div class="summary-grid">' +
    Object.entries(data.sentiment)
      .map(([s, n]) => `<div><strong>${n}</strong>${esc(s)}</div>`)
      .join("") +
    "</div>";
  renderReactions();
  $("viability").innerHTML = ["problem", "activation", "retention", "payment"]
    .map((d) => {
      const evidence = data.evidence.filter((e) => e.dimension === d);
      return `<article class="evidence"><h3>${d}</h3>${evidence.length ? evidence.map((e) => `<p><span class="pill">${esc(e.result)} · ${esc(e.strength)}</span>${esc(e.claim)}<br>${link(e.url, "Evidence source")} · <span class="meta">Checked ${esc(e.checkedAt)}</span></p>`).join("") : '<p class="caption">No evidence recorded. This remains an open question.</p>'}</article>`;
    })
    .join("");
  $("competitors").innerHTML = data.competitors.length
    ? data.competitors
        .map(
          (c) =>
            `<article class="evidence"><span class="pill">${esc(c.kind)}</span><h3>${esc(c.name)}</h3><p>${esc(c.positioning)}</p><p>${link(c.url, "Open alternative")} · <span class="meta">Checked ${esc(c.checkedAt)}</span></p><div class="table-scroll"><table><thead><tr><th>Dimension</th><th>Observed claim</th></tr></thead><tbody>${c.claims.map((x) => `<tr><td>${esc(x.dimension)}</td><td>${esc(x.value)} · ${link(x.url, "Source")}</td></tr>`).join("")}</tbody></table></div></article>`,
        )
        .join("")
    : empty(
        "Research direct alternatives, substitutes and doing nothing. Record dated evidence rather than filling a guessed feature matrix.",
      );
  $("experiments-list").innerHTML = data.experiments.length
    ? data.experiments
        .map(
          (e) =>
            `<article class="panel experiment"><span class="pill">${esc(e.decision)}</span><h2>${esc(e.name)}</h2>${e.arms.map((a) => `<div class="interval"><div>${esc(a.name)} · ${a.interval ? `${a.interval.successes} / ${a.interval.trials} · ${pct(a.interval.rate)} observed` : "No observations"}</div>${a.interval ? `<div class="track"><svg role="img" aria-label="${esc(a.name)} Wilson interval ${pct(a.interval.low)} to ${pct(a.interval.high)}"><rect class="range" x="${a.interval.low * 100}%" width="${(a.interval.high - a.interval.low) * 100}%" height="24"/><rect class="point" x="${a.interval.rate * 100}%" width="3" height="24"/></svg></div><span class="caption">95% Wilson interval: ${pct(a.interval.low)}–${pct(a.interval.high)}</span>` : ""}</div>`).join("")}<p>Difference B − A: ${e.difference ? `${pct(e.difference.estimate)} · conservative bounds ${pct(e.difference.low)} to ${pct(e.difference.high)}` : "Unknown"}</p><p><strong>Stopping rule:</strong> ${esc(e.stoppingRule)}</p><p class="caption">${esc(e.caveat)}</p></article>`,
        )
        .join("")
    : empty(
        "No experiments recorded. Define two arms, one primary outcome, a sample target and a stopping rule before gathering results.",
      );
  $("warnings").innerHTML = data.warnings
    .map((w) => `<li>${esc(w)}</li>`)
    .join("");
}
function drawChart() {
  const all = data.observations
    .filter((o) => chartKey(o) === metricKey)
    .toSorted((a, b) => a.end.localeCompare(b.end));
  if (!all.length) {
    $("chart").innerHTML = empty("Choose a metric after collecting readings.");
    return;
  }
  const max = Math.max(1, ...all.map((o) => o.value)),
    x = (i) => 45 + (i * 650) / Math.max(1, all.length - 1),
    y = (v) => 160 - (v / max) * 125;
  $("chart").innerHTML =
    `<svg class="plot" viewBox="0 0 740 195" role="img" aria-label="${esc(all[0].definition)} over reported dates; exact values in the table below"><line x1="45" y1="160" x2="700" y2="160"/><line x1="45" y1="35" x2="700" y2="35"/><text x="5" y="39">${num(max)}</text><text x="5" y="164">0</text>${all.length > 1 ? `<polyline points="${all.map((o, i) => `${x(i)},${y(o.value)}`).join(" ")}"/>` : ""}${all.map((o, i) => `<circle cx="${x(i)}" cy="${y(o.value)}" r="4"><title>${esc(o.end)}: ${num(o.value)}</title></circle>`).join("")}<text x="45" y="184">${esc(all[0].end)}</text><text x="625" y="184">${esc(all.at(-1).end)}</text></svg><details><summary class="caption">Read chart values &amp; sources</summary><table><thead><tr><th>Reported period</th><th>Value</th><th>Source</th></tr></thead><tbody>${all.map((o) => `<tr><td>${esc(o.start)} → ${esc(o.end)}</td><td>${num(o.value)}</td><td>${link(o.url, o.id)}</td></tr>`).join("")}</tbody></table></details>`;
}
function renderReactions() {
  const filter = $("sentiment-filter").value,
    rows = data.reactions.filter(
      (r) =>
        !filter ||
        (filter === "unreviewed" && !r.reviewed) ||
        (r.reviewed && r.sentiment === filter),
    );
  $("reactions").className = "reactions-grid";
  $("reactions").innerHTML = rows.length
    ? rows
        .map(
          (r) =>
            `<article class="panel reaction"><span class="pill ${esc(r.sentiment)}">${r.reviewed ? esc(r.sentiment) : "Needs review · suggestion " + esc(r.sentiment)}</span><span class="pill">${esc(r.channel || "direct")}</span><blockquote>${esc(r.text)}</blockquote><p>${link(r.url, "Read source context")}</p><form data-reaction="${esc(r.id)}"><label>Sentiment<select name="sentiment">${["positive", "negative", "neutral", "mixed", "unknown"].map((s) => `<option ${r.sentiment === s ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>Theme<input name="theme" value="${esc(r.theme)}" required maxlength="150"></label><button>Save review</button></form></article>`,
        )
        .join("")
    : empty(
        "No reactions in this selection. Import source-linked comments or collect an HN thread.",
      );
}
async function perform(action) {
  try {
    await action();
  } catch (e) {
    message(e.message + " Reload if another editor changed the ledger.", true);
  }
}
$("refresh").onclick = () => perform(() => load());
$("clear").onclick = () => {
  $("from").value = "";
  $("to").value = "";
  perform(() => load());
};
$("filters").onsubmit = (e) => e.preventDefault();
for (const id of ["project", "initiative", "from", "to"])
  $(id).onchange = () => perform(() => load());
$("metric").onchange = () => {
  metricKey = $("metric").value;
  drawChart();
};
$("sentiment-filter").onchange = renderReactions;
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll("[data-tab]")
        .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      document
        .querySelectorAll(".view")
        .forEach((v) => (v.hidden = v.id !== b.dataset.tab));
    }),
);
$("initiatives").onchange = (e) => {
  const id = e.target.dataset.initiative;
  if (!id) return;
  const record = {
    ...workspace.initiatives.find((i) => i.id === id),
    status: e.target.value,
  };
  perform(async () => {
    await api("/api/record", {
      collection: "initiatives",
      record,
      revision: workspace.revision,
    });
    await load();
    message("Initiative status saved.");
  });
};
$("reactions").onsubmit = (e) => {
  e.preventDefault();
  const id = e.target.dataset.reaction;
  if (!id) return;
  const form = new FormData(e.target),
    record = {
      ...workspace.reactions.find((r) => r.id === id),
      sentiment: form.get("sentiment"),
      theme: form.get("theme"),
      reviewed: true,
    };
  perform(async () => {
    await api("/api/record", {
      collection: "reactions",
      record,
      revision: workspace.revision,
    });
    await load();
    message("Reaction review saved.");
  });
};
$("upload").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  perform(async () => {
    if (file.size > 2 * 1024 * 1024)
      throw new Error("Import exceeds 2 MB; split into smaller files");
    await api("/api/import", {
      text: await file.text(),
      format: file.name.toLowerCase().endsWith(".csv") ? "csv" : "json",
      revision: workspace.revision,
    });
    await load();
    message("Results imported. Matching IDs were updated.");
    e.target.value = "";
  });
};
$("collect").onclick = () =>
  perform(async () => {
    const b = $("collect");
    b.disabled = true;
    message("Collecting registered sources…");
    try {
      const result = await api("/api/monitor", {
        revision: workspace.revision,
      });
      await load();
      const errors = result.sources.flatMap((s) => s.errors);
      message(
        errors.length
          ? errors.join("; ")
          : result.sources.length
            ? "Sources collected."
            : "No monitoring sources registered.",
        !!errors.length,
      );
    } finally {
      b.disabled = false;
    }
  });
perform(() => load(true));
