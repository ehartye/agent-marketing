export const collections = [
  "projects",
  "initiatives",
  "observations",
  "reactions",
  "competitors",
  "experiments",
  "evidence",
  "sources",
];
export const channels = [
  "youtube",
  "tiktok",
  "facebook",
  "steam",
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
export function validateWorkspace(w) {
  if (!w || w.schema !== "marketing/workspace@1")
    fail("schema", "expected marketing/workspace@1");
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
      if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(r.id)) fail(k, "invalid ID");
      if (ids.has(r.id)) fail(k, `duplicate ID ${r.id}`);
      ids.add(r.id);
    }
  }
  const projects = new Map(w.projects.map((r) => [r.id, r])),
    initiatives = new Map(w.initiatives.map((r) => [r.id, r]));
  for (const k of collections)
    for (const r of w[k]) {
      const p = `${k}.${r.id}`,
        t = (key) => text(r[key], `${p}.${key}`),
        n = (key, integer = false) => number(r[key], `${p}.${key}`, integer);
      if (k !== "projects" && !projects.has(r.projectId))
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
          url(r.url, p + ".url");
          date(r.checkedAt, p + ".checkedAt");
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
  return w;
}
