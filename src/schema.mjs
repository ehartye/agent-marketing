export const collections = [
  "projects",
  "initiatives",
  "observations",
  "reactions",
  "competitors",
  "experiments",
  "evidence",
  "sources",
  "reports",
  "gates",
  "decisions",
  "actions",
  "updates",
];
// Collections that workspaces saved by an earlier release do not have; they gain an empty one.
const addedLater = ["reports", "gates", "decisions", "actions", "updates"];
export const channels = [
  "youtube",
  "tiktok",
  "facebook",
  "steam",
  "apple-app-store",
  "google-play",
  "instagram",
  "twitch",
  "bluesky",
  "x",
  "reddit",
  "hacker-news",
  "github",
  "search",
  "email",
  "itch",
  "discord",
  "linkedin",
  "product-hunt",
  "poki",
  "crazygames",
  "newgrounds",
  "gamejolt",
  "press",
  "mastodon",
  "direct",
];
export const metrics = [
  "views",
  "impressions",
  "visitors",
  "clicks",
  "starts",
  "signups",
  "returns",
  "purchases",
  "revenue",
  "cost",
  "hours",
  "stars",
  "votes",
  "comments",
  "clones",
  "uniqueVisitors",
  "wishlists",
  "installs",
  "unsubscribes",
  "follows",
  "plays",
  "ratings",
];
export const sentiments = [
  "positive",
  "negative",
  "neutral",
  "mixed",
  "unknown",
];
export function emptyWorkspace() {
  return {
    schema: "marketing/workspace@1",
    revision: 0,
    ...Object.fromEntries(collections.map((k) => [k, []])),
  };
}
function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}
function text(v, p) {
  if (typeof v !== "string" || !v.trim() || v.length > 20000)
    fail(p, "expected nonempty text (max 20000 characters)");
}
function number(v, p, integer = false) {
  if (!Number.isFinite(v) || v < 0 || (integer && !Number.isSafeInteger(v)))
    fail(p, "expected nonnegative " + (integer ? "integer" : "number"));
}
function one(v, items, p) {
  if (!items.includes(v)) fail(p, `expected one of ${items.join(", ")}`);
}
function date(v, p) {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    fail(p, "expected a real YYYY-MM-DD date");
}
function timestamp(v, p) {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(v) ||
    !Number.isFinite(Date.parse(v))
  )
    fail(p, "expected ISO timestamp");
}
function url(v, p) {
  try {
    if (!["http:", "https:"].includes(new URL(v).protocol)) throw Error();
  } catch {
    fail(p, "expected http(s) source URL");
  }
}
function document(v, p) {
  if (!v || typeof v !== "object" || Array.isArray(v))
    fail(p, "expected {markdown, updatedAt}");
  if (typeof v.markdown !== "string" || !v.markdown.trim() || v.markdown.length > 100000)
    fail(p + ".markdown", "expected nonempty Markdown (max 100000 characters)");
  timestamp(v.updatedAt, p + ".updatedAt");
}
export const gateStatuses = ["open", "passed", "failed", "waived"];
// hours and dependsOn are read by the plan check. A ledger that kept free text under either name
// before then is refused, so the message says what to do about it.
const renameHint = " (the plan check reads this field; if it holds something else, rename that field)";
function plannedHours(v, p) {
  if (!Number.isFinite(v) || v < 0) fail(p, "expected nonnegative number of planned maker-hours" + renameHint);
}
// An initiative lists the gates and initiatives it waits on by ID, all in its own project.
function dependencies(r, p, gates, initiatives) {
  const where = p + ".dependsOn",
    expected = "expected an array of gate or initiative IDs" + renameHint;
  if (!Array.isArray(r.dependsOn)) fail(where, expected);
  const seen = new Set();
  for (const id of r.dependsOn) {
    if (typeof id !== "string" || !id) fail(where, expected);
    if (id === r.id) fail(where, "an initiative cannot depend on itself");
    if (seen.has(id)) fail(where, `duplicate dependency "${id}"`);
    seen.add(id);
    if (gates.get(id)?.projectId !== r.projectId && initiatives.get(id)?.projectId !== r.projectId)
      fail(where, `"${id}" is not a gate or initiative in this project`);
  }
}
// A gate depends on nothing, so a cycle can only run through initiatives. Depth-first with an
// explicit stack, so a long chain cannot exhaust the call stack. Returns the first cycle found
// in record order, as a list of IDs that starts and ends on the same initiative.
function dependencyCycle(records) {
  const byId = new Map(records.map((r) => [r.id, r])),
    done = new Set();
  for (const first of records) {
    if (done.has(first.id)) continue;
    const path = [first.id],
      cursor = [0];
    while (path.length) {
      const id = path.at(-1),
        from = byId.get(id),
        deps = from.dependsOn ?? [],
        i = cursor[cursor.length - 1]++;
      if (i >= deps.length) {
        done.add(id);
        path.pop();
        cursor.pop();
        continue;
      }
      const to = byId.get(deps[i]);
      if (!to || to.projectId !== from.projectId || done.has(to.id)) continue;
      const at = path.indexOf(to.id);
      if (at >= 0) return [...path.slice(at), to.id];
      path.push(to.id);
      cursor.push(0);
    }
  }
}
// A cycle of any length is named by its first ten initiatives and the number in it, so the error
// stays readable and small however long the loop is.
function cycleText(cycle) {
  const shown = 10;
  return cycle.length <= shown + 1
    ? cycle.join(" -> ")
    : `${cycle.slice(0, shown).join(" -> ")} -> … (${cycle.length - 1} initiatives in the cycle)`;
}
export const decisionStatuses = ["open", "decided", "deferred", "superseded"];
export const actionStatuses = ["todo", "doing", "done", "blocked", "dropped"];
export const updateKinds = ["decision", "gate", "initiative", "action", "asset", "document", "note"];
const idPattern = /^[a-zA-Z0-9_.:-]{1,160}$/;
// The dimensions the owner wants every option to state. Each is optional text, so a draft decision
// can be saved before they are all written, but docs/CLI.md asks for all five.
export const optionDimensions = ["time", "risk", "complexity", "bestPractice", "maintainability"];
function options(r, p) {
  const where = p + ".options";
  if (!Array.isArray(r.options))
    fail(where, "expected an array of {id, label, summary?, time?, risk?, complexity?, bestPractice?, maintainability?}");
  const seen = new Set();
  for (const o of r.options) {
    if (!o || typeof o !== "object" || Array.isArray(o)) fail(where, "expected an option record");
    text(o.id, where + ".id");
    if (!idPattern.test(o.id)) fail(where + ".id", "invalid option ID");
    if (seen.has(o.id)) fail(where, `duplicate option ID "${o.id}"`);
    seen.add(o.id);
    text(o.label, `${where}.${o.id}.label`);
    for (const key of ["summary", ...optionDimensions]) if (o[key] !== undefined) text(o[key], `${where}.${o.id}.${key}`);
  }
}
// Earlier choices of a decision that was changed, oldest first.
function decisionHistory(r, p) {
  if (!Array.isArray(r.history)) fail(p + ".history", "expected an array of {chosen, rationale?, decidedAt}");
  for (const h of r.history) {
    if (!h || typeof h !== "object" || Array.isArray(h)) fail(p + ".history", "expected {chosen, rationale?, decidedAt}");
    text(h.chosen, p + ".history.chosen");
    if (h.rationale !== undefined) text(h.rationale, p + ".history.rationale");
    timestamp(h.decidedAt, p + ".history.decidedAt");
  }
}
// A list of IDs, each a record of the same project in `known`.
function references(r, key, p, known, noun) {
  const where = `${p}.${key}`;
  if (!Array.isArray(r[key])) fail(where, `expected an array of ${noun} IDs`);
  const seen = new Set();
  for (const id of r[key]) {
    if (typeof id !== "string" || !id) fail(where, `expected an array of ${noun} IDs`);
    if (seen.has(id)) fail(where, `duplicate ${noun} "${id}"`);
    seen.add(id);
    if (known.get(id)?.projectId !== r.projectId) fail(where, `"${id}" is not a ${noun} in this project`);
  }
}
// One optional ID of a record of the same project in `known`.
function reference(r, key, p, known, noun) {
  if (r[key] === undefined) return;
  if (known.get(r[key])?.projectId !== r.projectId) fail(`${p}.${key}`, `"${r[key]}" is not a ${noun} in this project`);
}
// An initiative's parent groups it for reading; it is separate from dependsOn, which orders work.
// Each initiative has at most one parent, so the chain from any initiative either ends or repeats.
function parentCycle(records) {
  const byId = new Map(records.map((r) => [r.id, r]));
  for (const first of records) {
    const path = [first.id];
    for (let at = byId.get(first.parentId); at; at = byId.get(at.parentId)) {
      const seen = path.indexOf(at.id);
      if (seen >= 0) return [...path.slice(seen), at.id];
      path.push(at.id);
    }
  }
}
const reportKinds = ["market-landscape", "demand", "competition", "positioning", "other"];
const levels = ["high", "medium", "low"];
const evidenceStatuses = [
  "observed",
  "modeled-estimate",
  "documented-rule",
  "anecdote",
  "hypothesis",
  "product-fact",
];
// A product-fact is a verified fact about the project itself, so besides an http(s) URL (a live
// page or build) it may cite a repository-relative path. The path is portable by construction:
// no scheme, drive letter, leading slash, parent segment, space or home directory (a name that
// starts with ~), so it is never a local file location and the desk can show it as text without
// making it a link. Names may use letters and digits of any script.
const portablePath = /^(?!~)[\p{L}\p{N}\p{M}_.@+~-]+(\/(?!~)[\p{L}\p{N}\p{M}_.@+~-]+)*(#L\d+(-L\d+)?)?$/u;
function productFactSource(v, p) {
  const portable =
    typeof v === "string" &&
    v.length <= 500 &&
    portablePath.test(v) &&
    !v.split("#")[0].split("/").some((s) => /^\.+$/.test(s));
  if (portable) return;
  try {
    url(v, p);
  } catch {
    fail(
      p,
      "expected http(s) URL or a repository-relative path of letters, digits and . _ - @ + ~ separated by /, optionally ending #L10 or #L10-L20 (no scheme, no drive letter, no leading slash, no spaces, no .. and no name starting with ~, which is a home directory)",
    );
  }
}
function vaultLink(v, p) {
  try {
    if (!["http:", "https:", "obsidian:"].includes(new URL(v).protocol)) throw Error();
  } catch {
    fail(p, "expected an http(s) or obsidian:// link");
  }
}
export function validateWorkspace(w) {
  if (!w || w.schema !== "marketing/workspace@1")
    fail("schema", "expected marketing/workspace@1");
  // Workspaces saved before these collections existed have none; they gain an empty one.
  for (const k of addedLater) if (w[k] === undefined) w[k] = [];
  number(w.revision, "revision", true);
  for (const k of Object.keys(w))
    if (!["schema", "revision", ...collections].includes(k))
      fail(k, "unknown workspace collection");
  for (const k of collections) {
    if (!Array.isArray(w[k]) || w[k].length > 50000)
      fail(k, "expected array (max 50000 records)");
    const ids = new Set();
    for (const r of w[k]) {
      if (!r || typeof r !== "object" || Array.isArray(r))
        fail(k, "expected record");
      text(r.id, `${k}.id`);
      if (!idPattern.test(r.id)) fail(k, "invalid ID");
      if (ids.has(r.id)) fail(k, `duplicate ID ${r.id}`);
      ids.add(r.id);
    }
  }
  const projects = new Map(w.projects.map((r) => [r.id, r])),
    initiatives = new Map(w.initiatives.map((r) => [r.id, r])),
    gates = new Map(w.gates.map((r) => [r.id, r])),
    decisions = new Map(w.decisions.map((r) => [r.id, r])),
    reports = new Map(w.reports.map((r) => [r.id, r])),
    evidence = new Map(w.evidence.map((r) => [r.id, r]));
  for (const k of collections)
    for (const r of w[k]) {
      const p = `${k}.${r.id}`,
        t = (key) => text(r[key], `${p}.${key}`),
        n = (key, integer = false) => number(r[key], `${p}.${key}`, integer);
      if (k === "reports" && r.projectId === undefined) {
        // Workspace-level report: no project required.
      } else if (k !== "projects" && !projects.has(r.projectId))
        fail(p, "projectId does not exist");
      if (
        r.initiativeId &&
        (!initiatives.has(r.initiativeId) ||
          initiatives.get(r.initiativeId).projectId !== r.projectId)
      )
        fail(p, "initiativeId must belong to project");
      if (r.channel !== undefined) one(r.channel, channels, `${p}.channel`);
      switch (k) {
        case "projects":
          if (r.strategy !== undefined) document(r.strategy, p + ".strategy");
          for (const key of ["name", "problem", "promise", "objective"]) t(key);
          one(
            r.category,
            ["tool", "app", "game", "creative", "education"],
            p + ".category",
          );
          one(r.stage, ["idea", "prototype", "beta", "launched"], p + ".stage");
          if (!Array.isArray(r.audience) || !r.audience.length)
            fail(p, "audience must be a nonempty list");
          r.audience.forEach((x) => text(x, p + ".audience"));
          n("weeklyHours");
          n("budget");
          t("currency");
          break;
        case "initiatives":
          if (r.brief !== undefined) document(r.brief, p + ".brief");
          for (const key of ["name", "hypothesis", "cta", "owner"]) t(key);
          one(r.channel, channels, p + ".channel");
          one(
            r.status,
            ["planned", "running", "paused", "complete"],
            p + ".status",
          );
          date(r.start, p + ".start");
          date(r.end, p + ".end");
          if (r.end < r.start) fail(p, "end precedes start");
          n("budget");
          if (r.hours !== undefined) plannedHours(r.hours, p + ".hours");
          if (r.dependsOn !== undefined) dependencies(r, p, gates, initiatives);
          if (r.note !== undefined) t("note");
          if (r.parentId !== undefined) {
            if (r.parentId === r.id) fail(p + ".parentId", "an initiative cannot be its own parent");
            if (initiatives.get(r.parentId)?.projectId !== r.projectId)
              fail(p + ".parentId", `"${r.parentId}" is not an initiative in this project`);
          }
          break;
        case "gates":
          for (const key of ["name", "criteria"]) t(key);
          one(r.status, gateStatuses, p + ".status");
          if (r.checkedAt !== undefined) date(r.checkedAt, p + ".checkedAt");
          if (r.notes !== undefined) t("notes");
          if (r.due !== undefined) date(r.due, p + ".due");
          if (r.hours !== undefined) plannedHours(r.hours, p + ".hours");
          if (initiatives.get(r.id)?.projectId === r.projectId)
            fail(p, "ID is also an initiative in this project; a dependency must name one or the other");
          if (r.evidenceIds !== undefined) {
            if (!Array.isArray(r.evidenceIds)) fail(p + ".evidenceIds", "expected an array of evidence IDs");
            const seen = new Set();
            for (const id of r.evidenceIds) {
              if (typeof id !== "string" || !id) fail(p + ".evidenceIds", "expected an array of evidence IDs");
              if (seen.has(id)) fail(p + ".evidenceIds", `duplicate evidence "${id}"`);
              seen.add(id);
              if (evidence.get(id)?.projectId !== r.projectId)
                fail(p + ".evidenceIds", `"${id}" is not evidence in this project`);
            }
          }
          break;
        case "observations":
          one(r.channel, channels, p + ".channel");
          one(r.metric, metrics, p + ".metric");
          n("value", !["cost", "revenue", "hours"].includes(r.metric));
          one(r.kind, ["period", "snapshot"], p + ".kind");
          date(r.start, p + ".start");
          date(r.end, p + ".end");
          if (r.end < r.start) fail(p, "end precedes start");
          t("definition");
          url(r.url, p + ".url");
          timestamp(r.collectedAt, p + ".collectedAt");
          if (r.kind === "snapshot") t("series");
          if (["cost", "revenue"].includes(r.metric)) t("currency");
          if (r.cohort !== undefined) t("cohort");
          break;
        case "reactions":
          t("text");
          url(r.url, p + ".url");
          timestamp(r.collectedAt, p + ".collectedAt");
          one(r.sentiment, sentiments, p + ".sentiment");
          if (typeof r.reviewed !== "boolean")
            fail(p, "reviewed must be boolean");
          t("theme");
          break;
        case "competitors":
          t("name");
          one(r.kind, ["direct", "substitute", "do-nothing"], p + ".kind");
          t("positioning");
          url(r.url, p + ".url");
          date(r.checkedAt, p + ".checkedAt");
          if (!Array.isArray(r.claims)) fail(p, "claims must be an array");
          for (const c of r.claims) {
            text(c.dimension, p + ".claims.dimension");
            text(c.value, p + ".claims.value");
            url(c.url, p + ".claims.url");
            date(c.checkedAt, p + ".claims.checkedAt");
          }
          break;
        case "experiments":
          t("name");
          t("hypothesis");
          t("primaryMetric");
          t("stoppingRule");
          n("targetPerArm", true);
          if (r.targetPerArm === 0) fail(p, "targetPerArm must be positive");
          if (typeof r.randomized !== "boolean")
            fail(p, "randomized must be boolean");
          if (!Array.isArray(r.arms) || r.arms.length !== 2)
            fail(p, "exactly two arms required");
          for (const a of r.arms) {
            text(a.name, p + ".arm.name");
            number(a.trials, p + ".arm.trials", true);
            number(a.successes, p + ".arm.successes", true);
            if (a.successes > a.trials) fail(p, "successes exceed trials");
          }
          break;
        case "evidence":
          t("claim");
          one(
            r.dimension,
            [
              "problem",
              "activation",
              "retention",
              "payment",
              "positioning",
              "channel",
            ],
            p + ".dimension",
          );
          one(r.result, ["supports", "contradicts", "unknown"], p + ".result");
          one(
            r.strength,
            ["primary", "secondary", "anecdote", "hypothesis"],
            p + ".strength",
          );
          if (r.status === "product-fact") productFactSource(r.url, p + ".url");
          else url(r.url, p + ".url");
          date(r.checkedAt, p + ".checkedAt");
          if (r.publishedAt !== undefined) date(r.publishedAt, p + ".publishedAt");
          for (const key of ["dataPeriod", "denominator", "limit"])
            if (r[key] !== undefined) t(key);
          for (const key of ["credibility", "relevance"])
            if (r[key] !== undefined) one(r[key], levels, p + "." + key);
          if (r.status !== undefined) one(r.status, evidenceStatuses, p + ".status");
          break;
        case "reports":
          t("title");
          document({ markdown: r.markdown, updatedAt: r.updatedAt }, p);
          if (r.kind !== undefined) one(r.kind, reportKinds, p + ".kind");
          if (r.vaultUrl !== undefined) vaultLink(r.vaultUrl, p + ".vaultUrl");
          reference(r, "gateId", p, gates, "gate");
          reference(r, "decisionId", p, decisions, "decision");
          break;
        case "decisions": {
          for (const key of ["title", "question"]) t(key);
          one(r.status, decisionStatuses, p + ".status");
          if (r.needBy !== undefined) date(r.needBy, p + ".needBy");
          for (const key of ["defaultIfSilent", "recommendation", "rationale"]) if (r[key] !== undefined) t(key);
          options(r, p);
          if (r.chosen !== undefined && !r.options.some((o) => o.id === r.chosen))
            fail(p + ".chosen", `"${r.chosen}" is not one of the options`);
          if (r.status === "decided") {
            if (r.chosen === undefined) fail(p + ".chosen", "a decided decision needs the option chosen");
            if (r.decidedAt === undefined) fail(p + ".decidedAt", "a decided decision needs the time it was decided");
          }
          if (r.decidedAt !== undefined) timestamp(r.decidedAt, p + ".decidedAt");
          if (r.history !== undefined) decisionHistory(r, p);
          if (r.reportId !== undefined) {
            const memo = reports.get(r.reportId);
            if (!memo || (memo.projectId !== undefined && memo.projectId !== r.projectId))
              fail(p + ".reportId", `"${r.reportId}" is not a report of this project or of the workspace`);
          }
          if (r.gateIds !== undefined) references(r, "gateIds", p, gates, "gate");
          if (r.status === "superseded" && r.supersededBy === undefined)
            fail(p + ".supersededBy", "a superseded decision needs the decision that replaced it");
          if (r.supersededBy !== undefined) {
            if (r.supersededBy === r.id) fail(p + ".supersededBy", "a decision cannot supersede itself");
            reference(r, "supersededBy", p, decisions, "decision");
          }
          break;
        }
        case "actions":
          t("title");
          one(r.owner, ["owner", "agent"], p + ".owner");
          one(r.status, actionStatuses, p + ".status");
          if (r.due !== undefined) date(r.due, p + ".due");
          if (r.hours !== undefined) n("hours");
          for (const key of ["notes", "blockedBy"]) if (r[key] !== undefined) t(key);
          if (r.doneAt !== undefined) timestamp(r.doneAt, p + ".doneAt");
          reference(r, "gateId", p, gates, "gate");
          reference(r, "decisionId", p, decisions, "decision");
          break;
        case "updates":
          timestamp(r.at, p + ".at");
          one(r.kind, updateKinds, p + ".kind");
          t("text");
          // refId is not checked: the log is a history, and it must stay valid if a record it names is removed.
          if (r.refId !== undefined) t("refId");
          break;
        case "sources":
          t("name");
          one(r.adapter, ["github", "hn"], p + ".adapter");
          one(r.channel, channels, p + ".channel");
          t("target");
          if (r.adapter === "github" && !/^[\w.-]+\/[\w.-]+$/.test(r.target))
            fail(p, "GitHub target must be owner/repository");
          if (r.adapter === "hn" && !/^\d+$/.test(r.target))
            fail(p, "HN target must be an item ID");
          if (r.traffic !== undefined && typeof r.traffic !== "boolean")
            fail(p, "traffic must be boolean");
          if (r.lastCheckedAt) timestamp(r.lastCheckedAt, p + ".lastCheckedAt");
          if (r.lastError !== undefined && typeof r.lastError !== "string")
            fail(p, "lastError must be text");
          break;
      }
    }
  const cycle = dependencyCycle(w.initiatives);
  if (cycle) fail(`initiatives.${cycle[0]}.dependsOn`, "dependency cycle " + cycleText(cycle));
  const family = parentCycle(w.initiatives);
  if (family) fail(`initiatives.${family[0]}.parentId`, "parent cycle " + cycleText(family));
  return w;
}

// The fields each record type defines (docs/CLI.md). validateWorkspace keeps accepting anything
// else so older files still load; patchWarnings reports it, so a misspelled optional field
// (credibilty) or an unsupported one (dependsOn) is seen instead of silently kept and ignored.
// A field that a new feature reads must be added here.
export const recordFields = {
  projects: ["id", "name", "audience", "category", "problem", "promise", "stage", "objective", "weeklyHours", "budget", "currency", "strategy"],
  initiatives: ["id", "projectId", "name", "channel", "hypothesis", "cta", "status", "start", "end", "budget", "owner", "brief", "hours", "dependsOn", "parentId", "note"],
  observations: ["id", "projectId", "initiativeId", "channel", "metric", "value", "start", "end", "kind", "series", "definition", "url", "collectedAt", "currency", "cohort"],
  reactions: ["id", "projectId", "initiativeId", "channel", "text", "url", "collectedAt", "sentiment", "reviewed", "theme"],
  competitors: ["id", "projectId", "initiativeId", "name", "kind", "positioning", "url", "checkedAt", "claims"],
  experiments: ["id", "projectId", "initiativeId", "name", "hypothesis", "primaryMetric", "stoppingRule", "targetPerArm", "randomized", "arms"],
  evidence: ["id", "projectId", "initiativeId", "claim", "dimension", "result", "strength", "url", "checkedAt", "publishedAt", "dataPeriod", "denominator", "limit", "credibility", "relevance", "status"],
  sources: ["id", "projectId", "initiativeId", "name", "adapter", "channel", "target", "traffic", "lastCheckedAt", "lastError"],
  reports: ["id", "projectId", "title", "markdown", "updatedAt", "kind", "vaultUrl", "initiativeId", "gateId", "decisionId"],
  gates: ["id", "projectId", "name", "criteria", "status", "checkedAt", "evidenceIds", "notes", "due", "hours", "initiativeId"],
  decisions: ["id", "projectId", "initiativeId", "title", "question", "status", "needBy", "defaultIfSilent", "recommendation", "options", "chosen", "rationale", "decidedAt", "reportId", "gateIds", "supersededBy", "history"],
  actions: ["id", "projectId", "initiativeId", "gateId", "decisionId", "title", "owner", "status", "due", "hours", "notes", "doneAt", "blockedBy"],
  updates: ["id", "projectId", "initiativeId", "at", "kind", "refId", "text"],
};
const nestedFields = {
  competitors: { claims: ["dimension", "value", "url", "checkedAt"] },
  experiments: { arms: ["name", "trials", "successes"] },
  decisions: {
    options: ["id", "label", "summary", ...optionDimensions],
    history: ["chosen", "rationale", "decidedAt"],
  },
};
// Optimal string alignment distance: insert, delete, substitute or swap two neighbours.
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}
// The closest field the record does not already have, if it is about one typo per four letters
// away (never more than two), ignoring case.
function closest(key, known, record) {
  const lower = key.toLowerCase(),
    allowed = Math.min(2, Math.max(1, Math.floor(lower.length / 4)));
  let best,
    nearest = Infinity;
  for (const field of known) {
    if (field in record) continue;
    // Strings further apart in length than the allowance cannot be that close, so a very long
    // name is never compared letter by letter.
    if (Math.abs(lower.length - field.length) > allowed) continue;
    const d = distance(lower, field.toLowerCase());
    if (d < nearest) [best, nearest] = [field, d];
  }
  return nearest <= allowed ? best : undefined;
}
// Non-fatal warnings for fields no record type defines, for an object of collection arrays.
// The same field on many records is one warning that names the first few, so a CSV with a
// stray column does not print a line per row.
export function patchWarnings(patch) {
  const groups = new Map();
  const note = (collection, id, where, key, known, record) => {
    const group = `${collection}\0${where}\0${key}`;
    if (!groups.has(group))
      groups.set(group, { collection, where, key, hint: closest(key, known, record), ids: new Set() });
    groups.get(group).ids.add(id);
  };
  for (const [collection, rows] of Object.entries(patch ?? {})) {
    if (!recordFields[collection] || !Array.isArray(rows)) continue;
    for (const r of rows) {
      if (!r || typeof r !== "object" || Array.isArray(r)) continue;
      const id = typeof r.id === "string" && r.id ? r.id : "(no id)";
      for (const key of Object.keys(r))
        if (!recordFields[collection].includes(key)) note(collection, id, "", key, recordFields[collection], r);
      for (const [name, fields] of Object.entries(nestedFields[collection] ?? {}))
        for (const item of Array.isArray(r[name]) ? r[name] : [])
          if (item && typeof item === "object" && !Array.isArray(item))
            for (const key of Object.keys(item))
              if (!fields.includes(key)) note(collection, id, "." + name, key, fields, item);
    }
  }
  return [...groups.values()].map(({ collection, where, key, hint, ids }) => {
    const all = [...ids],
      named = all.slice(0, 3).join(", ") + (all.length > 3 ? ` and ${all.length - 3} more` : "");
    const shown = key.length > 60 ? key.slice(0, 60) + "…" : key;
    return `${collection}.${named}${where}: unknown field "${shown}"; ${hint ? `did you mean "${hint}"?` : "nothing reads it"}`;
  });
}
export function workspaceWarnings(w) {
  return patchWarnings(Object.fromEntries(collections.map((k) => [k, w[k]])));
}
// --strict: warnings become an error, raised before anything is written.
export function failOnWarnings(warnings) {
  if (warnings.length)
    throw Object.assign(new Error("Strict mode: " + warnings.join(" | ")), { status: 400 });
}
